'use strict';
const assert = require('assert');
const { pairKey, pairLooseFiles, contractKey, contractKeysFrom, mergeComparedResults } = require('./corpus-learn.js');

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

assert.ok(contractKeysFrom('202603109').includes('T202603109'));
assert.ok(contractKeysFrom('2525').includes('CA2525'));
assert.ok(contractKeysFrom('2525 Chaselynd Ph 3').includes('CA2525'));
assert.strictEqual(contractKey('T2026-031-09'), 'T202603109');

const ctfPair = pairLooseFiles([
  '/tmp/Source of Supply CTF IX (2).pdf',
  '/tmp/Source of Supply T2026-031-09 COMMUNITY TRANSPORTATION FUND.pdf',
], {
  '/tmp/Source of Supply CTF IX (2).pdf': {
    kind: 'contractor-form',
    appNums: ['202603109'],
    project: { contract: '202603109' },
  },
  '/tmp/Source of Supply T2026-031-09 COMMUNITY TRANSPORTATION FUND.pdf': {
    kind: 'issued-letter',
    appNums: ['T2026-031-09'],
  },
});
assert.strictEqual(ctfPair.length, 1);
assert.strictEqual(ctfPair[0].formPdfs.length, 1);
assert.strictEqual(ctfPair[0].pdfs.length, 1);

const caPair = pairLooseFiles([
  '/tmp/Chaselynd Ph 3 Source Materials.pdf',
  '/tmp/Source of Supply CA 2525 CHASELYND PHASE 3 NICHOLS.pdf',
], {
  '/tmp/Chaselynd Ph 3 Source Materials.pdf': {
    kind: 'contractor-form',
    appNums: ['2525'],
    project: { contract: '2525' },
  },
  '/tmp/Source of Supply CA 2525 CHASELYND PHASE 3 NICHOLS.pdf': {
    kind: 'issued-letter',
    appNums: ['CA 2525'],
  },
});
assert.strictEqual(caPair.length, 1);
assert.strictEqual(caPair[0].formPdfs.length, 1);
assert.strictEqual(caPair[0].pdfs.length, 1);

const splitJobs = pairLooseFiles([
  '/tmp/BLC - 2505 - NICCC - Del Dot - Source of Supply.pdf',
  '/tmp/Sussex EMS Submittal #1 - DelDot.pdf',
  '/tmp/Source of Supply 526781256 LINCOLN PARAMEDIC STATION WHAYLAND.pdf',
  '/tmp/Source of Supply 641671542 NANTICOKE INDIAN CULTURAL COMMUNITY CENTER WHAYLAND.pdf',
], {
  '/tmp/BLC - 2505 - NICCC - Del Dot - Source of Supply.pdf': {
    kind: 'contractor-form',
    appNums: ['526781256', '641671542'],
    project: { contract: '526781256', title: 'Nanticoke Indian Cultural Community Center' },
  },
  '/tmp/Sussex EMS Submittal #1 - DelDot.pdf': {
    kind: 'contractor-form',
    appNums: ['526781256'],
    project: { contract: '526781256', title: 'Lincoln Paramedic Station' },
  },
  '/tmp/Source of Supply 526781256 LINCOLN PARAMEDIC STATION WHAYLAND.pdf': {
    kind: 'issued-letter',
    appNums: ['526781256'],
  },
  '/tmp/Source of Supply 641671542 NANTICOKE INDIAN CULTURAL COMMUNITY CENTER WHAYLAND.pdf': {
    kind: 'issued-letter',
    appNums: ['641671542'],
  },
});
assert.ok(splitJobs.length >= 2, 'two issued letters with different app #s must stay separate');
const lincoln = splitJobs.find(c => (c.pdfs || []).some(p => /526781256/.test(p)));
const nanticoke = splitJobs.find(c => (c.pdfs || []).some(p => /641671542/.test(p)));
assert.ok(lincoln && nanticoke);
assert.ok(!(lincoln.pdfs || []).some(p => /641671542/.test(p)));
assert.ok(!(nanticoke.pdfs || []).some(p => /526781256/.test(p)));

const caMerged = mergeComparedResults([
  {
    slug: 'Chaselynd Ph 3 Source Materials',
    dir: '/tmp',
    xlsFiles: [],
    formFiles: ['Chaselynd Ph 3 Source Materials.pdf'],
    pdfFiles: [],
    engine: { project: { contract: '2525', title: 'Chaselynd Ph 3' }, items: [{ specs: ['#207021'], section: '#207021' }] },
    letters: [],
    notes: [],
  },
  {
    slug: 'Source of Supply CA 2525 CHASELYND PHASE 3 NICHOLS',
    dir: '/tmp',
    xlsFiles: [],
    formFiles: [],
    pdfFiles: ['Source of Supply CA 2525 CHASELYND PHASE 3 NICHOLS.pdf'],
    engine: null,
    letters: [{
      file: 'Source of Supply CA 2525 CHASELYND PHASE 3 NICHOLS.pdf',
      kind: 'issued-letter',
      intro: 'Contract CA 2525, CHASELYND PHASE 3',
      sections: [{ section: '#207021 - STRUCTURAL BACKFILL', bullets: [], source: '', action: '' }],
    }],
    notes: ['PDF only — add the contractor .xls / .xlsx (or a PDF printout of the form) to this folder.'],
  },
]);
assert.strictEqual(caMerged.length, 1);
assert.ok(caMerged[0].engine);
assert.strictEqual(caMerged[0].letters.length, 1);

