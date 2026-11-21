export const evidenceBoundaryVersion='observed-content-boundary-v1';
export const evidenceGuidance='BİLGİ SINIRINI KORU: Bizim erişemediğimiz veri, markada eksik olduğu doğrulanan yapı ve ticari hipotez farklıdır. Okuma hatası, arama özeti, metin çıkarıcının göstermediği etiket/özellik veya sınırlı örneklem tek başına marka kusuru değildir. Analitik hesaplara erişim yoksa ölçüm altyapısı yok, reklam verimsiz veya dönüşüm düşük sonucu çıkarma. Açık kaynakta görünmeyen satış, takipçi artışı veya memnuniyet sonucunu sıfır sayma. Kaynağın açıkça söylediği olumsuz koşulu kaynağı ve kapsamıyla aktarabilirsin; yalnız görünmemesinden yokluk üretme. Kamuya açık önemli soruyu bütçe içinde araştır; özel hesap/ciro/marj gibi iç bilgiyi müşteri sorusu, belirsiz ticari etkiyi doğrulanabilir hipotez olarak tut. Koşullu aksiyonu somut doğrulama/ölçüm adımıyla bağla; bütün raporu veri-yok ifadelerine çevirme. Aynı ayrımı SWOT, özet, bulgular ve aksiyonlarda tutarlı koru.';

export function sourceEvidenceBoundary(source,readingStatus){
 const kind=readingStatus==='discovery_only'?'discovery':readingStatus==='navigation_only'?'unread_body':source.sample?'bounded_sample':'readable_text';
 return {version:evidenceBoundaryVersion,kind,omissionProvesAbsence:false,authenticatedData:false,
  note:kind==='discovery'?'Arama özeti keşiftir; sayfanın gövdesi veya marka koşulu doğrulanmış değildir.':
   kind==='unread_body'?'Yeterli gövde alınmadı; bu erişim sınırı marka eksikliği veya yokluk kanıtı değildir.':
   kind==='bounded_sample'?'Yalnız dönen sınırlı örneklem gözlemlendi; eksik alan veya boş örneklem tüm kanalın/dönemin yokluğunu, satışını veya performansını kanıtlamaz.':
   'Yalnız aracın sunduğu kamu metni gözlemlendi; tam HTML/etiketler, hesap içi ölçüm veya sitenin bütünü doğrulanmadı. Metinde görünmeyen özellik yok sayılmaz.'};
}
export const failedEvidenceBoundary={version:evidenceBoundaryVersion,kind:'tool_failure',omissionProvesAbsence:false,brandCondition:'not_determined',
 note:'Araç/erişim sonucu marka kusuru veya yokluk kanıtı değildir; kapsamı açıkla ve uygun alternatif ya da müşteri sorusu seç.'};
