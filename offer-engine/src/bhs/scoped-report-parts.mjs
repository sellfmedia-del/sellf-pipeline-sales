import {BudgetError,hash} from '../budget/ledger.mjs';
import {arr,obj,str} from './sequential-contracts.mjs';
import {managedModelIssue} from './managed-evidence-review.mjs';
import {researchHost} from './research-url.mjs';

const unique=rows=>[...new Set(rows)];
const swotSection=id=>/^swot\b/iu.test(id||'');
const stable=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?
 Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const field=maxLength=>({...str(maxLength),minLength:1});

function reportParts(request,coverage,sections){
 const eligible=sections?coverage.filter(metric=>sections.includes(metric.section)):coverage;
 const topics=eligible.filter(metric=>!swotSection(metric.section));
 const assigned=new Set(coverage.flatMap(metric=>metric.sources));
 const unassigned=Object.keys(request.sources).filter(id=>!assigned.has(id));
 const brandHost=researchHost(request.brief.website);
 const brand=Object.entries(request.sources).filter(([,row])=>
  researchHost(request.documents?.[row[0]]?.[0]||row[0])===brandHost).map(([id])=>id).slice(0,4);
 const groups=[];
 for(let at=0;at<topics.length;at+=2)groups.push(topics.slice(at,at+2));
 if(!groups.length&&(unassigned.length||!topics.length&&!sections))groups.push([]);
 const parts=groups.map((metrics,index)=>({id:index?'topics-'+index:'brief',metrics,maxRows:7,
  aliases:unique([...metrics.flatMap(metric=>metric.sources),...unassigned.filter((_,i)=>i%groups.length===index),...brand])}));
 if(!sections||sections.some(swotSection)){
  const support=eligible.filter(metric=>swotSection(metric.section));
  const aliases=unique([...support.flatMap(metric=>metric.sources),...brand,...coverage.flatMap(metric=>metric.sources.slice(0,2)),...unassigned.slice(0,8)]);
  if(aliases.length){
   parts.splice(1,0,{id:'swot-internal',quadrants:['strength','weakness'],metrics:[...support,...topics],aliases,maxRows:3});
   parts.splice(Math.min(3,parts.length),0,{id:'swot-external',quadrants:['opportunity','threat'],metrics:[...support,...topics],aliases,maxRows:3});
  }
 }
 return parts.filter(part=>part.aliases.length||part.metrics.length);
}

