import {arr,obj,str} from './sequential-contracts.mjs';
import {identityAuthority,declaresWebsite} from './identity.mjs';
import {isReadEvidence} from './research-content.mjs';
import {researchHost,researchUrl} from './research-url.mjs';

export const publisherIdentitiesSchema=arr(obj({website:str(2048),sourceUrl:str(2048),
 legalName:str(160),address:str(200),quote:str(600)}),2);
export const publisherIdentityInstruction='Farklı bir alan adını aynı markanın resmî yayıncısı saymak için publishers alanına en fazla iki kayıtla, yalnız okuduğun kurumsal kaynaktaki site işletmecisinin tam ticari unvanını, adresini ve ikisini birlikte içeren özgün alıntıyı yaz. website o işletmecinin sitesi, sourceUrl okunan kaynaktır. Üretici veya distribütörün bilgilerini sitenin kendi işletmecisiyle karıştırma. Aynı ticari unvan ve adres iki sitede doğrulanmıyorsa bağlantıyı belirsiz bırak. Arama alıntısı, benzer marka adı, e-posta veya sosyal hesap tek başına alan adı sahipliğini doğrulamaz. Resmî sicil kaynağı kullanılıyorsa alıntı ilgili web adresini de açıkça bildirmeli. Gerekli kaynak yoksa publishers boş olsun; bu alan için ek çağrı zorunluluğu yoktur.';
const compact=value=>String(value||'').normalize('NFKC').replace(/\s+/gu,' ').trim();
const key=value=>compact(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const supplierIdentity=/(?<![\p{L}\p{N}])(?:manufacturer|manufactured by|producer|distribut(?:or|ed by)|üretici|uretici|fabricant|hersteller)(?![\p{L}\p{N}])/iu;
const publisherIdentity=/(?<![\p{L}\p{N}])(?:site operator|website operator|operated by|owned by|site owner|website owner|site işletmecisi|site isletmecisi)(?![\p{L}\p{N}])/iu;

function supportedIdentities(packet){
 const rows=[];
 for(const row of (Array.isArray(packet?.publisherIdentities)?packet.publisherIdentities:[]).slice(0,16)){
  if(!row||typeof row!=='object'||['website','sourceUrl','legalName','address','quote'].some(k=>typeof row[k]!=='string'))continue;
  const website=researchUrl(row.website),url=researchUrl(row.sourceUrl),quote=compact(row.quote);
  const legalName=compact(row.legalName),address=compact(row.address);
  if(!website||!url||key(legalName).length<2||legalName.length>160||address.length<10||address.length>200||!key(address)||!quote||quote.length>600)continue;
  const source=packet.sources?.find(s=>isReadEvidence(s)&&researchUrl(s.finalUrl||s.url)===url&&
   s.excerpts?.some(e=>compact(e.text).includes(quote)));
  if(!source||!key(quote).includes(key(legalName))||!key(quote).includes(key(address)))continue;
  if(supplierIdentity.test(quote)&&!publisherIdentity.test(quote))continue;
  const ownPage=researchHost(url)===researchHost(website);
  if(!ownPage&&(!identityAuthority(url)||!declaresWebsite(quote,website)))continue;
  rows.push({website,sourceUrl:url,legalName,address,quote});
 }
 return rows;
}

export function retainBrandPublishers(packet,publishers=[]){
 const supplied=Array.isArray(publishers)?publishers.slice(0,8):[];
 const stored=Array.isArray(packet.publisherIdentities)?packet.publisherIdentities:[];
 const rows=supportedIdentities({...packet,publisherIdentities:[...stored,...supplied]});
 const unique=[...new Map(rows.map(row=>[JSON.stringify([row.website,row.sourceUrl,row.legalName,row.address]),row])).values()].slice(0,16);
 return unique.length?{...packet,publisherIdentities:unique}:packet;
}

// Recheck the stored quotations against this run's read pages. Neither a
// model assertion nor a discovered URL can silently become an official host.
export function brandPublisherHosts(website,packet){
 const hosts=new Set([researchHost(website)].filter(Boolean));
 const rows=supportedIdentities(packet),sources=(packet?.sources||[]).filter(isReadEvidence);
 for(let pass=0;pass<=sources.length+rows.length;pass++){
  const before=hosts.size;
  for(const source of sources)if(hosts.has(researchHost(source.url)))hosts.add(researchHost(source.finalUrl||source.url));
  const owners=new Set(rows.filter(row=>hosts.has(researchHost(row.website)))
   .map(row=>JSON.stringify([key(row.legalName),key(row.address)])));
  for(const row of rows)if(owners.has(JSON.stringify([key(row.legalName),key(row.address)])))hosts.add(researchHost(row.website));
  if(hosts.size===before)break;
 }
 hosts.delete('');return hosts;
}

export function brandProductSources(website,packet){
 const hosts=brandPublisherHosts(website,packet);
 const sources=(packet?.sources||[]).filter(source=>isReadEvidence(source)&&researchUrl(source.finalUrl||source.url)).sort((a,b)=>
  Number(hosts.has(researchHost(b.finalUrl||b.url)))-Number(hosts.has(researchHost(a.finalUrl||a.url))));
 const result=[],seen=new Set();let linkCount=0,chars=0;
 for(const source of sources){
  if(result.length===8)break;
  const url=source.finalUrl||source.url,host=researchHost(url);
  const links=[...(source.technicalSignals?.identityLinks||[]),...(source.technicalSignals?.navigation||[])];
  const productLinks=[...new Map(links.filter(link=>researchHost(link.url)===host&&
   !seen.has(researchUrl(link.url))&&/product|ürün|urun|shop|store|catalog|collection|set[-/]|mat[-/]/iu.test(link.url+' '+link.label))
   .map(link=>[researchUrl(link.url),{url:researchUrl(link.url),label:compact(link.label).slice(0,120)}])).values()].slice(0,Math.min(4,8-linkCount));
  const row={url,title:compact(source.title).slice(0,150),status:hosts.has(host)?'official':'unconfirmed',productLinks};
  const size=JSON.stringify(row).length;
  if(chars+size>8000)continue;
  result.push(row);chars+=size;linkCount+=productLinks.length;
  for(const link of productLinks)seen.add(link.url);
 }
 return result;
}
