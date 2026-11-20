import {hash} from '../budget/ledger.mjs';
import {conversationAuditResult,validateConversationReport} from './conversation-report.mjs';
import {researchCoverage} from './conversation-progress.mjs';

// Inspection only: no provider, runtime store, queue or network dependency.
// Technical success never substitutes for the user's business-quality verdict.
export function inspectConversationAcceptance({brief,stored,cost,reference}){
 const audit=conversationAuditResult(brief,stored),report=stored.conversationReport;
 const mechanical=report?validateConversationReport(report,stored.conversationSources||[],{semantic:true,objective:true}):['report_unavailable'];
 const issues=[...mechanical,...audit.data.quality.issues.map(row=>row.reason)];
 if(!cost||cost.capKurus!==5000||!Number.isSafeInteger(cost.chargedKurus)||cost.chargedKurus<500||cost.chargedKurus>5000)issues.push('acceptance_cost_unverified');
 if(!stored.conversationContext||cost?.id!==stored.conversationContext.budgetId)issues.push('acceptance_account_unverified');
 if(!stored.objectiveValidationVersion)issues.push('objective_validation_missing');
 const unique=[...new Set(issues)],coverage=researchCoverage(stored.researchClosure?.progress,stored.conversationSources||[]);
 return {kind:'offline-bhs-acceptance',status:unique.length?'technical_review_required':'technical_pass_human_pending',issues:unique,
  paidCalls:0,productionWrites:0,report:{digest:report?hash(report):null,characters:report?.reportMarkdown.length||0,
   namedCompetitors:report?.competitors.map(({name,url,reason})=>({name,url,reason}))||[],readSources:coverage.count},
  cost:{capKurus:cost?.capKurus,committedKurus:cost?.chargedKurus},
  reference:reference?{available:true,digest:hash(reference),characters:(reference.reportMarkdown||reference.fullReport||'').length}: {available:false},
  humanAcceptance:{status:'pending',owner:'user',criteria:['Analiz derinliği ve marka/hedef uyumu','Gerçek pazar ve gerekçeli rakip kıyası',
   'Dört SWOT kolunun gerekçesi; uygulanabilir aksiyon ve ölçüm','İyi Doku raporuna göre kullanılabilirlik ve gerileme kontrolü','Gerçek süre ve sağlayıcı faturası']} };
}
