import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decisionMakers, officialDomain } from '../api/travis-run.js';

test('company lookup prefers canonical global domain over same-name foreign subsidiary', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ accounts: [
    { name: 'Cargill', domain: 'cargill.com.br' }, { name: 'Cargill', domain: 'cargill.com' }
  ] }), { status: 200 });
  try { assert.equal(await officialDomain('Cargill', {}), 'cargill.com'); }
  finally { globalThis.fetch = original; }
});

test('contact search follows the selected country', async () => {
  const original = globalThis.fetch;
  const locations = [];
  globalThis.fetch = async (_url, options) => {
    locations.push(JSON.parse(options.body).person_locations);
    return new Response(JSON.stringify({ people: [] }), { status: 200 });
  };
  try {
    await decisionMakers({ domain: 'example.com', country: 'UK' }, {});
    assert.deepEqual(locations, [ ['United Kingdom'], ['United Kingdom'], ['United Kingdom'] ]);
  } finally { globalThis.fetch = original; }
});

test('Turkey search enriches masked Apollo people and accepts verified work email without a second validator', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push(String(url));
    if (String(url).includes('mixed_people/api_search')) {
      const query = JSON.parse(options.body);
      assert.deepEqual(query.person_locations, ['Turkey']);
      return new Response(JSON.stringify({ people: [
        { id: '66fbbe08e86bf4000138d8ca', first_name: 'Cenk', last_name_obfuscated: 'Er***n', title: 'Sales and Marketing Director', has_email: true },
        { id: '66fbbcf0e86bf40001387ef9', first_name: 'Cem', last_name_obfuscated: 'Be***l', title: 'Senior Director, Growth & Strategy', has_email: true }
      ] }), { status: 200 });
    }
    if (String(url).includes('people/bulk_match')) {
      const details = JSON.parse(options.body).details;
      assert.deepEqual(details.map(x => x.id), ['66fbbe08e86bf4000138d8ca', '66fbbcf0e86bf40001387ef9']);
      return new Response(JSON.stringify({ matches: [
        { id: details[0].id, name: 'Cenk Erkan', title: 'Sales and Marketing Director', organization: { primary_domain: 'cargill.com' }, linkedin_url: 'http://www.linkedin.com/in/cenk-erkan' },
        { id: details[1].id, name: 'Cem Beysel', title: 'Senior Director, Growth & Strategy', organization: { primary_domain: 'cargill.com' } }
      ], waterfall: { status: 'accepted' }, request_id: '-123' }), { status: 200 });
    }
    if (String(url).includes('webhook_result')) return new Response(JSON.stringify({ webhook_result: {
      status: 'success', credits_consumed: 4, people: [
        { id: '66fbbe08e86bf4000138d8ca', emails: [{ email: 'cenk_erkan@cargill.com', email_status_cd: 'Verified' }] },
        { id: '66fbbcf0e86bf40001387ef9', emails: [{ email: 'cem_beysel@cargill.com', email_status_cd: 'Verified' }] }
      ] } }), { status: 200 });
    throw new Error('Unexpected provider call: ' + url);
  };
  try {
    const usage = {}, profiles = [];
    const contacts = await decisionMakers({ domain: 'cargill.com' }, usage, profiles);
    assert.deepEqual(contacts.map(x => x.email), ['cenk_erkan@cargill.com', 'cem_beysel@cargill.com']);
    assert.equal(usage.apollo_credits_consumed, 4);
    assert.equal(profiles[0].source_url, 'https://www.linkedin.com/in/cenk-erkan');
    assert.equal(calls.some(x => x.includes('zerobounce.net')), false);
  } finally { globalThis.fetch = original; }
});

