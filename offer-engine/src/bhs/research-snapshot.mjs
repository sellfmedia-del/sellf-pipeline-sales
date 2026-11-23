import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {hash} from '../budget/ledger.mjs';
import {groundOfferReport} from './source-gate.mjs';
import {hasGroundedResearch,requireGroundedResearch} from './research-content.mjs';
import {isExpertMethodology} from './expert-report.mjs';
import {validateConversationReport,conversationAuditResult} from './conversation-report.mjs';
import {conversationTransferIssues} from './conversation-transfer.mjs';

const version='source-checked-research-v1',maxBytes=1800000,maxEncoded=280000;
const withoutOriginal=report=>{const copy=structuredClone(report);delete copy.originalReport;delete copy.transfer;return copy;};
// Called only after the audit proof is verified by pricing. Store the full
// filtered research, never a customer excerpt or rejected model document.
// Original literal quotations retain their original retrieval method/date;
// this is a historical capture, not a new read or freshness attestation.
export function createResearchSnapshot(audit,brief){
 if(!hasGroundedResearch(audit))return null;
 let report=withoutOriginal(audit.report||audit),transferRestoration;
 const researchedAt=audit.researchReuse?.researchedAt||audit.researchAsOf||null;
 if(report.conversation&&report.conversationTransfer){
  const issues=conversationTransferIssues(report.conversation,report.conversationSources||[],report.conversationTransfer,{projections:[audit,report]});
  if(issues.length&&issues.every(code=>code.endsWith('_projection_mismatch'))){
   // Rebuild only derived fields from the same intact, digest-bound answer.
   // No model, source re-read, report rewrite or new budget is involved.
   report=withoutOriginal(conversationAuditResult(brief,{report}).data.report);
   transferRestoration={method:'same-report-projection',issues,additionalPaidCalls:0};
  }
 }
 const sourceContext=audit.researchContext||{brandName:brief.brandName,website:brief.website,briefHash:audit.researchReuse?.originalBriefHash||audit.briefHash};
 const packet={version:'sellf-evidence-v1',briefHash:sourceContext.briefHash,asOf:researchedAt,provenance:'historical-verified-quotes-only',sources:report.sources.map(s=>({url:s.url,finalUrl:s.url,title:s.title,method:s.verification.method,excerpts:[{text:s.quote}],retrievedAt:researchedAt}))};
 if(report.conversation){
  if(validateConversationReport(report.conversation,report.conversationSources||[],{semantic:Boolean(report.semanticReview),objective:Boolean(report.objectiveValidationVersion)}).length)return null;
  requireGroundedResearch(report);
 }else requireGroundedResearch(groundOfferReport(report,{packet,brief,preserveQualifiedImpacts:isExpertMethodology(audit.methodologyVersion)}));
 const claimContext=Object.fromEntries(['goals','needs','services','meetingNotes'].map(key=>[key,brief[key]||'']));
 const payload={version,report,analysisPacket:packet,researchedAt,sourceContext,claimContext,methodologyVersion:audit.methodologyVersion,...(audit.supervision?{supervision:audit.supervision}:{}),...(transferRestoration?{transferRestoration}:{})};
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
 let report;
 if(payload.report.conversation){
  if(validateConversationReport(payload.report.conversation,payload.report.conversationSources||[],{semantic:Boolean(payload.report.semanticReview),objective:Boolean(payload.report.objectiveValidationVersion)}).length)throw Error('Saklanan analiz kaynağı doğrulanamadı.');
  report=requireGroundedResearch(payload.report);
 }else report=requireGroundedResearch(groundOfferReport(payload.report,{packet:payload.analysisPacket,brief,preserveQualifiedImpacts:isExpertMethodology(payload.methodologyVersion)}));
 return {...payload,report:withoutOriginal(report)};
}
