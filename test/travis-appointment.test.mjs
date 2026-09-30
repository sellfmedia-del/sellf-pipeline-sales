import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appointmentEvidence, prioritizeAppointee } from '../api/travis-appointment.js';
import { decisionMakers } from '../api/travis-run.js';
import { createTRResearch } from '../api/travis-tr.js';
import { createUKResearch } from '../api/travis-uk.js';
import { createUSResearch } from '../api/travis-us.js';

test('appointment evidence and cited appointee receive priority in TR, UK and US only', () => {
  for (const country of ['TR', 'UK', 'US']) {
    const candidate = { country, observation_type: 'dated_event',
      signal_summary: 'Ada Green appointed CMO',
      evidence: [{ url: 'https://example.com/news', fact: 'Ada Green appointed CMO' }] };
    const evidence = appointmentEvidence(candidate);
    const people = prioritizeAppointee([
      { name: 'Ben Stone', role: 'Marketing Director', source_url: 'https://example.com/team' },
      { name: 'Ada Green', role: 'CMO', source_url: 'https://example.com/news' }
    ], evidence, candidate.signal_summary);
    assert.equal(people[0].name, 'Ada Green');
    assert.equal(people[0].appointment_target, true);
    assert.equal(people[1].appointment_target, undefined);
    assert.deepEqual(appointmentEvidence({ ...candidate, observation_type: 'current_technical_need' }), []);
    assert.deepEqual(appointmentEvidence({ ...candidate, signal_summary: 'New product launch', evidence: [] }), []);
    assert.deepEqual(appointmentEvidence({ ...candidate, signal_summary: 'New product announced by CEO',
      evidence: [{ url: 'https://example.com/product', fact: 'Example launches product' }] }), []);
    assert.equal(appointmentEvidence({ ...candidate, signal_summary: 'New CEO at Example',
      evidence: [{ url: 'https://example.com/news', fact: 'Ada Green joined Example' }] }).length, 1);
  }
});

test('all three engines discover the cited appointee first from the appointment article', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ results: [] }), { status: 200 });
  try {
    for (const create of [createTRResearch, createUKResearch, createUSResearch]) {
      const url = 'https://example.com/news';
      const candidate = { company: 'Example', observation_type: 'dated_event',
        signal_summary: 'Ada Green appointed CMO', evidence: [{ url, fact: 'Ada Green appointed CMO' }] };
      const engine = create({
        pageText: async pageUrl => pageUrl === url ?
          'Example appointed Ada Green as Chief Marketing Officer (CMO). Ben Stone is Marketing Director. This appointment starts a new commercial plan for Example.' : '',
        claude: async (_prompt, payload) => {
          assert.equal(payload.appointment[0].url, url);
          return { people: [
            { name: 'Ben Stone', role: 'Marketing Director', role_quote: 'Marketing Director', url },
            { name: 'Ada Green', role: 'CMO', role_quote: 'Chief Marketing Officer', url }
          ] };
        },
        goodTitle: () => true
      });
      const named = await engine.discoverDecisionMakers('Example', 'example.com', candidate.evidence, {}, candidate);
      assert.deepEqual(named.map(x => x.name), ['Ada Green', 'Ben Stone']);
      assert.equal(named[0].appointment_target, true);
    }
  } finally { globalThis.fetch = original; }
});

test('appointed person is attempted after two other contacts and occupies first slot when found', async () => {
  const original = globalThis.fetch;
  const oldKey = process.env.ZEROBOUNCE_API_KEY;
  process.env.ZEROBOUNCE_API_KEY = 'test';
  let finderCalls = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('mixed_people/api_search')) return new Response(JSON.stringify({ people: [] }), { status: 200 });
    if (String(url).includes('people/bulk_match')) {
      const details = JSON.parse(options.body).details;
      assert.equal(details[0].first_name, 'Ada');
      return new Response(JSON.stringify({ matches: [
        null,
        { id: 'ben', name: 'Ben Stone', title: 'Marketing Director', organization: { primary_domain: 'example.com' },
          email: 'ben@example.com', email_status: 'verified' },
        { id: 'cam', name: 'Cam Rivers', title: 'CEO', organization: { primary_domain: 'example.com' },
          email: 'cam@example.com', email_status: 'verified' }
      ], waterfall: { status: 'failed' } }), { status: 200 });
    }
    if (String(url).includes('people/match')) return new Response(JSON.stringify({ person: null }), { status: 200 });
    if (String(url).includes('guessformat')) {
      finderCalls++;
      assert.equal(new URLSearchParams(options.body).get('first_name'), 'Ada');
      return new Response(JSON.stringify({ email: 'ada.green@example.com', email_confidence: 'HIGH' }), { status: 200 });
    }
    throw new Error('Unexpected provider call: ' + url);
  };
  try {
    const contacts = await decisionMakers({ country: 'TR', company: 'Example', domain: 'example.com' }, {}, [], [
      { name: 'Ada Green', role: 'CMO', source_url: 'https://example.com/news', appointment_target: true },
      { name: 'Ben Stone', role: 'Marketing Director', source_url: 'https://example.com/team' },
      { name: 'Cam Rivers', role: 'CEO', source_url: 'https://example.com/team' }
    ]);
    assert.equal(finderCalls, 1);
    assert.deepEqual(contacts.map(x => x.name), ['Ada Green', 'Ben Stone']);
  } finally {
    globalThis.fetch = original;
    if (oldKey === undefined) delete process.env.ZEROBOUNCE_API_KEY;
    else process.env.ZEROBOUNCE_API_KEY = oldKey;
  }
});
