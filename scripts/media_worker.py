"""One GPU worker for local SDXL stills and Wan 2.2 clips. No remote inference."""
import gc
import json
import os
from pathlib import Path
import threading
import time
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

ROOT = Path(os.environ.get('MEDIA_DATA_DIR', './data/media-worker')).resolve()
ROOT.mkdir(parents=True, exist_ok=True)
SDXL = os.environ.get('SDXL_MODEL', 'stabilityai/stable-diffusion-xl-base-1.0')
WAN = os.environ.get('WAN_MODEL', 'Wan-AI/Wan2.2-TI2V-5B-Diffusers')
app = FastAPI(title='Mujian local media worker')
jobs: dict = {}
lock = threading.Lock()
pipeline = None
pipeline_kind = None

def model_readiness(model):
    root = Path(model)
    if not root.is_absolute():
        return {'ready': None, 'detail': 'Model repository will be resolved when loading.'}
    if not (root / 'model_index.json').is_file():
        return {'ready': False, 'detail': 'Local model directory is missing model_index.json.'}
    if model == SDXL and any(not (root / component / name).is_file() for component, name in [('unet', 'diffusion_pytorch_model.fp16.safetensors'), ('vae', 'diffusion_pytorch_model.fp16.safetensors'), ('text_encoder', 'model.fp16.safetensors'), ('text_encoder_2', 'model.fp16.safetensors')]):
        return {'ready': False, 'detail': 'A required SDXL component is missing.'}
    partials = list(root.rglob('*.incomplete')) + list(root.rglob('*.aria2'))
    if partials:
        return {'ready': False, 'detail': f'{len(partials)} model files are still downloading.'}
    weights = list(root.rglob('*.safetensors'))
    if not weights:
        return {'ready': False, 'detail': 'No local model weights found.'}
    for index in root.rglob('*.safetensors.index.json'):
        names = set(json.loads(index.read_text()).get('weight_map', {}).values())
        if any(not (index.parent / name).is_file() for name in names):
            return {'ready': False, 'detail': 'A model weight shard is missing.'}
    return {'ready': True, 'detail': 'Local model files are present.'}

class Request(BaseModel):
    kind: str = Field(pattern='^(image|video)$')
    prompt: str = Field(min_length=1, max_length=8000)
    seed: int = Field(default=42, ge=0, le=2147483647)
    reference: str | None = None
    quality: str = Field(default='draft', pattern='^(draft|final)$')

def persist(job):
    target = ROOT / (job['id'] + '.json')
    temp = target.with_suffix('.tmp')
    temp.write_text(json.dumps({k: v for k, v in job.items() if k != 'cancel'}, ensure_ascii=False, indent=2))
    temp.replace(target)

for file in ROOT.glob('*.json'):
    old = json.loads(file.read_text())
    if old.get('state') in ('queued', 'running'):
        old['state'] = 'interrupted'
        old['error'] = 'Worker restarted; output was not committed.'
        persist(old)
    jobs[old['id']] = old

