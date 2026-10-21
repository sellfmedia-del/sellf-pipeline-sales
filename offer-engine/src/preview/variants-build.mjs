import {readFile,writeFile,cp} from 'node:fs/promises';
import {offerFixture,sourceId,runId} from '../../test/fixtures/offer.mjs';
export async function buildVariantsReview(output){
 const tr=await offerFixture(),usd=await offerFixture('USD');
 const image='data:image/png;base64,'+(await readFile(new URL('../../public/examples/logo-color.png',import.meta.url))).toString('base64');
 for(const f of [tr,usd]){f.row.customer_document.brand={name:'Örnek Marka',website:'https://brand.example/'};f.row.customer_document.logo.image=image;f.row.originalPrices=f.row.customer_document.alternatives.map((a,i)=>f.row.customer_document.quote?.alternatives[i].monthlyAmount??a.monthlyAmount);f.row.minimumPrices=f.pricing.data.alternatives.map(a=>f.row.customer_document.quote?Math.ceil(a.minimumAmount/44.1234*100)/100:a.minimumAmount);}
 Object.assign(tr.row,{id:sourceId,version:1,state:'published'});Object.assign(usd.row,{id:runId,version:2,state:'draft'});
 const logo={...tr.logo.data,sourceType:'saved',reviewed:true};logo.candidates[0].image=image;logo.candidates[0].source=image;
 const data={rows:[tr.row,usd.row],logo:{...logo,logoProof:'synthetic-preview-only'},audit:tr.audit,pricing:{TRY:tr.pricing,USD:usd.pricing},proposal:{TRY:{data:tr.row.customer_document},USD:{data:usd.row.customer_document}}};
 for(const ext of ['html','js'])await cp(new URL('./variants-review.'+ext,import.meta.url),output+'/offers/variants-review.'+ext);
 await writeFile(output+'/offers/variants-review-data.json',JSON.stringify(data));
}
