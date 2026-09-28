import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decisionMakers } from '../api/travis-run.js';

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
      assert.deepEqual(details, [{ id: '66fbbe08e86bf4000138d8ca' }, { id: '66fbbcf0e86bf40001387ef9' }]);
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
