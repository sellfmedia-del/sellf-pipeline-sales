import {createHmac,timingSafeEqual} from 'node:crypto';
import {ResearchError,interactionId} from './provider.mjs';
const ttl=2*60*60*1000;
export function createTicketCodec(secret){
  if(!secret)throw new ResearchError('not_configured','BHS araştırma bağlantısı henüz tanımlı değil.');
  const sign=(text,session,host)=>createHmac('sha256',secret).update('sellf-bhs-v1\n'+session+'\n'+host+'\n'+text).digest('base64url');
  return {
    encode(value,session,host){const text=Buffer.from(JSON.stringify(value)).toString('base64url');return text+'.'+sign(text,session,host);},
    decode(token,session,host,now=Date.now()){
      if(typeof token!=='string'||token.length>4000)throw new ResearchError('invalid_job','Araştırma kaydı geçersiz.');
      const [text,mac,...rest]=token.split('.'),expected=sign(text,session,host);
      if(rest.length||!mac||mac.length!==expected.length||!timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))throw new ResearchError('invalid_job','Araştırma kaydı doğrulanamadı.');
      let data;try{data=JSON.parse(Buffer.from(text,'base64url').toString('utf8'));}catch{throw new ResearchError('invalid_job','Araştırma kaydı okunamadı.');}
      if(!Number.isFinite(data.startedAt)||data.startedAt>now+5000||now-data.startedAt>ttl||!['research','source_plan','synthesis','semantic','structure'].includes(data.phase)||!/^[a-f0-9]{64}$/.test(data.hash))throw new ResearchError('expired_job','Araştırma kaydının süresi dolmuş veya geçersiz.');
      interactionId(data.researchId);const field={structure:'structureId',source_plan:'sourcePlanId',synthesis:'synthesisId',semantic:'semanticId'}[data.phase];if(field)interactionId(data[field]);
      return data;
    }
  };
}
