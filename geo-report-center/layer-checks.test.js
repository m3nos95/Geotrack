'use strict';
const assert = require('assert');
const Layers = require('./layer-checks.js');

const tests = [];
function check(name, fn) { tests.push({ name, fn }); }

function memory() {
  const box = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(box, k) ? box[k] : null; },
    setItem: function (k, v) { box[k] = String(v); }
  };
}

check('layer keys merge paged refs and keep special file names', () => {
  assert.strictEqual(Layers.layerKey('soils.geojson'), 'soils');
  assert.strictEqual(Layers.layerKey('soils_2.geojson'), 'soils');
  assert.strictEqual(Layers.layerKey('soils-3.json'), 'soils');
  assert.strictEqual(Layers.layerKey('dgir_wells.json'), 'dgir_wells');
  assert.strictEqual(Layers.layerKey('nrcs_de_by_mukey.json'), 'nrcs_de_by_mukey');
});

check('a missing value is unset, and an empty list is a real all-off choice', () => {
  assert.strictEqual(Layers.parseStored(null), null);
  assert.strictEqual(Layers.parseStored(''), null);
  assert.strictEqual(Layers.parseStored('nope'), null);
  assert.deepStrictEqual(Layers.parseStored('[]'), []);
  assert.deepStrictEqual(Layers.parseStored('["soils_2.geojson","flood","soils"]'), ['flood', 'soils']);
});

check('drive reload loads only the checked layer files', () => {
  const catalog = [
    { id: 's1', name: 'soils.geojson', size: 2000000000 },
    { id: 's2', name: 'soils_2.geojson', size: 2000000000 },
    { id: 'f', name: 'flood.geojson', size: 900000000 },
    { id: 'w', name: 'dgir_wells.json', size: 4000 }
  ];
  assert.deepStrictEqual(Layers.filesToLoad(catalog, null), []);
  assert.deepStrictEqual(Layers.filesToLoad(catalog, []), []);
  const ids = Layers.filesToLoad(catalog, ['soils']).map(f => f.id);
  assert.deepStrictEqual(ids, ['s1', 's2']);
  assert.ok(!ids.includes('f'));
  assert.ok(!ids.includes('w'));
});

check('local layers keep the saved checks and do not turn the off ones back on', () => {
  const fresh = [{ base: 'soils', on: true }, { base: 'flood', on: true }];
  assert.strictEqual(Layers.applyToLayers(fresh, null).applied, false);
  assert.strictEqual(fresh[1].on, true);

  const saved = [{ base: 'soils', on: true }, { base: 'flood', on: true }];
  assert.strictEqual(Layers.applyToLayers(saved, ['soils']).applied, true);
  assert.strictEqual(saved[0].on, true);
  assert.strictEqual(saved[1].on, false);

  const none = [{ base: 'soils', on: true }, { base: 'flood', on: true }];
  Layers.applyToLayers(none, []);
  assert.strictEqual(none[0].on, false);
  assert.strictEqual(none[1].on, false);
});

check('the first check seeds the set, and later checks only add or remove that layer', () => {
  assert.deepStrictEqual(Layers.nextSet(null, [], 'soils.geojson', true), ['soils']);
  assert.deepStrictEqual(
    Layers.nextSet(null, ['soils', 'wetlands', 'flood'], 'flood', false),
    ['soils', 'wetlands']
  );
  assert.deepStrictEqual(Layers.nextSet(['soils'], [], 'dgir_wells.json', true), ['dgir_wells', 'soils']);
  assert.deepStrictEqual(Layers.nextSet(['soils', 'flood'], ['soils', 'flood'], 'soils', false), ['flood']);
  assert.deepStrictEqual(Layers.nextSet(['soils'], [], 'soils', false), []);
});

check('all on remembers loaded layers only, and all off stores an empty list', () => {
  const keys = Layers.keysForOnLayers(
    [{ base: 'soils', on: true }, { base: 'flood', on: false }],
    ['nrcs_de_by_mukey.json']
  );
  assert.deepStrictEqual(keys, ['nrcs_de_by_mukey', 'soils']);
  const store = memory();
  Layers.write(store, keys);
  assert.deepStrictEqual(Layers.read(store), keys);
  Layers.write(store, []);
  assert.deepStrictEqual(Layers.read(store), []);
  assert.notStrictEqual(Layers.read(memory()), []);
  assert.strictEqual(Layers.read(memory()), null);
});

check('a drive row follows the saved set, and an unsaved browser follows what is already loaded', () => {
  assert.strictEqual(Layers.catalogChecked(null, 'soils.geojson', false), false);
  assert.strictEqual(Layers.catalogChecked(null, 'soils.geojson', true), true);
  assert.strictEqual(Layers.catalogChecked(['flood'], 'soils.geojson', true), false);
  assert.strictEqual(Layers.catalogChecked(['soils'], 'soils_2.geojson', false), true);
});

(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log('ok  ' + t.name);
    } catch (e) {
      failed++;
      console.error('FAIL ' + t.name);
      console.error(e);
    }
  }
  if (failed) {
    console.error(failed + ' failed');
    process.exit(1);
  }
  console.log(tests.length + ' passed');
})();
