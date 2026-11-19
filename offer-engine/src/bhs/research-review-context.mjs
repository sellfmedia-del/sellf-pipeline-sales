// This is a transport window, not an evidence filter. Durable receipts and
// server-side scope/proof validation continue to use the complete archive.
export function researchReviewContext(request,seenProofIds){
 const unseen=request.findings.filter(row=>!seenProofIds.has(row.id));
 const priorities=[...(request.pendingCommands||[]).map(row=>row.id),request.previous.at(-1)?.id,
  ...request.needs.filter(need=>!request.checked.some(row=>row.id===need.id&&row.sufficient)).map(need=>need.id),
  ...request.needs.map(need=>need.id)].filter(Boolean);
 const order=[...new Set(priorities)],selected=[],selectedIds=new Set();
 let remaining=24000;
 const add=fact=>{
  if(selectedIds.has(fact.id))return;
  const size=JSON.stringify(fact).length;
  if(size>remaining&&selected.length)return;
  selected.push(fact);selectedIds.add(fact.id);remaining-=size;
 };
 // Round-robin complete excerpts, starting with the active question. A large
 // earlier task must not permanently hide a later task's source material.
 const queues=order.map(id=>unseen.filter(fact=>fact.needId===id).reverse());
 for(let at=0;at<Math.max(0,...queues.map(queue=>queue.length));at++)
  for(const queue of queues)if(queue[at])add(queue[at]);
 const accepted=new Set(request.checked.flatMap(row=>row.proofs||[]));
 for(const fact of request.findings.filter(row=>accepted.has(row.id)))add(fact);
 const active=new Set(selected.map(row=>row.needId));
 for(const row of request.pendingCommands||[])active.add(row.id);
 if(request.previous.at(-1))active.add(request.previous.at(-1).id);
 const previous=request.previous.filter(row=>active.has(row.id)).slice(-8);
 const commands=(request.commandHistory||[]).filter(row=>active.has(row.id)).slice(-12);
 const importantUrls=new Set([...selected.map(row=>row.url),...(request.pendingCommands||[]).map(row=>row.url),
  ...request.checked.filter(row=>active.has(row.id)).map(row=>row.read)].filter(Boolean));
 let urlRoom=12000;
 const knownUrls=[...request.knownUrls.filter(url=>importantUrls.has(url)),...request.knownUrls.filter(url=>!importantUrls.has(url))]
  .filter(url=>{if(url.length>urlRoom&&!importantUrls.has(url))return false;urlRoom-=url.length;return true;});
 const backlog=request.needs.flatMap(need=>{
  const count=unseen.filter(row=>row.needId===need.id&&!selectedIds.has(row.id)).length;
  return count?[{id:need.id,unseenSources:count}]:[];
 });
 return {proofIds:[...selectedIds],backlog:backlog.reduce((sum,row)=>sum+row.unseenSources,0),request:{...request,
  needs:request.needs.map(need=>Object.fromEntries(Object.entries(need).filter(([,value])=>value!==''))),
  findings:selected,knownUrls,previous,
  checked:request.checked.map(row=>active.has(row.id)?row:{id:row.id,sufficient:row.sufficient,proofs:row.proofs,
   ...(row.answerFit?{answerFit:row.answerFit}:{})}),
  ...(request.commandHistory?{commandHistory:commands}:{}),
  ...(backlog.length?{evidenceBacklog:backlog}:{}),
  retainedHistory:{receipts:request.previous.length-previous.length,commands:(request.commandHistory||[]).length-commands.length,
   urls:request.knownUrls.length-knownUrls.length},
  instruction:request.instruction+' findings bu karar turunun tam kaynak pasajlarıdır; ham arşiv silinmedi. checked içindeki önceki doğrulanmış kararlar korunur. evidenceBacklog varsa diğer pasajlar sıradaki inceleme penceresinde sunulabilir. Görmediğin pasajdan yeni proof seçme. Gerekli mevcut kanıtın incelemesi sürüyorsa yeni arama yerine commands boş kalabilir; sıradaki pencerede devam et.'}};
}
