import sharp from 'sharp';

// Only removes edge-connected, near-uniform backdrop pixels. It never redraws a logo.
export async function finishLogo(buffer, reference) {
  const {data:original,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width,height}=info;
  const referencePixels=reference?await sharp(reference).ensureAlpha().raw().toBuffer():null;
  if(referencePixels && referencePixels.length!==original.length)throw new Error('Logo karşılaştırma boyutları uyuşmuyor.');
  if(width*height>4000000) throw new Error('Logo kesiti çok büyük.');
  const data=Buffer.from(original);
  const n=width*height;
  let clear=0,opaque=0;
  for(let i=0;i<n;i++) { if(data[i*4+3]<10)clear++; if(data[i*4+3]>245)opaque++; }
  const method=clear>n*.03 ? 'native-transparency' : 'edge-matte';
  let background=[255,255,255];
  let matteStable=true;
  if(method==='edge-matte') {
    const edge=[];
    for(let x=0;x<width;x++) { edge.push(x,(height-1)*width+x); }
    for(let y=1;y<height-1;y++) { edge.push(y*width,y*width+width-1); }
    const buckets=new Map();
    for(const p of edge) {
      const key=[data[p*4]>>3,data[p*4+1]>>3,data[p*4+2]>>3].join(',');
      const b=buckets.get(key)||{count:0,sum:[0,0,0]};
      b.count++; for(let c=0;c<3;c++)b.sum[c]+=data[p*4+c]; buckets.set(key,b);
    }
    const dominant=[...buckets.values()].sort((a,b)=>b.count-a.count)[0];
    matteStable=dominant.count/edge.length>.8;
    background=dominant.sum.map(v=>Math.round(v/dominant.count));
    if(matteStable) {
      const visited=new Uint8Array(n),queue=new Int32Array(n); let head=0,tail=0;
      const distance=p=>Math.max(...background.map((v,c)=>Math.abs(data[p*4+c]-v)));
      const add=p=>{if(!visited[p] && distance(p)<=8){visited[p]=1;queue[tail++]=p;}};
      edge.forEach(add);
      while(head<tail) {
        const p=queue[head++],x=p%width,y=Math.floor(p/width);
        data[p*4+3]=0;
        if(x)add(p-1);if(x<width-1)add(p+1);if(y)add(p-width);if(y<height-1)add(p+width);
      }
      // Decontaminate only the immediate antialias fringe next to removed backdrop.
      for(let p=0;p<n;p++) {
        if(visited[p] || data[p*4+3]===0)continue;
        const x=p%width,y=Math.floor(p/width);
        if(!((x&&visited[p-1])||(x<width-1&&visited[p+1])||(y&&visited[p-width])||(y<height-1&&visited[p+width])))continue;
        let best=-1,bestDistance=0;
        for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
          const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;
          const q=yy*width+xx,d=distance(q);if(!visited[q]&&d>bestDistance){best=q;bestDistance=d;}
        }
        if(best<0||bestDistance<40)continue;
        let numer=0,denom=0;
        for(let c=0;c<3;c++) { const fg=original[best*4+c]-background[c]; numer+=(original[p*4+c]-background[c])*fg;denom+=fg*fg; }
        const alpha=Math.max(0,Math.min(1,numer/denom));
        if(alpha<.05||alpha>.98)continue;
        data[p*4+3]=Math.round(alpha*255);
        for(let c=0;c<3;c++)data[p*4+c]=Math.max(0,Math.min(255,Math.round((original[p*4+c]-(1-alpha)*background[c])/alpha)));
      }
    }
  }
  let left=width,top=height,right=-1,bottom=-1,foreground=0,error=0,changedSolid=0,luminance=0,alphaWeight=0,sourceMismatch=0;
  for(let p=0;p<n;p++) {
    if(data[p*4+3]>12) { const x=p%width,y=Math.floor(p/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);foreground++; }
    const a=data[p*4+3]/255;alphaWeight+=a;luminance+=a*(.2126*data[p*4]+.7152*data[p*4+1]+.0722*data[p*4+2]);
    if(original[p*4+3]>245 && data[p*4+3]>245 && [0,1,2].some(c=>original[p*4+c]!==data[p*4+c]))changedSolid++;
    if(referencePixels && data[p*4+3]>245 && [0,1,2].some(c=>Math.abs(data[p*4+c]-referencePixels[p*4+c])>5))sourceMismatch++;
    if(method==='edge-matte')for(let c=0;c<3;c++)error+=Math.abs(data[p*4+c]*(data[p*4+3]/255)+background[c]*(1-data[p*4+3]/255)-original[p*4+c]);
  }
  if(right<left||bottom<top||foreground<n*.001)throw new Error('Logo kesiti boş görünüyor.');
  const trim={left,top,width:right-left+1,height:bottom-top+1};
  const touchesEdge=left<1||top<1||right>width-2||bottom>height-2;
  const compositingError=method==='edge-matte'?error/(n*3):0;
  const transparency=Array.from({length:n},(_,p)=>data[p*4+3]).some(a=>a<245);
  const sourceMismatchRatio=sourceMismatch/Math.max(1,foreground);
  const approved=matteStable&&transparency&&changedSolid===0&&compositingError<1.5&&!touchesEdge&&sourceMismatchRatio<.005;
  const png=await sharp(data,{raw:{width,height,channels:4}}).extract(trim).extend({top:12,bottom:12,left:12,right:12,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  return {png,quality:{method,width:trim.width+24,height:trim.height+24,transparency,matteStable,compositingError:Number(compositingError.toFixed(3)),changedSolid,touchesEdge,sourceMismatchRatio:Number(sourceMismatchRatio.toFixed(4)),foregroundLuminance:Math.round(luminance/Math.max(1,alphaWeight)),status:approved?'ready':'review'}};
}
