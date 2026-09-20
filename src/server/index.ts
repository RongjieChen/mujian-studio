import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { caseSchema, type Asset } from '../core/schema.ts';
import { sampleCase } from '../core/sample.ts';
import { hashObject, sceneInput, validateCase, revisionDiff } from '../core/validate.ts';
import { getProject, listProjects, createProject, updateCase, saveProject, getJob, listJobs, dataDir } from './store.ts';
import { enqueue, cancelJob, registerHandler, recoverJobs } from './jobs.ts';
import { runAgent, llmConfig } from './agent.ts';
import { runMedia, workerUrl, assetCurrent } from './media.ts';
import { exportGame } from './export.ts';

recoverJobs();
for(const kind of ['generate','edit','repair'] as const)registerHandler(kind,runAgent);
for(const kind of ['image','video'] as const)registerHandler(kind,runMedia);
const app=express();
app.disable('x-powered-by');
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  const origin=req.headers.origin;
  if(origin){
    try{const source=new URL(origin);if(!['localhost','127.0.0.1','[::1]'].includes(source.hostname) && source.host!==req.get('host'))return res.status(403).json({error:'不允许此来源访问本地工作台'});}catch{return res.status(403).json({error:'无效来源'});}
  }
  next();
});
app.use(express.json({limit:'2mb'}));
const projectView=(id:string)=>{
  const p=getProject(id);return {...p,assetStates:p.assets.map(a=>({id:a.id,current:assetCurrent(p,a)}))};
};
app.get('/api/health',(_req,res)=>res.json({ok:true,version:'0.1.0'}));
app.get('/api/status',async(_req,res)=>{
  const config=llmConfig();
  const probes=await Promise.allSettled([
    fetch(`${config.baseUrl}/models`,{headers:{authorization:`Bearer ${config.key||''}`},signal:AbortSignal.timeout(2500)}).then(async r=>({ok:r.ok,models:r.ok?await r.json():null})),
    fetch(`${workerUrl()}/health`,{signal:AbortSignal.timeout(2500)}).then(async r=>({ok:r.ok,...await r.json()})),
  ]);
  res.json({llm:{provider:config.provider,model:config.model,configured:!!config.key,reachable:probes[0].status==='fulfilled'&&probes[0].value.ok},media:probes[1].status==='fulfilled'?probes[1].value:{ok:false},activeJobs:listJobs().filter(j=>['running','queued'].includes(j.state)).length});
});
app.get('/api/projects',(_req,res)=>res.json(listProjects().map(({id,title,brief,createdAt,updatedAt,revision,source,report,case:doc,assets})=>({id,title,brief,createdAt,updatedAt,revision,source,passed:report?.passed,logline:doc.logline,scenes:doc.scenes.length,characters:doc.characters.length,assets:assets.length}))));
app.post('/api/projects/sample',(_req,res)=>res.status(201).json(createProject(structuredClone(sampleCase),'手工示例案件；用于体验玩法，不代表 AI 现场生成。','sample')));
app.post('/api/projects/import',(req,res)=>{const doc=caseSchema.parse(req.body.case??req.body);res.status(201).json(createProject(doc,'从 JSON 导入','imported'));});
app.post('/api/generate',(req,res)=>{const {prompt}=z.object({prompt:z.string().trim().min(5).max(5000)}).parse(req.body);res.status(202).json(enqueue('generate',{prompt},null));});
app.get('/api/projects/:id',(req,res)=>res.json(projectView(req.params.id)));
app.put('/api/projects/:id/case',(req,res)=>{const body=z.object({case:caseSchema,baseRevision:z.number().int(),note:z.string().max(200).default('手动编辑')}).parse(req.body);res.json(updateCase(req.params.id,body.case,body.baseRevision,body.note));});
app.post('/api/projects/:id/validate',(req,res)=>{const p=getProject(req.params.id);p.report=validateCase(p.case);saveProject(p);res.json(p.report);});
app.post('/api/projects/:id/agent',(req,res)=>{const body=z.object({kind:z.enum(['edit','repair']),prompt:z.string().trim().min(3).max(5000)}).parse(req.body);const p=getProject(req.params.id);res.status(202).json(enqueue(body.kind,{prompt:body.prompt},p.id,p.revision));});
app.post('/api/projects/:id/restore',(req,res)=>{const {revision}=z.object({revision:z.number().int()}).parse(req.body);const p=getProject(req.params.id);const old=p.revisions.find(r=>r.number===revision);if(!old)throw new Error('版本不存在');res.json(updateCase(p.id,old.case,p.revision,`恢复第 ${revision} 版`));});
app.get('/api/projects/:id/diff',(req,res)=>{const p=getProject(req.params.id);const a=p.revisions.find(r=>r.number===Number(req.query.from));if(!a)throw new Error('版本不存在');res.json(revisionDiff(a.case,p.case));});
app.post('/api/projects/:id/media',(req,res)=>{const body=z.object({sceneId:z.string(),kind:z.enum(['image','video']),seed:z.number().int().min(0).max(2147483647).default(42),quality:z.enum(['draft','final']).default('draft'),force:z.boolean().default(false)}).parse(req.body);const p=getProject(req.params.id);if(!p.case.scenes.some(s=>s.id===body.sceneId))throw new Error('场景不存在');res.status(202).json(enqueue(body.kind,body,p.id,p.revision));});
app.post('/api/projects/:id/upload/:sceneId',express.raw({type:['image/png','image/jpeg'],limit:'16mb'}),(req,res)=>{
  const p=getProject(req.params.id);if(!p.case.scenes.some(s=>s.id===req.params.sceneId))throw new Error('场景不存在');
  const bytes=req.body;if(!Buffer.isBuffer(bytes))throw new Error('只接受 PNG/JPEG 图片');
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(!png&&!jpg)throw new Error('图片格式不正确');
  const id=randomUUID();const file=`${id}.${png?'png':'jpg'}`;fs.writeFileSync(path.join(dataDir,'media',file),bytes);
  const asset:Asset={id,sceneId:req.params.sceneId,kind:'image',file,mime:png?'image/png':'image/jpeg',inputHash:hashObject(sceneInput(p.case,req.params.sceneId,'image',0)),seed:0,model:'用户导入',durationMs:0,createdAt:new Date().toISOString(),provenance:'upload'};
  p.assets.push(asset);saveProject(p);res.status(201).json(asset);
});
app.get('/api/projects/:id/export',(req,res)=>{const p=getProject(req.params.id);res.setHeader('Content-Disposition',`attachment; filename="mujian-${p.id}.html"`);res.type('html').send(exportGame(p));});
app.get('/api/projects/:id/json',(req,res)=>{const p=getProject(req.params.id);res.setHeader('Content-Disposition',`attachment; filename="mujian-${p.id}.json"`);res.json(p.case);});
app.get('/api/jobs',(_req,res)=>res.json(listJobs().slice(0,40)));
app.get('/api/jobs/:id',(req,res)=>res.json(getJob(req.params.id)));
app.post('/api/jobs/:id/cancel',(req,res)=>{cancelJob(req.params.id);res.json({ok:true});});
app.use('/media',express.static(path.join(dataDir,'media'),{dotfiles:'deny',immutable:true,maxAge:'1y'}));
app.use(express.static(path.resolve('dist/web')));
app.get('/{*path}',(_req,res)=>res.sendFile(path.resolve('dist/web/index.html')));
app.use((error:Error,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(error instanceof z.ZodError?400:409).json({error:error.message});});
const port=Number(process.env.PORT||4317),host=process.env.HOST||'127.0.0.1';
app.listen(port,host,()=>console.log(`幕间工作台：http://${host}:${port}`));
