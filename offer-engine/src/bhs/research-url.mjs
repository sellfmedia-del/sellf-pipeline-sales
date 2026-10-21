// Model and search output may omit the scheme. Normalize only web addresses;
// network.mjs still validates DNS/public IPs and every redirect before reading.
export function researchUrl(value){
 if(typeof value!=='string')return '';
 const input=value.trim();
 if(!input||input.length>2048||/[\s\u0000-\u001f\u007f\\]/u.test(input))return '';
 try{
  const candidate=input.startsWith('//')?'https:'+input:/^[a-z][a-z\d+.-]*:/i.test(input)?input:'https://'+input;
  if(!/^https?:\/\//i.test(candidate))return '';
  const url=new URL(candidate),hostname=url.hostname.replace(/\.$/,'');
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||(url.port&&!['80','443'].includes(url.port)))return '';
  if(!hostname.startsWith('[')&&(!hostname.includes('.')||hostname.split('.').some(label=>!/^([a-z\d]|[a-z\d][a-z\d-]{0,61}[a-z\d])$/i.test(label))))return '';
  url.hash='';
  return url.href.length<=2048?url.href:'';
 }catch{return '';}
}
export function researchHost(value){
 const url=researchUrl(value);
 return url?new URL(url).hostname.replace(/^www\./,''):'';
}