def render(job, req):
    global pipeline, pipeline_kind
    started = time.monotonic()
    try:
        import torch
        from PIL import Image
        from diffusers import StableDiffusionXLPipeline, WanPipeline, WanImageToVideoPipeline, AutoencoderKLWan
        from diffusers.utils import export_to_video
        if not torch.cuda.is_available():
            raise RuntimeError('CUDA GPU unavailable; refusing to label CPU work as Spark generation.')
        job.update(state='running', phase='loading', device=torch.cuda.get_device_name(0))
        persist(job)
        reference_path = None
        if req.reference:
            if not req.reference.replace('-', '').replace('.', '').isalnum():
                raise ValueError('Invalid reference filename')
            reference_path = ROOT / req.reference
            if not reference_path.is_file() or reference_path.suffix not in ('.png', '.jpg'):
                raise ValueError('Reference image not found')
        target_kind = 'image' if req.kind == 'image' else 'i2v' if reference_path else 't2v'
        if pipeline_kind != target_kind:
            pipeline = None
            gc.collect()
            torch.cuda.empty_cache()
            if target_kind == 'image':
                pipeline = StableDiffusionXLPipeline.from_pretrained(SDXL, torch_dtype=torch.float16, use_safetensors=True, variant='fp16').to('cuda')
            else:
                vae = AutoencoderKLWan.from_pretrained(WAN, subfolder='vae', torch_dtype=torch.float32)
                cls = WanImageToVideoPipeline if reference_path else WanPipeline
                pipeline = cls.from_pretrained(WAN, vae=vae, torch_dtype=torch.bfloat16).to('cuda')
                pipeline.vae.enable_tiling()
            pipeline_kind = target_kind
        job['loadMs'] = round((time.monotonic() - started) * 1000)
        if job['cancel'].is_set():
            raise InterruptedError('Cancelled before sampling')
        torch.cuda.reset_peak_memory_stats()
        def progress(_pipe, step, _timestep, values):
            if job['cancel'].is_set():
                raise InterruptedError('Cancelled during sampling')
            job.update(phase='sampling', step=step + 1)
            persist(job)
            return values
        gen = torch.Generator('cuda').manual_seed(req.seed)
        if req.kind == 'image':
            steps = 20 if req.quality == 'draft' else 30
            settings = dict(width=1024, height=576, num_inference_steps=steps, guidance_scale=6.0)
            job['steps'] = steps
            result = pipeline(prompt=req.prompt, negative_prompt='text, watermark, logo, blurry, distorted, duplicate people', generator=gen, callback_on_step_end=progress, **settings).images[0]
            file = job['id'] + '.png'
            result.save(ROOT / file)
            with Image.open(ROOT / file) as check:
                check.verify()
            model = SDXL
        else:
            # Native final recipe is 1280x704, 121 frames. Draft reduces cost openly.
            settings = dict(width=768 if req.quality == 'draft' else 1280, height=448 if req.quality == 'draft' else 704, num_frames=49 if req.quality == 'draft' else 121, num_inference_steps=20 if req.quality == 'draft' else 50, guidance_scale=5.0)
            job['steps'] = settings['num_inference_steps']
            if reference_path:
                settings['image'] = Image.open(reference_path).convert('RGB').resize((settings['width'], settings['height']))
            frames = pipeline(prompt=req.prompt, negative_prompt='blurry, distorted faces, watermark, text, subtitles, abrupt camera movement', generator=gen, callback_on_step_end=progress, **settings).frames[0]
            file = job['id'] + '.mp4'
            export_to_video(frames, str(ROOT / file), fps=24)
            import subprocess
            probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_name', '-of', 'json', str(ROOT / file)], check=True, capture_output=True, text=True)
            job['probe'] = json.loads(probe.stdout)
            model = WAN
        if job['cancel'].is_set():
            raise InterruptedError('Cancelled before commit')
        job.update(state='succeeded', phase='done', file=file, model=model, durationMs=round((time.monotonic()-started)*1000), peakAllocatedBytes=torch.cuda.max_memory_allocated(), settings={k:v for k,v in settings.items() if k != 'image'}, torchVersion=torch.__version__, cudaVersion=torch.version.cuda)
    except InterruptedError as exc:
        job.update(state='cancelled', error=str(exc))
    except Exception as exc:
        job.update(state='failed', error=f'{type(exc).__name__}: {exc}')
        # Discard potentially half-loaded or corrupted pipelines after an error.
        pipeline = None
        pipeline_kind = None
        gc.collect()
    finally:
        job['finishedAt'] = time.time()
        persist(job)
        lock.release()

@app.get('/health')
def health():
    import torch
    return {'ok': True, 'gpu': torch.cuda.get_device_name(0) if torch.cuda.is_available() else None, 'busy': lock.locked(), 'loaded': pipeline_kind, 'models': {'image': SDXL, 'video': WAN}, 'readiness': {'image': model_readiness(SDXL), 'video': model_readiness(WAN)}}

@app.post('/jobs')
def create(req: Request):
    ready = model_readiness(SDXL if req.kind == 'image' else WAN)
    if ready['ready'] is False:
        raise HTTPException(503, ready['detail'])
    if not lock.acquire(blocking=False):
        raise HTTPException(409, 'GPU worker is busy')
    job = {'id': str(uuid.uuid4()), 'state': 'queued', 'createdAt': time.time(), 'request': req.model_dump(), 'cancel': threading.Event()}
    jobs[job['id']] = job
    persist(job)
    threading.Thread(target=render, args=(job,req), daemon=True).start()
    return {'id':job['id'], 'state':job['state']}

@app.get('/jobs/{job_id}')
def status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, 'Job not found')
    return {k:v for k,v in jobs[job_id].items() if k != 'cancel'}

@app.post('/jobs/{job_id}/cancel')
def cancel(job_id: str):
    if job_id not in jobs or jobs[job_id]['state'] not in ('running','queued'):
        raise HTTPException(409, 'Job is not running')
    jobs[job_id]['cancel'].set()
    return {'requested': True}

@app.put('/references/{ref_id}')
async def reference(ref_id: str, request: __import__('fastapi').Request):
    if not ref_id.replace('-','').isalnum():
        raise HTTPException(400, 'Invalid reference ID')
    content = await request.body()
    if len(content) > 20*1024*1024:
        raise HTTPException(413, 'Reference too large')
    import io
    from PIL import Image
    try:
        image = Image.open(io.BytesIO(content))
        image.load()
        image.convert('RGB').save(ROOT / (ref_id+'.png'))
    except Exception:
        raise HTTPException(400, 'Invalid image')
    return {'file':ref_id+'.png'}

@app.get('/files/{filename}')
def file(filename: str):
    if not filename.replace('-','').replace('.','').isalnum() or filename.count('.') != 1 or Path(filename).suffix not in ('.png','.jpg','.mp4'):
        raise HTTPException(400, 'Invalid filename')
    p = ROOT / filename
    if not p.is_file():
        raise HTTPException(404, 'File not found')
    return FileResponse(p)
