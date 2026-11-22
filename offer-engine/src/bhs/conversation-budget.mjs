import {marketAnalysisVersion} from './conversation-market.mjs';

// Only derived status is compacted, on new policies. Original brief, native
// assistant blocks (including thinking), tool observations and source passages
// stay intact. Frozen requests are replayed before rebuilding any messages.
export function compactBudgetText(value,analysisVersion){
 if(analysisVersion!==marketAnalysisVersion)return value;
 const prefix='Sistem bütçe bilgisi: ';
 if(typeof value!=='string'||!value.startsWith(prefix))return value;
 try{const {research,outcomes,statusContext,...budget}=JSON.parse(value.slice(prefix.length));
  return prefix+JSON.stringify(budget);
 }catch{return value;}
}
export function currentBudgetStatus(research,outcomes,analysisVersion){
 if(analysisVersion!==marketAnalysisVersion)return {research,outcomes};
 return {research:{coverage:research.coverage,issues:research.issues,
  openPublicQuestionIds:research.questions.filter(q=>q.access==='public'&&q.important&&q.status==='open').map(q=>q.id),
  unavailablePublicQuestionIds:research.questions.filter(q=>q.access==='public'&&q.important&&q.status==='unavailable').map(q=>q.id),
  pendingUrls:research.candidates.filter(row=>row.status==='pending').map(row=>row.url),
  ...(research.candidateIssues?{candidateIssues:research.candidateIssues}:{})},
 outcomes:{version:outcomes.version,issues:outcomes.issues},
 statusContext:'Soruların tam metni, hedef, aday gerekçeleri ve teslim edilen sonuçlar yukarıdaki özgün araç konuşmasında korunur; burada yalnız güncel açık kimlikleri gösterilir.'};
}
