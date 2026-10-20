import {reportSchema} from './schema.mjs';
import {brandPublisher,identityAuthority,declaresWebsite} from './identity.mjs';
import {assertCoreEvidence} from './evidence.mjs';
const host=url=>new URL(url).hostname.replace(/^www\./,'');
// Keep relevant full excerpts, including issuer/period context, rather than
// sending repeated global/product/navigation pages to every model call.
export function focusEvidence(packet,brief){
 const peers=packet.entities.filter(e=>e.role==='competitor');
 const mandatory=[];
 const identity=packet.sources.find(s=>identityAuthority(s.finalUrl)&&s.excerpts.some(e=>declaresWebsite(e.text,brief.website)))||packet.sources.find(s=>brandPublisher(s.finalUrl,brief.website));
 if(identity)mandatory.push(identity);
 for(const peer of peers){const source=packet.sources.find(s=>host(s.finalUrl)===host(peer.website)&&!s.metadataOnly);if(source)mandatory.push(source);}
 const peerHosts=new Set(peers.map(e=>host(e.website)));
 const score=s=>{
  const value=s.finalUrl+' '+s.title;let rank=0;
  if(/faaliyet|annual|financial|finans|sürdürü|surdur|tsrs|rapor|kap\.org/i.test(decodeURI(value)))rank+=12;
  if(peerHosts.has(host(s.finalUrl)))rank+=7;
  if(/servis|service|bayi|dealer|hakkimiz|hakkımız/i.test(value))rank+=4;
  if(/sikayetvar|reviews/i.test(value))rank+=8;
  if(/youtube|linkedin|wikipedia/i.test(value))rank-=8;
  if(/urun.?bilgi|ürün.?bilgi|product.?information|formu/i.test(decodeURI(value)))rank-=8;
  return rank;
 };
 const chosen=[...new Map([...mandatory,...[...packet.sources].sort((a,b)=>score(b)-score(a))].map(s=>[s.id,s])).values()].slice(0,12);
 const sources=chosen.map(s=>{
  const scored=s.excerpts.map((e,i)=>({e,i,rank:(e.text.match(/finansal|net satış|net satis|hasılat|has[iı]lat|kâr|karı|dönem|donem|202[456]|internet|www\.|bayi|servis|ürün|ankastre/gi)||[]).length+(i===0?10:0)+(declaresWebsite(e.text,brief.website)?1000:0)}));
  const excerpts=scored.sort((a,b)=>b.rank-a.rank||a.i-b.i).slice(0,4).sort((a,b)=>a.i-b.i).map(x=>x.e);
  return {...s,excerpts};
 });
 const focused={...packet,sources};assertCoreEvidence(focused,brief);return focused;
}
export function boundedReportSchema(packet){
 // reportSchema intentionally shares its generic ID schema. A JSON clone
 // separates those nodes before source IDs and finding IDs receive enums.
 const schema=JSON.parse(JSON.stringify(reportSchema)),p=schema.properties,sourceIds=packet.sources.map(s=>s.id);
 const readPeers=packet.entities.filter(e=>e.role==='competitor'&&packet.sources.some(s=>host(s.finalUrl)===host(e.website)&&!s.metadataOnly));
 const peerIds=readPeers.map(p=>p.id),findingIds=['financial','operations','funnel','digital','perception','competition'].flatMap(d=>[1,2].map(n=>d+'_'+n));
 p.sources.minItems=8;p.sources.maxItems=12;p.sources.items.properties.id.enum=sourceIds;p.sources.items.properties.url.enum=packet.sources.map(s=>s.finalUrl);
 p.competitors.minItems=3;p.competitors.items.properties.id.enum=peerIds;p.competitors.items.properties.sourceIds.minItems=1;
 p.findings.minItems=12;p.findings.maxItems=12;p.findings.items.properties.id.enum=findingIds;
 p.findings.items.properties.statement.maxLength=260;p.findings.items.properties.reportExcerpt.maxLength=260;p.findings.items.properties.impact.maxLength=200;p.findings.items.properties.goalConnection.maxLength=200;
 p.dimensions.items.properties.findingIds.minItems=2;p.dimensions.items.properties.rationale.maxLength=400;
 p.benchmarks.items.properties.entries.minItems=4;p.benchmarks.items.properties.entries.items.properties.entityId.enum=['brand',...peerIds];
 p.meetingQuestions.maxItems=6;p.meetingQuestions.items.properties.question.maxLength=200;
 p.serviceRecommendations.minItems=2;p.serviceRecommendations.maxItems=3;
 function bind(node,key){if(key==='sourceIds'){node.items.enum=sourceIds;node.maxItems=3;}if(key==='findingIds'){node.items.enum=findingIds;node.maxItems=3;}if(key==='comparisonCompetitorIds'){node.items.enum=peerIds;node.maxItems=3;}for(const[k,v]of Object.entries(node.properties||{}))bind(v,k);if(node.items)bind(node.items,'');}
 bind(schema,'');return schema;
}
