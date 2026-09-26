// Server-only provider adapters. No provider token is returned to the browser or stored in Supabase.
const recent = value => {
  const date = new Date(value).getTime();
  return Number.isFinite(date) && date <= Date.now() + 86400000 && date >= Date.now() - 21 * 86400000;
};
const clean = (value, limit = 700) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
const safeLink = value => { try { const u = new URL(value); return u.protocol === 'https:' && u.hostname.endsWith('linkedin.com') ? u.href : ''; } catch { return ''; } };
const JOB_TERMS = ['genel müdür yardımcısı','iş geliştirme direktörü','pazarlama direktörü','e-ticaret direktörü','CMO Turkey brand'];
const POST_TERMS = ['sosyal medya ajansı arıyoruz','sosyal medya ajansı arayışımız','kreatif ajans arıyoruz','grafik tasarım ajansı arıyoruz','performans pazarlama ajansı arıyoruz','reklam ajansı arıyoruz','google reklamları ajansı','meta reklam ajansı arıyoruz','seo ajansı arıyoruz','yazılım ajansı arıyoruz','ajans arıyoruz','ajans arayışımız','partner arıyoruz','partner arayışımız','ajans önerisi','ajans tavsiyesi'];
async function actor(name, input, usage) {
  const res = await fetch(`https://api.apify.com/v2/acts/${name}/run-sync-get-dataset-items`, {
    method: 'POST', signal: AbortSignal.timeout(95000),
    headers: { Authorization: `Bearer ${process.env.APIFY_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!res.ok) throw new Error(`Apify ${name}: ${res.status}`);
  const items = await res.json();
  if (!Array.isArray(items)) throw new Error(`Apify ${name}: beklenmeyen yanıt`);
  usage.apify_actor_runs = (usage.apify_actor_runs || 0) + 1;
  return items;
}
export async function linkedInSignals(usage) {
  const jobsInput = { count: 50, scrapeCompany: true, splitByLocation: false,
    urls: JOB_TERMS.map(term => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(term)}&location=Turkey&f_TPR=r1209600`) };
  const postsInput = { maxPosts: 20, postNestedComments: false, postNestedReactions: false,
    scrapeComments: false, scrapeReactions: false, searchQueries: POST_TERMS.map(x => `"${x}"`) };
  const results = await Promise.allSettled([
    actor('curious_coder~linkedin-jobs-scraper', jobsInput, usage),
    actor('harvestapi~linkedin-post-search', postsInput, usage)
  ]);
  const [jobs, posts] = results.map(r => r.status === 'fulfilled' ? r.value : []);
  usage.linkedin_errors = results.filter(r => r.status === 'rejected').map(r => clean(r.reason?.message, 120));
  const items = [
    ...jobs.filter(j => recent(j.postedAt)).map(j => ({ title: clean(`${j.title} - ${j.companyName}`, 160), url: safeLink(j.link),
      content: clean(`${j.descriptionText || ''} | İlanı yayınlayan: ${j.jobPosterName || ''} (${j.jobPosterTitle || ''})`),
      published_date: new Date(j.postedAt).toISOString().slice(0, 10), kind: 'linkedin_job' })),
    ...posts.filter(p => recent(p.postedAt?.date)).map(p => ({ title: clean(`${p.author?.name} - LinkedIn Post`, 160), url: safeLink(p.linkedinUrl),
      content: clean(`[${p.author?.info || ''}] ${p.content || ''}`),
      published_date: new Date(p.postedAt.date).toISOString().slice(0, 10), kind: 'linkedin_post' }))
  ];
  return [...new Map(items.filter(i => i.url && i.content).map(i => [i.url, i])).values()].slice(0, 60);
}
async function apollo(path, body, usage) {
  const response = await fetch(`https://api.apollo.io/api/v1/${path}`, {
    method: 'POST', signal: AbortSignal.timeout(18000),
    headers: { 'x-api-key': process.env.APOLLO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  usage.apollo_calls = (usage.apollo_calls || 0) + 1;
  if (!response.ok) throw new Error(`Apollo ${response.status}`);
  return response.json();
}
async function validateEmail(email, usage) {
  const params = new URLSearchParams({ api_key: process.env.ZEROBOUNCE_API_KEY, email, ip_address: '' });
  const res = await fetch('https://api.zerobounce.net/v2/validate', {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params
  });
  usage.zerobounce_calls = (usage.zerobounce_calls || 0) + 1;
  if (!res.ok) return false;
  return (await res.json()).status === 'valid';
}
const goodTitle = title => /chief|ceo|cmo|founder|owner|president|general manager|managing director|vice president|\bvp\b|director|head of|pazarlama|ticaret|müdür|kurucu|başkan|growth|marketing|ecommerce|e-commerce|business development|iş geliştirme/i.test(title || '');
const domainOK = domain => /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(domain || '') && !/\.\./.test(domain);
export async function decisionMakers(candidate, usage) {
  const domain = String(candidate.domain || '').toLowerCase().replace(/^www\./, '');
  if (!domainOK(domain)) return [];
  const search = await apollo('mixed_people/api_search', {
    q_organization_domains_list: [domain], person_seniorities: ['owner','founder','c_suite','vp','head','director'],
    person_titles: ['CEO','Founder','General Manager','CMO','Marketing Director','Head of Growth','E-commerce Director','Business Development Director'],
    per_page: 10, page: 1
  }, usage);
  const people = (search.people || []).filter(p => p.id && goodTitle(p.title)).slice(0, 6);
  const enriched = await Promise.allSettled(people.map(person =>
    apollo('people/match', { id: person.id, reveal_personal_emails: false, reveal_phone_number: false }, usage)));
  const candidates = enriched.filter(r => r.status === 'fulfilled').map(r => r.value.person).filter(Boolean);
  const seen = new Set(), ready = [];
  for (const p of candidates) {
    const name = clean(p.name || `${p.first_name || ''} ${p.last_name || ''}`, 100);
    const role = clean(p.title, 120), email = String(p.email || '').toLowerCase().trim();
    const employerDomain = String(p.organization?.primary_domain || '').toLowerCase().replace(/^www\./, '');
    if (!name.includes(' ') || !goodTitle(role) || employerDomain !== domain ||
        !email.endsWith(`@${domain}`) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        seen.has(email) || p.email_status !== 'verified') continue;
    seen.add(email);
    ready.push({ name, role, email, verification: 'apollo_verified_zerobounce_valid',
      source_url: safeLink(p.linkedin_url) || null });
  }
  const checked = await Promise.allSettled(ready.slice(0, 4).map(c => validateEmail(c.email, usage)));
  const contacts = ready.slice(0, 4).filter((_, i) => checked[i].status === 'fulfilled' && checked[i].value).slice(0, 2);
  return contacts;
}
