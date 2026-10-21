// Customer access only. Operator JWTs, cookies and save/publish actions never
// cross this public portal boundary. All password checks remain in Pipeline.
export function createPortalHandler({fetchImpl=fetch}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(req.method==='GET')return res.status(200).json({customerPortal:true});
  if(req.method!=='POST')return res.status(405).json({error:'POST gerekli.'});
  if(!req.headers.host||req.headers.origin!=='https://'+req.headers.host)return res.status(403).json({error:'İstek kaynağı doğrulanamadı.'});
  let body;
  try{
   if(Number(req.headers['content-length'])>4096)throw Error();
   body=typeof req.body==='string'?JSON.parse(req.body):req.body;
   if(!body||JSON.stringify(body).length>4096)throw Error();
  }catch{return res.status(400).json({error:'Teklif bilgileri geçersiz.'});}
  if(body.action!=='access')return res.status(403).json({error:'Bu sayfa yalnızca müşteri teklifini açmak için kullanılabilir.'});
  if(typeof body.password!=='string'||!body.password||body.password.length>128||
     (body.slug?typeof body.slug!=='string'||body.slug.length>120:typeof body.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(body.token)))return res.status(422).json({error:'Teklif bağlantısı veya şifresi doğrulanamadı.'});
  try{
   const response=await fetchImpl('https://sales.sellfmedia.com/api/offer',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://sales.sellfmedia.com'},body:JSON.stringify({action:'access',password:body.password,...(body.slug?{slug:body.slug}:{token:body.token})}),redirect:'error',signal:AbortSignal.timeout(30000)});
   const result=await response.json();
   if(!response.ok)return res.status(response.status===422?422:502).json({error:response.status===422?'Teklif bağlantısı veya şifresi doğrulanamadı.':'Teklif servisine şu anda ulaşılamıyor. Yeniden deneyin.'});
   if(!result.id||!result.document)throw Error();
   return res.status(200).json({id:result.id,version:result.version,document:result.document});
  }catch{return res.status(502).json({error:'Teklif servisine şu anda ulaşılamıyor. Yeniden deneyin.'});}
 };
}
export default createPortalHandler();
