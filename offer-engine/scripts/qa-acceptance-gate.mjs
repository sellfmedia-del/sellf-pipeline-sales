export const sequentialQaCases=Object.freeze(['claude_probe','humm','muratbey','muratbey_france','teksan_b2b','sutas','duru','tadim','tadim_release','tadim_final']);
export function sequentialQaRequested(env=process.env){
 return env.VERCEL_ENV==='preview'&&env.VERCEL_PROJECT_ID==='prj_B6Q6FIgq9NjbBlb6ga03cn6PD3jJ'&&/^[a-f0-9]{40}$/.test(env.OFFER_BHS_QA_COMMIT||'')&&env.OFFER_BHS_QA_COMMIT===env.VERCEL_GIT_COMMIT_SHA&&sequentialQaCases.includes(env.OFFER_BHS_QA_CASE);
}