test('ZeroBounce Finder supplies a missing Apollo email without validating Apollo results again', async () => {
  const original = globalThis.fetch;
  const oldKey = process.env.ZEROBOUNCE_API_KEY;
  process.env.ZEROBOUNCE_API_KEY = 'test';
  let finderCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes('mixed_people/api_search')) return new Response(JSON.stringify({ people: [
      { id: '54a3aebd7468693676044c0a', first_name: 'Osman', last_name_obfuscated: 'De***l', title: 'Sales Director' }
    ] }), { status: 200 });
    if (String(url).includes('people/bulk_match')) return new Response(JSON.stringify({ matches: [
      { id: '54a3aebd7468693676044c0a', name: 'Osman Demirel', title: 'Sales Director', organization: { primary_domain: 'emerson.com' } }
    ], waterfall: { status: 'failed' } }), { status: 200 });
    if (String(url).includes('people/match')) return new Response(JSON.stringify({ person: null }), { status: 200 });
    if (String(url).includes('guessformat')) {
      finderCalls++;
      return new Response(JSON.stringify({ email: 'osman.demirel@emerson.com', email_confidence: 'HIGH' }), { status: 200 });
    }
    throw new Error('Unexpected provider call: ' + url);
  };
  try {
    const contacts = await decisionMakers({ domain: 'emerson.com' }, {});
    assert.equal(finderCalls, 1);
    assert.equal(contacts[0].email, 'osman.demirel@emerson.com');
    assert.equal(contacts[0].verification, 'zerobounce_finder_high_confidence');
  } finally {
    globalThis.fetch = original;
    if (oldKey === undefined) delete process.env.ZEROBOUNCE_API_KEY;
    else process.env.ZEROBOUNCE_API_KEY = oldKey;
  }
});

test('source-backed name reaches ZeroBounce when Apollo finds no person', async () => {
  const original = globalThis.fetch;
  const oldKey = process.env.ZEROBOUNCE_API_KEY;
  process.env.ZEROBOUNCE_API_KEY = 'test';
  let finderCalls = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('mixed_people/api_search')) return new Response(JSON.stringify({ people: [] }), { status: 200 });
    if (String(url).includes('people/bulk_match')) return new Response(JSON.stringify({ matches: [], waterfall: { status: 'failed' } }), { status: 200 });
    if (String(url).includes('people/match')) return new Response(JSON.stringify({ person: null }), { status: 200 });
    if (String(url).includes('guessformat')) {
      finderCalls++;
      const body = new URLSearchParams(options.body);
      assert.equal(body.get('first_name'), 'Ayşe');
      assert.equal(body.get('last_name'), 'Yılmaz');
      return new Response(JSON.stringify({ email: 'ayse.yilmaz@example.com', email_confidence: 'HIGH' }), { status: 200 });
    }
    throw new Error('Unexpected provider call: ' + url);
  };
  try {
    const contacts = await decisionMakers({ company: 'Example', domain: 'example.com' }, {}, [], [
      { name: 'Ayşe Yılmaz', role: 'Pazarlama Direktörü', source_url: 'https://example.com/yonetim' }
    ]);
    assert.equal(finderCalls, 1);
    assert.deepEqual(contacts, [{ name: 'Ayşe Yılmaz', role: 'Pazarlama Direktörü',
      email: 'ayse.yilmaz@example.com', verification: 'zerobounce_finder_high_confidence',
      source_url: 'https://example.com/yonetim' }]);
  } finally {
    globalThis.fetch = original;
    if (oldKey === undefined) delete process.env.ZEROBOUNCE_API_KEY;
    else process.env.ZEROBOUNCE_API_KEY = oldKey;
  }
});

test('native Apollo enrichment recovers verified emails when waterfall is unavailable', async () => {
  const original = globalThis.fetch;
  const ids = ['one', 'two'];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('mixed_people/api_search')) return new Response(JSON.stringify({ people: ids.map(id =>
      ({ id, title: 'Marketing Director' })) }), { status: 200 });
    if (String(url).includes('people/bulk_match')) return new Response(JSON.stringify({ matches: ids.map(id =>
      ({ id, name: `Director ${id}`, title: 'Marketing Director', organization: { primary_domain: 'example.com' } })) ,
      waterfall: { status: 'skipped' } }), { status: 200 });
    if (String(url).includes('people/match')) {
      const id = JSON.parse(options.body).id;
      return new Response(JSON.stringify({ person: { id, name: `Director ${id}`,
        title: 'Marketing Director', email: `${id}@example.com`, email_status: 'verified',
        organization: { primary_domain: 'example.com' } } }), { status: 200 });
    }
    throw new Error('Unexpected provider call: ' + url);
  };
  try {
    const usage = {};
    const contacts = await decisionMakers({ domain: 'example.com' }, usage);
    assert.deepEqual(contacts.map(c => c.email), ['one@example.com', 'two@example.com']);
    assert.equal(usage.apollo_verified_emails, 2);
  } finally { globalThis.fetch = original; }
});

