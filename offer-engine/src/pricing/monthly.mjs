import {operations,byId,cost,costVersion} from './catalog.mjs';

export class MonthlyPlanError extends Error {}
const fail=message=>{throw new MonthlyPlanError(message);};
const keys=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>allowed.includes(k));
const amount=(value,label)=>{
 if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>1e10||!Number.isSafeInteger(Math.round(value*100)))fail(label+' sıfırdan büyük, geçerli bir TL tutarı olmalı.');
 return Math.round(value*100);
};
const tl=value=>value/100;
const ids=new Set(operations.map(s=>s.id));

// An explicit monthly selection is independent of the research brief. Neither
// a model nor a budget hint may add, remove or postpone these operations.
export function normalizeMonthlyPlan(input,segment){
 if(!keys(input,['months'])||!Array.isArray(input.months)||!input.months.length||input.months.length>36)fail('Aylık plan 1–36 ay içermeli.');
 return {months:input.months.map((row,index)=>{
  const month=index+1,label=month+'. ay';
  if(!keys(row,['month','services','influencerListAmount'])||row.month!==month||!Array.isArray(row.services)||!row.services.length||row.services.length>operations.length)fail(label+' için en az bir operasyon seç; aylar sıralı olmalı.');
  const used=new Set();
  const services=row.services.map(item=>{
   if(!keys(item,['serviceId','description','customCost'])||!ids.has(item.serviceId)||used.has(item.serviceId))fail(label+' operasyonları geçersiz veya tekrarlanıyor.');
   used.add(item.serviceId);const service=byId[item.serviceId],base=cost(service.id,segment);
   if(item.description!==undefined&&(typeof item.description!=='string'||item.description.length>240||/[<>]/.test(item.description)))fail(label+' kapsam açıklaması geçersiz.');
   if(item.customCost!==undefined&&(base>0||service.kind==='commission'))fail('Sheet’te maliyeti tanımlı operasyonun maliyeti değiştirilemez.');
   const custom=base===0&&service.kind!=='commission'?tl(amount(item.customCost,label+' · '+service.name+' maliyeti')):undefined;
   return {serviceId:service.id,...(item.description?.trim()?{description:item.description.trim()}:{}),...(custom!==undefined?{customCost:custom}:{})};
  });
  if(services.filter(s=>['webmaster','ecommerce_webmaster','custom_webmaster'].includes(s.serviceId)).length>1)fail(label+' için bir webmaster kategorisi seç.');
  const influencer=used.has('influencer');
  if(!influencer&&row.influencerListAmount!==undefined)fail(label+' influencer liste tutarı için ilgili operasyonu seç.');
  return {month,services,...(influencer?{influencerListAmount:tl(amount(row.influencerListAmount,label+' influencer liste tutarı'))}:{})};
 })};
}

export function monthlyCatalog(){
 return operations.map(({id,name,kind,costs})=>({id,name,kind,customSegments:Object.keys(costs).filter(segment=>costs[segment]===0&&kind!=='commission')}));
}

