import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

// Run these assertions against the unchanged parent as well as the new code.
// They fail on actual absent behavior, not on an absent imported new module.
const root=process.env.BHS_BASELINE_ROOT?pathToFileURL(process.env.BHS_BASELINE_ROOT+'/offer-engine/'):new URL('../',import.meta.url);
const offerings=await import(new URL('src/bhs/conversation-offerings.mjs',root));
const {researchOutcomeIssues}=await import(new URL('src/bhs/conversation-research.mjs',root));
const {conversationQuote}=await import(new URL('src/bhs/conversation-providers.mjs',root));
const {brief,sources,summary,progress}=await import(new URL('test/fixtures/bhs-offerings.mjs',root));

test('a selected product handoff still needs chosen buyer-market decisions beyond a generic channel recap',()=>{
 const analysisVersion=offerings.marketHandoffSchema?'product-buyer-market-competition-v2':offerings.offeringAnalysisVersion;
 const issues=researchOutcomeIssues(summary(),sources,brief,{analysisVersion,progress:progress()});
 assert.ok(issues.includes('market_decision_scope_missing'),JSON.stringify(issues));
});
test('a useful narrow decision can fit the original account without lowering the complete report or the review floor',()=>{
 const quote=conversationQuote(20000,{availableKurus:3770,analysisVersion:'product-buyer-market-competition-v2'});
 assert.equal(quote.funded,true,JSON.stringify(quote));
 assert.ok(quote.output>=512&&quote.output<1000);assert.ok(quote.reviewOutput>=1000);
 assert.equal(quote.finalReservation,1856);assert.equal(quote.followingReserveKurus,600);assert.equal(quote.toolReserveKurus,62);
});