test('partially accepted Apollo waterfall is polled and includes LinkedIn identity', async () => {
  const original = globalThis.fetch;
  let polled = false;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('mixed_people/api_search')) return new Response(JSON.stringify({ people: [
      { id: 'one', title: 'Marketing Director', linkedin_url: 'https://www.linkedin.com/in/person-one' }
    ] }), { status: 200 });
    if (String(url).includes('people/bulk_match')) {
      const details = JSON.parse(options.body).details;
      assert.equal(details[0].linkedin_url, 'https://www.linkedin.com/in/person-one');
      return new Response(JSON.stringify({ matches: [ { id: 'one', name: 'Person One', title: 'Marketing Director',
        organization: { primary_domain: 'example.com' } } ], waterfall: { status: 'partial_accepted' },
        request_id: '-123' }), { status: 200 });
    }
    if (String(url).includes('webhook_result')) {
      polled = true;
      return new Response(JSON.stringify({ webhook_result: { status: 'success', people: [
        { id: 'one', emails: [{ email: 'person.one@example.com', email_status_cd: 'Verified' }] }
      ] } }), { status: 200 });
    }
    if (String(url).includes('people/match')) return new Response(JSON.stringify({ person: null }), { status: 200 });
    throw new Error('Unexpected provider call: ' + url);
  };
  try {
    const contacts = await decisionMakers({ domain: 'example.com' }, {});
    assert.equal(polled, true);
    assert.equal(contacts[0].email, 'person.one@example.com');
  } finally { globalThis.fetch = original; }
});

test('source-backed names lead Apollo enrichment even when people search is empty', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('mixed_people/api_search')) return new Response(JSON.stringify({ people: [] }), { status: 200 });
    if (String(url).includes('people/bulk_match')) {
      const details = JSON.parse(options.body).details;
      assert.deepEqual(details.map(x => `${x.first_name} ${x.last_name}`), ['Ayşe Yılmaz', 'Cem Kaya']);
      assert.equal(details[0].domain, 'example.com');
      return new Response(JSON.stringify({ matches: details.map((d, i) => ({ id: String(i), name: `${d.first_name} ${d.last_name}`,
        title: i ? 'General Manager' : 'Marketing Director', organization: { primary_domain: 'example.com' } })),
        waterfall: { status: 'accepted' }, request_id: '-123' }), { status: 200 });
    }
    if (String(url).includes('webhook_result')) return new Response(JSON.stringify({ webhook_result: {
      status: 'success', people: [
        { id: '0', emails: [{ email: 'ayse.yilmaz@example.com', email_status_cd: 'Verified' }] },
        { id: '1', emails: [{ email: 'cem.kaya@example.com', email_status_cd: 'Verified' }] }
      ] } }), { status: 200 });
    throw new Error('Unexpected provider call: ' + url);
  };
  try {
    const contacts = await decisionMakers({ company: 'Örnek Gıda', domain: 'example.com' }, {}, [], [
      { name: 'Ayşe Yılmaz', role: 'Pazarlama Direktörü', source_url: 'https://example.com/yonetim' },
      { name: 'Cem Kaya', role: 'Genel Müdür', source_url: 'https://example.com/yonetim' }
    ]);
    assert.deepEqual(contacts.map(x => x.email), ['ayse.yilmaz@example.com', 'cem.kaya@example.com']);
  } finally { globalThis.fetch = original; }
});
