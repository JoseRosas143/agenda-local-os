import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = await readFile(new URL('../../src/features/organizations/validation.ts', import.meta.url), 'utf8');
const { outputText, diagnostics = [] } = ts.transpileModule(source, {
  fileName: 'validation.ts', reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, strict: true },
});
assert.equal(diagnostics.filter((item) => item.category === ts.DiagnosticCategory.Error).length, 0);
const { suggestSlug, validateOrganization } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

function form(values = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({
    name: 'Clínica Sonrisa', slug: 'clinica-sonrisa', industry: 'dental',
    timezone: 'America/Mexico_City', currency: 'MXN', ...values,
  })) result.append(key, value);
  return result;
}

test('suggests a stable lowercase identifier for Spanish names', () => {
  assert.equal(suggestSlug('  Clínica   Niño & Familia  '), 'clinica-nino-familia');
});

test('accepts all supported business types and passes only validated values', () => {
  for (const industry of ['general', 'dental', 'medical']) {
    const result = validateOrganization(form({ industry }));
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, {
      name: 'Clínica Sonrisa', slug: 'clinica-sonrisa', industry,
      timezone: 'America/Mexico_City', currency: 'MXN',
    });
  }
});

test('rejects duplicate fields and file values', () => {
  const duplicate = form(); duplicate.append('slug', 'second-slug');
  assert.equal(validateOrganization(duplicate).ok, false);
  const file = form(); file.delete('name'); file.append('name', new Blob(['x']));
  assert.equal(validateOrganization(file).ok, false);
});

test('rejects invalid identifiers, unsupported choices and overlong names', () => {
  for (const slug of ['a', 'Uppercase', 'bad--slug', '-starts', 'space here', 'a'.repeat(64)]) {
    assert.equal(validateOrganization(form({ slug })).ok, false);
  }
  assert.equal(validateOrganization(form({ name: 'a'.repeat(161) })).ok, false);
  assert.equal(validateOrganization(form({ industry: 'owner' })).ok, false);
  assert.equal(validateOrganization(form({ timezone: 'Mars/Olympus' })).ok, false);
  assert.equal(validateOrganization(form({ currency: 'ARS' })).ok, false);
});

test('does not return unbounded input in field errors', () => {
  const result = validateOrganization(form({ name: 'x'.repeat(10000) }));
  assert.equal(result.ok, false);
  assert.equal(result.values.name.length, 160);
});
