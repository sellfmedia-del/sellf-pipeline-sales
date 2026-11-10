// Protected public-brand QA checkpoints only. Never use this transport for keys.
export async function fetchQaCheckpoint(link,{fetchImpl=fetch}={}){
 const initial=new URL(link),origin=initial.origin;
 if(!/^sellf-pipeline-sales-[a-z0-9]+-yigit-konuks-projects\.vercel\.app$/.test(initial.hostname)||initial.protocol!=='https:'||initial.username||initial.password)throw Error('Unapproved QA checkpoint origin.');
 initial.pathname='/bhs-sequential-checkpoint.json';initial.hash='';
 let current=initial,cookies=[];
 for(let i=0;i<4;i++){
  const r=await fetchImpl(current,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:cookies.length?{Cookie:cookies.join('; ')}:{}});
  cookies.push(...r.headers.getSetCookie().map(v=>v.split(';')[0]));
  if(r.status>=300&&r.status<400){const next=new URL(r.headers.get('location'),current);if(next.origin!==origin)throw Error('QA checkpoint redirect left origin.');current=next;continue;}
  if(!r.ok||Number(r.headers.get('content-length'))>2000000)throw Error('QA checkpoint unavailable.');
  const reader=r.body.getReader(),parts=[];let bytes=0;
  try{for(;;){const v=await reader.read();if(v.done)break;bytes+=v.value.byteLength;if(bytes>2000000)throw Error('QA checkpoint too large.');parts.push(v.value);}}finally{await reader.cancel();}
  const wrapper=JSON.parse(Buffer.concat(parts).toString('utf8'));if(wrapper.encoding!=='br-base64'||!['humm','muratbey','sutas','duru','tadim'].includes(wrapper.case)||typeof wrapper.data!=='string')throw Error('QA checkpoint format invalid.');return wrapper.data;
 }
 throw Error('QA checkpoint redirect limit.');
}
