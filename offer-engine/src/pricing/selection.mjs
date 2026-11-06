import {operations,byId,projects,projectById,cost,costVersion} from './catalog.mjs';

export class SelectionError extends Error {}
const fail=message=>{throw new SelectionError(message);};
export const hasKeys=(v,allowed)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>allowed.includes(k));
export const cents=(value,label='Maliyet')=>{
 if(typeof value!=='number'||!Number.isFinite(value)||value<0.01||value>1e10||!Number.isSafeInteger(Math.round(value*100))||Math.abs(value*100-Math.round(value*100))>0.00001)fail(label+' sıfırdan büyük, en fazla iki ondalıklı bir TL tutarı olmalı.');
 return Math.round(value*100);
};
const tl=v=>v/100;
export function normalizeServices(entries,segment,influencerListAmount){
 if(!Array.isArray(entries)||entries.length>operations.length)fail('Hizmet seçimi geçersiz.');
 const used=new Set(),services=entries.map(item=>{
  const s=byId[item?.serviceId];
  if(!hasKeys(item,['serviceId','description','customCost'])||!operations.includes(s)||used.has(s.id))fail('Hizmet seçimi geçersiz veya tekrarlanıyor.');
  used.add(s.id);
  if(item.description!==undefined&&(typeof item.description!=='string'||item.description.length>240||/[<>]/.test(item.description)))fail('Kapsam açıklaması geçersiz.');
  const base=cost(s.id,segment);
  if(item.customCost!==undefined&&(base>0||s.kind==='commission'))fail('Sheet’te tanımlı maliyet değiştirilemez.');
  return {serviceId:s.id,...(item.description?.trim()?{description:item.description.trim()}:{}),...(base===0&&s.kind!=='commission'?{customCost:tl(cents(item.customCost,s.name+' maliyeti'))}:{})};
 });
 if(services.filter(s=>['webmaster','ecommerce_webmaster','custom_webmaster'].includes(s.serviceId)).length>1)fail('Bir webmaster kategorisi seç.');
 if(!used.has('influencer')&&influencerListAmount!==undefined)fail('Influencer liste tutarı için ilgili hizmeti seç.');
 return {services,...(used.has('influencer')?{influencerListAmount:tl(cents(influencerListAmount,'Influencer liste bedeli'))}:{})};
}
export function normalizeProjects(entries=[],segment){
 if(!Array.isArray(entries)||entries.length>projects.length)fail('Proje seçimi geçersiz.');
 const used=new Set();
 return entries.map(item=>{
  const s=projectById[item?.serviceId];
  if(!hasKeys(item,['serviceId','quantity','customCost','description'])||!s||used.has(s.id))fail('Proje seçimi geçersiz veya tekrarlanıyor.');
  used.add(s.id);const quantity=item.quantity??1;
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>10000||(!['project_static','project_motion'].includes(s.id)&&quantity!==1))fail('Proje adedi geçersiz.');
  if(item.description!==undefined&&(typeof item.description!=='string'||item.description.length>240||/[<>]/.test(item.description)))fail('Proje açıklaması geçersiz.');
  if(item.customCost!==undefined&&s.costs[segment]>0)fail('Sheet’te tanımlı proje maliyeti değiştirilemez.');
  return {serviceId:s.id,quantity,...(item.description?.trim()?{description:item.description.trim()}:{}),...(s.costs[segment]===0?{customCost:tl(cents(item.customCost,s.name+' maliyeti'))}:{})};
 });
}
export function priceProjects(entries,segment){
 const items=normalizeProjects(entries,segment).map(item=>{
  const s=projectById[item.serviceId],unitCost=item.customCost===undefined?s.costs[segment]*100:cents(item.customCost),account=cost('account',segment),base=unitCost*item.quantity+account;
  if(base*2>1e12)fail('Proje toplamı tutar sınırını aşıyor.');
  return {serviceId:s.id,name:s.name,description:item.description||s.name,quantity:item.quantity,row:s.row,sheet:'Proje Kalem ve Bedelleri',unitCost:tl(unitCost),accountCost:tl(account),cost:tl(base),minimumAmount:tl(Math.ceil(base*3/2)),idealAmount:tl(base*2),amount:tl(base*2)};
 });
 return {items,oneTimeAmount:tl(items.reduce((sum,p)=>sum+Math.round(p.amount*100),0))};
}
export function priceServices(selection,segment){
 const normalized=normalizeServices(selection.services,segment,selection.influencerListAmount);
 const services=normalized.services.map(item=>{
  const s=byId[item.serviceId],commission=s.kind==='commission'?Math.ceil(cents(normalized.influencerListAmount)/10):0;
  return {serviceId:s.id,name:s.name,row:s.row,reason:item.description||s.name,description:item.description||(s.id==='design'?'Aylık 25 statik + 5 motion; tasarım başına 2 revize.':s.name),cost:tl(item.customCost===undefined?cost(s.id,segment):cents(item.customCost)),commissionAmount:tl(commission),pricingRule:s.kind==='commission'?'10_percent_of_list':item.customCost!==undefined?'explicit_custom_cost':'catalog'};
 });
 const operation=services.reduce((sum,s)=>sum+Math.round(s.cost*100),0),commission=services.reduce((sum,s)=>sum+Math.round(s.commissionAmount*100),0),account=!services.length?0:services.length===1?500000:cost('account',segment),base=operation+account;
 return {services,operation,commission,account,base,monthlyAmount:tl(base*2+commission),cost:tl(base),minimumAmount:tl(Math.ceil(base*3/2)+commission),idealAmount:tl(base*2+commission),accountCost:tl(account),operationCost:tl(operation),commissionAmount:tl(commission)};
}
export const publicProjects=plan=>({items:plan.items.map(p=>({id:p.serviceId,name:p.name,description:p.description,quantity:p.quantity,amount:p.amount})),oneTimeAmount:plan.oneTimeAmount});
export function selectedPricing(input,brief){
 const selection=input.serviceSelection;
 if(!hasKeys(selection,['services','projects','influencerListAmount'])||input.scope!==undefined||input.customCosts!==undefined||input.influencerListAmount!==undefined)fail('Seçili kapsamın dışında fiyat girdisi kullanılamaz.');
 const normalized={...normalizeServices(selection.services,brief.segment,selection.influencerListAmount),projects:normalizeProjects(selection.projects,brief.segment)};
 if(!normalized.services.length&&!normalized.projects.length)fail('En az bir hizmet veya proje seç.');
 const priced=priceServices(normalized,brief.segment),projectPlan=priceProjects(normalized.projects,brief.segment);
 const growthAccount=cost('account',brief.segment),initial=cost('growth_initial',brief.segment),consultant=cost('growth_consultant',brief.segment),growthBase=growthAccount+Math.max(initial,consultant+priced.operation);
 const alternatives=[
  {id:'growth_operations',name:'Growth + Operasyon',billingPeriod:'monthly',monthlyAmount:tl(growthBase*2+priced.commission),cost:tl(growthBase),minimumAmount:tl(Math.ceil(growthBase*3/2)+priced.commission),idealAmount:tl(growthBase*2+priced.commission),accountCost:tl(growthAccount),budgetFit:'unknown',services:priced.services,growthCosting:{initialTeamCost:tl(initial),ongoingConsultantCost:tl(consultant),ongoingOperationsCost:tl(priced.operation),costBasis:tl(Math.max(initial,consultant+priced.operation)),rule:'max_initial_or_consultant_plus_operations',note:'Tek ve sabit aylık ücret. Projeler ayrıca tek seferlik fiyatlandırılır.'}},
  {id:'operations_bundle',name:'Operasyon Paketi',billingPeriod:'monthly',monthlyAmount:priced.monthlyAmount,cost:priced.cost,minimumAmount:priced.minimumAmount,idealAmount:priced.idealAmount,accountCost:priced.accountCost,budgetFit:'unknown',services:priced.services}
 ];
 const costSnapshot={version:costVersion,segment:brief.segment,serviceSelection:normalized,services:priced.services,projects:projectPlan,rules:{minimumMarkup:1.5,idealMarkup:2,singleServiceAccount:5000,projectAccount:'segment_account_once_per_project',growth:'max(initial,consultant+operations)+account',projectBilling:'one_off_separate'}};
 return {status:'ready',data:{schemaVersion:'pricing-v2',currency:'TRY',costVersion,segment:brief.segment,selectionMode:'explicit',alternatives,recommendedAlternativeId:priced.services.length?'growth_operations':'operations_bundle',...(projectPlan.items.length?{projectPlan}:{}),scope:{summary:'Kapsam kullanıcı tarafından seçildi. Yalnızca işaretlenen hizmetler ve projeler fiyatlandırıldı.',budgetPosture:'unspecified',budgetQuote:null,statedBudget:brief.budget,statedBudgetScope:'unspecified',target:null,selected:priced.services,deferred:[],pending:[],exclusions:[],provisional:false},costSnapshot,notices:['Aylık retainer ve tek seferlik proje bedelleri ayrıdır. Seçilmeyen hizmetler fiyatlandırılmaz.','Reklam harcaması, üçüncü taraf bedelleri ve KDV ayrıca değerlendirilir.'],valueSync:{performed:false,reason:'Fiyat hesaplaması kart değerini değiştirmez; aylık retainer referans alınır.'}}};
}
