export const validSlug=value=>typeof value==='string'&&value.length<=120&&/^[a-z0-9]+(?:-[a-z0-9]+)*-teklifi(?:-v\d+-[a-f0-9]{8})?$/.test(value);
export function brandSlug(name){const base=String(name||'marka').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70).replace(/-$/,'')||'marka';return base+'-teklifi';}
export function publicationUrl(host,link){if(link?.slug&&validSlug(link.slug))return 'https://'+host+'/'+link.slug;return 'https://'+host+'/offers/customer.html#'+link.token;}
