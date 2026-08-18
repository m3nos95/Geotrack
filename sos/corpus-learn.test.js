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

const pdfSets = pairLooseFiles([
  '/tmp/drop/App_644071456_Mcdonalds_Rev1.pdf',
  '/tmp/drop/Source_of_Supply_644071456_MCDONALDS.pdf',
  '/tmp/drop/Brittingham_Farms_Entrance.pdf',
  '/tmp/drop/Source_of_Supply_646011054_BRITTINGHAM.pdf',
], {
  '/tmp/drop/App_644071456_Mcdonalds_Rev1.pdf': { kind: 'contractor-form', appNums: ['644071456'] },
  '/tmp/drop/Source_of_Supply_644071456_MCDONALDS.pdf': { kind: 'issued-letter', appNums: ['644071456'] },
  '/tmp/drop/Brittingham_Farms_Entrance.pdf': { kind: 'contractor-form', appNums: ['646011054'] },
  '/tmp/drop/Source_of_Supply_646011054_BRITTINGHAM.pdf': { kind: 'issued-letter', appNums: ['646011054'] },
});
assert.strictEqual(pdfSets.length, 2);
const mac = pdfSets.find(c => (c.formPdfs || []).some(p => /644071456/.test(p)));
const brit = pdfSets.find(c => (c.formPdfs || []).some(p => /Brittingham/.test(p)));
assert.ok(mac && mac.pdfs.length === 1 && mac.formPdfs.length === 1);
assert.ok(brit && brit.pdfs.length === 1 && brit.formPdfs.length === 1);

console.log('OK corpus pairing');
