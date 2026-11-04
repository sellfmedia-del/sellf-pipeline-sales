import test from 'node:test';
import assert from 'node:assert/strict';
import {supportedNumbers} from '../src/bhs/numeric-evidence.mjs';
import {groundOfferReport} from '../src/bhs/source-gate.mjs';
import {context} from './fixtures/evidence.mjs';
test('equivalent localised quantities, decimals, words and scaled amounts retain support',()=>{
 for(const [claim,source]of [['1.000 bayi','1000 dealers'],['25.771 ziyaret','25,771 visits'],['yüzde 10,3 değişim','10.3% change'],['5 ürün, 10 ürün','five products and ten products'],['beş ürün','5 products'],['14,3 bin takipçi','14.3K followers'],['250 bin dolar','250,000 dollars'],['1,000 kullanıcı','1,000 users'],['-10 düşüş','−10 decline']])assert.equal(supportedNumbers(claim,source),true,claim);
});
test('different values, signs, ranges, magnitude and substrings are still rejected',()=>{
 for(const [claim,source]of [['10 kullanıcı','1000 users in 2026'],['+10 büyüme','-10 percent decline'],['1–3 gün','2–4 days'],['6-12 gün','2-4 days'],['14,3 milyon takipçi','14.3K followers'],['5 yıldız','four stars'],['1,5 değer','15 value']])assert.equal(supportedNumbers(claim,source),false,claim);
});
test('articles and an English preposition are not Turkish measured quantities',()=>{
 assert.equal(supportedNumbers('Bir fırsat olabilir; analiz onay bekliyor.','The company has a dealer network.'),true);
 assert.equal(supportedNumbers('%10 indirim var.','Subscribe on our website for updates.'),false);
 assert.equal(supportedNumbers('6 ürün','SIX products are available.'),true);
 assert.equal(supportedNumbers('1.000 bayi','Gümüşsuyu has 1,000 dealers in the country.'),true);
 assert.equal(supportedNumbers('1000 değer','The company reports 1.000 percent.'),false);
});
test('one rejected finding cannot erase another verified finding or all its qualitative strengths',()=>{
 const c=context(),quote='The company has 1000 authorized dealers and a nationwide service network.';
 c.packet.sources[0].excerpts=[{offset:0,text:quote}];c.report.sources[0].quote=quote;
 c.report.findings[0].statement='Şirketin 1.000 yetkili bayisi bulunuyor.';
 c.report.findings.push({...c.report.findings[0],id:'wrong',statement:'Şirketin 999999 çalışanı var.'});
 c.report.dimensions[0].findingIds=['f0','wrong'];c.report.dimensions[0].strengths=['Bayi ağı','999999 çalışan'];
 const safe=groundOfferReport(c.report,c);
 assert.ok(safe.findings.some(f=>f.id==='f0'));assert.ok(!safe.findings.some(f=>f.id==='wrong'));
 assert.deepEqual(safe.dimensions[0].strengths,['Bayi ağı']);assert.equal(safe.dimensions[0].dataStatus,'partial');assert.equal(safe.dimensions[0].score,null);
 assert.ok(!safe.dimensions[0].rationale.includes('999999'));assert.ok(safe.dimensions[0].rationale.includes('1.000'));
});
test('normalising number words does not promote an announced future quantity to completed growth',()=>{
 const c=context(),quote='We entered the year with five products and we’ll be exiting with ten products.';
 c.packet.sources[0].excerpts=[{offset:0,text:quote}];c.report.sources[0].quote=quote;
 c.report.findings[0].statement="Marka ürün çeşidini 10'a çıkarmıştır.";
 const rejected=groundOfferReport(c.report,c);assert.ok(!rejected.findings.some(f=>f.id==='f0'));
 c.report.findings[0].statement='Marka ürün çeşidini 10 ürüne çıkarmayı planlıyor.';
 assert.ok(groundOfferReport(c.report,c).findings.some(f=>f.id==='f0'));
});
test('a cheaper percentage cannot be copied as the inverse more-expensive percentage',()=>{
 const c=context(),quote='On average, Jimmy Joy is about 74% cheaper than Huel.';
 c.packet.sources[0].excerpts=[{offset:0,text:quote}];c.report.sources[0].quote=quote;
 c.report.findings[0].statement="Huel, Jimmy Joy'a göre %74 daha yüksek fiyatlıdır.";
 assert.ok(!groundOfferReport(c.report,c).findings.some(f=>f.id==='f0'));
 c.report.findings[0].statement="Jimmy Joy, Huel'e göre %74 daha ucuzdur.";
 assert.ok(groundOfferReport(c.report,c).findings.some(f=>f.id==='f0'));
});
test('reported revenue cannot certify current budget capacity or unsupported sector health',()=>{
 const c=context(),quote='The company reported 170 million dollars revenue and 40% growth in 2022.';
 c.packet.sources[0].excerpts=[{offset:0,text:quote}];c.report.sources[0].quote=quote;
 c.report.findings[0].statement='Şirket 2022 yılında 170 milyon dolar ciro ve %40 büyüme bildirdi.';
 c.report.findings[0].impact='Markanın gelir sağlığı çok güçlü olup, bütçe ayırabilecek kapasitededir.';
 c.report.findings[0].goalConnection='Pazarlama yatırım gücüne işaret eder.';
 c.report.dimensions[0].strengths=['Yüksek büyüme (%40).','Kategorisi için sağlıklı seviyelerde.'];
 const safe=groundOfferReport(c.report,c),f=safe.findings.find(f=>f.id==='f0');assert.ok(f);assert.match(f.impact,/hipotezdir/);assert.match(f.goalConnection,/hipotezdir/);
 assert.deepEqual(safe.dimensions[0].strengths,['Yüksek büyüme (%40).']);
 assert.ok(safe.transfer.issues.some(i=>i.reason==='unmeasured_impact_qualified'));
 c.report.findings[0].statement='Şirket agresif bir büyüme trendi sergilemektedir.';
 const inference=groundOfferReport(c.report,c).findings.find(f=>f.id==='f0');assert.equal(inference.kind,'inference');assert.match(inference.statement,/doğrulanacak hipotez/);
 const repeated=groundOfferReport(groundOfferReport(c.report,c),c).findings.find(f=>f.id==='f0');assert.equal((repeated.statement.match(/Görüşmede doğrulanacak hipotez/g)||[]).length,1);
});
