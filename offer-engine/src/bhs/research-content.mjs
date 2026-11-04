// Useful partial research needs a supported observation, not just headings,
// citations or meeting context. Run this only after the provenance gate.
export function hasGroundedResearch(report){
 const ids=new Set((report?.sources||[]).filter(s=>s.verification?.status==='quote_matched').map(s=>s.id));
 const supported=row=>Array.isArray(row?.sourceIds)&&row.sourceIds.length>0&&row.sourceIds.every(id=>ids.has(id));
 return ids.size>0&&((report.findings||[]).some(f=>f.kind!=='brief'&&f.statement?.trim()&&supported(f))||(report.researchCoverage||[]).some(a=>['observed','partial'].includes(a.status)&&a.observation?.trim()&&supported(a)));
}
export function requireGroundedResearch(report){
 if(!hasGroundedResearch(report))throw Object.assign(Error('Kaynakla doğrulanabilen araştırma içeriği oluşmadı. Boş yanıt BHS olarak kullanılmadı.'),{code:'research_empty',safeData:report});
 return report;
}
