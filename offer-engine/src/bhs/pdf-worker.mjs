import {parentPort,workerData} from 'node:worker_threads';
import {getDocumentProxy} from 'unpdf';
let pdf;
try{
  pdf=await getDocumentProxy(new Uint8Array(workerData),{isEvalSupported:false,useSystemFonts:false,disableFontFace:true,useWorkerFetch:false,verbosity:0});
  if(pdf.numPages>200)throw Error('page_limit');
  const chunks=[];let length=0;
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i),content=await page.getTextContent();
    const text=content.items.map(x=>typeof x.str==='string'?x.str:'').join(' ');
    length+=text.length;if(length>2000000)throw Error('text_limit');
    chunks.push(text);page.cleanup();
  }
  parentPort.postMessage({text:chunks.join('\n'),pages:pdf.numPages});
}catch{parentPort.postMessage({error:'pdf_unreadable'});}
finally{try{await pdf?.loadingTask?.destroy();}catch{/* Worker termination also releases resources; cleanup must not overwrite a result. */}}
