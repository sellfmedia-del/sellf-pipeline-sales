import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTRResearch } from '../api/travis-tr.js';

const iso = () => new Date().toUTCString();
function harness(sourceRows = []) {
  const writes = [], patches = [];
  const dependency = {
    sb: async (path, _jwt, options = {}) => {
      if (path.startsWith('travis_run_sources?select')) return sourceRows;
      if (path.startsWith('travis_columns?')) return [{ id: 'travis-new' }];
      if (options.method === 'POST') { writes.push({ path, body: options.body }); return []; }
      if (options.method === 'PATCH') { patches.push(options.body); return []; }
      return [];
    },
    claude: async () => ({ candidates: [] }),
    pageText: async () => 'Published: ' + new Date().toISOString().slice(0, 10) + ' Şirket yeni markasını tanıttı.',
    feedback: async () => ({ manual: [], own: [], interactions: [], lessons: [] }),
    learnFromOutcomes: async () => {}, actor: async () => [], linkedInSignals: async () => [],
    tavily: async () => [], officialDomain: async () => null,
    decisionMakers: async () => [], validateEmail: async () => 'unknown',
    sourceSupports: () => true, domainOK: () => false, goodTitle: () => true
  };
  return { dependency, writes, patches };
}

test('RSS round keeps dated entries and checkpoints despite failed feeds', async () => {
  const { dependency, writes, patches } = harness();
  const original = globalThis.fetch;
  globalThis.fetch = async url => url.includes('dunya.com') ? {
    ok: true, headers: { get: () => 'application/rss+xml' },
    text: async () => `<rss><channel><item><title>Yeni marka</title><link>https://example.com/lansman</link><pubDate>${iso()}</pubDate><description>Şirketin yeni markası</description></item><item><title>Eski</title><link>https://example.com/eski</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item></channel></rss>`
  } : { ok: false, status: 404 };
  try {
    const engine = createTRResearch(dependency);
    const result = await engine.step({ id: 'run1', strategy: { phase: 3, space_id: 'travis-main' } }, 'jwt', {});
    assert.equal(result.phase, 4);
    assert.equal(result.found, 1);
    assert.equal(writes[0].body[0].url, 'https://example.com/lansman');
    assert.equal(patches.at(-1).strategy.errors.length, 9);
  } finally { globalThis.fetch = original; }
});

test('ordinary intent without two verified contacts is not saved', async () => {
  const sourceRows = [{ url: 'https://example.com/lansman', title: 'Lansman',
    content: 'Şirket yeni markasını tanıttı.', published_date: new Date().toISOString().slice(0, 10), source_type: 'rss' }];
  const { dependency, writes, patches } = harness(sourceRows);
  const engine = createTRResearch(dependency);
  const result = await engine.step({ id: 'run2', strategy: { phase: 6, space_id: 'travis-main', cursor: 0,
    candidates: [{ company: 'Örnek Gıda', country: 'TR', domain: null, signal_summary: 'Yeni marka',
      hypothesis: 'Yeni satış kanalı gerekebilir', fit_reason: 'Marka lansmanı', timing_reason: 'Lansman bu ay',
      evidence: [{ url: 'https://example.com/lansman', fact: 'Yeni marka tanıtıldı' }] }] } }, 'jwt', {});
  assert.equal(result.completed, true);
  assert.equal(writes.some(x => x.path === 'travis_leads'), false);
  assert.equal(result.skipped_contacts, 1);
  assert.equal(patches.at(-1).status, 'completed');
});

test('ordinary intent with two verified decision makers is saved', async () => {
  const source = { url: 'https://example.com/lansman', title: 'Lansman', content: 'Yeni ürün duyuruldu.' };
  const { dependency, writes } = harness([source]);
  dependency.officialDomain = async () => 'example.com';
  dependency.decisionMakers = async () => [
    { name: 'Ayşe Yılmaz', role: 'CMO', email: 'ayse@example.com', verification: 'apollo_verified_zerobounce_valid' },
    { name: 'Ali Kaya', role: 'CEO', email: 'ali@example.com', verification: 'apollo_verified_zerobounce_valid' }
  ];
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ results: [] }), { status: 200 });
  try {
    const result = await createTRResearch(dependency).step({ id: 'run4', strategy: { phase: 6, space_id: 'travis-main',
      candidates: [{ company: 'Örnek Gıda', signal_summary: 'Ürün duyurusu', confidence: 'medium',
        evidence: [{ url: source.url, fact: 'Yeni ürün duyuruldu' }] }] } }, 'jwt', {});
    assert.equal(result.added, 1);
    assert.equal(writes.find(x => x.path === 'travis_leads').body.contact_status, 'complete');
  } finally { globalThis.fetch = original; }
});

