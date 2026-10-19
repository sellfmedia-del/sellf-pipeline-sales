import {createHmac,timingSafeEqual} from 'node:crypto';
import {digest} from '../pricing/proof.mjs';
export function logoProof(secret,host,data,token){
 if(!secret)throw Error('Logo doğrulama bağlantısı gerekli.');
 const sign=t=>createHmac('sha256',secret).update('sellf-logo-v1\n'+host+'\n'+t).digest('base64url');
 if(token===undefined){const t=Buffer.from(JSON.stringify({hash:digest(data),at:Date.now()})).toString('base64url');return t+'.'+sign(t);}
 if(typeof token!=='string'||token.length>1000)throw Error('Logo kaydı geçersiz.');
 const [t,mac,...rest]=token.split('.'),expected=sign(t);
 if(rest.length||!mac||mac.length!==expected.length||!timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))throw Error('Logo doğrulanamadı.');
 const value=JSON.parse(Buffer.from(t,'base64url').toString());
 if(value.hash!==digest(data)||!Number.isFinite(value.at)||Date.now()-value.at>7200000||value.at>Date.now()+5000)throw Error('Logo değişti veya kaydın süresi doldu.');
 return true;
}
