import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const root=process.env.BHS_BASELINE_ROOT?pathToFileURL(process.env.BHS_BASELINE_ROOT+'/offer-engine/'):new URL('../',import.meta.url);
const {applySemanticDecision}=await import(new URL('src/bhs/conversation-semantic.mjs',root));
const {hash}=await import(new URL('src/budget/ledger.mjs',root));
const {brief,source,researchSources,completeResearchProgress}=await import(new URL('test/fixtures/bhs-conversation.mjs',root));
const {strongNarrativeReport,weakClaim,correctedClaim}=await import(new URL('test/fixtures/bhs-strong-narrative.mjs',root));
let policy;
try{policy=(await import(new URL('src/bhs/conversation-review-contract.mjs',root))).reviewPolicyVersion;}
catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const options={sources:researchSources,brief,progress:completeResearchProgress(),...(policy?{reviewPolicyVersion:policy}:{})};
function nativeDecision(draft,{verdict='patch',issues,patches,briefCheck=false}={}){
 return {draftDigest:hash(draft),verdict,rationale:'Sentetik karar: iyi raporu koru, yalnız yanlış iddiayı düzelt ve gerçek public açığı araştır.',issues,patches,
  ...(policy?{claimScope:'Sentetik özet, rapor ve SWOT kesinliği değerlendirildi.',claimChecks:[{
   path:briefCheck?'summary':'reportMarkdown',text:briefCheck?draft.summary:weakClaim,kind:briefCheck?'brief_statement':'hypothesis',
   basis:'Gerçek olmayan kesinlik doğrulanmış marka koşulu değildir.',sourceIds:[],briefQuote:briefCheck?'Satış sonrası deneyim kötüdür.':'',
   verification:'Hesap veya müşteri kaydı ve olay testiyle doğrula.',issueId:briefCheck?'':'measurement'}]}:{})};
}
const issue={id:'measurement',reason:'Görünmeyen etiket verimsizlik kanıtı değildir.',resolution:'Koşullu analiz olarak düzelt.',sourceIds:[source.id],question:'',access:'analysis'};
test('a uniquely matching whitespace-varied claim can be repaired without discarding the good report',()=>{
 const draft=strongNarrativeReport({flawed:true});draft.reportMarkdown=draft.reportMarkdown.replace(weakClaim,weakClaim.replaceAll(' ','\n  '));
 const decision=nativeDecision(draft,{issues:[issue],patches:[{issueId:'measurement',path:'reportMarkdown',operation:'replace_text',before:weakClaim,after:correctedClaim}]});
 assert.equal(applySemanticDecision(draft,decision,options).report.reportMarkdown,draft.reportMarkdown.replace(weakClaim.replaceAll(' ','\n  '),correctedClaim));
});
test('a repairable wrong claim and a separate public research gap do not invalidate each other',()=>{
 const draft=strongNarrativeReport({flawed:true}),decision=nativeDecision(draft,{verdict:'research_needed',issues:[issue,
  {...issue,id:'peer_order',access:'public',question:'Rakibin doğrudan sipariş koşulu nedir?',resolution:''}],
  patches:[{issueId:'measurement',path:'reportMarkdown',operation:'replace_text',before:weakClaim,after:correctedClaim}]});
 const result=applySemanticDecision(draft,decision,options);assert.equal(result.review.status,'research_needed');
 assert.deepEqual(result.review.researchIssues.map(row=>row.id),['peer_order']);assert.equal(result.report.reportMarkdown,draft.reportMarkdown.replace(weakClaim,correctedClaim));
});
test('an absent brief assertion cannot stand in for evidence of a company weakness',()=>{
 const draft=strongNarrativeReport();draft.summary='Markanın satış sonrası deneyimi zayıftır.';
 const decision=nativeDecision(draft,{verdict:'approve',issues:[],patches:[],briefCheck:true});
 assert.throws(()=>applySemanticDecision(draft,decision,options),error=>error.code==='semantic_review_invalid');
});