// Each closed response contains at most two complete findings. Claude chooses
// whether there is more to write; neither the batch size nor a clipped response
// marks an information need as satisfied. All calls share the existing ledger.
export async function writeBoundedScopedParts({providers,request,coverage,sections,swotId,outputSchema,normalizeData,project,signal,savedPartsOnly,reportFailures,contentQuality=false}){
 const parts=reportParts(request,coverage,sections);
 const collected={findings:[],benchmarks:[],questions:[]},completions=[];
 const manager=providers.modelHandoff?providers.manager:providers.claudeManager||providers.manager;
 let reportIssue,reportDiagnostic;
 for(const [index,part] of parts.entries()){
  const sources=Object.fromEntries(part.aliases.map(id=>[id,request.sources[id]]).filter(([,row])=>row));
  const documents=new Set(Object.values(sources).map(row=>row[0]));
  const needIds=new Set(part.metrics.map(metric=>metric.id));
  const retained={findings:[],benchmarks:[],questions:[]};
  let unfinished=false;
  // A finite continuation window also bounds malformed/always-more replies.
  for(let page=0;page<Math.ceil(part.maxRows/2);page++){
   const rowLimit=Math.min(2,part.maxRows-retained.findings.length);
   const row=obj({...outputSchema.properties.findings.items.properties,observation:field(220),analysis:field(210),
    action:field(175),measurement:str(140),limitation:str(120),question:str(160)});
   const contentSchema=obj({findings:arr(row,rowLimit),benchmarks:arr(outputSchema.properties.benchmarks.items,part.quadrants?0:1),
    questions:arr(outputSchema.properties.questions.items,3)});
   const contract=obj({...contentSchema.properties,hasMore:{type:'boolean'}});
   const partRequest={...request,sources,
    ...(request.documents?{documents:Object.fromEntries(Object.entries(request.documents).filter(([id])=>documents.has(id)))}:{}),
    ...(request.brandProofs?{brandProofs:request.brandProofs.filter(id=>Object.hasOwn(sources,id))}:{}),
    entities:request.entities.map(([id,role,name,url,proofs])=>[id,role,name,url,proofs.filter(proof=>Object.hasOwn(sources,proof))]),
    needs:request.needs.filter(need=>needIds.has(need.id)),
    coverage:part.metrics.map(metric=>({...metric,sources:metric.sources.filter(id=>Object.hasOwn(sources,id)),
     ...(metric.marketMeasures?{marketMeasures:metric.marketMeasures.map(measure=>({...measure,sources:measure.sources.filter(id=>Object.hasOwn(sources,id))})).filter(measure=>measure.sources.length)}:{})})),
    scope:part.quadrants?{section:swotId,quadrants:part.quadrants}:unique(part.metrics.map(metric=>metric.section)),
    existing:[...request.existing,...retained.findings.map(finding=>[finding.section,finding.observation,finding.quadrant])],
    instruction:request.instruction+' Yalnız bu yazım parçasını tamamla. En fazla '+rowLimit+' bulguyu bütün alanlarıyla, kısa ama tam cümlelerle yaz. '+
     'Bulgu alanlarını kesmeden JSON nesnesini kapat. Bu parçada henüz yazılmamış önemli, kaynaklı bulgu varsa hasMore=true; tamamlandıysa false ver. '+
     'existing içindeki tamamlanmış bulguları yeniden üretme veya değiştirme. Bu yazım parçasındaki bütün kanıtları incele; bulgu kotasını doldurmak için metin üretme. '+
     (part.quadrants?'Yalnız scope.quadrants içindeki SWOT kollarını değerlendir. İç koşullarla dış pazar koşullarını ayır. Eksik kanıttan zayıflık çıkarma.':
      'Briefin özgün hedefini, iş modelini ve satış sürecini koru. SWOT bu parçanın dışında. İç kayıtlara erişmeden performans teşhisi koyma.')};
   const normalize=raw=>{
    const data=normalizeData(raw,sources,contentSchema);
    data.benchmarks=data.benchmarks.filter(benchmark=>benchmark.sourceIds.every(id=>Object.hasOwn(sources,id)));
    data.findings=data.findings.filter(finding=>finding.proof.length&&
     (part.quadrants?part.quadrants.includes(finding.quadrant):finding.quadrant==='none'&&!swotSection(finding.section)))
     .map(finding=>part.quadrants?{...finding,section:swotId}:finding);
    // Save only complete rows that pass the same final proof/content gate.
    const findings=[],openQuestions=[];
    for(const finding of data.findings){
     const prior=[...retained.findings,...findings];
     const inspected=project({findings:[...prior,finding],benchmarks:[],questions:[]});
     if(inspected.findings.length>project({findings:prior,benchmarks:[],questions:[]}).findings.length)findings.push(finding);
     else if(contentQuality)openQuestions.push(...inspected.meetingQuestions.map(row=>row.question));
    }
    if(contentQuality)data.questions=unique([...openQuestions,...data.questions]).slice(0,contentSchema.properties.questions.maxItems);
    return {...data,findings,hasMore:raw?.hasMore===true||Array.isArray(raw?.findings)&&raw.findings.length>rowLimit};
   };
   const key={version:1,part:part.id,page,requestHash:hash(stable(partRequest))};
   try{
    let written=await providers.readCheckpoint?.('scoped-report-page',key);
    if(!written&&savedPartsOnly){reportIssue??='report_checkpoint_missing';break;}
    if(!written){
     const response=await manager('bhs-scoped-report-'+part.id+'-page-'+page,partRequest,contract,{
      signal,compactReview:true,lowEffort:true,plainJson:true,maxOutputTokens:rowLimit===2?2200:1400,
      minimumOutputTokens:rowLimit===2?1800:1000,generationTimeoutMs:30000,
      reserveForFollowingKurus:Math.min(440,(parts.length-index-1)*220),normalizeData:normalize,
      acceptPartialData:data=>normalize(data).findings.length>0
     });
     const valid={data:normalize(response.data),model:response.model??null,usage:response.usage??null,
      ...(response.partialOutput?{partialOutput:true}:{}),...(response.providerHandoff?{providerHandoff:response.providerHandoff}:{})};
     // A failed/budget-denied generation must not poison a zero-cost checkpoint.
     // The provider's paid-response receipt already makes crash recovery safe.
     written=providers.checkpoint?await providers.checkpoint('scoped-report-page',key,async()=>valid):valid;
    }
    const checked=normalize(written.data);
    retained.findings.push(...checked.findings);
    retained.benchmarks.push(...checked.benchmarks);
    retained.questions.push(...checked.questions);
    completions.push(written);
    unfinished=Boolean(written.partialOutput||checked.hasMore);
    if(!unfinished)break;
    if(!checked.findings.length||retained.findings.length>=part.maxRows)break;
   }catch(error){
    const issue=managedModelIssue(error,signal);
    if(!(error instanceof BudgetError)&&!reportFailures.has(issue)&&!signal.aborted&&
     !['model_deadline','model_network','input_budget'].includes(issue))throw error;
    reportIssue??=issue;
    reportDiagnostic??=error.budgetDiagnostic||error.validationDetail;
    break;
   }
  }
  for(const key of Object.keys(collected))collected[key].push(...retained[key]);
  if(unfinished)reportIssue??='partial_model_document';
 }
 const report=project({...collected,benchmarks:[...new Map(collected.benchmarks.map(row=>[JSON.stringify(row),row])).values()]});
 if(!report.findings.length&&Object.keys(request.sources).length)reportIssue??='no_source_backed_findings';
 const handoff=completions.find(row=>row.providerHandoff)?.providerHandoff;
 const usage=completions.filter(row=>row.usage).map(({model,usage})=>({model,usage}));
 const completion=completions.length?{model:completions[0].model,usage:usage.length?{parts:usage}:null,...(handoff?{providerHandoff:handoff}:{})}:undefined;
 return {report,completion,...(reportIssue?{reportIssue}:{}),...(reportDiagnostic?{reportDiagnostic}:{})};
}
