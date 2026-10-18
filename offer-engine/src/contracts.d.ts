export type Stage='logo'|'audit'|'pricing'|'proposal';
export type Status='ready'|'review';
export interface BriefSnapshot {version:string;leadId:string;brandName:string;website:string;segment:'kobi'|'corporate'|'key_account';goals:string;needs:string;services:string;meetingNotes:string;}
export interface EngineResult<T=unknown> {stage:Stage;engineVersion:string;inputHash:string;runId:string;status:Status;data:T;}
export interface LogoData {generated:false;sourceType:'upload';reviewed?:boolean;candidates:Array<{id:string;image:string;source:string;placement:{background:string;area:'logo-only'};quality:{transparency:true;matteStable:true;touchesEdge:false;changedSolid:0;[key:string]:unknown;}}>;}
export interface AuditData {findings:Array<{finding:string;sourceUrls:string[]}>;services:string[];}
export interface PricingData {currency:'TRY';costVersion:string;alternatives:Array<{id:string;billingPeriod:'monthly';monthlyAmount:number}>;}
export interface ProposalData {sections:Array<{title:string;body:string}>;}
export interface Engine {id:Stage;version:string;run(input:unknown,dependencies?:Partial<Record<Stage,EngineResult>>):Promise<{status:Status;data:unknown}>;}
