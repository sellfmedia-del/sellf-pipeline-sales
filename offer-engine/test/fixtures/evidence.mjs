import {brief,fixture,quote} from './bhs.mjs';
import {snapshotBrief,briefHash} from '../../src/bhs/brief.mjs';
import {reportHash} from '../../src/bhs/semantic.mjs';
import {evidenceHash} from '../../src/bhs/evidence.mjs';
export const plan={entities:[{id:'brand',role:'brand',name:'Test Brand',website:brief.website},...['peer-one','peer-two','peer-three'].map((name,i)=>({id:'peer'+i,role:'competitor',name,website:'https://'+name+'.example/about'}))].map(e=>({...e,scaleReason:'Scale unknown',audienceReason:'Kitchen products',geographyReason:'Turkey',scope:'Public products only'})),sources:[brief.website,...['peer-one','peer-two','peer-three'].map(name=>'https://'+name+'.example/about')].map(url=>({url,purpose:'Identity and product scope'}))};
export function context(){
 const report=JSON.parse(JSON.stringify(fixture()).replace(/s([0-3])/g,(_,n)=>'ev'+(Number(n)+1)));
 report.dimensions.forEach(d=>{d.score=null;d.dataStatus='insufficient';});report.findings.forEach(f=>f.reportExcerpt=f.statement);
 const packet={version:'sellf-evidence-v1',briefHash:briefHash(snapshotBrief(brief)),asOf:'2026-10-19',entities:plan.entities,sources:report.sources.map(s=>({id:s.id,url:s.url,finalUrl:s.url,title:s.title,method:'html',excerpts:[{id:'p0',offset:0,text:quote}],contentHash:'a'.repeat(64),retrievedAt:'2026-10-19T00:00:00.000Z'})),unavailable:[]};
 const assessment={reportHash:reportHash(report),packetHash:evidenceHash(packet),checks:Object.fromEntries(['entityScope','periodComparability','claimsQualified','missingDataHonest','competitorComparability','overviewGrounded','questionsAndServicesGrounded','readerLimitationsQualified'].map(k=>[k,true])),findings:report.findings.map(f=>({id:f.id,verdict:'supported',reason:'Fixture support'})),dimensions:report.dimensions.map(d=>({id:d.id,scoreJustified:true,reason:'Unknown data stays null'})),benchmarks:[],issues:[]};
 return {packet,report,assessment};
}
