import {snapshotBrief,briefHash} from '../bhs/brief.mjs';
import {modelText,citationUrls,ResearchError} from '../bhs/provider.mjs';
import {verifyReport} from '../bhs/verify.mjs';
import {methodologyVersion} from '../bhs/prompts.mjs';
export function createAuditEngine({verifySource}={}){
  return Object.freeze({id:'audit',version:'0.2.2',async run(input){
    const brief=snapshotBrief(input?.brief);
    const {research,structure}=input;
    if(research?.status!=='completed'||structure?.status!=='completed')throw new ResearchError('incomplete','BHS araştırması ve yapılandırması tamamlanmadı.');
    const rawReport=modelText(research),json=modelText(structure);
    if(!rawReport||rawReport.length>500000||!json||json.length>250000)throw new ResearchError('invalid_report','BHS raporu eksik veya boyut sınırını aşıyor.');
    let report;try{report=JSON.parse(json);}catch{throw new ResearchError('invalid_report','BHS raporu beklenen biçimde değil.');}
    const result=await verifyReport(report,{brief,rawReport,citations:citationUrls(research),...(verifySource?{verifySource}:{})});
    // Source/quote matches alone cannot approve entity, period or causal claims.
    // A trusted semantic assessment is still required before downstream use.
    if(result.data.quality.semanticBenchmark!=='passed')result.status='review';
    Object.assign(result.data,{schemaVersion:'bhs-v1',methodologyVersion,briefHash:briefHash(brief),rawReport,researchId:research.id,structureId:structure.id,usage:{research:research.usage||null,structure:structure.usage||null}});
    return result;
  }});
}
export const auditEngine=createAuditEngine();
