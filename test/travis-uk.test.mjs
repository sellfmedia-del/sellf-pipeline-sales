import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUKResearch, retryGemini } from '../api/travis-uk.js';

const today = () => new Date().toISOString().slice(0, 10);
test('Gemini overload retries once and retains a successful search result', async () => {
  let attempts = 0, waits = 0;
  const result = await retryGemini(async () => {
    if (++attempts === 1) throw new Error('Gemini Google Search 503: high demand');
    return { refs: [{ url: 'https://example.co.uk/news' }] };
  }, async () => { waits++; });
  assert.equal(attempts, 2);
  assert.equal(waits, 1);
  assert.equal(result.refs[0].url, 'https://example.co.uk/news');
});

test('persistent Gemini overload stops after bounded retry', async () => {
  let attempts = 0;
  await assert.rejects(retryGemini(async () => { attempts++; throw new Error('Gemini 503'); }, async () => {}), /503/);
  assert.equal(attempts, 2);
});
function harness(rows = []) {
  const writes = [], patches = [];
  const d = {
    sb: async (path, _jwt, options = {}) => {
      if (path.startsWith('travis_run_sources?select')) return rows;
      if (path.startsWith('travis_columns?')) return [{ id: 'new-intent' }];
      if (options.method === 'POST') { writes.push({ path, body: options.body }); return []; }
      if (options.method === 'PATCH') { patches.push(options.body); return []; }
      return [];
    },
    claude: async () => ({ candidates: [] }), pageText: async () => '',
    feedback: async () => ({ manual: [], own: [], lessons: [] }), learnFromOutcomes: async () => {},
    linkedInSignals: async () => [], tavily: async () => [], officialDomain: async () => 'harbour.co.uk',
    decisionMakers: async () => [], validateEmail: async () => 'unknown',
    sourceSupports: (fact, src) => src.content.includes(fact),
    domainOK: domain => /\.[a-z]{2,}$/i.test(domain), goodTitle: () => true
  };
  const run = (phase, extras = {}) => ({ id: 'run-uk', strategy: { phase, space_id: 'travis-space', ...extras } });
  return { d, run, writes, patches };
}

test('UK LinkedIn phase searches posts and never invokes Google Places', async () => {
  const { d, run, writes } = harness();
  d.linkedInSignals = async (_usage, country) => {
    assert.equal(country, 'UK');
    return [{ kind: 'linkedin_post', url: 'https://www.linkedin.com/posts/harbour-launch',
      title: 'Harbour', content: 'Harbour launching in UK', published_date: today() },
    { kind: 'linkedin_job', url: 'https://www.linkedin.com/jobs/1', title: 'Vacancy', content: 'Job', published_date: today() }];
  };
  d.actor = () => { throw Error('Paid Places actor must not run'); };
  const result = await createUKResearch(d).step(run(2), 'jwt', {});
  assert.equal(result.phase, 3);
  assert.deepEqual(writes[0].body.map(x => x.source_type), ['linkedin_post']);
});

test('UK review requires a source-backed UK activity and a recent commercial event', async () => {
  const source = { url: 'https://example.com/harbour-launch', title: 'Harbour expands UK retail',
    content: 'Harbour expands UK retail with a new product range and wholesale network.',
    published_date: today(), source_type: 'rss' };
  const { d, run, patches } = harness([source]);
  const candidate = { company: 'Harbour', domain: 'harbour.co.uk', country: 'UK',
    observation_type: 'dated_event', signal_summary: 'New range', hypothesis: 'New trade demand',
    fit_reason: 'B2B Marketing', timing_reason: 'Launch now', counterargument: 'Existing team',
    uk_activity: { url: source.url, fact: 'Harbour expands UK retail' },
    evidence: [{ url: source.url, fact: 'Harbour expands UK retail with a new product range' }] };
  d.claude = async (_system, _payload, maxTokens, _usage, schema) => {
    assert.equal(maxTokens, 5000);
    assert.equal(schema.properties.candidates.items.properties.country.enum[0], 'UK');
    return { candidates: [candidate, { ...candidate, company: 'American Inc',
    uk_activity: { url: source.url, fact: 'American Inc has a UK office' } },
  { ...candidate, company: 'Old Harbour', uk_activity: { url: source.url, fact: 'Old Harbour expands UK retail' },
    evidence: [{ url: source.url, fact: 'Old Harbour launched yesterday' }] }] };
  };
  const result = await createUKResearch(d).step(run(5), 'jwt', {});
  assert.equal(result.candidates, 1);
  assert.equal(patches.at(-1).strategy.candidates[0].company, 'Harbour');
});

