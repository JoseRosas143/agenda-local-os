// Run from repository root: node --test tests/step6/validation.test.mjs
// Exercises the actual pure TypeScript module. No network, credentials or DB writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = await readFile(new URL('../../src/features/auth/validation.ts', import.meta.url), 'utf8');
const { outputText, diagnostics = [] } = ts.transpileModule(source, {
  fileName: 'validation.ts', reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, strict: true },
});
assert.equal(diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
const { readSingleText, validEmail, validateCredentials, validConfirmation, parseAppOrigin, publicAuthError } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
function form(values = {}) {
  const f = new FormData();
  Object.entries(values).forEach(([name, value]) => f.append(name, value));
  return f;
}
const credentials = { email: 'jose@example.invalid', password: 'Long test passphrase 42', confirmPassword: 'Long test passphrase 42' };

test('single text: accepts one string', () => assert.equal(readSingleText(form({x:'a'}), 'x'), 'a'));
test('single text: rejects absent value', () => assert.equal(readSingleText(form(), 'x'), null));
test('single text: rejects duplicate fields', () => {
  const f = form({x:'a'}); f.append('x','b'); assert.equal(readSingleText(f, 'x'), null);
});
test('single text: rejects a file', () => assert.equal(readSingleText(form({x:new Blob(['a'])}), 'x'), null));
test('email: accepts an ordinary address', () => assert.equal(validEmail(credentials.email), true));
test('email: rejects malformed and control character inputs', () => {
  for (const input of ['', 'no-at', 'a@@b.test', 'a@b', 'a b@c.test', 'a\n@b.test', '\u0000a@b.test', null, 123]) {
    assert.equal(validEmail(input), false);
  }
});
test('email: rejects overlong addresses', () => assert.equal(validEmail('a'.repeat(250)+'@x.test'), false));
test('registration: accepts matching long passwords', () => {
  assert.deepEqual(validateCredentials(form(credentials), 'register'), {ok:true,email:credentials.email,password:credentials.password});
});
test('credentials: normalizes email but not password', () => {
  const f = form({email:' JOSE@EXAMPLE.INVALID ', password:' pass phrase 42 ', confirmPassword:' pass phrase 42 '});
  const result = validateCredentials(f, 'register');
  assert.equal(result.ok, true); assert.equal(result.email, 'jose@example.invalid'); assert.equal(result.password,' pass phrase 42 ');
});
test('registration: rejects short passwords', () => {
  const result = validateCredentials(form({...credentials,password:'short',confirmPassword:'short'}), 'register');
  assert.equal(result.ok,false); assert.ok(result.fieldErrors.password);
});
test('registration: rejects overlong passwords', () => {
  const result = validateCredentials(form({...credentials,password:'x'.repeat(129)}), 'register');
  assert.equal(result.ok,false); assert.ok(result.fieldErrors.password);
});
test('registration: rejects confirmation mismatch', () => {
  const result = validateCredentials(form({...credentials,confirmPassword:'different password'}), 'register');
  assert.equal(result.ok,false); assert.ok(result.fieldErrors.confirmPassword);
});
test('login: permits existing shorter passwords', () => assert.equal(validateCredentials(form({email:credentials.email,password:'12345678'}), 'login').ok,true));
test('login: rejects missing password', () => assert.equal(validateCredentials(form({email:credentials.email}), 'login').ok,false));
test('login: rejects empty password', () => assert.equal(validateCredentials(form({email:credentials.email,password:''}), 'login').ok,false));
test('credentials: duplicate email rejected', () => {
  const f=form(credentials); f.append('email','other@example.invalid'); assert.equal(validateCredentials(f,'register').ok,false);
});
test('credentials: duplicate password rejected', () => {
  const f=form(credentials); f.append('password','other password'); assert.equal(validateCredentials(f,'register').ok,false);
});
test('error result contains no supplied password', () => {
  const r=validateCredentials(form({...credentials,email:'bad'}),'register');
  assert.equal(r.ok,false); assert.equal(JSON.stringify(r).includes(credentials.password),false);
});
test('confirmation: accepts email token syntax only', () => assert.equal(validConfirmation('a'.repeat(64),'email'),true));
test('confirmation: rejects alternative OTP types', () => {
  for (const type of ['invite','recovery','signup','email_change',null,['email']]) assert.equal(validConfirmation('a'.repeat(64),type),false);
});
test('confirmation: rejects invalid token shapes and sizes', () => {
  for (const token of [null,undefined,['a'.repeat(64)],'<script>alert(1)</script>','a'.repeat(15),'a'.repeat(513),'a b']) {
    assert.equal(validConfirmation(token,'email'),false);
  }
});
test('origin: accepts loopback HTTP and normalizes slash', () => assert.equal(parseAppOrigin('http://localhost:3000/'),'http://localhost:3000'));
test('origin: accepts HTTPS', () => assert.equal(parseAppOrigin('https://example.invalid'),'https://example.invalid'));
test('origin: accepts numeric loopback and IPv6 loopback', () => {
  assert.equal(parseAppOrigin('http://127.0.0.1:3000'),'http://127.0.0.1:3000');
  assert.equal(parseAppOrigin('http://[::1]:3000'),'http://[::1]:3000');
});
test('origin: rejects non-local insecure HTTP', () => assert.throws(()=>parseAppOrigin('http://example.invalid')));
test('origin: rejects credentials path query and fragment', () => {
  for (const input of ['https://user:pass@example.invalid','https://example.invalid/path','https://example.invalid/?x=1','https://example.invalid/#hash']) assert.throws(()=>parseAppOrigin(input));
});
test('origin: rejects missing invalid and non-HTTP inputs', () => {
  for (const input of [undefined,'','not-a-url','javascript:alert(1)','file:///etc/passwd']) assert.throws(()=>parseAppOrigin(input));
});
test('public errors never echo arbitrary provider messages', () => {
  const secret = 'DO_NOT_RETURN_THIS_TOKEN_OR_PASSWORD';
  const result = publicAuthError({message:secret,code:'unexpected',status:500});
  assert.equal(result.includes(secret),false); assert.equal(result,publicAuthError(null));
});
test('public errors distinguish throttling without reflecting raw text', () => {
  assert.notEqual(publicAuthError({status:429}),publicAuthError(null));
  assert.equal(publicAuthError({code:'over_request_rate_limit'}),publicAuthError({status:429}));
});
test('public errors map expected provider codes', () => {
  for (const code of ['invalid_credentials','email_not_confirmed','weak_password','email_address_not_authorized']) {
    assert.notEqual(publicAuthError({code}),publicAuthError(null));
  }
});