const { parseCcPeople, harvestCcFromResults, parseIssuedSections, harvestLanguageFromResults, actionIntent } = require('./corpus-learn.js');
const ccBlock = [
  'The following material sources have been reviewed by this office for Application No. 0000016055, BOBBY FREY ENTRANCE(S) as to their acceptability for use on this project.',
  'SECTION: #301001 - GABC',
  'SOURCE: Vulcan Materials - Salisbury, MD',
  'ACTION: Must be tested.',
  'If you have any questions, please contact this office.',
  'cc: James Smith, DelDOT',
  'Ray Glanden, DelDOT',
  'Aaron Wieczorek, DelDOT',
  'Mark Schafer, DelDOT',
  'Jason Denson, DelDOT',
  'James Kwasnieski, DelDOT',
  '',
  'SHANTÉ A. HASTINGS',
  'Secretary',
].join('\n');
const ccPeople = parseCcPeople(ccBlock);
assert.strictEqual(ccPeople[0].name, 'James Smith');
assert.strictEqual(ccPeople[0].org, 'DelDOT');
assert.ok(ccPeople.some(p => p.name === 'Ray Glanden'));
assert.ok(ccPeople.some(p => p.name === 'James Kwasnieski'));
assert.ok(!ccPeople.some(p => /hastings/i.test(p.name)));
assert.ok(!ccPeople.some(p => /section/i.test(p.name)));

const issued = parseIssuedSections(ccBlock);
assert.strictEqual(issued.kind, 'issued-letter');
assert.strictEqual(issued.cc[0].name, 'James Smith');
assert.ok(issued.cc.length >= 6);

const harvest = harvestCcFromResults([
  { letters: [{ kind: 'issued-letter', cc: ccPeople }] },
  { letters: [{ kind: 'issued-letter', cc: ccPeople.slice(0, 3) }] },
  { letters: [{ kind: 'issued-letter', cc: [{ name: 'James Smith', org: 'DelDOT' }, { name: 'Hunter McCabe', org: 'DelDOT' }] }] },
  { letters: [{ kind: 'contractor-form', cc: [{ name: 'Should Skip', org: 'DelDOT' }] }] },
]);
assert.strictEqual(harvest.letters, 3);
assert.ok(harvest.always.some(p => p.name === 'James Smith'));
assert.ok(!harvest.always.some(p => p.name === 'Hunter McCabe'), 'Hunter is on 1/3 letters, below 40%');
assert.ok(!harvest.people.some(p => p.name === 'Should Skip'));

assert.strictEqual(actionIntent('Must be tested.'), 'test');
assert.strictEqual(actionIntent('Approved.'), 'approved');
assert.strictEqual(actionIntent('Approved: Conduct a visual inspection to ensure specification compliance.'), 'visual');

const languageLetter = [
  'The following material sources have been reviewed by this office for Application No. 0000016055, BOBBY FREY ENTRANCE(S) as to their acceptability for use on this project.',
  'SECTION: #301001 - GABC',
  'SOURCE: Vulcan Materials - Salisbury, MD',
  'ACTION: Must be tested.',
  'SECTION: #202888 - INCLINOMETERS',
  'SOURCE: Acme Instruments - Dover, DE',
  'ACTION: Approved: Conduct a visual inspection to ensure specification compliance.',
  'If you have any questions, please contact this office.',
].join('\n');
const languageParsed = parseIssuedSections(languageLetter);
assert.strictEqual(languageParsed.kind, 'issued-letter');
assert.strictEqual(languageParsed.sections.length, 2);

const language = harvestLanguageFromResults([
  { engine: null, notes: ['Letter only (no contractor spreadsheet). SECTION / SOURCE / ACTION language is still harvested.'], letters: [languageParsed] },
]);
assert.strictEqual(language.kind, 'issued-language');
assert.ok(language.bySpec['#301001']);
assert.strictEqual(language.bySpec['#301001'].intent, 'test');
assert.ok(/must be tested/i.test(language.bySpec['#301001'].action));
assert.ok(language.bySpec['#202888']);
assert.strictEqual(language.bySpec['#202888'].intent, 'visual');
assert.ok(/visual inspection/i.test(language.bySpec['#202888'].action));

const shortApproved = harvestLanguageFromResults([{
  letters: [{
    kind: 'issued-letter',
    sections: [{ section: '#905007 - SUPER SILT FENCE', source: 'ACF', action: 'Approved.' }],
  }],
}]);
assert.ok(shortApproved.bySpec['#905007'], 'short Approved. from issued letters is still harvested');
assert.strictEqual(shortApproved.bySpec['#905007'].intent, 'approved');

console.log('OK corpus pairing');
