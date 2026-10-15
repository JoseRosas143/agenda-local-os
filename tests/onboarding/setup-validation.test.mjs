import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = await readFile(new URL('../../src/features/organizations/onboarding-validation.ts', import.meta.url), 'utf8');
const { outputText, diagnostics = [] } = ts.transpileModule(source, {
  fileName: 'onboarding-validation.ts', reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, strict: true },
});
assert.equal(diagnostics.filter((item) => item.category === ts.DiagnosticCategory.Error).length, 0);
const { isOnboardingStep, validateOnboardingValue } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

function form(value) {
  const result = new FormData();
  if (value !== undefined) result.append('value', value);
  return result;
}

test('accepts only wizard steps 3 through 9', () => {
  for (const step of [3, 4, 5, 6, 7, 8, 9]) assert.equal(isOnboardingStep(step), true);
  for (const step of [-1, 0, 2, 10, 3.5, NaN]) assert.equal(isOnboardingStep(step), false);
});

test('normalizes bounded city and ideal customer text', () => {
  assert.deepEqual(validateOnboardingValue(3, form('  Puebla  ')), { ok: true, value: 'Puebla' });
  assert.deepEqual(validateOnboardingValue(6, form('  Familias locales  ')), { ok: true, value: 'Familias locales' });
  for (const [step, value] of [[3, ''], [3, 'a'.repeat(121)], [6, ''], [6, 'a'.repeat(501)]]) {
    assert.equal(validateOnboardingValue(step, form(value)).ok, false);
  }
});

test('service and price steps accept no user-supplied text', () => {
  assert.deepEqual(validateOnboardingValue(4, form()), { ok: true, value: null });
  assert.deepEqual(validateOnboardingValue(5, form()), { ok: true, value: null });
  assert.equal(validateOnboardingValue(4, form('bypass')).ok, false);
  assert.equal(validateOnboardingValue(5, form('100')).ok, false);
});

test('WhatsApp is optional but invalid numbers are rejected', () => {
  assert.deepEqual(validateOnboardingValue(7, form('')), { ok: true, value: null });
  assert.deepEqual(validateOnboardingValue(7, form(' +52 222 123 4567 ')), {
    ok: true, value: '+52 222 123 4567',
  });
  for (const value of ['------()', '123456', '+52 abc 1234', '1'.repeat(33)]) {
    assert.equal(validateOnboardingValue(7, form(value)).ok, false);
  }
});

test('tone and goal accept only supported choices', () => {
  for (const tone of ['cercano', 'profesional', 'directo', 'empatico']) {
    assert.deepEqual(validateOnboardingValue(8, form(tone)), { ok: true, value: tone });
  }
  for (const goal of ['agendar_mas_citas', 'captar_clientes', 'mejorar_seguimiento', 'organizar_operacion']) {
    assert.deepEqual(validateOnboardingValue(9, form(goal)), { ok: true, value: goal });
  }
  assert.equal(validateOnboardingValue(8, form('owner')).ok, false);
  assert.equal(validateOnboardingValue(9, form('send_messages')).ok, false);
});

test('rejects duplicate and file input without echoing unbounded data', () => {
  const duplicate = form('Puebla'); duplicate.append('value', 'CDMX');
  assert.equal(validateOnboardingValue(3, duplicate).ok, false);
  const file = form(); file.append('value', new Blob(['Puebla']));
  assert.equal(validateOnboardingValue(3, file).ok, false);
  const long = validateOnboardingValue(3, form('x'.repeat(10000)));
  assert.equal(long.ok, false);
  assert.ok(long.value.length <= 500);
});
