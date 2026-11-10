# BHS canlı kurulum kaydı

Kullanıcı, 10 Kasım 2026'da altı aşamalı Claude yönetici / Gemini operatör akışının canlı kurulumunu açıkça onayladı. Gerçek marka raporunun kalite ve gerçekleşmiş maliyet kabulünü kullanıcı canlıda yapacak; otomatik ücretli QA kapalıdır.

Hedef: sellfmedia-del/sellf-pipeline-sales, Vercel sellf-pipeline-sales / yigit-konuks-projects, Supabase Pipeline ve Bağımsız / Sellf Toolları ve Aunce / gxngmqewskhrbxqmnpps. Başlangıç canlı commit 30c0c139cf05f41d275ffd9f9747dfca21345fa5, deployment dpl_emoskTtF3z4Y7VUFGeGe4zQmJvPU.

Uygulanan altyapı: pg_cron 1.6.4, pg_net 0.20.0 ve özel RLS etkin BHS kuyruğu. Anon/authenticated kuyruk erişimi yok; servis rolü fonksiyonları kullanır. Mevcut müşteri/teklif tabloları ve politikaları değiştirilmedi. Yeni worker anahtarı Vercel Secret ve Supabase Vault içinde; değeri dosyaya yazılmaz.

Supabase bağlantısında ortam sırrı yönetim aracı bulunmadığından gateway, BHS_WORKER_SECRET ortam değeri yoksa yalnız servis rolünün çağırabildiği pipeline_bhs_worker_authorized RPC ile Vault içindeki anahtarı doğrular. RPC yalnız boolean döndürür; anahtarı açığa çıkarmaz. Geçersiz anahtarın reddi ve rol yetkileri doğrulandı.

İki mevcut Edge gateway'in önceki kaynakları, Git baseline ile BHS import/action satırı dışında bire bir karşılaştırıldı. Production gateway v4→v5 (JWT açık), Preview gateway v8→v9 (önceden olduğu gibi JWT kapalı, mevcut uygulama denetimleri korunur). Tek fark BHS adaptörüdür.

Worker iad1 bölgesine sabitlendi; hesaplama maliyet zarfı bu bölgeye bağlıdır. Özel readiness işlemi worker yetkisi ister, iş başlatmaz ve yalnız katalog/hesap limitlerini okur. Sağlayıcı anahtarları, özel müşteri verileri veya worker sırrı yanıtlanmaz.

Dağıtım, zamanlayıcı aktivasyonu ve son kontrollerin sonuçları PR #33 kapanış kaydına eklenecek. Scraperlar yalnız doğrulanmış özgün Actor limitleri varsa çalışır; eksik limitlere ortak varsayım atanmaz.

Geri dönüş: önce sellf-bhs-sequential-worker zamanlayıcısını durdur, BHS aktivasyon bayraklarını kapat; sonra başlangıç Vercel sürümünü ve iki gateway'in Git baseline kaynaklarını özgün JWT ayarlarıyla geri yükle. Yeni queue/receipt/maliyet kayıtlarını silme ve bütçeleri sıfırlama. Ortak eklentileri kaldırma. Vault doğrulama fonksiyonunun izinleri yalnız servis rolünde kalır.
