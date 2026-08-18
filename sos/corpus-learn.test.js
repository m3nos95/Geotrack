'use strict';
const assert = require('assert');
const { pairKey, pairLooseFiles, contractKey, mergeComparedResults } = require('./corpus-learn.js');

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

const { listFilesRecursive } = require('./corpus-learn.js');
const dropFiles = listFilesRecursive(require('path').join(__dirname, 'corpus', 'drop'), ['.pdf']);
assert.ok(dropFiles.some(p => /644071456/.test(p)));

assert.strictEqual(contractKey('T2024-062-02'), 'T202406202');
assert.strictEqual(contractKey('T202406202'), 'T202406202');
assert.strictEqual(contractKey('T2025-063-01'), contractKey('T202506301 SOS Channel Bed Fill.xls'));
assert.strictEqual(contractKey('CA 2525 Chaselynd'), 'CA2525');
assert.strictEqual(contractKey('Source of Supply 619701523 DELDOT'), '619701523');

const tPair = pairLooseFiles([
  '/tmp/T202506301 SOS Channel Bed Fill.xls',
  '/tmp/Source of Supply T2025-063-01 PAVEMENT GEORGE.pdf',
]);
assert.strictEqual(tPair.length, 1);
assert.strictEqual(tPair[0].xls.length, 1);
assert.strictEqual(tPair[0].pdfs.length, 1);

const merged = mergeComparedResults([
  {
    slug: 'Copy of SOS Borrow Type C',
    dir: '/tmp',
    xlsFiles: ['Copy of SOS Borrow Type C.xls'],
    formFiles: [],
    pdfFiles: [],
    engine: { project: { contract: '619701523', title: 'Deldot Bridgeville Yard' }, items: [{ specs: ['#209004'], section: '#209004 - BORROW, TYPE C' }] },
    letters: [],
    notes: [],
  },
  {
    slug: 'Source of Supply 619701523 DELDOT BRIDGEVILLE YARD',
    dir: '/tmp',
    xlsFiles: [],
    formFiles: [],
    pdfFiles: ['Source of Supply 619701523 DELDOT BRIDGEVILLE YARD.pdf'],
    engine: null,
    letters: [{
      file: 'Source of Supply 619701523 DELDOT BRIDGEVILLE YARD.pdf',
      kind: 'issued-letter',
      intro: 'Application No. 619701523, DELDOT BRIDGEVILLE YARD',
      sections: [{ section: '#209004 - BORROW, TYPE C', bullets: [], source: '', action: '' }],
    }],
    notes: ['PDF only — add the contractor .xls / .xlsx (or a PDF printout of the form) to this folder.'],
  },
]);
assert.strictEqual(merged.length, 1);
assert.ok(merged[0].engine);
assert.strictEqual(merged[0].letters.length, 1);
assert.ok(merged[0].diff);
assert.ok(!merged[0].notes.some(n => /PDF only/i.test(n)));

console.log('OK corpus pairing');
