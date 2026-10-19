import {citationUrls,modelText} from './provider.mjs';
const host=url=>new URL(url).hostname.replace(/^www\./,'');
export function discoverySourceHints(research,brief){
 const cited=new Set(citationUrls(research)),brand=host(brief.website),result=[];
 for(const m of modelText(research).matchAll(/\[([^\]]+)\]\((https?:[^\s)]+)\)/g)){
  const label=m[1].toLowerCase().replace(/^www\./,'');
  if(cited.has(m[2])&&(label===brand||label.endsWith('.'+brand)||['kap.org.tr','sec.gov','find-and-update.company-information.service.gov.uk'].includes(label)))result.push(m[2]);
 }
 return [...new Set(result)].slice(0,12);
}
