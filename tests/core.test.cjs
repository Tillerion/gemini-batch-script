const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'gemini_music_batch.user.js'), 'utf8');
const coreSource = source.split('// RANDOM_CORE_BEGIN')[1].split('// RANDOM_CORE_END')[0].replace(/^[^\n]*\n/, '');
const box = { crypto: require('node:crypto').webcrypto, Uint32Array };
vm.runInNewContext(coreSource + '; globalThis.core = { defaultRandom, normalizeRandom, validateRandom, variedPrompt, normalizedDelaySeconds };', box);
const core = box.core;
for (const [input, expected] of [
  [{ delay: 5 }, 300], [{ delay: .25 }, 15], [{ delay: 120 }, 7200],
  [{ delaySeconds: 3, delay: 5 }, 3], [{ delaySeconds: 0, delay: 5 }, 0],
  [{ delaySeconds: 9000 }, 60], [{}, 60]
]) assert.equal(core.normalizedDelaySeconds(input), expected);
const migrated = { delay: 5 }; migrated.delaySeconds = core.normalizedDelaySeconds(migrated); delete migrated.delay;
assert.equal(core.normalizedDelaySeconds(migrated), 300, 'Migration must be idempotent');
let total = 0;
for (const mode of ['music', 'image']) {
  const base = mode === 'music' ? 'Japanese Artcore, 180 BPM. Piano and violin.\nOriginal melody.' : '白色背景，蓝色立方体，居中，正面视角，无文字。';
  const off = core.defaultRandom(mode);
  assert.equal(core.variedPrompt(base, off, {}).text, base);
  for (const strength of [1, 2]) {
    const config = { ...core.defaultRandom(mode), enabled: true, strength };
    const state = {}; let previous = null;
    for (let i = 0; i < 300; i++) {
      const result = core.variedPrompt(base, config, state);
      assert.ok(result.text.startsWith(base), 'Original prompt must remain intact');
      assert.ok(result.tweaks.length <= strength, 'Variation count exceeded strength');
      assert.equal(new Set(result.tweaks).size, result.tweaks.length);
      assert.notEqual(result.text, previous, 'Adjacent rounds must vary');
      assert.ok(['add', 'remove', 'replace'].includes(result.operation));
      if (previous !== null && result.text !== base) assert.ok(result.text.includes('若有冲突，优先遵循上方要求'));
      previous = result.text; total++;
    }
  }
}
assert.throws(() => core.validateRandom({ enabled: true, strength: 1, pool: '重复\n重复' }));
assert.throws(() => core.validateRandom({ enabled: true, strength: 1, pool: 'x'.repeat(501) + '\nvalid' }));
assert.equal(core.normalizeRandom({ enabled: true, strength: 999, pool: 'a\nb' }, 'music').strength, 1);
console.log(JSON.stringify({ secondsMigration: 'PASS', randomRounds: total, originalPreserved: 'PASS', strengthLimits: 'PASS', adjacentVariation: 'PASS', invalidPools: 'PASS' }));
