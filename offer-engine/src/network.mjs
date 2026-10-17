import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { gunzipSync, brotliDecompressSync, inflateSync } from 'node:zlib';
import ipaddr from 'ipaddr.js';

export function isPublicAddress(address) {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}

export async function resolveTarget(input, resolver = lookup) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80','443'].includes(url.port))) throw new Error('Yalnızca herkese açık web sitesi adresleri kullanılabilir.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (/^(localhost|metadata)(\.|$)|\.(localhost|local|internal|test|invalid)$/.test(host)) throw new Error('Bu adres kullanılamaz.');
  const addresses = ipaddr.isValid(host) ? [{ address:host, family:ipaddr.parse(host).kind()==='ipv6'?6:4 }] : await resolver(host,{all:true});
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new Error('Bu adres herkese açık değil.');
  return { url, address:addresses[0] };
}

export function createPublicFetcher({ maxRequests=100, maxBytes=45*1024*1024, deadline=Date.now()+45000 }={}) {
  let count=0, total=0;
  const cache=new Map();
  return async function read(input, redirects=0) {
    if (++count > maxRequests || Date.now()>deadline || redirects>5) throw new Error('Site yükleme sınırına ulaşıldı.');
    const target=await resolveTarget(input);
    if (cache.has(target.url.href)) return cache.get(target.url.href);
    const result=await new Promise((resolve,reject)=>{
      const transport=target.url.protocol==='https:'?https:http;
      const request=transport.get(target.url, {
        headers:{'user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36','accept':'*/*','accept-encoding':'identity'},
        lookup:(_hostname, options, callback)=>options.all ? callback(null,[target.address]) : callback(null,target.address.address,target.address.family),
        timeout:Math.max(1000,Math.min(12000,deadline-Date.now())),
        agent:false
      }, response=>{
        const chunks=[];
        let bytes=0;
        response.on('data',chunk=>{
          bytes+=chunk.length; total+=chunk.length;
          if(bytes>8*1024*1024 || total>maxBytes) { request.destroy(new Error('Görsel veya sayfa boyutu sınırı aşıldı.')); return; }
          chunks.push(chunk);
        });
        response.on('error',reject);
        response.on('end',()=>{
          try {
            let body=Buffer.concat(chunks);
            const encoding=response.headers['content-encoding'];
            if (encoding==='gzip') body=gunzipSync(body,{maxOutputLength:10*1024*1024});
            if (encoding==='br') body=brotliDecompressSync(body,{maxOutputLength:10*1024*1024});
            if (encoding==='deflate') body=inflateSync(body,{maxOutputLength:10*1024*1024});
            const headers={};
            for(const [key,value] of Object.entries(response.headers)) {
              if(value && !['content-encoding','content-length','transfer-encoding','connection','set-cookie'].includes(key)) headers[key]=Array.isArray(value)?value.join(', '):String(value);
            }
            resolve({status:response.statusCode,headers,body,url:target.url.href});
          } catch(error) { reject(error); }
        });
      });
      request.on('timeout',()=>request.destroy(new Error('Site yanıtı zaman aşımına uğradı.')));
      request.on('error',reject);
    });
    // Chromium follows redirects; each new request passes this resolver again.
    // Returning the actual redirect preserves final URL and relative asset paths.
    cache.set(target.url.href,result);
    return result;
  };
}
