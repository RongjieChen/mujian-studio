import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'mujian-queue-tests-'));
const {registerHandler,enqueue,cancelJob,recoverJobs}=await import('../src/server/jobs.ts');
const {getJob,saveJob,dataDir}=await import('../src/server/store.ts');
test.after(()=>fs.rmSync(dataDir,{recursive:true,force:true}));
async function finish(id:string){for(let i=0;i<100;i++){const j=getJob(id);if(!['queued','running'].includes(j.state))return j;await delay(10);}throw new Error('Job did not terminate');}
test('queued cancellations, active cancellations and cancellation after commit have distinct outcomes',async()=>{
  registerHandler('edit',async(_j,_e,signal)=>{await delay(1000,undefined,{signal});return {};});
  const active=enqueue('edit',{},null),queued=enqueue('edit',{},null);cancelJob(queued.id);cancelJob(active.id);
  assert.equal((await finish(queued.id)).state,'cancelled');assert.equal((await finish(active.id)).state,'cancelled');
  registerHandler('edit',async j=>{cancelJob(j.id);return {durablySaved:true};});
  const late=enqueue('edit',{},null);assert.equal((await finish(late.id)).state,'succeeded');
});
test('restart marks unfinished jobs interrupted and preserves completed outcomes',async()=>{
  registerHandler('edit',async()=>({saved:true}));const job=enqueue('edit',{},null);await finish(job.id);
  const queued={...getJob(job.id),id:'crashed-job',state:'running' as const};saveJob(queued);recoverJobs();
  assert.equal(getJob('crashed-job').state,'interrupted');assert.equal(getJob(job.id).state,'succeeded');
});
