import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = await readFile(new URL('../../src/features/crm/validation.ts', import.meta.url), 'utf8');
const { outputText, diagnostics = [] } = ts.transpileModule(source, {
  fileName: 'validation.ts', reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, strict: true },
});
assert.equal(diagnostics.filter((item) => item.category === ts.DiagnosticCategory.Error).length, 0);
const { validateContact, validateService } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

function contact(fields = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    displayName: ' Juan Pérez ', email: ' JUAN@EXAMPLE.COM ', phone: '+52 55 1234 5678',
    source: 'referral', ...fields,
  })) data.append(key, value);
  return data;
}

function service(fields = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    code: ' Consulta-Inicial ', name: 'Consulta inicial', description: 'Primera visita',
    price: '250.00', durationMinutes: '60', active: 'on', ...fields,
  })) data.append(key, value);
  return data;
}

test('normalizes valid contact and service without extra fields', () => {
  const c = validateContact(contact());
  assert.equal(c.ok, true);
  assert.deepEqual(c.value, {
    displayName: 'Juan Pérez', email: 'juan@example.com', phone: '+52 55 1234 5678',
    source: 'referral', archived: false,
  });
  const s = validateService(service());
  assert.equal(s.ok, true);
  assert.deepEqual(s.value, {
    code: 'consulta-inicial', name: 'Consulta inicial', description: 'Primera visita',
    price: '250.00', durationMinutes: '60', active: true,
  });
});

test('rejects duplicate and file values, including optional fields', () => {
  const c = contact(); c.append('email', 'another@example.com');
  assert.equal(validateContact(c).ok, false);
  const c2 = contact(); c2.delete('source'); c2.append('source', new Blob(['x']));
  assert.equal(validateContact(c2).ok, false);
  const s = service(); s.append('description', 'duplicate');
  assert.equal(validateService(s).ok, false);
  const s2 = service(); s2.delete('durationMinutes'); s2.append('durationMinutes', new Blob(['x']));
  assert.equal(validateService(s2).ok, false);
});

test('rejects malformed contact details and unsupported source', () => {
  assert.equal(validateContact(contact({ email: 'bad@' })).ok, false);
  assert.equal(validateContact(contact({ phone: 'abc' })).ok, false);
  assert.equal(validateContact(contact({ source: 'unknown' })).ok, false);
  assert.equal(validateContact(contact({ displayName: 'x'.repeat(161) })).ok, false);
});

test('rejects invalid prices, identifiers and durations', () => {
  for (const price of ['-1', '1.234', '1e6', '01', '9999999999999.00']) {
    assert.equal(validateService(service({ price })).ok, false);
  }
  assert.equal(validateService(service({ code: 'bad--code' })).ok, false);
  assert.equal(validateService(service({ durationMinutes: '1441' })).ok, false);
  assert.equal(validateService(service({ name: 'x'.repeat(161) })).ok, false);
});

test('bounds invalid values returned to forms', () => {
  const c = validateContact(contact({ displayName: 'x'.repeat(10000) }));
  assert.equal(c.ok, false);
  assert.equal(c.values.displayName.length, 160);
  const s = validateService(service({ description: 'x'.repeat(10000) }));
  assert.equal(s.ok, false);
  assert.equal(s.values.description.length, 1000);
});
