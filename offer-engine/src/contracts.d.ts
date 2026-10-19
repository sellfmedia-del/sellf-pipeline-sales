export type Stage='logo'|'audit'|'pricing'|'proposal';
export type Status='ready'|'review';
export interface BriefSnapshot {brandName:string;website:string;segment:'kobi'|'corporate'|'key_account';goals:string;needs:string;services:string;meetingNotes:string;budget:number|null;}
export interface EngineResult<T=unknown> {stage:Stage;engineVersion:string;inputHash:string;runId:string;status:Status;data:T;}
export interface LogoData {generated:false;sourceType:'upload';reviewed?:boolean;candidates:Array<{id:string;image:string;source:string;placement:{background:string;area:'logo-only'};quality:{transparency:true;matteStable:true;touchesEdge:false;changedSolid:0;[key:string]:unknown;}}>;}
export type BhsDimension='financial'|'operations'|'funnel'|'digital'|'perception'|'competition';
export interface AuditData {
  schemaVersion:'bhs-v1';methodologyVersion:string;briefHash:string;rawReport:string;summary:string;researchId:string;structureId:string;
  findings:Array<{id:string;dimension:BhsDimension;kind:'observation'|'inference'|'brief';statement:string;reportExcerpt:string;sourceIds:string[];impact:string;goalConnection:string;priority:'high'|'medium'|'low'}>;
  sources:Array<{id:string;url:string;title:string;quote:string;publishedAt:string|null;period:string|null;scope:string;sourceType:'primary'|'secondary'|'review';verification:{status:string;finalUrl?:string;checkedAt:string}}>;
  dimensions:Array<{id:BhsDimension;score:number|null;rationale:string;dataStatus:'full'|'partial'|'insufficient';findingIds:string[];comparisonCompetitorIds:string[];strengths:string[];gaps:string[];onboardingQuestions:string[]}>;
  competitors:Array<{id:string;name:string;website:string;scaleReason:string;audienceReason:string;geographyReason:string;sourceIds:string[]}>;
  benchmarks:Array<{metric:string;entries:Array<{entityId:string;value:string|null;unit:string|null;period:string|null;sourceIds:string[]}>}>;
  meetingQuestions:Array<{dimension:BhsDimension;question:string;findingIds:string[]}>;
  serviceRecommendations:Array<{id:string;name:string;hypothesis:string;findingIds:string[];measurement:string}>;
  criticalOpportunityFindingId:string|null;criticalRiskFindingId:string|null;services:string[];
  scoring:{total:number|null;weights:Array<{id:BhsDimension;weight:number}>;note:string};
  quality:{checksPassed:boolean;issues:string[];scope:'citation-and-quote-checks';semanticBenchmark:'pending';customerApproval:'pending'};
  usage:{research:unknown;structure:unknown};
}
export interface PricingData {currency:'TRY';costVersion:string;alternatives:Array<{id:string;billingPeriod:'monthly';monthlyAmount:number}>;}
export interface ProposalData {sections:Array<{title:string;body:string}>;}
export interface Engine {id:Stage;version:string;run(input:unknown,dependencies?:Partial<Record<Stage,EngineResult>>):Promise<{status:Status;data:unknown}>;}
