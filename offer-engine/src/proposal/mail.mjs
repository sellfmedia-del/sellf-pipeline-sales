export const contractRecipients=Object.freeze(['yigit@sellfmedia.com','businessdevelopment@sellfmedia.com']);
export function contractMessage(offer,input,from){
 const d=offer.customer_document,a=d.alternatives.find(a=>a.id===input.alternativeId);
 if(!a)throw Error('Geçerli işbirliği alternatifini seç.');
 return {from,to:[...contractRecipients],reply_to:input.email,subject:'Sözleşme talebi · '+d.brand.name.replace(/[\r\n]/g,' ').slice(0,150),text:['Marka: '+d.brand.name,'Teklif: '+offer.id+' · v'+offer.version,'Alternatif: '+a.name,'Aylık hizmet bedeli: '+a.monthlyAmount+' TRY','Yetkili: '+input.name,'E-posta: '+input.email].join('\n')};
}
export function createContractMailer({key=process.env.OFFER_RESEND_API_KEY,from=process.env.OFFER_MAIL_FROM,fetchImpl=fetch}={}){
 return {from,configured:()=>Boolean(key&&from),async send(id,payload){
  if(!key||!from)throw Error('Sözleşme bildirimi için e-posta bağlantısı henüz tanımlı değil.');
  const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'sellf-contract/'+id},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!response.ok)throw Error('E-posta sağlayıcısı bildirimi kabul etmedi.');
  const result=await response.json();if(!result.id)throw Error('E-posta gönderimi doğrulanamadı.');return result.id;
 }};
}
