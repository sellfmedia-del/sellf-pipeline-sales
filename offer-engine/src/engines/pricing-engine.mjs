import {createHash} from 'node:crypto';
import {snapshotBrief,briefHash} from '../bhs/brief.mjs';
import {assertResult} from '../contracts.mjs';
import {byId,catalog,cost,costVersion} from '../pricing/catalog.mjs';
import {validateScope,fallbackScope} from '../pricing/scope.mjs';

function money(value){
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e10||!Number.isSafeInteger(Math.round(value*100)))throw Error('Özel maliyet tutarı geçersiz.');
 return Math.round(value*100);
}
const tl=value=>value/100;
const markup=(cost,numerator)=>Math.ceil(cost*numerator/2);
export const pricingEngine=Object.freeze({id:'pricing',version:'0.3.0',async run(input,{audit}={}){
 const brief=snapshotBrief(input?.brief);
 assertResult('audit',audit);
 if(audit.status!=='ready'||audit.data.briefHash!==briefHash(brief))throw Error('Fiyatlama için bu briefe ait doğrulanmış BHS gerekli.');
 const scope=input.scope?validateScope(input.scope,brief,audit.data):fallbackScope(brief);
 const custom=new Map();
 if(input.customCosts!==undefined&&!Array.isArray(input.customCosts))throw Error('Özel maliyet listesi geçersiz.');
 for(const row of input.customCosts||[]){
  const service=byId[row.serviceId];
  if(!service||custom.has(row.serviceId)||service.kind==='account'||service.kind==='growth'||service.kind==='commission'||service.kind==='fixed'&&service.costs[brief.segment]>0)throw Error('Sabit katalog maliyeti değiştirilemez.');
  const value=money(row.monthlyCost);if(!value)throw Error('Özel işin maliyeti sıfır olamaz.');custom.set(row.serviceId,value);
 }
 const selected=[],deferred=scope.services.filter(s=>s.phase==='later').map(s=>({...s,name:byId[s.serviceId].name})),pending=[];
 for(const item of scope.services.filter(s=>s.phase==='start').sort((a,b)=>a.priority-b.priority)){
  const service=byId[item.serviceId],base={...item,name:service.name,row:service.row};
  if(service.kind==='commission'){
   if(input.influencerListAmount===undefined){pending.push({...base,reason:'Liste fiyatının %10’u AHB; liste tutarı belirtilmediği için sabit toplama dahil edilmedi.',rule:'10_percent_of_list'});continue;}
   const list=money(input.influencerListAmount);
   if(!list){pending.push({...base,reason:'Pozitif influencer liste tutarı gerekli.',rule:'10_percent_of_list'});continue;}
   selected.push({...base,cost:0,fee:Math.ceil(list/10),listAmount:list,pricingRule:'10_percent_of_list'});continue;
  }
  const value=custom.get(item.serviceId)??cost(item.serviceId,brief.segment);
  if(!value){pending.push({...base,reason:'Bu segmentte sabit maliyet tanımlı değil; kapsam ve maliyet girilmeden fiyat toplamına dahil edilmedi.',rule:'custom_cost_required'});continue;}
  selected.push({...base,cost:value,fee:0,pricingRule:custom.has(item.serviceId)?'explicit_custom_cost':'catalog'});
 }
 // Unknown bespoke work never blocks the entire offer or becomes a free line.
 // Use a separately labelled planning scope if there is no priceable operation.
 let provisional=scope.fallback;
 if(!selected.length){
  provisional=true;
  selected.push({serviceId:'media_planning',name:byId.media_planning.name,row:23,priority:1,phase:'start',reason:'Fiyatı belirlenebilen başlangıç planlama kapsamı; özel işin uygulanması dahil değildir.',briefQuote:null,findingIds:[],cost:cost('media_planning',brief.segment),fee:0,pricingRule:'provisional_planning'});
 }
 const feeTarget=scope.target?.scope==='sellf_fee'?scope.target:null;
 let scopeTrimmed=false;
 // Keep at least one meaningful service. If even its floor exceeds the target,
 // show the mismatch; never hide it with an under-cost price or invented budget.
 if(feeTarget)while(selected.length>1){
  const base=selected.reduce((sum,s)=>sum+s.cost,0)+cost('account',brief.segment);
  const floor=markup(base,3)+selected.reduce((sum,s)=>sum+s.fee,0);
  if(floor<=feeTarget.max)break;
  scopeTrimmed=true;const item=selected.pop();deferred.push({...item,reason:item.reason+' Belirtilen teklif aralığı için sonraki aşamaya ayrıldı.'});
 }
 const operationCost=selected.reduce((sum,s)=>sum+s.cost,0),commission=selected.reduce((sum,s)=>sum+s.fee,0);
 const packageAccount=selected.length===1?500000:cost('account',brief.segment);
 const initial=cost('growth_initial',brief.segment),ongoing=cost('growth_consultant',brief.segment)+operationCost;
 const growthAccount=cost('account',brief.segment);
 function price(base,extra=0){
  const minimum=markup(base,3)+extra,ideal=base*2+extra;
  // Explicit fee guidance can lower an ideal offer only as far as its floor.
  // A larger target never increases the standard price of the same scope.
  const amount=feeTarget&&feeTarget.max>=minimum?Math.min(ideal,feeTarget.max):ideal;
  return {cost:tl(base),minimumAmount:tl(minimum),idealAmount:tl(ideal),monthlyAmount:tl(amount),budgetFit:!feeTarget?'unknown':amount<=feeTarget.max?'within':'above',belowTargetRange:Boolean(feeTarget&&amount<feeTarget.min)};
 }
 const publicService=s=>({serviceId:s.serviceId,name:s.name,row:s.row,reason:s.reason,briefQuote:s.briefQuote,findingIds:s.findingIds,cost:tl(s.cost),commissionAmount:tl(s.fee),pricingRule:s.pricingRule,...(s.listAmount?{listAmount:tl(s.listAmount)}:{}),...(s.serviceId==='design'?{deliverables:'Aylık 25 statik + 5 motion; tasarım başına 2 revize.'}:{})});
 const alternatives=[
  {id:'growth_operations',name:'Growth + Operasyon',billingPeriod:'monthly',...price(growthAccount+Math.max(initial,ongoing),commission),services:selected.map(publicService),accountCost:tl(growthAccount),growthCosting:{initialTeamCost:tl(initial),ongoingConsultantCost:tl(cost('growth_consultant',brief.segment)),ongoingOperationsCost:tl(operationCost),costBasis:tl(Math.max(initial,ongoing)),rule:'max_initial_or_consultant_plus_operations',note:'Tek ve sabit aylık ücret. İlk dönem ekibi ve sonraki operasyon ekibi üst üste eklenmez.'}},
  {id:'operations_bundle',name:'Operasyon Paketi',billingPeriod:'monthly',...price(operationCost+packageAccount,commission),services:selected.map(publicService),accountCost:tl(packageAccount)}
 ];
 for(const alternative of alternatives){alternative.budgetFit=!feeTarget?'unknown':Math.round(alternative.monthlyAmount*100)<=feeTarget.max?'within':'above';alternative.belowTargetRange=Boolean(feeTarget&&Math.round(alternative.monthlyAmount*100)<feeTarget.min);}
 const recommended=scope.budget.posture==='limited'||feeTarget?alternatives.filter(a=>a.budgetFit!=='above').sort((a,b)=>a.monthlyAmount-b.monthlyAmount)[0]||alternatives[1]:alternatives[0];
 const costSnapshot={version:costVersion,segment:brief.segment,rows:catalog.map(({id,row,costs,kind})=>({id,row,kind,monthlyCost:costs[brief.segment]})),customCosts:[...custom].map(([serviceId,value])=>({serviceId,monthlyCost:tl(value)})),rules:{minimumMarkup:1.5,idealMarkup:2,singleServiceAccount:5000,growth:'max(initial,consultant+operations)+account'}};
 return {status:provisional||pending.length||scopeTrimmed?'review':'ready',data:{
  schemaVersion:'pricing-v2',currency:'TRY',costVersion,briefHash:briefHash(brief),segment:brief.segment,alternatives,recommendedAlternativeId:recommended.id,
  scope:{summary:scope.summary,budgetPosture:scope.budget.posture,budgetQuote:scope.budget.quote,statedBudget:brief.budget,statedBudgetScope:'unspecified',target:scope.target?{...scope.target,min:tl(scope.target.min),max:tl(scope.target.max)}:null,selected:selected.map(publicService),deferred,pending,exclusions:scope.exclusions,provisional},
  costSnapshot,costSnapshotHash:createHash('sha256').update(JSON.stringify(costSnapshot)).digest('hex'),
  notices:[...scope.warnings,...(provisional?['Fiyatlı başlangıç kapsamı kontrol bekliyor. Özel işlerin tamamlandığı anlamına gelmez.']:[]),...(scopeTrimmed?['Teklif aralığına göre daraltılan kapsamın hizmet bağımlılıkları kontrol edilmeli.']:[]),...(pending.length?['Özel fiyat gereken işler aylık toplama dahil değildir; ücretsiz sunulmaz.']:[]),...(feeTarget&&alternatives.every(a=>a.budgetFit==='above')?['Belirtilen aralık başlangıç kapsamının minimum fiyatını karşılamıyor. Fiyat tabanı korunarak alternatifler gösterildi.']:[]),...(scope.target?.scope==='total_growth'?['Belirtilen toplam büyüme bütçesi hizmet ücreti sınırı sayılmadı. Reklam ve dış maliyetler netleşmeden toplam bütçeye uyum doğrulanamaz.']:[]),'Tutarlar aylık Sellf hizmet bedelleridir. Reklam harcaması, üçüncü taraf bedelleri ve KDV bu hesapta ayrıca hesaplanmadı.','BHS yatırım önerileri fiyat veya müşteri bütçesi olarak kullanılmadı.'],
  valueSync:{performed:false,reason:'Fiyat hesaplaması kart değerini değiştirmez; gerçek teklif oluşturulduğunda uygulanır.'}
 }};
}});