test('official-site names are checked before email enrichment', async () => {
  const { dependency } = harness();
  dependency.officialDomain = async () => 'example.com';
  dependency.pageText = async url => url.endsWith('/yonetim') ?
    'Örnek Gıda yönetim kadrosu ve güncel görev dağılımı: Ayşe Yılmaz, Pazarlama Direktörü. Cem Kaya, Genel Müdür. Şirketin yönetim kadrosu Türkiye faaliyetlerini ve ticari büyüme programını yürütüyor.' : '';
  dependency.claude = async () => ({ people: [
    { name: 'Ayşe Yılmaz', role: 'Pazarlama Direktörü', role_quote: 'Pazarlama Direktörü', url: 'https://example.com/yonetim' },
    { name: 'Cem Kaya', role: 'Genel Müdür', role_quote: 'Genel Müdür', url: 'https://example.com/yonetim' },
    { name: 'Uydurma Kişi', role: 'CEO', role_quote: 'CEO', url: 'https://example.com/yonetim' }
  ] });
  let received = [];
  dependency.decisionMakers = async (_candidate, _usage, _profiles, named) => { received = named; return []; };
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ results: [] }), { status: 200 });
  try {
    await createTRResearch(dependency).step({ id: 'run6', strategy: { phase: 6, space_id: 'travis-main',
      candidates: [{ company: 'Örnek Gıda', confidence: 'medium', evidence: [] }] } }, 'jwt', {});
    assert.deepEqual(received.map(x => x.name), ['Ayşe Yılmaz', 'Cem Kaya']);
  } finally { globalThis.fetch = original; }
});

test('very strong dated event accepts validated general contact when named contacts are missing', async () => {
  const source = { url: 'https://example.com/lansman', title: 'Lansman', content: 'Yeni marka lansmanı.' };
  const { dependency, writes } = harness([source]);
  dependency.officialDomain = async () => 'example.com';
  dependency.pageText = async () => 'Şirket iletişim: info@example.com';
  dependency.validateEmail = async () => 'valid';
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ results: [] }) });
  try {
    const result = await createTRResearch(dependency).step({ id: 'run5', strategy: { phase: 6, space_id: 'travis-main',
      candidates: [{ company: 'Örnek Gıda', signal_summary: 'Yeni marka', confidence: 'high',
        observation_type: 'dated_event', evidence: [{ url: source.url, fact: 'Yeni marka lansmanı' }] }] } }, 'jwt', {});
    assert.equal(result.added, 1);
    const lead = writes.find(x => x.path === 'travis_leads').body;
    assert.equal(lead.contact_status, 'incomplete');
    assert.equal(lead.contacts[0].email, 'info@example.com');
  } finally { globalThis.fetch = original; }
});

test('recent executive appointment reaches review without a stated agency brief', async () => {
  const source = { url: 'https://example.com/atama', title: 'Yeni genel müdür',
    content: 'Örnek Gıda yeni genel müdür atadı, şirket büyümeye odaklanacak.',
    published_date: new Date().toISOString().slice(0, 10), source_type: 'rss' };
  const { dependency, patches } = harness([source]);
  dependency.claude = async () => ({ candidates: [{ company: 'Örnek Gıda', country: 'TR',
    observation_type: 'dated_event', signal_summary: 'Yeni genel müdür atandı',
    hypothesis: 'Yeni yöneticinin büyüme programı olabilir', fit_reason: 'Büyüme danışmanlığı',
    timing_reason: 'Atama bu ay', evidence: [{ url: source.url, fact: 'Yeni genel müdür atadı' }] }] });
  const engine = createTRResearch(dependency);
  const result = await engine.step({ id: 'run3', strategy: { phase: 5, space_id: 'travis-main' } }, 'jwt', {});
  assert.equal(result.candidates, 1);
  assert.equal(patches.at(-1).strategy.candidates[0].company, 'Örnek Gıda');
});
