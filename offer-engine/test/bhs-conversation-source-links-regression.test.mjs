import test from 'node:test';
import assert from 'node:assert/strict';
import {presentConversationSource} from '../src/bhs/conversation-source.mjs';
import {advanceConversation,readConversation} from '../src/bhs/conversation-engine.mjs';
import {brief,source,memoryLedger,assistantCall,scriptedProviders} from './fixtures/bhs-conversation.mjs';

test('relative asset links survive a source view after forty image URLs without altering the original body',()=>{
 const url=new URL('/pages/satis-noktalari',source.url).href;
 const original={...source,text:source.text+'\n[Satış Noktaları](/pages/satis-noktalari)',links:Array.from({length:60},(_,at)=>'https://cdn.example.com/'+at+'.webp')};
 const before=structuredClone(original),view=presentConversationSource(original);
 assert.ok(view.links.includes(url));assert.equal(view.linkLabels[view.links.indexOf(url)],'Satış Noktaları');
 assert.equal(view.links.some(link=>link.endsWith('.webp')),false);assert.deepEqual(original,before);
});

test('a recovered existing-asset link remains an observed next target in the same durable conversation',async()=>{
 const {ledger}=memoryLedger(),id='f'.repeat(64),url=new URL('/pages/satis-noktalari',source.url).href;
 const providers=scriptedProviders(ledger,[assistantCall('read_pages',{urls:[source.url],purpose:'Mevcut kanalları anla'}),
  assistantCall('read_pages',{urls:[url],purpose:'Mevcut satış noktalarının kapsamını oku'})]);
 let reads=0;providers.extract=async({urls})=>{reads++;return {results:urls[0]===source.url?[{...source,navigation:[{url,label:'Satış Noktaları'}]}]:
  [{url,title:'Satış Noktaları',method:'extracted',text:'Marka mevcut satış noktalarını kendi sayfasında listeliyor; güncel sipariş hacmi veya satış başarısı bu listeden ölçülemez.'}]};};
 await advanceConversation({brief,ledger,id,providers});
 const next=await advanceConversation({brief,ledger,id,providers});assert.deepEqual(next.toolIssues,[]);
 assert.equal(reads,2);const state=await readConversation(ledger,id);assert.ok(state.sources.some(row=>row.url===url));
 assert.ok(JSON.stringify(providers.calls[1].messages).includes('Satış Noktaları'));
});
