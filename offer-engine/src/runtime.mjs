import {createPreviewStore} from './proposal/preview-store.mjs';
export const productionOffers=()=>process.env.VERCEL_ENV==='production'&&process.env.OFFER_PRODUCTION_ENABLED==='true';
export const offersEnabled=()=>process.env.VERCEL_ENV==='preview'||productionOffers();
export const bearer=req=>req.headers.authorization?.match(/^Bearer ([A-Za-z0-9._-]{20,5000})$/)?.[1];
export const runtimeStore=()=>createPreviewStore(productionOffers()?{production:true,enabled:process.env.OFFER_PERSISTENCE_ENABLED==='true'}:{});
export async function authorizeProduction(req,leadId){
 if(!productionOffers())return null;
 const jwt=bearer(req);if(!jwt)throw Error('Pipeline oturumu gerekli.');
 const who=await runtimeStore().call('authorize',{jwt,...(leadId?{leadId}:{})});
 return {accessToken:jwt,ownerId:who.ownerId};
}
