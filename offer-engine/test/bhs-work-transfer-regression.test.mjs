import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const root=process.env.BHS_BASELINE_ROOT?pathToFileURL(process.env.BHS_BASELINE_ROOT+'/offer-engine/'):new URL('../',import.meta.url);
const {applySemanticDecision}=await import(new URL('src/bhs/conversation-semantic.mjs',root));
const {conversationAuditResult}=await import(new URL('src/bhs/conversation-report.mjs',root));
const {createResearchSnapshot,readResearchSnapshot}=await import(new URL('src/bhs/research-snapshot.mjs',root));
const {brief,researchSources,marketSource,peerSource,usageSource,completeResearchProgress,semanticApproval,report}=await import(new URL('test/fixtures/bhs-conversation.mjs',root));
const {strongNarrativeReport}=await import(new URL('test/fixtures/bhs-strong-narrative.mjs',root));
let policy,transfer;
try{policy=(await import(new URL('src/bhs/conversation-work.mjs',root))).researchWorkPolicyVersion;transfer=(await import(new URL('src/bhs/conversation-transfer.mjs',root))).createConversationTransfer;}
catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const version={reviewPolicyVersion:policy||'targeted-claim-review-v2'};
function stored(draft,sources=researchSources,p=completeResearchProgress()){
 return {conversationReport:draft,conversationSources:sources,semanticReview:applySemanticDecision(draft,semanticApproval(draft,version),{brief,sources,progress:p,...version}).review,
  ...(transfer?{conversationTransfer:transfer(draft,sources,{progress:p})}:{})};
}
test('an explicitly identified public task cannot be signed off as a future client action',()=>{
 const draft=strongNarrativeReport();draft.questions.push('Rakibin ürün sipariş yolunu daha sonra inceleyin.');const decision=semanticApproval(draft,version);
 if(policy)decision.workReview={rationale:'Bu gerekli kamu araştırması BHS içinde tamamlanmalı.',items:[{path:'questions.'+(draft.questions.length-1),text:draft.questions.at(-1),access:'public',status:'open',questionId:'',issueId:'',sourceIds:[],reason:'Kamu sayfası okunarak yanıtlanabilecek görev.'}]};
 assert.throws(()=>applySemanticDecision(draft,decision,{brief,sources:researchSources,progress:completeResearchProgress(),...version}),e=>e.code==='semantic_review_invalid');
});
test('a stale summary projection cannot be saved as if it were the canonical full answer summary',()=>{
 const draft=strongNarrativeReport(),audit=conversationAuditResult(brief,stored(draft));audit.data.report.summary='Kısaltılmış ve farklı aktarım.';
 const capture=readResearchSnapshot(createResearchSnapshot(audit.data,brief));assert.equal(capture.report.summary,draft.summary);
});
test('uncited discovery history survives transfer as discovery, never as a newly read body',()=>{
 const sources=[researchSources[0],...[marketSource,peerSource,usageSource].map(row=>({...row,method:'search-snippet'}))],draft=report(),p=completeResearchProgress();
 p.proofs=p.proofs.filter(row=>row.sourceId===sources[0].id);
 const audit=conversationAuditResult(brief,stored(draft,sources,p));
 assert.equal(audit.data.conversationTransfer?.counts.discoveryOnly,3);assert.equal(audit.data.conversationTransfer?.counts.bodyAvailable,1);
 assert.equal(audit.data.sources.length,1);
});
