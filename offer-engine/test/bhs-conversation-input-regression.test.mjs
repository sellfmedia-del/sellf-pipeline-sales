import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationMessages} from '../src/bhs/conversation-engine.mjs';
import {brief} from './fixtures/bhs-conversation.mjs';
const state={turns:[],sources:[],researchProgress:{objective:'',questions:[],candidates:[],proofs:[]}};
test('a dated CRM call failure is excluded from brand context while the same line business target stays intact',()=>{
 const original={...brief,meetingNotes:'21 Kasım 2026 · Arama · İlgili kişiye ulaşılamadı; müşteri UK pazarında B2B bayilik büyümesi istiyor.'};
 const context=JSON.stringify(conversationMessages(original,state));
 assert.doesNotMatch(context,/İlgili kişiye ulaşılamadı/);assert.match(context,/UK pazarında B2B bayilik/);
 assert.match(original.meetingNotes,/İlgili kişiye ulaşılamadı/);
});
test('the raw brief password and private email cannot enter the analyst message while its actual partner and goal survive',()=>{
 const original={...brief,meetingNotes:'Amazon partneri mevcut. Teklif şifresi: DemoPrivateRegression910!; iletişim private.regression910@example.com. UK B2B büyümesi hedefleniyor.'};
 const context=JSON.stringify(conversationMessages(original,state));
 assert.equal(context.includes('DemoPrivateRegression910!'),false);assert.equal(context.includes('private.regression910@example.com'),false);
 assert.match(context,/Amazon partneri mevcut/);assert.match(context,/UK B2B büyümesi/);
});
