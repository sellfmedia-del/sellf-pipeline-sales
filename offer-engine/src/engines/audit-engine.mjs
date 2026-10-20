import {directAuditResult} from '../bhs/direct-report.mjs';
import {runBoundedStage} from '../bhs/direct-research.mjs';
import {snapshotBrief,briefHash} from '../bhs/brief.mjs';
import {modelText,citationUrls,ResearchError} from '../bhs/provider.mjs';
import {verifyReport} from '../bhs/verify.mjs';
import {methodologyVersion} from '../bhs/prompts.mjs';
import {assertEvidencePacket,evidenceSourceVerifier,evidenceHash} from '../bhs/evidence.mjs';
import {renderGroundedReport} from '../bhs/grounded-report.mjs';
import {assessSemantics} from '../bhs/semantic.mjs';
export function createAuditEngine({verifySource}={}){
  return Object.freeze({id:'audit',version:'0.3.0',async run(input){
    const brief=snapshotBrief(input?.brief);
    if(input.synthesis)return directAuditResult(brief,input.synthesis);
    if(input.packet){
      const packet=assertEvidencePacket(input.packet,brief),rawReport=renderGroundedReport(input.report);
      const result=await verifyReport(input.report,{brief,rawReport,brandEntityId:packet.entities.find(e=>e.role==='brand')?.id,citations:packet.sources.map(s=>s.finalUrl),verifySource:evidenceSourceVerifier(packet)});
      const semantic=assessSemantics(input.assessment,input.report,packet);
      result.data.quality.citationChecksPassed=result.data.quality.checksPassed;
      result.data.quality.semanticBenchmark=semantic.status;
      result.data.quality.scope='citation-quote-and-semantic-checks';
      result.data.quality.issues.push(...semantic.issues);
      result.data.quality.checksPassed=result.data.quality.citationChecksPassed&&semantic.status==='passed';
      result.status=result.data.quality.checksPassed?'ready':'review';
      if(result.status!=='ready'){result.data.scoring.total=null;result.data.scoring.note='Kaynak veya içerik doğrulaması tamamlanmadığı için toplam hesaplanmadı.';}
      Object.assign(result.data,{schemaVersion:'bhs-v1',methodologyVersion:'sellf-pre-bhs-2026-10-19-evidence-v2',briefHash:briefHash(brief),rawReport,researchId:input.researchId,structureId:input.synthesisId,semanticId:input.semanticId,revisionId:input.revisionId,packetHash:evidenceHash(packet),semanticReview:semantic.assessment,evidenceSources:packet.sources.map(({excerpts,...metadata})=>metadata),usage:input.usage||null});
      return result;
    }
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
export const auditEngine=Object.freeze({...createAuditEngine(),version:'0.4.0',runStage:runBoundedStage});
