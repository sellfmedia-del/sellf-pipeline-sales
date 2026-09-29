import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startStagedRun } from '../api/travis-run.js';

const now = Date.parse('2026-09-29T11:00:00Z');
const previous = (country, ageMinutes, space = 'board-1') => ({
  id: 'old-run', started_at: new Date(now - ageMinutes * 60000).toISOString(),
  strategy: { target_country: country, space_id: space, phase: 6 }
});

function database(existing) {
  const calls = [];
  const query = async (path, _jwt, options = {}) => {
    calls.push({ path, ...options });
    if (path.startsWith('travis_runs?select=')) return existing ? [existing] : [];
    if (options.method === 'POST') return [{ id: 'new-run', strategy: options.body.strategy }];
    return [];
  };
  return { query, calls };
}

test('an expired TR run is closed before starting UK', async () => {
  const { query, calls } = database(previous('TR', 90));
  const result = await startStagedRun(query, 'jwt', 'user-1', 'board-1', 'UK', now);
  assert.equal(result.run.id, 'new-run');
  assert.deepEqual(calls.map(call => call.method || 'GET'), ['GET', 'PATCH', 'POST']);
  assert.equal(calls[1].body.status, 'failed');
  assert.equal(calls[2].body.strategy.target_country, 'UK');
});

test('an active different-country run still blocks a new run', async () => {
  const { query, calls } = database(previous('TR', 10));
  const result = await startStagedRun(query, 'jwt', 'user-1', 'board-1', 'UK', now);
  assert.equal(result.conflict, true);
  assert.deepEqual(calls.map(call => call.method || 'GET'), ['GET']);
});

test('an active matching run resumes without creating another', async () => {
  const { query, calls } = database(previous('UK', 10));
  const result = await startStagedRun(query, 'jwt', 'user-1', 'board-1', 'UK', now);
  assert.equal(result.run.id, 'old-run');
  assert.deepEqual(calls.map(call => call.method || 'GET'), ['GET']);
});
