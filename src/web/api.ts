export async function api<T = any>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const r=await fetch(`/api${url}`,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const result=await r.json();if(!r.ok)throw new Error(result.error||`请求失败 (${r.status})`);return result;
}
export const time=(date:string)=>new Date(date).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
export const seconds=(ms:number)=>ms<1000?`${ms} ms`:`${(ms/1000).toFixed(1)} 秒`;
