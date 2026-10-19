// Explicit preview-only provider check. NEVER invoked by the ordinary build.
// Uses synthetic scope context; does not rerun Deep Research or access CRM data.
import {writeFile} from 'node:fs/promises';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {createResearchProvider,modelText} from '../src/bhs/provider.mjs';
import {pricingEngine} from '../src/engines/pricing-engine.mjs';
import {assertResult} from '../src/contracts.mjs';
if(process.env.VERCEL_ENV!=='preview')throw Error('Protected preview required.');
const provider=createResearchProvider();
const reuse=["v1_ChdubjdXYXItSEFzdUF5dE1QN19hZXNRNBIXbm43V2FyLUhBc3VBeXRNUDdfYWVzUTQ","v1_ChdubjdXYXBqbEF0RGV5dE1QdEkzU29BdxIXbm43V2FwamxBdERleXRNUHRJM1NvQXc","v1_ChRubjdXYWh5YzRNclRENkNlOEpFTRIUbm43V2FoeWM0TXJURDZDZThKRU0"];
if(reuse&&reuse.length!==3)throw Error('Exactly three completed scope IDs required.');
const cases=[['unknown','Bütçe konuşulmadı.'],['limited','Çok bütçemiz yok, önce küçük başlayalım. Önce Meta reklam yönetimi; tasarımları kendi ekibimiz hazırlayacak. Google ve sosyal medya daha sonra olabilir.'],['range','Aylık Sellf teklifini 30–40 bin TL aralığında verelim.']];
const results=await Promise.all(cases.map(async([id,meetingNotes],i)=>{
 try{
  const brief=snapshotBrief({brandName:'Sentetik fiyat testi',website:'https://brand.example/',segment:'corporate',budget:null,goals:'E-ticarette kârlı müşteri kazanımı.',needs:'Meta ve Google reklamları ile yaratıcı testlerin planlanması. Sosyal medya ikinci öncelik.',services:'Meta reklam yönetimi, Google Ads, statik motion tasarım ve sosyal medya konuşuldu; hepsinin birlikte alınması zorunlu değil.',meetingNotes});
  const audit={stage:'audit',status:'ready',data:{schemaVersion:'bhs-v1',briefHash:briefHash(brief),summary:'Sentetik test hipotezi: uzun vadeli ideal yatırım 3 milyon TL olabilir; bu müşteri bütçesi değildir.',findings:[{id:'f1',statement:'Meta ve Google edinim kanalları öncelikli olarak görüşüldü.',kind:'brief',priority:'high'},{id:'f2',statement:'Kreatif testleri için müşterinin mevcut tasarım kapasitesi doğrulanmalı.',kind:'inference',priority:'medium'}],services:['meta','google_ads','design'],serviceRecommendations:[{id:'s1',name:'Performans pazarlaması',hypothesis:'Öncelikli edinim kanallarında ölçümlü test.',findingIds:['f1']},{id:'s2',name:'Tasarım',hypothesis:'İç ekip kapasitesi yetersizse dış destek.',findingIds:['f2']}],quality:{checksPassed:true,semanticBenchmark:'passed'}}};
  let interaction=reuse?await provider.poll(reuse[i]):await provider.planPricing(brief,audit.data);const started=Date.now();
  while(['queued','in_progress'].includes(interaction.status)&&Date.now()-started<105000){await new Promise(resolve=>setTimeout(resolve,3000));interaction=await provider.poll(interaction.id);}
  if(interaction.status!=='completed')return {id,passed:false,reason:'scope_not_completed',interactionId:interaction.id};
  const result=await pricingEngine.run({brief,scope:JSON.parse(modelText(interaction))},{audit});assertResult('pricing',result);
  if(result.data.scope.provisional||id==='limited'&&result.data.scope.budgetPosture!=='limited'||id==='range'&&result.data.scope.target?.max!==40000||id!=='range'&&result.data.scope.target!==null)throw Error('Scope acceptance failed.');
  return {id,passed:true,interactionId:interaction.id,status:result.status,budgetPosture:result.data.scope.budgetPosture,target:result.data.scope.target,selected:result.data.scope.selected.map(s=>({id:s.serviceId,reason:s.reason})),deferred:result.data.scope.deferred.map(s=>s.serviceId),alternatives:result.data.alternatives.map(a=>({id:a.id,monthlyAmount:a.monthlyAmount,minimumAmount:a.minimumAmount,budgetFit:a.budgetFit})),notices:result.data.notices};
 }catch(error){return {id,passed:false,reason:error?.code||'scope_validation_failed'};}
}));
const output={kind:'synthetic-live-scope-provider-check',asOf:new Date().toISOString(),notARealBrandBhs:true,deepResearchCalls:0,scopeCalls:reuse?0:3,reusedCompletedScopes:reuse?3:0,passed:results.every(r=>r.passed),results};
await writeFile('public/pricing-validation.json',JSON.stringify(output,null,2));
console.log(JSON.stringify({pricingProviderCheck:output.passed,cases:results.map(({id,passed})=>({id,passed}))}));
