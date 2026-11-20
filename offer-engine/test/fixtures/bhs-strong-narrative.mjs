import {researchedReport} from './bhs-conversation.mjs';

// Synthetic preservation reference. It illustrates the qualities the user
// approved; it is not the historical Doku report or a paid model evaluation.
export const weakClaim='Ölçüm etiketi görülemediği için reklam harcamaları verimsizdir.';
export const correctedClaim='Bu kaynak ölçümün çalışmasını veya reklam verimini doğrulamıyor. Hesap erişimi ve olay testiyle ölçüm güvenilirliği incelenmeli; performans kaybı yaşandığı henüz söylenemez.';
export function strongNarrativeReport({flawed=false}={}){
 const report=researchedReport();
 report.reportMarkdown=report.reportMarkdown.replace('## SWOT',`## Ölçümün yorumlanması\n${flawed?weakClaim:correctedClaim}\n\n## SWOT`);
 report.reportMarkdown+='\n\n## Karar mantığı\nMarkanın hedefi yalnız daha çok ziyaretçi toplamak değil, ürün keşfi ile gelir üreten sipariş arasındaki ilişkiyi yönetilebilir hâle getirmektir. Mevcut harici yönlendirmelerin başarısız olduğu sonucuna varmak için yeterli veri yoktur. İlk iş kanalları değiştirmek değil, her geçişin sorumlusunu ve ölçümünü tanımlamaktır. Bu değerlendirme ticari bir hipotezdir; gerçekleşmiş ciro artışı veya dönüşüm kaybı olarak sunulamaz.\n\n'+
 'Ürün kullanımını açıklamak ile yeni bir satış altyapısı kurmak farklı kararlardır. Kullanım anlatımı mevcut kanallarda da iyileştirilebilir. Buna karşılık müşteri verisi ve sipariş izlemesi parçalıysa altyapı kararı, süreç sahipliği ve veri erişimi birlikte ele alınmalıdır. Amazon partnerinin bulunması, o kanalın bütün büyüme sorularını çözdüğünü veya tekliften çıkarıldığını göstermez. Mevcut partnerle sorumluluklar ve test alanları netleştirilmelidir.\n\n'+
 '## Önceliklendirilmiş uygulama\n'+
 '1. Ürün ziyareti, harici mağaza tıklaması ve WhatsApp başlangıcını ayrı olaylar olarak tanımla. Ölçüm: aynı kanal ve dönem için olayların tamamlanma oranını izle; siparişe eşleşmeyen tıklamayı satış sayma.\n'+
 '2. Öncelikli ürün sayfasında kullanım amacı, uygun hayvan türü ve uygulama adımlarını açıkla. Ölçüm: sayfa ziyaretinden ilgili sipariş yönlendirmesine geçişi önceki sürümle aynı trafik kaynağında karşılaştır.\n'+
 '3. Shopier ve WhatsApp yönlendirmelerinin sonrasındaki sipariş kaydını mümkün olan kapsamda eşleştir. Ölçüm: eşleşen ve eşleşemeyen sipariş oranlarını ayrı raporla; bilinmeyenleri sıfır kabul etme.\n'+
 '4. Mevcut Amazon partneriyle içerik, kampanya ve raporlama sorumluluklarını belirle. Ölçüm: kararlaştırılan veri teslimlerinin zamanında ve tam gerçekleşmesini izle; erişilemeyen kanal sonucunu tahmin etme.\n'+
 '5. Karşılaştırılan rakibin uygulama anlatımı ve sipariş yolunu bir ürün için nitel kıyas olarak kullan. Ölçüm: değiştirilen ürün anlatımının müşteri soruları ve yönlendirme davranışı üzerindeki etkisini kontrollü pilotta değerlendir.\n'+
 '6. Müşteriden gerçek brüt marj, operasyon maliyeti ve sipariş verisini al. Ölçüm: reklam harcaması ve operasyon etkisi sonrasında kalan katkıyı hesapla; bu iç bilgiler gelmeden kârlılık sonucu üretme.\n'+
 '7. Kanal ve içerik değişiklikleri için test günlüğü tut; aynı anda değişen fiyat, kampanya veya stok durumunu kaydet. Ölçüm: sonuç değişimini tek bir müdahaleye bağlayamadığın denemeleri açıkça işaretle.\n'+
 '8. Büyütme, düzeltme ve durdurma kararını müşteriyle önceden kararlaştırılan ekonomik ölçütlere bağla. Ölçüm: gerçekleşen katkı, sipariş kalitesi ve operasyon kapasitesini birlikte değerlendir; gösterim artışını kârlılık kanıtı sayma.\n\n'+
 '## İki uygulama alternatifi\nAlternatif A, mevcut sipariş kanallarını koruyarak ürün anlatımı ve ölçümde sınırlı bir pilotla ilerler. Daha düşük uygulama yüküyle hangi sorunun öncelikli olduğunu öğrenmeye uygundur. Mevcut altyapıda sipariş eşleştirmesi mümkün değilse bunun sınırı açıkça kaydedilir; bu alternatifin satış artışı sağlayacağı garanti edilmez.\n\n'+
 'Alternatif B, ürün anlatımıyla birlikte sipariş yolunun ve veri sahipliğinin yeniden düzenlenmesini değerlendirir. Ancak karar yalnız estetik bir web sitesi talebine bağlanmaz. Geçiş maliyeti, partner rolleri, sipariş kayıtlarına erişim ve müşterinin operasyon kapasitesi birlikte incelenir. Teknik değişiklik, ticari sorun ve ölçülebilir kazanım tanımlanmadan zorunlu hizmete dönüştürülmez.\n\n'+
 '## 90 günlük karar çerçevesi\nİlk 30 gün mevcut durumun ölçümü, veri erişimi ve tek ürün için pilot hazırlığına ayrılabilir. Bu bir önerilen uygulama planıdır, araştırılmış şirket takvimi değildir. 31–60. günlerde seçilen içerik ve yönlendirme denemeleri aynı kanal koşullarında değerlendirilir. 61–90. günlerde yalnız elde edilen ekonomik ve operasyonel sonuçların desteklediği değişiklikler genişletilir; yetersiz kalan denemeler için gerekçe ve sonraki karar açıkça yazılır.\n\n'+
 'Bu planın değeri, her faaliyeti bir soruya ve ölçüme bağlamasıdır. Veri eksikliği bir sonraki görüşmede alınacak bilgi olarak tutulur; markanın başarısızlığına çevrilmez. Aynı bulguyu farklı isimlerle tekrar etmek, daha fazla başlık açmak veya raporu kısaltmak araştırmanın ticari değerini artırmaz.';
 return report;
}
