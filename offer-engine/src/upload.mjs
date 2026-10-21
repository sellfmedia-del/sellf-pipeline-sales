import sharp from 'sharp';
import { finishLogo } from './pixels.mjs';
import {cropLogoRegion} from './logo-region.mjs';

const MAX_BYTES=2*1024*1024;
export async function prepareUploadedLogo(image,{locate,chooseBackdrop}={}) {
  if(typeof image!=='string'||image.length>Math.ceil(MAX_BYTES/3)*4+100)throw new Error('Görsel en fazla 2 MB olabilir.');
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if(!match||match[2].length%4)throw new Error('PNG, JPG veya WebP ekran görüntüsü yükle.');
  const bytes=Buffer.from(match[2],'base64');
  if(!bytes.length||bytes.length>MAX_BYTES||bytes.toString('base64')!==match[2])throw new Error('Görsel dosyası geçerli değil.');
  const meta=await sharp(bytes,{limitInputPixels:16000000}).metadata();
  if(!['png','jpeg','webp'].includes(meta.format)||(meta.pages||1)!==1||meta.format!==match[1])throw new Error('PNG, JPG veya WebP ekran görüntüsü yükle.');
  const source=await sharp(bytes,{limitInputPixels:16000000}).rotate().png().toBuffer();
  const {data}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let transparent=false;for(let i=3;i<data.length;i+=4)if(data[i]<10){transparent=true;break;}
  let cropped={image:source,backgroundPoints:[]},region;
  if(locate&&!transparent){region=await locate(source);cropped=await cropLogoRegion(source,region);}
  let processed,extractionError;
  try{processed=await finishLogo(cropped.image,undefined,{backgroundPoints:cropped.backgroundPoints});}catch(error){if(!region)throw error;extractionError=error;}
  // A locator box can be a few pixels inside the artwork. Try bounded wider
  // crops of the same original before rejecting the screenshot. This is pixel
  // processing only: localization and paid model calls are never repeated.
  if(region&&(!processed||!processed.quality.matteStable||processed.quality.touchesEdge)){
    for(const padding of [.16,.28]){
      const candidate=await cropLogoRegion(source,region,{padding});
      let preview;try{preview=await finishLogo(candidate.image);}catch{continue;}
      if(preview.quality.matteStable&&!preview.quality.touchesEdge){
        cropped=candidate;processed=preview;break;
      }
    }
  }
  if(!processed)throw extractionError;
  if(chooseBackdrop&&processed.quality.matteStable&&!processed.quality.touchesEdge)processed=await finishLogo(cropped.image,undefined,{backgroundPoints:cropped.backgroundPoints,chooseBackdrop});
  const q=processed.quality;
  if(!q.transparency||!q.matteStable||q.changedSolid||q.compositingError>=1.5){const error=new Error('Bu görselde arka plan logodan güvenle ayrılamadı. Logoya yakın, düz arka planlı bir ekran görüntüsü seç.');error.logoQuality=q;throw error;}
  if(q.touchesEdge)throw new Error('Logo görselin kenarına değiyor. Logonun çevresinde biraz boşluk bulunan bir ekran görüntüsü seç.');
  // The template's logo slot is 112×46 CSS pixels. A mandatory 180-pixel
  // cutoff incorrectly rejected otherwise sharp header-logo screenshots.
  if(Math.max(q.width-24,q.height-24)<96||Math.min(q.width-24,q.height-24)<8)throw new Error('Logo teklif için fazla küçük. Daha yüksek çözünürlüklü bir ekran görüntüsü seç.');
  const dataUrl=buffer=>'data:image/png;base64,'+buffer.toString('base64');
  const background=q.lightFraction>.03?(q.darkFraction>.15?'#626262':'#171717'):'#ffffff';
  const result={generated:false,sourceType:'upload',candidates:[{id:'uploaded-logo',source:dataUrl(source),image:dataUrl(processed.png),placement:{background,area:'logo-only'},quality:{...q,status:'review',requiresReview:true,sourceKind:'uploaded-screenshot',...(cropped.region?{detectedRegion:cropped.region}:{})}}]};
  if(JSON.stringify(result).length>3800000)throw new Error('Görselin işlenmiş boyutu fazla büyük. Yalnızca logo alanını içeren bir ekran görüntüsü seç.');
  return result;
}
