import {lookup} from 'node:dns/promises';

const temporary=new Set(['EBUSY','EAI_AGAIN','EMFILE','ENFILE','ENOBUFS']);
export const temporaryDnsError=error=>temporary.has(error?.code);

// Limit OS resolver pressure and share only simultaneous lookups. Completed
// answers are never cached: every subsequent target/redirect is checked anew.
// Retries apply to DNS only, never to HTTP or paid provider operations.
export function createDnsLookup({resolve=lookup,concurrency=4,delays=[200,500,1000],wait=ms=>new Promise(done=>setTimeout(done,ms))}={}){
 const pending=new Map(),queue=[];let active=0;
 async function acquire(){if(active<concurrency){active++;return;}await new Promise(done=>queue.push(done));}
 function release(){const next=queue.shift();if(next)next();else active--;}
 return function resolveHost(host){
  if(pending.has(host))return pending.get(host);
  const work=(async()=>{
   await acquire();
   try{for(let attempt=0;;attempt++){
    try{return await resolve(host,{all:true});}
    catch(error){if(!temporaryDnsError(error)||attempt>=delays.length)throw error;await wait(delays[attempt]);}
   }}finally{release();}
  })().finally(()=>pending.delete(host));
  pending.set(host,work);return work;
 };
}
export const lookupPublicTarget=createDnsLookup();
