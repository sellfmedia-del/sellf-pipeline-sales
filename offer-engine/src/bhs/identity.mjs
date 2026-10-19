const host=url=>new URL(url).hostname.toLowerCase().replace(/^www\./,'');
const registries=['kap.org.tr','sec.gov','find-and-update.company-information.service.gov.uk'];
export const brandPublisher=(url,website)=>host(url)===host(website);
export const identityAuthority=url=>registries.some(domain=>host(url)===domain||host(url).endsWith('.'+domain));
export function declaresWebsite(text,website){
 // An email address, lookalike hostname or different national domain is not a
 // declaration of this website. Require an explicit web-address token.
 for(const m of String(text).matchAll(/(?:https?:\/\/|www\.)[a-z0-9.-]+/gi)){
  try{if(host(m[0].startsWith('www.')?'https://'+m[0]:m[0])===host(website))return true;}catch{/* Ignore malformed text tokens. */}
 }
 return false;
}
export function packetBrandIdentity(packet,brief){
 return packet.sources.some(s=>brandPublisher(s.finalUrl,brief.website)||(identityAuthority(s.finalUrl)&&s.excerpts.some(e=>declaresWebsite(e.text,brief.website))));
}
export function reportBrandIdentity(source,brief){
 const url=source.verification?.finalUrl||source.url;
 return brandPublisher(url,brief.website)||(source.sourceType==='primary'&&identityAuthority(url)&&declaresWebsite(source.quote,brief.website));
}
