// Shared by pricing and customer-document validation. A customer project plan
// contains only the one-off selling price; internal costs never leave pricing.
export function assertProjectPlan(plan,{customer=false}={}){
 if(plan===undefined)return;
 if(!plan||Object.keys(plan).some(k=>!['items','oneTimeAmount'].includes(k))||!Array.isArray(plan.items)||!plan.items.length||plan.items.length>7)throw Error('Proje fiyat kaydı eksik.');
 const ids=new Set();let total=0;
 for(const p of plan.items){
  const id=customer?p.id:p.serviceId;
  if(typeof id!=='string'||ids.has(id)||typeof p.name!=='string'||typeof p.description!=='string'||!Number.isSafeInteger(p.quantity)||p.quantity<1||!Number.isFinite(p.amount)||p.amount<=0||Math.abs(p.amount*100-Math.round(p.amount*100))>0.00001)throw Error('Proje fiyatı veya kapsamı geçersiz.');
  ids.add(id);total+=Math.round(p.amount*100);
  if(customer){if(Object.keys(p).some(k=>!['id','name','description','quantity','amount'].includes(k)))throw Error('Müşteri proje belgesinde iç maliyet bulunamaz.');}
  else if(['cost','minimumAmount','idealAmount','accountCost','unitCost'].some(k=>!Number.isFinite(p[k])||p[k]<0)||p.amount!==p.idealAmount||p.amount<p.minimumAmount)throw Error('Proje maliyeti veya kârlılığı geçersiz.');
 }
 if(plan.oneTimeAmount!==total/100)throw Error('Tek seferlik proje toplamı eşleşmiyor.');
}
export function assertProjectPlans(data,options){
 assertProjectPlan(data.projectPlan,options);
 for(const row of data.monthlyPlan?.months||[])assertProjectPlan(row.projectPlan,options);
}
