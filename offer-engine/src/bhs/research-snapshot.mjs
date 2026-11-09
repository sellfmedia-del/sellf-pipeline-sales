import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {hash} from '../budget/ledger.mjs';
import {groundOfferReport} from './source-gate.mjs';
import {hasGroundedResearch,requireGroundedResearch} from './research-content.mjs';
import {expertVersion} from './expert-report.mjs';

const version='source-checked-research-v1',maxBytes=1800000,maxEncoded=280000;
const withoutOriginal=report=>{const copy=structuredClone(report);delete copy.originalReport;delete copy.transfer;return copy;};
// Called only after the audit proof is verified by pricing. Store the full
// filtered research, never a customer excerpt or rejected model document.
// Original literal quotations retain their original retrieval method/date;
// this is a historical capture, not a new read or freshness attestation.
export function createResearchSnapshot(audit,brief){
 if(!hasGroundedResearch(audit))return null;
 const report=withoutOriginal(audit.report||audit),researchedAt=audit.researchReuse?.researchedAt||audit.researchAsOf||null;
 const sourceContext=audit.researchContext||{brandName:brief.brandName,website:brief.website,briefHash:audit.researchReuse?.originalBriefHash||audit.briefHash};
 const packet={version:'sellf-evidence-v1',briefHash:sourceContext.briefHash,asOf:researchedAt,provenance:'historical-verified-quotes-only',sources:report.sources.map(s=>({url:s.url,finalUrl:s.url,title:s.title,method:s.verification.method,excerpts:[{text:s.quote}],retrievedAt:researchedAt}))};
 requireGroundedResearch(groundOfferReport(report,{packet,brief,preserveQualifiedImpacts:audit.methodologyVersion===expertVersion}));
 const claimContext=Object.fromEntries(['goals','needs','services','meetingNotes'].map(key=>[key,brief[key]||'']));
 const payload={version,report,analysisPacket:packet,researchedAt,sourceContext,claimContext,methodologyVersion:audit.methodologyVersion};
 const json=JSON.stringify(payload);if(Buffer.byteLength(json)>maxBytes)throw Error('Saklanan araştırmanın boyut sınırı aşıldı.');
 const data=deflateRawSync(Buffer.from(json)).toString('base64url');if(data.length>maxEncoded)throw Error('Saklanan araştırmanın aktarım sınırı aşıldı.');
 return {version,encoding:'deflate-raw-base64url',digest:hash(payload),data};
}
// Integrity is additionally bound by pricing/proposal/save proofs and the
// authorised offer-detail boundary. Corrupt captures never fall back silently.
export function readResearchSnapshot(snapshot){
 if(snapshot?.version!==version||snapshot.encoding!=='deflate-raw-base64url'||typeof snapshot.data!=='string'||snapshot.data.length>maxEncoded||!snapshot.data.length||!/^[A-Za-z0-9_-]+$/.test(snapshot.data))throw Error('Saklanan BHS biçimi geçersiz.');
 let payload;try{payload=JSON.parse(inflateRawSync(Buffer.from(snapshot.data,'base64url'),{maxOutputLength:maxBytes}).toString('utf8'));}catch{throw Error('Saklanan BHS okunamadı.');}
 if(payload?.version!==version||hash(payload)!==snapshot.digest||!payload.sourceContext?.brandName||!payload.sourceContext?.website||!/^[a-f0-9]{64}$/.test(payload.sourceContext.briefHash||'')||payload.analysisPacket?.provenance!=='historical-verified-quotes-only')throw Error('Saklanan BHS dayanağı doğrulanamadı.');
 const brief={...payload.claimContext,brandName:payload.sourceContext.brandName,website:payload.sourceContext.website};
 const report=requireGroundedResearch(groundOfferReport(payload.report,{packet:payload.analysisPacket,brief,preserveQualifiedImpacts:payload.methodologyVersion===expertVersion}));
 return {...payload,report:withoutOriginal(report)};
}