test('UK run rejects an event outside the 30-day window', async () => {
  const oldDate = new Date(Date.now() - 32 * 86400000).toISOString().slice(0, 10);
  const source = { url: 'https://harbour.co.uk/news', title: 'Harbour UK launches',
    content: 'Harbour UK launches a new retail range.', published_date: oldDate, source_type: 'rss' };
  const { d, run } = harness([source]);
  d.claude = async () => ({ candidates: [{ company: 'Harbour', domain: 'harbour.co.uk', country: 'UK',
    uk_activity: { url: source.url, fact: 'Harbour UK launches' }, observation_type: 'dated_event',
    signal_summary: 'New range', hypothesis: 'New demand', fit_reason: 'E-Commerce Growth',
    timing_reason: 'Launch', counterargument: 'Existing agency',
    evidence: [{ url: source.url, fact: 'Harbour UK launches a new retail range' }] }] });
  const result = await createUKResearch(d).step(run(5), 'jwt', {});
  assert.equal(result.candidates, 0);
});

test('UK lead enters Travis board only with two named work-email contacts', async () => {
  const source = { url: 'https://harbour.co.uk/news', title: 'Harbour UK',
    content: 'Harbour expands UK retail with a new range.', published_date: today(), source_type: 'rss' };
  const { d, run, writes } = harness([source]);
  const candidate = { company: 'Harbour', country: 'UK', domain: 'harbour.co.uk',
    confidence: 'medium', observation_type: 'dated_event', signal_summary: 'New range',
    hypothesis: 'Needs a sales system', fit_reason: 'B2B Marketing', timing_reason: 'Launch now',
    evidence: [{ url: source.url, fact: 'Harbour expands UK retail' }] };
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ results: [] }), { status: 200 });
  try {
    const first = await createUKResearch(d).step(run(6, { candidates: [candidate] }), 'jwt', {});
    assert.equal(first.skipped_contacts, 1);
    assert.equal(writes.some(x => x.path === 'travis_leads'), false);
    d.decisionMakers = async (_candidate, _usage, _profiles, named) => {
      assert.ok(Array.isArray(named));
      return [
        { name: 'Ada Green', role: 'CMO', email: 'ada@harbour.co.uk', verification: 'apollo_verified' },
        { name: 'Ben Stone', role: 'Managing Director', email: 'ben@harbour.co.uk', verification: 'apollo_verified' }
      ];
    };
    const second = await createUKResearch(d).step(run(6, { candidates: [candidate] }), 'jwt', {});
    assert.equal(second.total_added, 1);
    const lead = writes.find(x => x.path === 'travis_leads').body;
    assert.equal(lead.country, 'UK');
    assert.equal(lead.review_status, 'pending');
    assert.equal(lead.contact_status, 'complete');
  } finally { globalThis.fetch = original; }
});

test('UK card saves each evidence URL once when an article supports several facts', async () => {
  const source = { url: 'https://harbour.co.uk/news', title: 'Harbour UK',
    content: 'Harbour expands UK retail.', published_date: today(), source_type: 'rss' };
  const { d, run, writes } = harness([source]);
  d.decisionMakers = async () => [
    { name: 'Ada Green', role: 'CMO', email: 'ada@harbour.co.uk', verification: 'apollo_verified' },
    { name: 'Ben Stone', role: 'Managing Director', email: 'ben@harbour.co.uk', verification: 'apollo_verified' }
  ];
  const candidate = { company: 'Harbour', country: 'UK', domain: 'harbour.co.uk',
    confidence: 'medium', observation_type: 'dated_event', signal_summary: 'Expansion',
    hypothesis: 'Needs a sales system', fit_reason: 'B2B Marketing', timing_reason: 'Launch now',
    evidence: [
      { url: source.url, fact: 'Harbour expands UK retail' },
      { url: source.url, fact: 'Harbour opens a new store' }
    ] };
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ results: [] }), { status: 200 });
  try {
    const result = await createUKResearch(d).step(run(6, { candidates: [candidate] }), 'jwt', {});
    assert.equal(result.completed, true);
    assert.equal(result.total_added, 1);
    const evidence = writes.filter(x => x.path === 'travis_evidence');
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].body.url, source.url);
  } finally { globalThis.fetch = original; }
});
