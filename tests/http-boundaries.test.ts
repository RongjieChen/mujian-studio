import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';
test('HTTP boundaries reject hostile requests and stale restores without corrupting a project',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mujian-http-tests-'));
  const reserve=http.createServer();await new Promise<void>(resolve=>reserve.listen(0,'127.0.0.1',resolve));
  const port=(reserve.address() as any).port;await new Promise<void>(resolve=>reserve.close(()=>resolve()));
  const child=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','src/server/index.ts'],{env:{...process.env,DATA_DIR:dir,HOST:'127.0.0.1',PORT:String(port),GPU_EXCLUSIVE:'false',APP_ALLOWED_HOSTS:'',APP_ALLOWED_ORIGINS:''},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
  const base=`http://127.0.0.1:${port}`;
  try{
    let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await delay(100);}
    assert(ready,logs);
    // fetch may normalize Host to the URL host; use a raw HTTP request to
    // actually send the hostile DNS-rebinding header.
    const hostileHost=await new Promise<number|undefined>((resolve,reject)=>{const req=http.get(base+'/api/health',{headers:{host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});
    assert.equal(hostileHost,403);
    assert.equal((await fetch(base+'/api/health',{headers:{Origin:'http://127.0.0.1:9999'}})).status,403);
    assert.equal((await fetch(base+'/api/health',{headers:{Origin:'null'}})).status,403);
    assert.equal((await fetch(base+'/api/nonexistent')).status,404);
    const json=async(route:string,body:unknown,method='POST')=>fetch(base+route,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await fetch(base+'/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:'{broken'})).status,400);
    assert.equal((await json('/api/generate',{prompt:'x'.repeat(2100000)})).status,413);
    const p=await(await json('/api/projects/sample',{})).json();
    const doc=structuredClone(p.case);doc.title='并发修改后的标题';
    assert.equal((await json(`/api/projects/${p.id}/case`,{case:doc,baseRevision:1,note:'edit'},'PUT')).status,200);
    assert.equal((await json(`/api/projects/${p.id}/restore`,{revision:1,baseRevision:1})).status,409);
    assert.equal((await(await fetch(base+`/api/projects/${p.id}`)).json()).title,doc.title);
    assert.equal((await json(`/api/projects/${p.id}/restore`,{revision:1,baseRevision:2})).status,200);
    const upload=base+`/api/projects/${p.id}/upload/${doc.scenes[0].id}`;
    assert.equal((await fetch(upload,{method:'POST',headers:{'content-type':'image/png'},body:Buffer.from('89504e470d0a1a0a'+'00'.repeat(200),'hex')})).status,409);
    const image=await sharp({create:{width:16,height:16,channels:3,background:'#ffaa00'}}).png().toBuffer();
    assert.equal((await fetch(upload,{method:'POST',headers:{'content-type':'image/png'},body:image})).status,201);
    const after=await(await fetch(base+`/api/projects/${p.id}`)).json();assert.equal(after.assets.length,1);assert.equal(after.revision,3);
    assert.equal((await fetch(base+`/api/projects/${p.id}/export`)).status,200);
  }finally{
    child.kill('SIGTERM');await new Promise<void>(resolve=>child.exitCode!==null?resolve():child.once('exit',()=>resolve()));fs.rmSync(dir,{recursive:true,force:true});
  }
});
