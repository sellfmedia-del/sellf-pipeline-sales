import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { renderRatecard } from '../ratecard/page.mjs';

const cookieName = '__Host-sellf-ratecard';
const sessionLifetime = 30 * 60;
const cookieOptions = 'Path=/; HttpOnly; Secure; SameSite=Strict';

function equalSecret(left, right) {
  const digest = value => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(left), digest(right));
}

function signExpiry(expiry, password) {
  return createHmac('sha256', password).update(`offerletter-ratecard:${expiry}`).digest('base64url');
}

function hasSession(request, password, now) {
  const session = request.headers.get('cookie')?.split(/;\s*/).find(cookie => cookie.startsWith(`${cookieName}=`));
  const match = session?.slice(cookieName.length + 1).match(/^(\d{10})\.([\w-]{43})$/);
  return Boolean(match && Number(match[1]) > now && equalSecret(match[2], signExpiry(match[1], password)));
}

function loadOperations(rawPrices) {
  try {
    const operations = JSON.parse(rawPrices);
    if (Array.isArray(operations) && operations.length > 0 && operations.every(operation =>
      ['tr', 'en'].every(language => typeof operation?.[language] === 'string' && operation[language].trim()) &&
      Array.isArray(operation.rates) && operation.rates.length === 3 && operation.rates.every(rate =>
        rate === null || (Number.isSafeInteger(rate) && rate > 0) ||
        (typeof rate?.percent === 'number' && rate.percent > 0 && rate.percent <= 100),
      ),
    )) return operations;
  } catch {
    return null;
  }
  return null;
}

export async function handleRatecard(request, {
  password = process.env.OFFERLETTER_RATECARD_PASSWORD,
  rawPrices = process.env.OFFERLETTER_RATECARD_PRICES,
} = {}) {
  const url = new URL(request.url);
  const language = url.pathname === '/en/ratecard' || url.searchParams.get('lang') === 'en' ? 'en' : 'tr';
  const pagePath = language === 'en' ? '/en/ratecard' : '/ratecard';
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'Content-Type': 'text/html; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  });
  const page = (status, options = {}) => new Response(
    request.method === 'HEAD' ? null : renderRatecard(language, options), { status, headers },
  );

  if (!['GET', 'HEAD', 'POST'].includes(request.method)) {
    headers.set('Allow', 'GET, HEAD, POST');
    return new Response(null, { status: 405, headers });
  }
  if (!password || !rawPrices) return page(503, { message: 'unavailable' });

  const now = Math.floor(Date.now() / 1000);
  if (request.method !== 'POST') {
    if (!hasSession(request, password, now)) return page(200);
    const operations = loadOperations(rawPrices);
    return operations ? page(200, { operations }) : page(503, { message: 'unavailable' });
  }

  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  // A native same-origin form can send Origin: null under no-referrer.
  const sameOriginForm = origin === 'null' && fetchSite === 'same-origin';
  if (fetchSite === 'cross-site' || (origin && origin !== url.origin && !sameOriginForm)) {
    return new Response(null, { status: 403, headers });
  }

  const contentType = request.headers.get('content-type')?.split(';')[0];
  if (contentType !== 'application/x-www-form-urlencoded' || Number(request.headers.get('content-length')) > 2048) {
    return page(400, { message: 'invalid' });
  }
  const body = await request.text();
  if (body.length > 2048) return page(400, { message: 'invalid' });
  const form = new URLSearchParams(body);

  if (form.get('action') === 'lock') {
    headers.set('Set-Cookie', `${cookieName}=; ${cookieOptions}; Max-Age=0`);
  } else {
    const submittedPassword = form.get('password');
    if (!submittedPassword || !equalSecret(submittedPassword, password)) return page(401, { message: 'wrong' });
    const expiry = now + sessionLifetime;
    const session = `${expiry}.${signExpiry(expiry, password)}`;
    headers.set('Set-Cookie', `${cookieName}=${session}; ${cookieOptions}; Max-Age=${sessionLifetime}`);
  }
  headers.set('Location', pagePath);
  return new Response(null, { status: 303, headers });
}

export default { fetch: request => handleRatecard(request) };
