import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { handleRatecard } from '../api/ratecard.js';

const origin = 'https://offerletter.sellfmedia.com';
const password = 'ratecard-test-fixture';
const operations = [
  { tr: 'Örnek Operasyon', en: 'Sample Service', rates: [12345, 23456, 34567] },
  { tr: 'Koşullu Operasyon', en: 'Scoped Service', rates: [null, { percent: 9 }, null] },
];
const settings = { password, rawPrices: JSON.stringify(operations) };
const request = (path, init) => new Request(origin + path, init);
const submit = (path, fields, site = origin) => request(path, {
  method: 'POST', headers: { Origin: site }, body: new URLSearchParams(fields),
});

test('both Ratecard links keep prices behind the server-side password, including the direct function route', async () => {
  for (const [path, language, title] of [
    ['/ratecard', 'tr', 'Operasyon fiyatları'],
    ['/en/ratecard', 'en', 'Operations pricing'],
    ['/api/ratecard?lang=en', 'en', 'Operations pricing'],
  ]) {
    const response = await handleRatecard(request(path), settings);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const html = await response.text();
    assert.ok(html.includes(`<html lang="${language}">`));
    assert.ok(html.includes(title));
    assert.match(html, /type="password"/);
    assert.doesNotMatch(html, /<table>|<data value=|Sample Service|Örnek Operasyon/);
  }
  const wrong = await handleRatecard(submit('/ratecard', { password: 'wrong' }), settings);
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get('set-cookie'), null);
  assert.doesNotMatch(await wrong.text(), /<data value=/);
  assert.equal((await handleRatecard(submit('/ratecard', { password }, 'https://example.org'), settings)).status, 403);
  const unavailable = await handleRatecard(request('/ratecard'), { ...settings, password: '' });
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(await unavailable.text(), /<data value=/);
});

test('a Ratecard session opens the complete table in both languages and can be closed', async () => {
  const login = await handleRatecard(submit('/api/ratecard?lang=en', { password }), settings);
  assert.equal(login.status, 303);
  assert.equal(login.headers.get('location'), '/en/ratecard');
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /^__Host-sellf-ratecard=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=1800$/);
  const session = cookie.split(';')[0];
  for (const [path, name, amount] of [['/ratecard', 'Örnek Operasyon', '12.345'], ['/en/ratecard', 'Sample Service', '12,345']]) {
    const open = await handleRatecard(request(path, { headers: { Cookie: session } }), settings);
    const html = await open.text();
    assert.equal(open.headers.get('cache-control'), 'private, no-store');
    assert.equal(html.match(/<th scope="row">/g).length, operations.length);
    assert.ok(html.includes(name));
    assert.ok(html.includes(`<data value="12345">${amount}</data>`));
    assert.doesNotMatch(html, /<data value="0">/);
  }
  const tampered = `${session.slice(0, -1)}${session.endsWith('x') ? 'y' : 'x'}`;
  const locked = await handleRatecard(request('/ratecard', { headers: { Cookie: tampered } }), settings);
  assert.doesNotMatch(await locked.text(), /<table>/);
  const rotated = await handleRatecard(request('/ratecard', { headers: { Cookie: session } }), { ...settings, password: 'new password' });
  assert.doesNotMatch(await rotated.text(), /<table>/);
  const logout = await handleRatecard(submit('/ratecard', { action: 'lock' }), settings);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0$/);
  assert.equal(logout.headers.get('location'), '/ratecard');
  const invalid = await handleRatecard(request('/ratecard', { headers: { Cookie: session } }), { ...settings, rawPrices: '[{}]' });
  assert.equal(invalid.status, 503);
  assert.doesNotMatch(await invalid.text(), /<table>/);
});

test('Offerletter routes send both Ratecard pages to the standalone function', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  for (const [language, base] of [['tr', '/'], ['en', '/en/']]) {
    assert.deepEqual(config.rewrites.find(route => route.source === `${base}ratecard`), {
      source: `${base}ratecard`, destination: `/api/ratecard?lang=${language}`,
    });
    for (const filename of ['index', 'contact', 'search', '404']) {
      const html = await readFile(new URL(`../site${base}${filename}.html`, import.meta.url), 'utf8');
      assert.ok(html.includes(`<a href="${base}ratecard">Ratecard</a>`));
    }
  }
});
