import {interpretOperations} from '../pricing/service-interpretation.mjs';

const list=value=>Array.isArray(value)?value:[];
const clean=value=>typeof value==='string'?value.replace(/\s+/gu,' ').trim():'';
const key=value=>clean(value).toLocaleLowerCase('tr');
const explicitExclusion=/(?:kapsam\s+dışı|dahil\s+değil|hariç|istemiyoruz|out of scope|not included|excluded|do not include)/iu;

export const scopeAuthorityInstruction='Mevcut partner, ajans veya kanal bilgisi çalışma bağlamıdır; hizmeti kapsam dışı bırakma talimatı değildir. Bir BHS bulgusu belirli bir hizmeti zorunlu yapmaz. Briefte açıkça istenmeyen uygulamayı yalnız ileri aşamada değerlendirilecek öneri olarak sun; genel konumlandırma bulgusundan zorunlu Meta/Google yönetimi çıkarma. Exclusions yalnız briefteki açık kapsam dışı bırakma cümlesinin birebir alıntısı olsun. Hizmetlerin kesin kapsamını kullanıcının hizmet seçimi belirler.';

// This guard is confined to the BHS advisory scope. Pricing and the user's
// explicit operation/project selections keep their existing validators.
export function guardResearchScope(scope,brief,audit){
 if(!audit?.supervision?.researchPlan?.taskReporting||!scope||scope.fallback)return scope;
 const requested=new Set(interpretOperations(brief.services||'',{context:[brief.needs,brief.meetingNotes].filter(Boolean).join('\n')}).serviceIds);
 const sentences=['goals','needs','services','meetingNotes'].flatMap(field=>
  String(brief[field]||'').split(/(?<=[.!?;])\s+|\n/gu)).map(clean).filter(Boolean);
 const exclusions=list(scope.exclusions).filter(value=>explicitExclusion.test(value)&&sentences.some(sentence=>key(sentence)===key(value)));
 return {...scope,summary:'Hizmet kapsamı kullanıcının açık hizmet seçimiyle kesinleşir; BHS bulguları önerilere dayanak sağlar.',
  exclusions,services:list(scope.services).map(service=>requested.has(service.serviceId)?service:{...service,phase:'later',
   reason:'Bu hizmet BHS bağlamında değerlendirilecek bir öneridir; uygulanması kullanıcının hizmet seçimiyle kesinleşir.'})};
}