export function monthlyPricing(input,brief){
 const plan=normalizeMonthlyPlan(input.monthlyPlan,brief.segment);
 if(input.customCosts!==undefined||input.influencerListAmount!==undefined)fail('Aylık planda özel maliyet ve influencer tutarını ilgili ayın içinde gir.');
 const rows=plan.months.map(row=>{
  const selected=row.services.map(item=>{
   const service=byId[item.serviceId],operationCost=item.customCost!==undefined?amount(item.customCost,'Özel maliyet'):cost(service.id,brief.segment);
   const commission=service.kind==='commission'?Math.ceil(amount(row.influencerListAmount,'Influencer liste tutarı')/10):0;
   return {serviceId:service.id,name:service.name,row:service.row,reason:item.description||service.name,description:item.description||(service.id==='design'?'Aylık 25 statik + 5 motion; tasarım başına 2 revize.':service.name),cost:tl(operationCost),commissionAmount:tl(commission),pricingRule:service.kind==='commission'?'10_percent_of_list':item.customCost!==undefined?'explicit_custom_cost':'catalog'};
  });
  const operationCost=selected.reduce((sum,s)=>sum+Math.round(s.cost*100),0),commission=selected.reduce((sum,s)=>sum+Math.round(s.commissionAmount*100),0);
  // These are the existing sheet rules: one operation uses 5,000 TL account;
  // a bundle uses the segment's account cost; ideal is 2x cost plus commission.
  const account=selected.length===1?500000:cost('account',brief.segment),base=operationCost+account;
  return {month:row.month,services:selected,monthlyAmount:tl(base*2+commission),cost:tl(base),minimumAmount:tl(Math.ceil(base*3/2)+commission),idealAmount:tl(base*2+commission),accountCost:tl(account),operationCost:tl(operationCost),commissionAmount:tl(commission)};
 });
 const first=rows[0],union=[...new Map(rows.flatMap(row=>row.services).map(s=>[s.serviceId,s])).values()];
 const alternatives=['growth_operations','operations_bundle'].map(id=>({id,name:'Ay bazlı operasyon planı',billingPeriod:'monthly',monthlyAmount:first.monthlyAmount,minimumAmount:first.minimumAmount,idealAmount:first.idealAmount,cost:first.cost,accountCost:first.accountCost,budgetFit:'unknown',services:union}));
 // Retain the existing two-entry storage contract. In this opt-in mode only
 // monthlyPlan is presented to the customer; the legacy scalar is the first
 // month's operations fee, explicitly labelled by the operator UI.
 const costSnapshot={version:costVersion,segment:brief.segment,monthlyPlan:plan,months:rows,rules:{minimumMarkup:1.5,idealMarkup:2,singleServiceAccount:5000,influencer:'10_percent_of_list',referenceAmount:'first_month_operations'}};
 return {status:'ready',data:{schemaVersion:'pricing-v2',currency:'TRY',costVersion,segment:brief.segment,pricingMode:'monthly',monthlyPlan:{months:rows},alternatives,recommendedAlternativeId:'operations_bundle',
  scope:{summary:'Operasyonlar ve başlangıç ayları kullanıcı tarafından belirlendi. Her ay kendi kapsamıyla ideal kârlılık üzerinden fiyatlandırıldı.',budgetPosture:'unspecified',budgetQuote:null,statedBudget:brief.budget,statedBudgetScope:'unspecified',target:null,selected:union,deferred:[],pending:[],exclusions:[],provisional:false},
  costSnapshot,
  notices:['Tutarlar aylık Sellf hizmet bedelleridir. Reklam harcaması, üçüncü taraf bedelleri ve KDV bu hesapta ayrıca hesaplanmadı.','BHS yatırım önerileri fiyat veya müşteri bütçesi olarak kullanılmadı.'],valueSync:{performed:false,reason:'Fiyat hesaplaması kart değerini değiştirmez; kayıt sırasında ilk ayın operasyon bedeli referans alınır.'}}};
}

export function assertMonthlyPlan(data,{customer=false}={}){
 if(data.pricingMode!=='monthly'){
  if(data.pricingMode!==undefined&&data.pricingMode!=='standard'||data.monthlyPlan!==undefined)fail('Aylık plan için ay bazlı fiyatlandırmayı seç.');
  return;
 }
 const rows=data.monthlyPlan?.months;
 if(!Array.isArray(rows)||!rows.length||rows.length>36||data.recommendedAlternativeId!=='operations_bundle')fail('Aylık fiyat kaydı eksik.');
 for(const [i,row]of rows.entries()){
  if(row.month!==i+1||!Number.isFinite(row.monthlyAmount)||row.monthlyAmount<=0||!Array.isArray(row.services)||!row.services.length)fail('Aylık fiyat veya kapsam kaydı geçersiz.');
  if(customer){
   if(Object.keys(row).some(k=>!['month','monthlyAmount','services'].includes(k))||row.services.some(s=>Object.keys(s).some(k=>!['id','name','description'].includes(k))))fail('Müşteri belgesinde iç maliyet bulunamaz.');
  }else if(['cost','minimumAmount','idealAmount','accountCost'].some(k=>!Number.isFinite(row[k])||row[k]<0)||row.monthlyAmount!==row.idealAmount||row.monthlyAmount<row.minimumAmount)fail('Aylık maliyet ve kârlılık kaydı geçersiz.');
 }
 if(data.alternatives?.find(a=>a.id==='operations_bundle')?.monthlyAmount!==rows[0].monthlyAmount)fail('İlk ay referans tutarı aylık planla eşleşmiyor.');
}
