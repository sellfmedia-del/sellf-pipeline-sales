import {dimensions} from './brief.mjs';
import {methodologyAreas} from './methodology-areas.mjs';

const dimensionIds=new Set(dimensions.map(row=>row.id));
const areas=new Map(methodologyAreas.map(row=>[row.key,row.dimension]));
export const classificationAreas=[...dimensionIds,...areas.keys()];
export const conditionScopes=['internal','external','mixed','unknown'];

// The model chooses the dimension from its analysis of the business impact.
// No keyword, country, source hostname or default operational assignment.
export function classifiedDimension(row){
 return areas.get(row.area)||(dimensionIds.has(row.area)?row.area:undefined);
}

export function classificationIssue(row){
 if(!classifiedDimension(row))return 'dimension_unassigned';
 if(!conditionScopes.includes(row.conditionScope))return 'condition_scope_unassigned';
 const required={strength:'internal',weakness:'internal',opportunity:'external',threat:'external'}[row.quadrant];
 if(required&&row.conditionScope!==required)return 'swot_scope_mismatch';
}

export function internalFinding(finding){
 if(['opportunity','threat'].includes(finding.swotQuadrant))return false;
 return !finding.conditionScope||finding.conditionScope==='internal';
}

const key=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('tr').replace(/\s+/gu,' ').trim();
// Legacy projections can already contain the right fact but list it as an
// internal strength/gap. Remove only that derived label, retaining the finding.
export function internalDimensionText(value,findings){
 const statement=key(value).replace(/^(?:doğrulanacak hipotez|görüşmede doğrulanacak hipotez|hypothesis):\s*/u,'');
 const matched=(findings||[]).filter(finding=>key(finding.statement)===statement);
 return !matched.length||matched.some(internalFinding);
}

export const classificationInstruction='Her bulgunun boyutunu briefteki hedefe etkisini analiz ederek sen seç. area alanına financial, operations, funnel, digital, perception, competition kodlarından birini veya bunlara ait verilen metodoloji alt alanını yaz; boş bırakma. Finansal sağlık, operasyonel verimlilik, satış hunisi, dijital varlıklar, marka algısı ve rekabetçi konum birbirinden farklıdır. Bir alt alan birebir uymasa da önemli doğrulanmış bulguyu en uygun gördüğün boyuta ve kendi section başlığına yerleştir. conditionScope iç koşul için internal, dış pazar/rekabet koşulu için external; gerçekten ayrıştırılmamış karma koşul için mixed, belirlenemeyen için unknown olsun. SWOT güçlü/zayıf yönleri mevcut markanın kaynaklı iç yetkinliği veya kısıtı; fırsat/tehditleri dış koşullar olarak değerlendir. Dış pazardaki eğitim ihtiyacı, talep göstergesi veya mevzuat markanın mevcut iç gücü değildir; olumlu olmak tek başına güçlü yön yapmaz. Bir şirket hakkındaki bağımsız kaynak iç koşulu doğrulayabilir; kaynak alan adına göre sınıflandırma yapma. mixed veya unknown koşulu kanıtsız bir SWOT koluna zorlama; gerekiyorsa olguyu ayrı bulgu olarak koru. Kanıt olmayan SWOT kolunu boş bırak; dört kolu veya bulgu sayısını doldurmak için çıkarım uydurma. section, area ve quadrant farklı amaç taşır; SWOT kolu boyutun yerine geçmez.';
