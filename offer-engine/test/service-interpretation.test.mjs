import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretOperations} from '../src/pricing/service-interpretation.mjs';
import {operations} from '../src/pricing/catalog.mjs';
import {pricingEngine} from '../src/engines/pricing-engine.mjs';
import {fallbackScope} from '../src/pricing/scope.mjs';
import {offerFixture} from './fixtures/offer.mjs';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';

test('ordinary advertising wording resolves to the exact catalogue operations, with Turkish/English variants and no duplicated fees',()=>{
 const examples=[
  ['dijital reklamlar',['meta','google_ads']],['DİJİTAL REKLAM YÖNETİMİ',['meta','google_ads']],['paid media',['meta','google_ads']],['digital advertising',['meta','google_ads']],
  ['Meta ve Google Ads',['meta','google_ads']],['Meta & Google',['meta','google_ads']],['facebook reklamları ve instagram reklamları',['meta']],
  ['sosyal medya yönetimi ve dijital reklamlar',['social','meta','google_ads']],['dijital reklamlar, Meta reklam yönetimi',['meta','google_ads']],
  ['Google Ads reklam yönetimi',['google_ads']],['sadece Google Ads dijital reklamlar',['google_ads']],['dijital reklamlar meta hariç',['google_ads']],
  ['Meta istemiyoruz; Google Ads',['google_ads']],['sosyal medya yönetimi',['social']],['sosyal medya yönetimi ve Google Ads',['social','google_ads']],['UGC influencer',['ugc']]
 ];
 for(const [text,ids]of examples){const result=interpretOperations(text);assert.deepEqual(result.unresolved,[],text);assert.deepEqual(new Set(result.serviceIds),new Set(ids),text);}
});

test('advice-only wording never creates campaign management fees; social management does not turn advertising advice into execution',()=>{
 for(const text of ['reklam danışmanlığı','Google Ads danışmanlığı','Meta ve Google Ads danışmanlığı','Meta ve Google danışmanlığı','dijital reklam stratejisi','advertising consulting']){
  const result=interpretOperations(text);assert.deepEqual(result.unresolved,[],text);assert.deepEqual(result.serviceIds,['media_planning'],text);
 }
 for(const [text,ids]of [['sosyal medya yönetimi ve dijital reklam danışmanlığı',['social','media_planning']],['Meta yönetimi ve reklam danışmanlığı',['meta','media_planning']]]){
  const result=interpretOperations(text);assert.deepEqual(result.unresolved,[],text);assert.deepEqual(new Set(result.serviceIds),new Set(ids),text);
 }
});

test('ambiguous and unknown work does not silently become a cheaper service, all SEO operations, or a free project',()=>{
 for(const text of ['SEO','brandbook','website','yeni bir özel kapsam','reklam danışmanlığı değil dijital reklam yönetimi','dijital reklamlar hariç sosyal medya yönetimi'])assert.ok(interpretOperations(text).unresolved.length,text);
 const ids=new Set(operations.map(s=>s.id));
 for(const text of ['dijital reklamlar','reklam danışmanlığı','Meta Ads','Google Ads','teknik SEO','on site SEO','off site SEO','sosyal medya yönetimi','grafik tasarım','marka pazarlama','E-ticaret danışmanlığı','pazaryeri yönetimi','E-ticaret webmaster','özel yazılım','yapay zeka','fulfillment','moderasyon','B2B pazarlama','UGC','influencer'])for(const id of interpretOperations(text).serviceIds)assert.ok(ids.has(id),id);
 assert.ok(interpretOperations('x'.repeat(2001)).unresolved.length);
});

test('clear advisory-only meeting context informs generic advertising wording; an explicit monthly management selection still wins',()=>{
 const context='Dijital reklamlar için sadece danışmanlık verilecek. Kampanyaları markanın ekibi yönetecek.';
 assert.deepEqual(interpretOperations('dijital reklamlar',{context}).serviceIds,['media_planning']);
 assert.deepEqual(interpretOperations('Meta reklam yönetimi',{context}).serviceIds,['meta']);
 assert.deepEqual(interpretOperations('sosyal medya yönetimi',{context}).serviceIds,['social']);
});

test('free text and explicit month selections have identical kuruş-accurate costs, ideal markup, one account charge and exact service scope',async()=>{
 const f=await offerFixture();
 for(const segment of ['kobi','corporate','key_account']){
  const brief=snapshotBrief({...f.brief,segment}),audit={...f.audit,data:{...f.audit.data,briefHash:briefHash(brief)}};
  const words={months:[{month:1,services:[],operationsText:'dijital reklamlar'},{month:2,services:[],operationsText:'reklam danışmanlığı'},{month:3,services:[],operationsText:'sosyal medya yönetimi ve dijital reklamlar'}]};
  const explicit={months:[{month:1,services:[{serviceId:'meta'},{serviceId:'google_ads'}]},{month:2,services:[{serviceId:'media_planning'}]},{month:3,services:[{serviceId:'social'},{serviceId:'meta'},{serviceId:'google_ads'}]}]};
  const run=monthlyPlan=>pricingEngine.run({brief,pricingMode:'monthly',monthlyPlan},{audit});
  const a=await run(words),b=await run(explicit);assert.deepEqual(a.data.monthlyPlan,b.data.monthlyPlan);
  // Independent arithmetic using the approved workbook's three segment columns.
  const inputs={kobi:{ads:6000,social:10000,account:10000,planning:6000},corporate:{ads:9000,social:15000,account:15000,planning:9000},key_account:{ads:12000,social:20000,account:20000,planning:12000}}[segment];
  assert.deepEqual(a.data.monthlyPlan.months.map(row=>row.monthlyAmount),[(inputs.ads*2+inputs.account)*2,(inputs.planning+5000)*2,(inputs.ads*2+inputs.social+inputs.account)*2]);
  await assert.rejects(()=>run({months:[{month:1,services:[],operationsText:'SEO'}]}),/SEO/);
 }
});

test('standard pricing fallback preserves existing rules while matching generic digital ads and respecting consulting/excluded channels',async()=>{
 const f=await offerFixture();
 for(const [services,expected]of [['dijital reklamlar',['meta','google_ads']],['Google Ads danışmanlığı',['media_planning']],['dijital reklamlar meta hariç',['google_ads']]]){
  const scope=fallbackScope({...f.brief,services});assert.deepEqual(new Set(scope.services.map(s=>s.serviceId)),new Set(expected));
 }
});
