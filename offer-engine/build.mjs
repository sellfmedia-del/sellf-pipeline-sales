import { mkdir,cp,readFile,writeFile,rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import {writeTemplateExample} from './scripts/template-example.mjs';
import {buildPipelinePreview} from './src/preview/build-pipeline.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
await mkdir(path.join(here,'public'),{recursive:true});
await mkdir(path.join(here,'public/examples'),{recursive:true});
const examples={
  white:'<rect width="760" height="210" fill="#191919"/><text x="44" y="132" fill="white" font-family="Arial,sans-serif" font-size="68" font-weight="bold">ORNEK MARKA</text>',
  color:'<rect width="760" height="210" fill="white"/><rect x="35" y="35" width="125" height="140" rx="15" fill="#245bad"/><path d="M60 105 L90 135 L135 70" fill="none" stroke="white" stroke-width="15"/><text x="190" y="132" fill="#172236" font-family="Arial,sans-serif" font-size="62" font-weight="bold">ORNEK MARKA</text>'
};
for(const [name,content]of Object.entries(examples))await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="760" height="210">'+content+'</svg>')).png().toFile(path.join(here,'public/examples/logo-'+name+'.png'));
const pipelineSource=await readFile(path.join(root,'index.html'),'utf8');
// Diagnostic source is inert if opened directly; it cannot initialize production.
await writeFile(path.join(here,'public/crm-source.html'),pipelineSource.replace('<head>',`<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; form-action 'none'">`));
await cp(path.join(root,'offers'),path.join(here,'public/offers'),{recursive:true});
const html=await readFile(path.join(here,'public/offers/preview.html'),'utf8');
await writeFile(path.join(here,'public/offers/preview.html'),html.replace('<html lang="tr">','<html lang="tr" data-logo-service="ready">'));
const js=await readFile(path.join(here,'public/offers/preview.js'),'utf8');
await writeFile(path.join(here,'public/offers/preview.js'),js.replace("fetch('/index.html'","fetch('/crm-source.html'"));
const production=process.env.VERCEL_ENV==='production';
await writeFile(path.join(here,'public/index.html'),production?pipelineSource:buildPipelinePreview(pipelineSource));
if(production){
 for(const name of ['travis.html','travis.css','travis.js'])await cp(path.join(root,name),path.join(here,'public',name));
}
// This reviewer sandbox has synthetic page-local state. Never publish its
// fixtures or adapter to production, including after a reused local build dir.
for(const name of ['variants-review.html','variants-review.js','variants-review-data.json','team-review.html','team-review.js'])await rm(path.join(here,'public/offers',name),{force:true});
if(!production){const {buildVariantsReview}=await import('./src/preview/variants-build.mjs');await buildVariantsReview(path.join(here,'public'));const {buildTeamReview}=await import('./src/preview/team-build.mjs');await buildTeamReview(path.join(here,'public'));}


// Deterministic synthetic example: no paid model, customer data or persistence.
process.chdir(here);
await writeTemplateExample();

// Only the explicitly provisioned synthetic QA session opts into a live
// recovery check. Ordinary preview/production builds never call providers.
if(process.env.OFFER_REGRESSION_SESSION)await import('./scripts/recovery-regression.mjs');
