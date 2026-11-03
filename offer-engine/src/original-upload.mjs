import sharp from 'sharp';

// Validate the actual image without cropping, resizing, re-encoding or AI.
export async function prepareOriginalLogo(image){
 const max=2*1024*1024;
 if(typeof image!=='string'||image.length>Math.ceil(max/3)*4+100)throw Error('Görsel en fazla 2 MB olabilir.');
 const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
 if(!match||match[2].length%4)throw Error('PNG, JPG veya WebP ekran görüntüsü yükle.');
 const bytes=Buffer.from(match[2],'base64');
 if(!bytes.length||bytes.length>max||bytes.toString('base64')!==match[2])throw Error('Görsel dosyası geçerli değil.');
 const reader=sharp(bytes,{limitInputPixels:16000000}),meta=await reader.metadata();
 if(meta.format!==match[1]||(meta.pages||1)!==1||!meta.width||!meta.height)throw Error('Geçerli, tek kare PNG, JPG veya WebP görseli seç.');
 await reader.stats();
 return {generated:false,sourceType:'upload-original',processing:'original',candidates:[{id:'original-logo',source:image,image,placement:{background:'#ffffff',area:'logo-only'},quality:{method:'original',width:meta.width,height:meta.height,status:'review',requiresReview:true,sourceKind:'original-upload'}}]};
}
