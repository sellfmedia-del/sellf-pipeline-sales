// Recover only JSON values that actually finished in the returned document.
// Never guess a truncated sentence, number, quote or closing delimiter.
export function readPartialOutput(text){
 const stripped=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 try{return {data:JSON.parse(stripped),issues:[]};}catch{}
 const start=stripped.indexOf('{'),data={};let at=start+1;
 if(start>=0)while(at<stripped.length){
  const match=stripped.slice(at).match(/^\s*,?\s*("(?:[^"\\]|\\.)*")\s*:\s*/);if(!match)break;
  const key=JSON.parse(match[1]);at+=match[0].length;
  const begin=at;let quoted=false,escape=false,depth=0,complete=false;
  for(;at<stripped.length;at++){
   const c=stripped[at];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue;}
   if(c==='"'){quoted=true;continue;}if(c==='{'||c==='[')depth++;
   if(c==='}'||c===']'){if(depth===0){complete=true;break;}depth--;}
   if(c===','&&depth===0){complete=true;break;}
  }
  if(!complete){
   if(stripped[begin]==='['){
    const rows=[];let rowStart=begin+1,level=0,inString=false,escaped=false;
    for(let i=rowStart;i<stripped.length;i++){
     const c=stripped[i];if(inString){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')inString=false;continue;}
     if(c==='"'){inString=true;continue;}if(c==='{'||c==='[')level++;if(c==='}'||c===']')level--;
     if(c===','&&level===0){try{rows.push(JSON.parse(stripped.slice(rowStart,i)));rowStart=i+1;}catch{break;}}
    }
    if(rows.length&&!['__proto__','constructor','prototype'].includes(key))data[key]=rows;
   }
   break;
  }
  try{const value=JSON.parse(stripped.slice(begin,at));if(!['__proto__','constructor','prototype'].includes(key))data[key]=value;}catch{break;}
  if(stripped[at]==='}')break;
 }
 return {data,originalText:text,issues:['partial_model_document']};
}
