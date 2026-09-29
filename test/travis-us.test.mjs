import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUSResearch } from '../api/travis-us.js';

const today = () => new Date().toISOString().slice(0, 10);
const event = { url: 'https://trade.example/news/harbour', title: 'Harbour expands retail',
  content: 'Harbour expands its retail distribution with a new product line in the United States.',
  published_date: today(), source_type: 'rss' };
const candidate = (overrides = {}) => ({ company: 'Harbour', country: 'US', domain: 'harbour.com',
  us_origin: null, confidence: 'medium', observation_type: 'dated_event',
  signal_summary: 'New retail line', hypothesis: 'New channel demand',
  fit_reason: 'B2B and ecommerce growth', timing_reason: 'Launching now',
  evidence: [{ url: event.url, fact: 'Harbour expands its retail distribution' }], ...overrides });
function harness(rows = [event]) {
  const writes = [], patches = [];
  const d = {
    sb: async (path, _jwt, options = {}) => {
      if (path.startsWith('travis_run_sources?select')) return rows;
      if (path.startsWith('travis_columns?')) return [{ id: 'new-intent' }];
      if (options.method === 'POST') { writes.push({ path, body: options.body }); return []; }
      if (options.method === 'PATCH') { patches.push(options.body); return []; }
      return [];
    },
    claude: async () => ({}), pageText: async () => '',
    feedback: async () => ({ manual: [], own: [], interactions: [], lessons: [] }),
    learnFromOutcomes: async () => {}, linkedInSignals: async () => [], tavily: async () => [],
    officialDomain: async () => 'harbour.com', decisionMakers: async () => [],
    sourceSupports: (fact, source) => source.content.includes(fact),
    domainOK: domain => /\.[a-z]{2,}$/i.test(domain), goodTitle: () => true
  };
  const run = (phase, extras = {}) => ({ id: 'run-us', strategy: { phase, space_id: 'us-space', ...extras } });
  return { d, run, writes, patches };
}

test('US LinkedIn phase keeps announcements and does not start Google Places', async () => {
  const { d, run, writes } = harness();
  d.linkedInSignals = async (_usage, country) => {
    assert.equal(country, 'US');
    return [{ kind: 'linkedin_post', url: 'https://www.linkedin.com/posts/harbour-launch',
      title: 'Harbour', content: 'New product', published_date: today() },
    { kind: 'linkedin_job', url: 'https://www.linkedin.com/jobs/1', title: 'Job' }];
  };
  d.actor = () => { throw Error('Places should not be called'); };
  const result = await createUSResearch(d).step(run(2), 'jwt', {});
  assert.equal(result.phase, 3);
  assert.deepEqual(writes[0].body.map(x => x.source_type), ['linkedin_post']);
});

test('US outcome lessons stay in US run state and do not change shared TR/UK lessons', async () => {
  const { d, run, writes, patches } = harness();
  const own = [1, 2, 3].map(n => ({ id: `us-${n}`, country: 'US',
    review_status: 'rejected', review_reason: 'No buying trigger' }));
  d.feedback = async () => ({ manual: [], own: [...own, { id: 'uk-1', country: 'UK',
    review_status: 'rejected', review_reason: 'Irrelevant' }], interactions: [], lessons: [] });
  d.claude = async (_prompt, payload) => {
    assert.equal(payload.reviews.length, 3);
    assert.equal(payload.companies.length, 3);
    return { lessons: [{ lesson_key: 'no-trigger', subject: 'Timing', conclusion: 'Seek a dated change',
      supporting_lead_ids: own.map(x => x.id), confidence: 'tentative' }] };
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '' }] } }] }), { status: 200 });
  try {
    const result = await createUSResearch(d).step(run(0), 'jwt', {});
    assert.equal(result.phase, 1);
    assert.equal(patches.at(-1).strategy.us_lessons[0].lesson_key, 'us-no-trigger');
    assert.equal(writes.some(x => x.path.startsWith('travis_lessons')), false);
  } finally { globalThis.fetch = originalFetch; }
});

test('US review preserves a fresh American commercial event for a separate origin check', async () => {
  const { d, run, patches } = harness();
  d.claude = async (_prompt, _payload, _tokens, _usage, schema) => {
    assert.deepEqual(schema.properties.candidates.items.properties.country.enum, ['US']);
    return { candidates: [{ ...candidate({ us_origin: { url: '', fact: '' } }),
      counterargument: 'Could use an incumbent agency' }] };
  };
  const result = await createUSResearch(d).step(run(5), 'jwt', {});
  assert.equal(result.candidates, 1);
  assert.equal(patches.at(-1).strategy.candidates[0].us_origin, null);
});

test('US review rejects stale event despite an origin claim', async () => {
  const old = { ...event, published_date: new Date(Date.now() - 35 * 86400000).toISOString().slice(0, 10) };
  const { d, run } = harness([old]);
  d.claude = async () => ({ candidates: [{ ...candidate({
    us_origin: { url: old.url, fact: 'American brand Harbour is headquartered in California' },
    evidence: [{ url: old.url, fact: 'Harbour expands its retail distribution' }]
  }), counterargument: 'Incumbent agency' }] });
  const result = await createUSResearch(d).step(run(5), 'jwt', {});
  assert.equal(result.candidates, 0);
});

