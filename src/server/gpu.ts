import { setTimeout as delay } from 'node:timers/promises';

type Emit = (type:string,message:string,detail?:unknown)=>void;
const exclusive = () => process.env.GPU_EXCLUSIVE === 'true' && process.env.LLM_PROVIDER !== 'stepfun';
const vllm = () => exclusive() && process.env.GPU_BACKEND === 'vllm';
const worker = () => process.env.MEDIA_WORKER_URL || 'http://127.0.0.1:4318';
function admin() {
  const value=process.env.LLM_ADMIN_URL || (process.env.LLM_BASE_URL || 'http://127.0.0.1:8000/v1').replace(/\/v1\/?$/,'');
  const parsed=new URL(value);
  if(!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname))throw new Error('GPU 内存控制端点必须绑定本地回环地址。');
  return value;
}
async function control(route:string,method:string,signal:AbortSignal) {
  const r=await fetch(admin()+route,{method,headers:{Authorization:'Bearer '+(process.env.LLM_API_KEY||'')},signal:AbortSignal.any([signal,AbortSignal.timeout(180_000)])});
  if(!r.ok)throw new Error(`vLLM 内存控制失败 (${route}, HTTP ${r.status})；请检查本地 sleep-mode 配置。`);
  return r;
}
export async function prepareTextInference(emit:Emit,signal:AbortSignal) {
  if(!exclusive())return;
  const r=await fetch(worker()+'/unload',{method:'POST',signal:AbortSignal.any([signal,AbortSignal.timeout(25_000)])});
  if(!r.ok)throw new Error('素材模型尚未释放内存，请等待 GPU 作业结束后重试。');
  emit('memory','已释放素材模型内存。',await r.json());
  if(vllm()){
    const status=await (await control('/is_sleeping','GET',signal)).json();
    if(status.is_sleeping) {
      await control('/wake_up','POST',signal);
      emit('memory','语言模型已唤醒。');
    }
  }
}
export async function withMediaMemory<T>(work:()=>Promise<T>,emit:Emit,signal:AbortSignal):Promise<T> {
  if(!vllm())return work();
  let slept=false;
  try{
    // "wait" drains work already running; never use the default abort mode.
    slept=true;
    // A client abort can race the server's successful sleep. Recovery must run
    // even when the sleep response was lost.
    await control('/sleep?level=1&mode=wait','POST',signal);
    const status=await(await control('/is_sleeping','GET',signal)).json();
    if(status.is_sleeping!==true)throw new Error('语言模型未确认休眠，停止启动媒体模型。');
    emit('memory','语言模型已休眠，释放 KV 缓存供本地媒体生成。');
    return await work();
  }finally{
    if(slept){
      try{
        const recovery=AbortSignal.timeout(240_000);
        while(true){
          const r=await fetch(worker()+'/health',{signal:recovery});
          if(!r.ok)throw new Error('无法检查媒体作业状态');
          if(!(await r.json()).busy)break;
          await delay(1500,undefined,{signal:recovery});
        }
        await prepareTextInference(emit,recovery);
      }catch(error){
        emit('memory-warning','媒体任务已结束，但语言模型恢复尚未完成；下次创作会重试恢复。',{error:(error as Error).message});
      }
    }
  }
}
