import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { withMediaMemory } from '../src/server/gpu.ts';
test('GPU memory is restored after rendering failure and after a lost sleep response',async()=>{
  let sleeping=false,abortOnSleep=false;const calls:string[]=[],controller=new AbortController();
  const server=http.createServer((req,res)=>{
    calls.push(req.url!);res.setHeader('content-type','application/json');
    if(req.url?.startsWith('/sleep')){sleeping=true;if(abortOnSleep){controller.abort(new Error('cancel race'));return;}res.end('{}');}
    else if(req.url==='/is_sleeping')res.end(JSON.stringify({is_sleeping:sleeping}));
    else if(req.url==='/wake_up'){sleeping=false;res.end('{}');}
    else if(req.url==='/health')res.end('{"busy":false}');
    else res.end('{"released":true}');
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${(server.address() as any).port}`;
  Object.assign(process.env,{GPU_EXCLUSIVE:'true',GPU_BACKEND:'vllm',LLM_PROVIDER:'local',LLM_ADMIN_URL:url,MEDIA_WORKER_URL:url});
  try{
    await assert.rejects(withMediaMemory(async()=>{assert(sleeping);throw new Error('render failed');},()=>{},AbortSignal.timeout(5000)),/render failed/);
    assert.equal(sleeping,false);assert(calls.indexOf('/unload')<calls.indexOf('/wake_up'));
    calls.length=0;abortOnSleep=true;
    await assert.rejects(withMediaMemory(async()=>{throw new Error('must not render');},()=>{},controller.signal),/cancel race/);
    assert.equal(sleeping,false);assert(calls.includes('/wake_up'));
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
