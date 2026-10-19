import {Worker} from 'node:worker_threads';
export function extractPdfText(bytes){
  if(bytes.length>8*1024*1024||!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))return Promise.reject(Error('pdf_invalid'));
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./pdf-worker.mjs',import.meta.url),{workerData:bytes,resourceLimits:{maxOldGenerationSizeMb:96,maxYoungGenerationSizeMb:16}});
    let finished=false;
    const done=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);worker.terminate().catch(()=>{});if(error)reject(Error('pdf_unreadable'));else resolve(result);};
    const timer=setTimeout(()=>done(Error('timeout')),15000);
    worker.once('message',value=>{if(value.error||typeof value.text!=='string')done(Error('pdf_unreadable'));else done(null,value);});
    worker.once('error',error=>done(error));
    worker.once('exit',()=>{if(!finished)done(Error('pdf_exit'));});
  });
}
