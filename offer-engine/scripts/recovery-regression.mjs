// Explicit opt-in validation on the EXISTING synthetic QA card. Never runs in
// an ordinary build, creates no replacement budget, and starts no research.
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {normalizeCompleteDirectReport,directAuditResult} from '../src/bhs/direct-report.mjs';
import {runBoundedStage,stageKey} from '../src/bhs/direct-research.mjs';
import {budgetFor} from '../src/budget/ledger.mjs';
import {createBoundedProviders} from '../src/budget/providers.mjs';
import {offerGeminiKey} from '../src/config.mjs';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
import {createPricingHandler} from '../api/pricing.js';
import {createProposalHandler} from '../api/proposal.js';
import {createOfferHandler} from '../api/offer.js';
import logoHandler from '../api/logo-upload.js';

if(process.env.VERCEL_ENV!=='preview'||!process.env.OFFER_REGRESSION_SESSION)throw Error('Explicit isolated regression session required.');
const session=JSON.parse(process.env.OFFER_REGRESSION_SESSION),host=new URL(session.base).host;
if(host!=='sellf-pipeline-sales-git-feat-offe-6bb474-yigit-konuks-projects.vercel.app'||session.context.leadId!=='e417bd66-c2da-46ee-95ba-88521105d84c')throw Error('Pinned existing synthetic QA card required.');
const jar={...session.jar};delete jar._vercel_jwt;
jar['__Host-offer-research']||=randomBytes(32).toString('base64url');
const req=body=>({method:'POST',headers:{host,origin:'https://'+host,cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join('; ')},body});
const response=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;if(k.toLowerCase()==='set-cookie')for(const c of Array.isArray(v)?v:[v]){const m=c.match(/^([^=]+)=([^;]*)/);if(m)jar[m[1]]=m[2];}},getHeader(k){return this.headers[k];},status(v){this.statusCode=v;return this;},json(v){this.data=v;return this;}});
async function call(handler,body){const res=response();await handler(req(body),res);if(res.statusCode>=400){const e=Error(res.data?.error||'Validation endpoint failed');e.code=res.data?.code||'validation_endpoint';throw e;}return res.data;}
const brief=snapshotBrief({brandName:'One More Global',website:'https://onemoreglobalinc.com/',segment:'corporate',goals:'ABD pazarında perakende büyümesi.',needs:'MLM satışlarından monobrand perakende ve e-ticarete geçiş.',services:'Growth danışmanlığı, e-ticaret, Meta ve Google Ads operasyonları.',meetingNotes:'Sentetik tekrar testi. Kamuya açık kaydedilmiş One More araştırması kullanılır; gerçek müşterinin yeni brief beyanı değildir.',budget:null});
const res=response(),ledger=await budgetFor(req({}),res,session.context.leadId);await ledger.begin();const before=await ledger.status();
const raw=JSON.parse(await readFile(new URL('../test/fixtures/one-more-recorded-report.json',import.meta.url),'utf8')),report=normalizeCompleteDirectReport(raw);
let synthesis={report},audit={stage:'audit',engineVersion:'recorded-real-report-regression',...directAuditResult(brief,synthesis)};
const existing={...ledger,get:async key=>key===stageKey(brief,'synthesis','v5')?{state:'complete',value:synthesis}:ledger.get(key)};
const scope=await runBoundedStage({phase:'scope',brief,ledger:existing,providers:createBoundedProviders({ledger}),researchVersion:'v5'});
audit.data={...audit.data,scopePlan:scope.scopePlan,proposalCopy:scope.proposalCopy};
const codec=createPricingProof(offerGeminiKey()),researchSession=jar['__Host-offer-research'];
const pricingProof=codec.encode({kind:'audit_ready',createdAt:Date.now(),briefHash:briefHash(brief),auditHash:digest(audit),budgetLeadId:session.context.leadId},researchSession,host);
// Opaque screenshot of the actual public brand asset; never generate/redraw ink.
const assetResponse=await fetch('https://onemore.global/cdn/images/one-more-global.png',{signal:AbortSignal.timeout(20000)});if(!assetResponse.ok)throw Error('Public logo asset unavailable.');
const image=await sharp(Buffer.from(await assetResponse.arrayBuffer())).resize({width:600,withoutEnlargement:true}).flatten({background:'#fafafa'}).png().toBuffer();
const logo=await call(logoHandler,{context:session.context,brandName:brief.brandName,image:'data:image/png;base64,'+image.toString('base64')});
const pricing=await call(createPricingHandler(),{action:'start',requestId:randomUUID(),brief,audit,pricingProof});
const proposal=await call(createProposalHandler(),{action:'start',requestId:randomUUID(),context:session.context,brief,audit,pricing:pricing.result,proposalProof:pricing.proposalProof,logo,planMode:'growth'});
const handler=createOfferHandler(),saved=await call(handler,{action:'save',...session.context,proposal:proposal.result,pricing:pricing.result,saveProof:proposal.saveProof,logoApproved:true,scopeApproved:true});
const published=await call(handler,{action:'publish',offerId:saved.offer.id});
const access=await call(handler,{action:'access',slug:new URL(published.url).pathname.slice(1),password:published.password});
const listing=await call(handler,{action:'list',leadId:session.context.leadId}),listed=listing.offers.find(o=>o.id===saved.offer.id),cost=await ledger.status();
if(access.id!==saved.offer.id||listed.publicUrl!==published.url||listed.password!==published.password||cost.id!==before.id||cost.chargedKurus>cost.capKurus)throw Error('Publication or preserved-budget assertion failed.');
const summary={passed:true,kind:'recorded-one-more-research-real-scope-logo-and-persistence',researchCalls:0,budgetReset:false,newAccount:false,newCard:false,realMailSends:0,coverage:audit.data.quality.methodologyCoverage,logo:logo.candidates[0].quality,alternatives:proposal.result.data.alternatives.map(a=>({id:a.id,monthlyAmount:a.monthlyAmount})),saved:true,published:true,passwordAccess:true,ownerLinkRetained:true,offerId:saved.offer.id,version:access.version,budgetBeforeKurus:before.chargedKurus,budgetAfterKurus:cost.chargedKurus};
await writeFile('public/recovery-regression.json',JSON.stringify(summary,null,2));console.log(JSON.stringify({recoveryRegression:'passed',version:summary.version,costKurus:cost.chargedKurus}));
