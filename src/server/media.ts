import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { Asset, Job, Project } from '../core/schema.ts';
import { hashObject, sceneInput } from '../core/validate.ts';
import { dataDir, getProject, saveProject } from './store.ts';
import { withMediaMemory } from './gpu.ts';

export const workerUrl = () => process.env.MEDIA_WORKER_URL || 'http://127.0.0.1:4318';
async function waitForLlmSleep(emit:(type:string,message:string,detail?:unknown)=>void,signal:AbortSignal){
  if(process.env.LLM_WAIT_FOR_SLEEP!=='true'||process.env.LLM_PROVIDER==='stepfun')return;
  const root=process.env.LLAMA_ADMIN_URL||'http://127.0.0.1:8088';
  emit('memory','等待语言模型释放内存，为视频生成腾出统一内存。');
  const deadline=Date.now()+120_000;
  while(Date.now()<deadline){
    const r=await fetch(`${root}/props`,{signal:AbortSignal.any([signal,AbortSignal.timeout(5000)])});
    if(!r.ok)throw new Error('无法确认语言模型内存状态，请检查 llama.cpp 休眠配置。');
    const status=await r.json();
    if(status.is_sleeping===true){emit('memory','已确认语言模型休眠，开始视频作业。');return;}
    await delay(2000,undefined,{signal});
  }
  throw new Error('语言模型尚未释放内存，请启用 --sleep-idle-seconds 后重试视频。');
}
export function assetCurrent(project: Project, asset: Asset) {
  if (!project.case.scenes.some(s=>s.id===asset.sceneId)) return false;
  let ref: string|undefined;
  if(asset.kind==='video'){
    const image=[...project.assets].reverse().find(a=>a.kind==='image'&&a.sceneId===asset.sceneId&&assetCurrent(project,a));
    if(image){const file=path.join(dataDir,'media',image.file);if(!fs.existsSync(file))return false;ref=hashObject(fs.readFileSync(file).toString('base64'));}
  }
  return asset.inputHash === hashObject(sceneInput(project.case,asset.sceneId,asset.kind,asset.seed,ref));
}
export async function runMedia(job: Job, emit: (type:string,message:string,detail?:unknown)=>void, signal: AbortSignal) {
  if (!job.projectId) throw new Error('缺少项目');
  const project=getProject(job.projectId);
  if(job.baseRevision!==undefined && project.revision!==job.baseRevision)throw new Error('排队期间项目已修改，请基于最新版本重新生成素材。');
  const sceneId=String(job.request.sceneId); const kind=job.kind==='video'?'video':'image'; const seed=Number(job.request.seed??42);
  const scene=project.case.scenes.find(s=>s.id===sceneId); if(!scene)throw new Error('场景不存在');
  const reference=kind==='video' ? [...project.assets].reverse().find(a=>a.sceneId===sceneId&&a.kind==='image'&&assetCurrent(project,a)) : undefined;
  const referenceHash=reference ? hashObject(fs.readFileSync(path.join(dataDir,'media',reference.file)).toString('base64')):undefined;
  const input=sceneInput(project.case,sceneId,kind,seed,referenceHash);const inputHash=hashObject(input);
  const cached=project.assets.find(a=>a.inputHash===inputHash&&a.metadata?.quality===(job.request.quality||'draft')&&fs.existsSync(path.join(dataDir,'media',a.file)));
  if(cached&&!job.request.force){emit('cache','复用完全相同输入的已有素材',{assetId:cached.id});return {asset:cached,cacheHit:true};}
  return withMediaMemory(async()=>{
  emit('workflow','执行分镜制作流程：顺序调度、种子固定、保留旧素材');
  if(kind==='video')await waitForLlmSleep(emit,signal);
  let remoteRef: string|undefined;
  if(reference){
    const r=await fetch(`${workerUrl()}/references/${reference.id}`,{method:'PUT',body:fs.readFileSync(path.join(dataDir,'media',reference.file)),signal});
    if(!r.ok)throw new Error('无法提交视频首帧参考');remoteRef=(await r.json()).file;
  }
  const prompt=`${input.prompt}\nVisual style: ${input.style}`;
  let started:Response;
  let waiting=false;
  while(true){
    started=await fetch(`${workerUrl()}/jobs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind,prompt,seed,reference:remoteRef,quality:job.request.quality||'draft'}),signal});
    if(started.status!==409)break;
    await started.text();
    if(!waiting){emit('waiting','等待上一份 GPU 作业释放资源；可以取消当前任务。');waiting=true;}
    await delay(2000,undefined,{signal});
  }
  if(!started.ok)throw new Error(`本地素材服务拒绝任务：${await started.text()}`);
  const remote=await started.json();emit('media','本地 GPU 作业已创建',{workerJobId:remote.id,kind,seed,inputHash});
  let previous='';
  try{
    while(true){
      signal.throwIfAborted();
      const r=await fetch(`${workerUrl()}/jobs/${remote.id}`,{signal});if(!r.ok)throw new Error('无法读取素材作业状态');
      const status=await r.json();
      const label=`${status.phase||status.state}:${status.step||0}`;
      if(label!==previous){emit('progress',status.phase==='loading'?'加载本地生成模型':status.phase==='sampling'?`生成采样 ${status.step}/${status.steps}`:`素材状态：${status.state}`,{phase:status.phase,step:status.step,steps:status.steps});previous=label;}
      if(status.state==='failed'||status.state==='cancelled'||status.state==='interrupted')throw new Error(status.error||'素材作业未完成');
      if(status.state==='succeeded'){
        const result=await fetch(`${workerUrl()}/files/${encodeURIComponent(status.file)}`,{signal});if(!result.ok)throw new Error('输出素材文件不可读');
        const bytes=Buffer.from(await result.arrayBuffer());if(bytes.length<100)throw new Error('输出素材文件为空');
        const id=randomUUID();const file=`${id}.${kind==='image'?'png':'mp4'}`;
        fs.writeFileSync(path.join(dataDir,'media',file),bytes);
        signal.throwIfAborted();
        const asset:Asset={id,sceneId,kind,file,mime:kind==='image'?'image/png':'video/mp4',inputHash,seed,model:status.model,durationMs:status.durationMs,createdAt:new Date().toISOString(),provenance:'local-generation',metadata:{...status,quality:job.request.quality||'draft',referenceHash}};
        const latest=getProject(project.id);latest.assets.push(asset);latest.updatedAt=new Date().toISOString();saveProject(latest);
        const stale=!assetCurrent(latest,asset);emit('asset',stale?'素材已保存，但关联场景已修改，请重新生成':'生成完成，已保存可追溯素材',{assetId:id,durationMs:asset.durationMs,stale});
        return {asset,cacheHit:false,stale};
      }
      await delay(1800,undefined,{signal});
    }
  }catch(error){
    if(signal.aborted)await fetch(`${workerUrl()}/jobs/${remote.id}/cancel`,{method:'POST',signal:AbortSignal.timeout(5000)}).catch(()=>{});
    throw error;
  }
  },emit,signal);
}
