// Read-only smoke tests against the RUNNING local Next.js server.
// No login, registration, email requests, credentials or cookies are sent.
// Run: node --test tests/step6/guest-http.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
const raw = process.env.STEP6_TEST_ORIGIN ?? 'http://localhost:3000';
const origin = new URL(raw);
if (origin.origin !== raw || !['localhost','127.0.0.1','[::1]'].includes(origin.hostname)) {
  throw new Error('STEP6_TEST_ORIGIN must be a loopback origin with no path, for example http://localhost:3000');
}
async function request(path, options = {}) {
  return fetch(new URL(path, origin), {redirect:'manual', cache:'no-store', signal:AbortSignal.timeout(30_000), ...options});
}
function noStore(response) { assert.match(response.headers.get('cache-control') ?? '', /no-store/i); }
test('guest login page responds with real form', async () => {
  const res = await request('/login'); assert.equal(res.status,200); noStore(res);
  const html=await res.text(); assert.match(html, /name="email"/); assert.match(html, /name="password"/);
});
test('guest register page includes password confirmation', async () => {
  const res = await request('/register'); assert.equal(res.status,200); noStore(res);
  assert.match(await res.text(), /name="confirmPassword"/);
});
test('guest cannot open account', async () => {
  const res=await request('/account'); assert.equal(res.status,307); noStore(res);
  const destination=new URL(res.headers.get('location'), origin);
  assert.equal(destination.origin,origin.origin); assert.equal(destination.pathname,'/login');
});
test('guest API receives 401, not a login HTML document', async () => {
  const res=await request('/api/auth/me'); assert.equal(res.status,401); noStore(res);
  assert.deepEqual(await res.json(),{ok:false,error:'UNAUTHENTICATED'});
});
test('incomplete confirmation is safe HTML and no-store', async () => {
  const res=await request('/auth/confirm'); assert.equal(res.status,200); noStore(res);
  assert.match(await res.text(), /Enlace incompleto/);
});
test('invalid OTP type is refused before exchange', async () => {
  const res=await request('/auth/confirm?token_hash=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&type=recovery');
  assert.equal(res.status,200); assert.match(await res.text(), /Enlace incompleto/);
});
test('untrusted next parameter does not create an external redirect', async () => {
  const res=await request('/account?next=https%3A%2F%2Fattacker.example.invalid');
  assert.equal(res.status,307);
  const destination=new URL(res.headers.get('location'),origin);
  assert.equal(destination.origin,origin.origin); assert.equal(destination.pathname,'/login'); assert.equal(destination.search,'');
});
