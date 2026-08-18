'use strict';
const assert = require('assert');
const { pairKey, pairLooseFiles } = require('./corpus-learn.js');

assert.strictEqual(pairKey('Frey Entrance.xls'), pairKey('Frey Entrance.pdf'));
assert.strictEqual(pairKey('frey-entrance.xls'), pairKey('frey-entrance-rev1.pdf'));
assert.strictEqual(pairKey('Lightkeepers.xlsx'), pairKey('Lightkeepers.pdf'));
assert.notStrictEqual(pairKey('frey.xls'), pairKey('lightkeepers.pdf'));

const paired = pairLooseFiles([
  '/tmp/drop/Frey Entrance.xls',
  '/tmp/drop/Frey Entrance.pdf',
  '/tmp/drop/Frey Entrance-rev1.pdf',
  '/tmp/drop/lightkeepers.xls',
  '/tmp/drop/lightkeepers.pdf',
  '/tmp/drop/orphan-letter.pdf',
]);
const bySlug = Object.fromEntries(paired.map(c => [c.slug, c]));
assert.strictEqual(bySlug['Frey Entrance'].xls.length, 1);
assert.strictEqual(bySlug['Frey Entrance'].pdfs.length, 2);
assert.strictEqual(bySlug.lightkeepers.pdfs.length, 1);
assert.ok(bySlug['orphan-letter']);
assert.strictEqual(bySlug['orphan-letter'].xls.length, 0);
assert.strictEqual(paired.length, 3);

console.log('OK corpus pairing');
