// Compare quantities, not punctuation. Source locale and report locale differ;
// preserve exact literals too, and never turn a decimal/range into a substring.
const units={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,sıfır:0,bir:1,iki:2,üç:3,dört:4,beş:5,altı:6,yedi:7,sekiz:8,dokuz:9,on:10,yirmi:20,otuz:30,kırk:40,elli:50,altmış:60,yetmiş:70,seksen:80,doksan:90};
const scales={hundred:100,yüz:100,thousand:1000,bin:1000,million:1e6,milyon:1e6,billion:1e9,milyar:1e9,k:1000,m:1e6};
const turkish=new Set(['sıfır','bir','iki','üç','dört','beş','altı','yedi','sekiz','dokuz','on','yirmi','otuz','kırk','elli','altmış','yetmiş','seksen','doksan','yüz','bin','milyon','milyar']);
const fold=value=>value.toLowerCase().replace(/\u0307/g,'');
const words=Object.keys({...units,...scales}).sort((a,b)=>b.length-a.length).join('|');
const pattern=new RegExp('(?<![\\p{L}\\p{N}])(?:[+−-]?\\d+(?:[.,]\\d+)*(?:[ \\u00a0]\\d{3})*(?:[kKmM](?![\\p{L}\\p{N}]))?|(?:'+words+')(?![\\p{L}\\p{N}]))','giu');
const canonical=n=>Number.isFinite(n)&&Math.abs(n)<=1e15?String(Number(n.toPrecision(15))):null;
function decimal(raw,locale){
 let text=raw.replace(/\s/g,'').replace('−','-');
 const dot=text.lastIndexOf('.'),comma=text.lastIndexOf(',');
 if(dot>=0&&comma>=0){const decimal=dot>comma?'.':',';text=text.replaceAll(decimal==='.'?',':'.','').replace(decimal,'.');}
 else if(dot>=0||comma>=0){
  const separator=dot>=0?'.':',',group=separator===(locale==='tr'?'.':',')&&/^[+\-]?\d{1,3}(?:[.,]\d{3})+$/.test(text);
  text=group?text.replaceAll(separator,''):text.replace(separator,'.');
 }
 return Number(text);
}
export function numericEvidence(text,{locale='auto',claims=false}={}){
 const value=String(text||'').normalize('NFKC');
 const en=(value.match(/\b(?:the|and|with|our|company|products?|users?|dealers?|growth|from|to|of|in|on|we|has|have|will|year|visits|percent)\b/giu)||[]).length;
 const tr=(value.match(/(?<!\p{L})(?:ve|ile|için|şirket|ürün|bayi|yıl|ziyaret|yüzde|milyon|yıldız)(?!\p{L})/giu)||[]).length;
 const language=locale==='auto'?(en>tr?'en':tr>en||/[çğıöşü]/iu.test(value)?'tr':'en'):locale;
 const matches=[...value.matchAll(pattern)],result=[];
 for(let i=0;i<matches.length;i++){
  const match=matches[i],raw=match[0],word=fold(raw);
  if(!/\d/.test(raw)&&word!=='k'&&word!=='m'&&turkish.has(word)!==(language==='tr'))continue;
  if(Object.hasOwn(scales,word))continue; // A unit without an amount is not a claim.
  let amount,end=match.index+raw.length,literal=raw;
  if(/\d/.test(raw)){
   let token=raw;
   // A dash between quantities is a range separator, not a negative sign.
   if(/^[−-]/.test(token)&&/[\d.,]\s*$/.test(value.slice(0,match.index)))token=token.slice(1);
   const suffix=token.match(/[kKmM]$/)?.[0]?.toLowerCase();if(suffix)token=token.slice(0,-1);
   amount=decimal(token,language)*(scales[suffix]||1);
  }else amount=units[word];
  let group=amount,total=0,scaled=false;
  for(let j=i+1;j<matches.length;j++){
   const next=matches[j],nextWord=fold(next[0]),gap=value.slice(end,next.index);
   if(nextWord!=='k'&&nextWord!=='m'&&turkish.has(nextWord)!==(language==='tr'))break;
   if(!/^(?:\s+|[ -]|\s+(?:and|ve)\s+)$/.test(gap))break;
   const scale=scales[nextWord],part=units[nextWord];
   if(scale){if(scale===100)group=(group||1)*100;else{total+=(group||1)*scale;group=0;}scaled=true;}
   else if(part!==undefined&&(scaled||group>=10&&group<100&&group%10===0&&part<10))group+=part;
   else break;
   i=j;end=next.index+next[0].length;literal=value.slice(match.index,end);
  }
  // "bir fırsat" is an indefinite article, not a measured one. Written
  // quantities in claims need a count/measurement noun or an explicit scale.
  if(claims&&!/\d/.test(raw)&&!scaled&&!/^\s+(?:adet|ürün|bayi|kişi|çalışan|yıldız|takipçi|gün|mağaza|şube|ürünün|ürünle|ürüne|üründen|product|dealer|star|user|day)/iu.test(value.slice(end)))continue;
  const number=canonical(total+group);if(number!==null)result.push({number,literal:literal.replace('−','-').replace(/^\+/,'')});
 }
 return result;
}
export function supportedNumbers(value,evidence){
 const known=String(evidence||'').split('\n').flatMap(line=>numericEvidence(line)),numbers=new Set(known.map(n=>n.number)),literals=new Set(known.map(n=>n.literal));
 return numericEvidence(value,{locale:'tr',claims:true}).every(n=>numbers.has(n.number)||literals.has(n.literal));
}
