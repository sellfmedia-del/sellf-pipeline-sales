import {assertResult} from '../contracts.mjs';
import {digest} from '../pricing/proof.mjs';
import {fallbackScope} from '../pricing/scope.mjs';
import {offerCopy} from '../proposal/composition.mjs';
import {briefHash,snapshotBrief} from './brief.mjs';
import {hasGroundedResearch} from './research-content.mjs';
import {guardResearchScope} from './scope-authority.mjs';

export function canSaveBhs(result){
 const data=result?.data;
 return result?.status==='ready'&&data?.researchContinuity?.status!=='unavailable'&&(
  hasGroundedResearch(data)||Boolean(data?.report?.conversation?.reportMarkdown?.trim()));
}

export async function saveBhs(store,{jwt,leadId,spaceId,brief,result}){
 if(!canSaveBhs(result))return null;
 assertResult('audit',result);
 const hash=briefHash(brief);
 if(result.data.briefHash!==hash)throw Error('BHS ile kayıt briefi eşleşmiyor.');
 const id=digest({leadId,spaceId,hash,data:result.data});
 // The same completed analysis can be saved again after a lost acknowledgment.
 // Prior budget receipts are for the original run and do not enter this record.
 const {cost,...audit}=result;
 return store.call('saved_bhs_save',{jwt,leadId,spaceId,id,brief,audit},{timeoutMs:4500});
}

export function restoreBhs(row,brief){
 const source=snapshotBrief(row.brief),hash=briefHash(brief),originalBriefHash=briefHash(source);
 if(!canSaveBhs(row.audit)||row.audit.data.briefHash!==originalBriefHash)throw Error('Kayıtlı BHS doğrulanamadı.');
 const normalizeBrand=value=>value.normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/\s+/g,' ').trim();
 if(normalizeBrand(brief.brandName)!==normalizeBrand(source.brandName)||new URL(brief.website).hostname.replace(/^www\./,'')!==new URL(source.website).hostname.replace(/^www\./,''))
  throw Error('Kayıtlı BHS, kayıt tarihindeki marka ve web sitesine aittir.');
 const exactBrief=hash===originalBriefHash;
 const data={...row.audit.data,briefHash:hash,researchReuse:{
  ...row.audit.data.researchReuse,researchedAt:row.audit.data.researchAsOf||row.created_at,
  originalBriefHash,exactBrief,contextNeedsConfirmation:!exactBrief,incrementalResearchCalls:0,historicalCapture:true
 }};
 if(!exactBrief){
  data.scopePlan=guardResearchScope(fallbackScope(brief),brief,data);
  data.proposalCopy=offerCopy(null,data);
 }
 const result={...row.audit,data,inputHash:hash,cost:{chargedKurus:0,attemptChargedKurus:0}};
 assertResult('audit',result);
 return result;
}
