import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Small signed claims bind approved audit bytes / scope job to this host,
// session and exact brief. No CRM or large report is placed in a token.
export function createPricingProof(secret){
 if(!secret)throw Error('Fiyat hesaplama bağlantısı tanımlı değil.');
 const sign=(text,session,host)=>createHmac('sha256',secret).update('sellf-pricing-v1\n'+session+'\n'+host+'\n'+text).digest('base64url');
 return {
  encode(value,session,host){const text=Buffer.from(JSON.stringify(value)).toString('base64url');return text+'.'+sign(text,session,host);},
  decode(token,session,host,now=Date.now()){
   if(typeof token!=='string'||token.length>4000)throw Error('Fiyat hesaplama kaydı geçersiz.');
   const [text,mac,...rest]=token.split('.'),expected=sign(text,session,host);
   if(rest.length||!mac||mac.length!==expected.length||!timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))throw Error('Fiyat hesaplama kaydı doğrulanamadı.');
   let value;try{value=JSON.parse(Buffer.from(text,'base64url').toString('utf8'));}catch{throw Error('Fiyat hesaplama kaydı okunamadı.');}
   if(!['bounded_audit','audit_ready','scope','pricing_ready','proposal_job','proposal_ready'].includes(value.kind)||!Number.isFinite(value.createdAt)||value.createdAt>now+5000||now-value.createdAt>7200000||!/^[a-f0-9]{64}$/.test(value.briefHash)||!/^[a-f0-9]{64}$/.test(value.auditHash))throw Error('Fiyat hesaplama kaydı süresi dolmuş veya geçersiz.');
   return value;
  }
 };
}
