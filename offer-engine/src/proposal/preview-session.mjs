import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
const name='__Host-offer-preview-session';
function key(secret){if(typeof secret!=='string'||secret.length<32)throw Error('Test oturum anahtarı gerekli.');return createHash('sha256').update('sellf-preview-session-v1\n'+secret).digest();}
export function sealSession(value,secret,host){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);cipher.setAAD(Buffer.from(host));const bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64url');}
export function openEnvelope(token,secret,context){
 if(typeof token!=='string'||token.length>16000)throw Error('Şifreli kayıt geçersiz.');
 const bytes=Buffer.from(token,'base64url'),decipher=createDecipheriv('aes-256-gcm',key(secret),bytes.subarray(0,12));decipher.setAAD(Buffer.from(context));decipher.setAuthTag(bytes.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString());
}
export function readSession(req,secret){
 try{const token=(req.headers.cookie||'').match(/(?:^|;\s*)__Host-offer-preview-session=([A-Za-z0-9_-]+)(?:;|$)/)?.[1];if(!token)return null;const value=openEnvelope(token,secret,req.headers.host);if(!value.accessToken||!value.refreshToken||!Number.isFinite(value.createdAt)||Date.now()-value.createdAt>7*86400000)return null;return value;}catch{return null;}
}
export function setSession(res,req,value,secret){res.setHeader('Set-Cookie',name+'='+sealSession(value,secret,req.headers.host)+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=604800');}
export async function sessionFor(req,res,store,secret){let session=readSession(req,secret);if(!session)return null;if(session.expiresAt<Date.now()+60000){const renewed=await store.refresh(session.refreshToken);session={...session,...renewed};setSession(res,req,session,secret);}return session;}