test('foreign-origin brand selling in the US never reaches people enrichment or a card', async () => {
  const { d, run, writes } = harness();
  d.pageText = async () => 'Harbour was founded in London and sells in America. A foreign brand with a product range, overseas retail partnerships, ecommerce operations, and a new US distribution program described here in detail.';
  d.claude = async prompt => {
    assert.match(prompt, /American origin/);
    return { american_origin: false, url: 'https://foreign.example/about', quote: 'founded in London' };
  };
  d.decisionMakers = async () => { throw Error('Apollo people search must not run'); };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ results: [] }), { status: 200 });
  try {
    const result = await createUSResearch(d).step(run(6, { candidates: [candidate()] }), 'jwt', {});
    assert.equal(result.completed, true);
    assert.equal(result.skipped_origin, 1);
    assert.equal(writes.some(x => x.path === 'travis_leads'), false);
  } finally { globalThis.fetch = originalFetch; }
});

test('wrong same-name domain fails before contacts even with an American-origin signal', async () => {
  const { d, run, writes } = harness();
  d.pageText = async () => 'Harbour sells unrelated industrial pumps across the United States. Harbour pump engineering and repairs for construction sites and factories, with replacement parts and maintenance services.';
  d.claude = async prompt => {
    assert.match(prompt, /SAME American-origin buyer brand/);
    return { same_brand: false, site_url: 'https://harbour.com/', site_quote: 'unrelated industrial pumps' };
  };
  d.decisionMakers = async () => { throw Error('Wrong company must not reach Apollo people search'); };
  const origin = { url: 'https://trade.example/about', fact: 'American brand Harbour is headquartered in California' };
  const result = await createUSResearch(d).step(run(6, { candidates: [candidate({ us_origin: origin })] }), 'jwt', {});
  assert.equal(result.skipped_origin, 1);
  assert.equal(writes.some(x => x.path === 'travis_leads'), false);
});

test('separate company background search proves American origin before Apollo contacts', async () => {
  const { d, run, writes } = harness();
  const originUrl = 'https://harbour.com/about';
  const originFact = 'Harbour is headquartered in California';
  d.pageText = async () => `Harbour is an American consumer brand. ${originFact}. Harbour makes retail goods and sells them through ecommerce and wholesale partners. The company was founded by its US team.`;
  d.claude = async prompt => prompt.includes('Find an explicit statement') ?
    { american_origin: true, url: originUrl, quote: originFact } :
    prompt.includes('SAME American-origin buyer brand') ?
      { same_brand: true, site_url: 'https://harbour.com/', site_quote: 'Harbour makes retail goods' } :
      { people: [] };
  d.decisionMakers = async (_candidate, _usage, _profiles, named) => {
    assert.ok(Array.isArray(named));
    return [
      { name: 'Ada Green', role: 'CMO', email: 'ada.green@harbour.com', verification: 'apollo_verified' },
      { name: 'Ben Stone', role: 'Managing Director', email: 'ben.stone@harbour.com', verification: 'apollo_verified' }
    ];
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ results: [] }), { status: 200 });
  try {
    const result = await createUSResearch(d).step(run(6, { candidates: [candidate()] }), 'jwt', {});
    assert.equal(result.total_added, 1);
    assert.ok(writes.filter(x => x.path === 'travis_evidence').some(x => x.body.url === originUrl));
  } finally { globalThis.fetch = originalFetch; }
});

test('US card requires two relevant contacts whose work emails match their identities', async () => {
  const { d, run, writes } = harness();
  d.pageText = async () => 'Harbour is an American consumer brand headquartered in California. Harbour makes new retail goods for consumers and distributes its products through ecommerce, stores, and wholesale partners.';
  d.claude = async prompt => prompt.includes('SAME American-origin buyer brand') ?
    { same_brand: true, site_url: 'https://harbour.com/', site_quote: 'Harbour makes new retail goods' } : { people: [] };
  d.decisionMakers = async () => [
    { name: 'Tom Sedek', role: 'Marketing Director', email: 's.thomas@harbour.com', verification: 'apollo_verified' },
    { name: 'Ada Green', role: 'CMO', email: 'ada.green@harbour.com', verification: 'apollo_verified' },
    { name: 'Hannah Stone', role: 'People Director', email: 'hannah.stone@harbour.com', verification: 'apollo_verified' }
  ];
  const origin = { url: 'https://trade.example/about', fact: 'American brand Harbour is headquartered in California' };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ results: [] }), { status: 200 });
  try {
    const first = await createUSResearch(d).step(run(6, { candidates: [candidate({ us_origin: origin })] }), 'jwt', {});
    assert.equal(first.skipped_contacts, 1);
    assert.equal(writes.some(x => x.path === 'travis_leads'), false);

    d.decisionMakers = async () => [
      { name: 'Ada Green', role: 'CMO', email: 'ada.green@harbour.com', verification: 'apollo_verified' },
      { name: 'Ben Stone', role: 'Managing Director', email: 'ben.stone@harbour.com', verification: 'apollo_verified' }
    ];
    const second = await createUSResearch(d).step(run(6, { candidates: [candidate({ us_origin: origin })] }), 'jwt', {});
    assert.equal(second.total_added, 1);
    const lead = writes.find(x => x.path === 'travis_leads').body;
    assert.equal(lead.country, 'US');
    assert.equal(lead.contacts.length, 2);
    assert.equal(lead.contact_status, 'complete');
  } finally { globalThis.fetch = originalFetch; }
});
