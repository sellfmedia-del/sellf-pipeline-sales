const reasons={
 missing_plan:'Bu adım için brief’e özgü plan dönmedi.',
 copy_too_long:'Adım metni güvenli uzunluk sınırını aştı.',
 invalid_structure:'Plan yanıtı beklenen biçimde değildi.',
 monthly_step_count:'Bu ay için tek ve bütün bir adım doğrulanamadı.',
 duplicate_group:'Aynı ay veya alternatif için çelişen plan kayıtları döndü.',
 service_scope_mismatch:'Plan seçilen hizmet kapsamıyla eşleşmedi.',
 service_coverage_missing:'Seçilen hizmetlerin tamamı planlanmadı.',
 finding_reference_invalid:'Planın bulgu bağlantısı doğrulanamadı.',
 brief_reference_invalid:'Planın brief dayanağı doğrulanamadı.',
 basis_missing:'Planın brief veya bulgu dayanağı eksik.',
 unsafe_content:'Plan onaylanmamış ücret, taahhüt veya uygun olmayan içerik içerdi.',
 unapproved_timing:'Plan onaylanmamış bir süre taahhüdü içerdi.',
 unsupported_quantity:'Plandaki sayısal iddia doğrulanamadı.',
 unpriced_channel:'Plan fiyatlandırılmamış bir reklam kanalı ekledi.',
 duplicate_step:'Birbirini tekrarlayan adımlar doğrulanamadı.',
 budget_limit:'Taslak için ayrılan bütçe bu planı karşılamadı.',
 generation_unavailable:'Brief’e özgü plan oluşturulamadı.'
};
const label=group=>Number.isSafeInteger(group.month)&&group.month>0?group.month+'. ay':
 group.groupId==='growth_operations'?'Growth + Operasyon':group.groupId==='operations_bundle'?'Operasyon alternatifi':'Plan adımı';

// Seller-only status text. Never echo model copy, URLs, service IDs or errors.
export function implementationReviewNotice(review){
 return (Array.isArray(review?.groups)?review.groups:[]).flatMap(group=>{
  if(['rejected','missing'].includes(group.status)){
   const copy=[...new Set((group.reasons||[]).map(reason=>Object.hasOwn(reasons,reason.code)?reasons[reason.code]:'Plan adımı doğrulanamadı.'))].join(' ');
   return [label(group)+': '+copy+' Seçili hizmetlerin başlangıç adımı korunuyor.'];
  }
  if(group.status==='normalized'&&(group.reasons||[]).some(reason=>reason.code==='copy_length_tolerance'))
   return [label(group)+': Uzunluk hedefini az aşan plan metni anlamı kesilmeden korundu.'];
  return [];
 }).join(' ');
}
