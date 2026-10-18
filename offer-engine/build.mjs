import { mkdir,copyFile,cp,readFile,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
await mkdir(path.join(here,'public'),{recursive:true});
await mkdir(path.join(here,'public/examples'),{recursive:true});
const examples={
  white:'<rect width="760" height="210" fill="#191919"/><text x="44" y="132" fill="white" font-family="Arial,sans-serif" font-size="68" font-weight="bold">ORNEK MARKA</text>',
  color:'<rect width="760" height="210" fill="white"/><rect x="35" y="35" width="125" height="140" rx="15" fill="#245bad"/><path d="M60 105 L90 135 L135 70" fill="none" stroke="white" stroke-width="15"/><text x="190" y="132" fill="#172236" font-family="Arial,sans-serif" font-size="62" font-weight="bold">ORNEK MARKA</text>'
};
for(const [name,content]of Object.entries(examples))await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="760" height="210">'+content+'</svg>')).png().toFile(path.join(here,'public/examples/logo-'+name+'.png'));
await copyFile(path.join(root,'index.html'),path.join(here,'public/crm-source.html'));
await cp(path.join(root,'offers'),path.join(here,'public/offers'),{recursive:true});
const html=await readFile(path.join(here,'public/offers/preview.html'),'utf8');
await writeFile(path.join(here,'public/offers/preview.html'),html.replace('<html lang="tr">','<html lang="tr" data-logo-service="ready">'));
const js=await readFile(path.join(here,'public/offers/preview.js'),'utf8');
await writeFile(path.join(here,'public/offers/preview.js'),js.replace("fetch('/index.html'","fetch('/crm-source.html'"));
await writeFile(path.join(here,'public/index.html'),'<!doctype html><html lang="tr"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/offers/preview.html"><title>Teklif hazırlığı önizlemesi</title><a href="/offers/preview.html">Önizlemeyi aç</a></html>');
