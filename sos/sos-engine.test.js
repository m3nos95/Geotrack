'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Engine = require('./sos-engine.js');
const DATA = require('./sos-data.js');

function gridFromObjects(headerRows, items) {
  const rows = headerRows.map(r => {
    const row = Array(9).fill('');
    Object.entries(r).forEach(([k, v]) => { row[Number(k)] = v; });
    return row;
  });
  rows.push(['Specification #', '', 'Item Description', 'Plan sheet included with', 'Material', 'Supplier', '', 'Manufacturer', 'Alternate Manufacturer']);
  rows.push(['', '', '', 'Material Requirements?', '', '', '', 'Address & Contact', 'Address & Contact']);
  for (const item of items) {
    rows.push(item[0]);
    for (const cont of item.slice(1)) rows.push(cont);
    rows.push(Array(9).fill(''));
  }
  return rows;
}

const FREY_HEADER = [
  { 6: 'Agreement /Permit/Contract/Application #:' },
  { 6: 'Title of Contract:', 7: 'Bobby Frey Entrance(s)' },
  { 0: 'Source of Supply' },
  { 0: 'Materials & Research', 7: 'Contractor: Terra Firma of Delmarva, Inc. ' },
  { 7: 'Address: 38156 Brittingham Rd., Delmar, DE 19940' },
  { 7: 'E-Mail: ryan@terrafirmacorp.com' },
  { 0: 'Delaware Department of Transportation', 7: 'Sub-Contractor: n/a' },
  { 7: 'Date:7/6/26' },
  { 1: 'District: South ' },
  { 7: 'DelDOT Contact: James Smith ' },
];

const FREY_ITEMS = [
  [
    ['', 401005.0, 'Superpave Type C, PG 64-22', '', 'Superpave Type C, PG 64-22', 'River Asphalt, LLC ', '', '30548 Thorogoods Rd. ', '36393 Sussex Highway '],
    ['', '', '', '', '', '', '', 'Dagsboro, DE 19939', 'Delmar, DE 19940'],
    ['', '', '', '', '', '', '', '302-934-0881', '302-907-6400'],
  ],
  [
    ['', 401014.0, 'Superpave Type B, PG 64-22', '', 'Superpave Type B, PG 64-22', 'River Asphalt, LLC', '', '30548 Thorogoods Rd. ', '36393 Sussex Highway '],
    ['', '', '', '', '', '', '', 'Dagsboro, DE 19939', 'Delmar, DE 19940'],
    ['', '', '', '', '', '', '', '302-934-0881', '302-907-6400'],
  ],
  [
    ['', 404001.0, 'Bituminous Crack and Joint Seal ', '', 'Hot Applied Sealant ', 'Johnson Seed & Feed ', '', 'Maxwell Products, Inc. ', ''],
    ['', '', '', '', 'Elastoflex 61', '871 W. Isabella ', '', '650 South Delong St. ', ''],
    ['', '', '', '', '', 'Salisbury, MD 21801', '', 'Salt Lake City, UT 84104', ''],
    ['', '', '', '', '', '410-742-2151', '', '1-800-266-2090', ''],
  ],
  [
    ['', 401501.0, 'Bituminous Asphalt Tack Coat ', '', 'Tack Coat CRS-1', 'Tri County Materials ', '', 'Russell Standard', ''],
    ['', '', 'CRS-1', '', '', '3800 Dover AFB Rd. ', '', '3450 Asiatic Ave. ', ''],
    ['', '', '', '', '', 'Dover, DE ', '', 'Baltimore, MD 21226', ''],
  ],
  [
    ['', 301003.0, 'Graded Aggregate', '', 'GABC', 'Vulcan Materials', '', '1002  Parsons Rd. ', ''],
    ['', '', '', '', '', '', '', 'Salisbury, MD 21801', ''],
    ['', '', '', '', '', '', '', '410-742-4645', ''],
  ],
];

// --- unit: spec helpers ---
assert.strictEqual(Engine.normalizeSpec(401005.0), '#401005');
assert.strictEqual(Engine.normalizeSpec('301003.0'), '#301003');
assert.deepStrictEqual(Engine.extractSpecs('401029/401030'), ['#401029', '#401030']);
assert.ok(Engine.isStreet('30548 Thorogoods Rd.'));
assert.ok(Engine.isCompanyName('Maxwell Products, Inc.'));
assert.ok(Engine.isCityState('Dagsboro, DE 19939'));
assert.ok(!Engine.isCompanyName('3450 Asiatic Ave.'));

const grid = gridFromObjects(FREY_HEADER, FREY_ITEMS);
const result = Engine.processGrid(grid, { filename: 'DEL DOT - SOS - Frey Entrance(s).xls' });

assert.strictEqual(result.project.title, 'Bobby Frey Entrance(s)');
assert.ok(/Terra Firma/.test(result.project.contractor));
assert.ok(/38156 Brittingham/.test(result.project.contractorAddr));
assert.ok(/Delmar/.test(result.project.contractorAddr));
assert.strictEqual(result.project.contact, 'James Smith');
assert.ok(/South/i.test(result.project.district));
assert.ok(!result.project.contract, 'Frey form leaves application # blank');
assert.ok(result.warnings.some(w => /blank/i.test(w)));
assert.strictEqual(result.project.submittedDate, '2026-07-06', 'SOS form date is kept as submittedDate');
assert.strictEqual(result.project.date, Engine.todayISO(), 'letter date is today, not the SOS submission date');
assert.ok(Engine.letterPlainText(result.project, result.items, result.cc).startsWith(Engine.formatLongDate(Engine.todayISO())));

const adobeStamp = Engine.formatDigitalSignStamp('2026-06-08T13:35:21.000Z');
assert.strictEqual(adobeStamp.date, '2026.06.08');
assert.ok(/09:35:21 -04'00'/.test(adobeStamp.time), adobeStamp.time);
assert.deepStrictEqual(Engine.digitalSignatureLines('2026-06-08T13:35:21.000Z', 'Steven Peretiatko'), [
  'Digitally signed by',
  'Steven Peretiatko',
  'Date: 2026.06.08',
  adobeStamp.time,
]);

const families = result.items.map(i => i.family);
const specs = result.items.map(i => (i.letterSpecs || i.specs).join(','));

// GABC #301003 stays 301003 (SOS Database: GABC by the ton). Must be tested.
const gabc = result.items.find(i => i.family === 'aggregate');
assert.ok(gabc, 'GABC item present');
assert.deepStrictEqual(gabc.letterSpecs || gabc.specs, ['#301003']);
assert.ok(!/CRUSHED CONCRETE/.test(gabc.desc));
assert.strictEqual(gabc.action, 'test');
assert.ok(/Vulcan/i.test(gabc.srcName));
assert.ok(/Salisbury/i.test(gabc.srcLoc));
assert.ok(/Ray Glanden/.test(gabc.actionNotes));
assert.ok(/Aaron Wieczorek/.test(gabc.actionNotes));

const southTestNotes = DATA.stockNotesForAction('test', 'South');
assert.ok(/Must be tested and approved prior to use/.test(southTestNotes));
assert.ok(/Ray Glanden/.test(southTestNotes));
assert.ok(/Aaron Wieczorek/.test(southTestNotes));
assert.ok(/Damian Blakely/.test(DATA.stockNotesForAction('test', 'North')));
assert.ok(DATA.actionNotePresets('South').some(p => p.id === 'test' && /ten \(10\) working days/.test(p.notes)));
assert.strictEqual(DATA.stockNotesForAction('approved'), DATA.ACTION_TEXT.approved);

// Superpave Type C + B grouped, numbered River Asphalt plants
const hma = result.items.find(i => i.family === 'hma-mix');
assert.ok(hma, 'HMA mix item present');
assert.ok(hma.specs.includes('#401005') && hma.specs.includes('#401014'));
assert.ok(/River Asphalt 1/.test(hma.srcName));
assert.ok(/Dagsboro/i.test(hma.srcLoc));
assert.ok(/River Asphalt 2/.test(hma.altName));
assert.ok(/Delmar/i.test(hma.altLoc));
assert.strictEqual(hma.action, 'approved');
assert.ok(/mix designs/i.test(hma.actionNotes));
assert.ok(/one source/i.test(hma.actionNotes));

// Tack: manufacturer Russell Standard Baltimore → APL approved
const tack = result.items.find(i => i.family === 'tack');
assert.ok(tack, 'Tack item present');
assert.deepStrictEqual(tack.letterSpecs, ['#401xxx']);
assert.ok(/CRS-1 Tack Coat/i.test(tack.subItems.join(' ')));
assert.ok(/Russell Standard/i.test(tack.srcName));
assert.ok(/Baltimore/i.test(tack.srcLoc));
assert.ok(!/Tri County/i.test(tack.srcName), 'distributor is not the letter SOURCE');
assert.ok(tack.action === 'apl' || tack.action === 'approved');
assert.ok(/APL/i.test(tack.actionNotes));
assert.ok(!/not approved/i.test(tack.actionNotes));

// Crack seal: Maxwell Products, Elastoflex, APL
const crack = result.items.find(i => i.family === 'crack-seal');
assert.ok(crack, 'Crack seal item present');
assert.ok(/Maxwell/i.test(crack.srcName));
assert.ok(/Salt Lake/i.test(crack.srcLoc));
assert.ok(!/Johnson Seed/i.test(crack.srcName));
assert.ok(crack.subItems.some(s => /Elastoflex/i.test(s)));
assert.ok(/APL/i.test(crack.actionNotes));

// CC: form contact, district sampler (soil/stone), then material assignments
assert.strictEqual(result.cc[0].name, 'James Smith');
assert.ok(result.cc.some(c => c.name === 'Aaron Wieczorek'), 'lab results on soil/stone');
assert.ok(result.cc.some(c => c.name === 'Mark Schafer'), 'HMA person on hot mix');
assert.ok(!result.cc.some(c => c.name === 'Ray Glanden'), 'district sampler is ACTION notes, not auto-CC');
assert.ok(!result.cc.some(c => c.name === 'Jason Denson'), 'core dump removed — assign by material');
assert.ok(!result.cc.some(c => c.name === 'James Kwasnieski'));
assert.strictEqual(Engine.samplerName('South'), 'Ray Glanden');
assert.strictEqual(Engine.samplerName('North'), 'Damian Blakely');
assert.strictEqual(Engine.samplerName('Canal'), 'Rich Taylor');

const phrase = Engine.contractPhrase({ contract: '0000016055', title: 'BOBBY FREY ENTRANCE(S)', docKind: 'application' });
assert.strictEqual(phrase, 'Application No. 0000016055, BOBBY FREY ENTRANCE(S)');
assert.strictEqual(
  Engine.contractPhrase({
    contract: 'T2025-061-01',
    title: 'PAVE & REHAB, NEW CASTLE 5A, KIRKWOOD HIGHWAY',
    docKind: 'contract',
  }),
  'Contract T2025-061-01, PAVE & REHAB, NEW CASTLE 5A, (KIRKWOOD HIGHWAY)'
);
assert.strictEqual(
  Engine.contractPhrase({
    contract: 'T2025-061-01',
    title: 'PAVEMENT REHABILITATION, NEW CASTLE 5A, (KIRKWOOD HIGHWAY)',
    docKind: 'contract',
  }),
  'Contract T2025-061-01, PAVEMENT REHABILITATION, NEW CASTLE 5A, (KIRKWOOD HIGHWAY)'
);
assert.strictEqual(Engine.parenthesizeTitlePlace('SUBDIVISION PAVING, NEW CASTLE COUNTY VIII, 2026'), 'SUBDIVISION PAVING, NEW CASTLE COUNTY VIII, 2026');

// Seaford Russell Standard must reject
const seafordGrid = gridFromObjects(FREY_HEADER, [[
  ['', 401501.0, 'Tack Coat', '', 'CRS-1', 'Tri County', '', 'Russell Standard', ''],
  ['', '', '', '', '', '', '', 'Seaford, DE 19973', ''],
]]);
const seaford = Engine.processGrid(seafordGrid);
const seafordTack = seaford.items.find(i => i.family === 'tack');
assert.strictEqual(seafordTack.action, 'not-approved');
assert.ok(/not listed on tack coat APL/i.test(seafordTack.actionNotes));

// 301003 crushed concrete stays 301003 (not rewritten to 301001 GABC)
const crushGrid = gridFromObjects(FREY_HEADER, [[
  ['', 301003.0, 'Graded Aggregate Base Course', '', 'Crushed Concrete', 'Porter Road Materials', '', '1250 Porter Road', ''],
  ['', '', '', '', '', '', '', 'Bear, DE 19701', ''],
]]);
const crush = Engine.processGrid(crushGrid).items.find(i => i.family === 'aggregate');
assert.deepStrictEqual(crush.letterSpecs || crush.specs, ['#301003']);
assert.ok(!Engine.processGrid(crushGrid).warnings.some(w => /301001/.test(w)));

// Live parse of the uploaded workbook when present
const liveXls = '/home/ubuntu/.cursor/projects/workspace/uploads/DEL_DOT_-_SOS_-_Frey_Entrance_s__b85d.xls';
if (fs.existsSync(liveXls)) {
  let XLSX;
  try { XLSX = require('xlsx'); } catch (e) { XLSX = null; }
  if (XLSX) {
    const wb = XLSX.readFile(liveXls);
    const live = Engine.processWorkbook(wb, { filename: path.basename(liveXls) });
    assert.ok(/Terra Firma/.test(live.project.contractor));
    assert.ok(live.items.length >= 4, 'live parse found items, got ' + live.items.length);
    assert.ok(live.items.some(i => i.family === 'hma-mix'));
    assert.ok(live.items.some(i => i.family === 'tack'));
    assert.ok(live.items.some(i => i.family === 'aggregate'));
    console.log('live xls items:', live.items.map(i => `${(i.letterSpecs||i.specs).join('/')} ${i.family} ${i.action} ${i.srcName}`).join(' | '));
  } else {
    console.log('skip live xls (no sheetjs)');
  }
}

console.log('items:', result.items.map(i => ({
  specs: i.letterSpecs || i.specs,
  family: i.family,
  action: i.action,
  src: i.srcName + ' - ' + i.srcLoc,
  alt: i.altName ? i.altName + ' - ' + i.altLoc : '',
  subs: i.subItems,
  rule: i.rule,
})));
console.log('warnings:', result.warnings);
console.log('OK', result.items.length, 'letter items from', FREY_ITEMS.length, 'xls rows');

const filled = { ...result.project, contract: '0000016055', docKind: 'application', title: 'BOBBY FREY ENTRANCE(S)' };
const letter = Engine.letterPlainText(filled, result.items, result.cc);
assert.ok(/Application No\. 0000016055/.test(letter));
assert.ok(/#301003 - GABC/.test(letter));
assert.ok(!/#301001 - GABC/.test(letter));
assert.ok(/Must be tested/.test(letter));
assert.ok(/River Asphalt 1/.test(letter) && /River Asphalt 2/.test(letter));
assert.ok(/#401005 - SUPERPAVE TYPE C/.test(letter));
assert.ok(/#401014 - SUPERPAVE TYPE B/.test(letter));
assert.ok(/#401xxx/.test(letter) && /CRS-1 Tack Coat/.test(letter));
assert.ok(/Russell Standard - Baltimore/.test(letter));
assert.ok(/Elastoflex 61/.test(letter));
assert.ok(/James Smith/.test(letter));

// North district sampler is Damian Blakely (not Ray Glanden)
const northHeader = FREY_HEADER.map(r => ({ ...r }));
northHeader[8] = { 1: 'District: North ' };
const northGrid = gridFromObjects(northHeader, [FREY_ITEMS[4]]);
const northResult = Engine.processGrid(northGrid);
const northGabc = northResult.items.find(i => i.family === 'aggregate');
assert.ok(/Damian Blakely/.test(northGabc.actionNotes));
assert.ok(/302-593-7158/.test(northGabc.actionNotes));
assert.ok(!/Ray Glanden/.test(northGabc.actionNotes));
assert.strictEqual(northResult.cc[0].name, 'James Smith');
assert.ok(northResult.cc.some(c => c.name === 'Aaron Wieczorek'));
assert.ok(!northResult.cc.some(c => c.name === 'Damian Blakely'), 'North sampler stays in ACTION notes');
assert.ok(!northResult.cc.some(c => c.name === 'Ray Glanden'), 'South sampler is not copied on a North soil/stone letter');
assert.ok(!northResult.cc.some(c => c.name === 'Mark Schafer'), 'no hot mix on this letter');

const hmaOnly = Engine.processGrid(gridFromObjects(FREY_HEADER, [FREY_ITEMS[0]]));
assert.ok(hmaOnly.cc.some(c => c.name === 'Mark Schafer'));
assert.ok(!hmaOnly.cc.some(c => c.name === 'Aaron Wieczorek'), 'no soil/stone on HMA-only letter');
assert.ok(!hmaOnly.cc.some(c => c.name === 'Ray Glanden'));

const canalHeader = FREY_HEADER.map(r => ({ ...r }));
canalHeader[8] = { 1: 'District: Canal ' };
canalHeader[9] = { 7: 'DelDOT Contact: John Mastrobuono ' };
const canalGrid = gridFromObjects(canalHeader, [FREY_ITEMS[0], FREY_ITEMS[4]]);
const canalResult = Engine.processGrid(canalGrid);
assert.ok(canalResult.cc.some(c => c.name === 'John Mastrobuono'));
assert.ok(canalResult.cc.some(c => c.name === 'Aaron Wieczorek'));
assert.ok(canalResult.cc.some(c => c.name === 'Mark Schafer'));
assert.ok(!canalResult.cc.some(c => /taylor/i.test(c.name)), 'Canal sampler is not auto-copied on cc');
const canalGabc = canalResult.items.find(i => i.family === 'aggregate');
assert.ok(/Rich Taylor/.test(canalGabc.actionNotes), 'Canal sampler still named in must-be-tested ACTION');

assert.strictEqual(DATA.normalizeCcName('Richard Taylor'), 'rich taylor');
assert.strictEqual(DATA.filterRetiredCcPeople(
  [{ name: 'Rich Taylor', org: 'DelDOT' }, { name: 'John Mastrobuono', org: 'DelDOT' }],
  ['Richard Taylor']
).map(p => p.name).join(), 'John Mastrobuono');

const retiredSampler = Engine.processGrid(canalGrid, {
  lists: { retiredCc: ['Richard Taylor'] },
});
assert.ok(!retiredSampler.cc.some(c => /taylor/i.test(c.name)));

const namedSampler = Engine.processGrid(canalGrid, {
  lists: { ccAssignments: [
    { name: 'Aaron Wieczorek', org: 'DelDOT', groups: ['soil-stone'], role: 'results' },
    { name: 'Mark Schafer', org: 'DelDOT', groups: ['hma'] },
    { name: 'Rich Taylor', org: 'DelDOT', groups: ['soil-stone'] },
  ] },
});
assert.ok(namedSampler.cc.some(c => c.name === 'Rich Taylor'), 'sampler is copied only when assigned on the CC tab');

const canalAlwaysCc = Engine.processGrid(canalGrid, {
  lists: {
    ccAssignments: [
      { name: 'Pat Canal', org: 'DelDOT', always: true, districts: ['canal'] },
      { name: 'Aaron Wieczorek', org: 'DelDOT', groups: ['soil-stone'], role: 'results' },
      { name: 'Mark Schafer', org: 'DelDOT', groups: ['hma'] },
    ],
  },
});
assert.ok(canalAlwaysCc.cc.some(c => c.name === 'Pat Canal'), 'Always + Canal copies on Canal jobs');
const southNoCanalCc = Engine.processGrid(gridFromObjects(FREY_HEADER, [FREY_ITEMS[4]]), {
  lists: {
    ccAssignments: [
      { name: 'Pat Canal', org: 'DelDOT', always: true, districts: ['canal'] },
      { name: 'Aaron Wieczorek', org: 'DelDOT', groups: ['soil-stone'], role: 'results' },
    ],
  },
});
assert.ok(!southNoCanalCc.cc.some(c => c.name === 'Pat Canal'), 'Always + Canal does not copy on South jobs');

const renamed = Engine.processGrid(grid, {
  lists: {
    ccAssignments: [
      { name: 'Pat Successor', org: 'DelDOT', groups: ['soil-stone'], role: 'results', phone: '302-555-0100' },
      { name: 'Mark Schafer', org: 'DelDOT', groups: ['hma'] },
    ],
  },
});
assert.ok(renamed.cc.some(c => c.name === 'Pat Successor'));
assert.ok(!renamed.cc.some(c => c.name === 'Aaron Wieczorek'));
assert.ok(/Pat Successor/.test(renamed.items.find(i => i.family === 'aggregate').actionNotes));
assert.ok(/302-555-0100/.test(renamed.items.find(i => i.family === 'aggregate').actionNotes));

const withAlways = Engine.processGrid(gridFromObjects(FREY_HEADER, [FREY_ITEMS[0]]), {
  lists: { ccAssignments: [{ name: 'Hunter McCabe', org: 'DelDOT', always: true }] },
});
assert.strictEqual(withAlways.cc[0].name, 'James Smith');
assert.ok(withAlways.cc.some(c => c.name === 'Hunter McCabe'));
assert.ok(withAlways.cc.filter(c => c.name === 'James Smith').length === 1);

// Russell Standard Chambersburg tack is not on APL
const chambersburgGrid = gridFromObjects(FREY_HEADER, [[
  ['', 401501.0, 'Tack Coat', '', 'CRS-1H', 'Tri County', '', 'Russell Standard', ''],
  ['', '', '', '', '', '', '', 'Chambersburg, PA 17201', ''],
]]);
const chambersburgTack = Engine.processGrid(chambersburgGrid).items.find(i => i.family === 'tack');
assert.strictEqual(chambersburgTack.action, 'not-approved');

// Seaboard Asphalt is on the tack APL
const seaboardGrid = gridFromObjects(FREY_HEADER, [[
  ['', 401501.0, 'Tack Coat', '', 'EM-50-TT', 'Tri County', '', 'Seaboard Asphalt Products', ''],
  ['', '', '', '', '', '', '', 'Baltimore, MD 21226', ''],
]]);
const seaboardTack = Engine.processGrid(seaboardGrid).items.find(i => i.family === 'tack');
assert.ok(seaboardTack.action === 'apl' || seaboardTack.action === 'approved');
assert.ok(!/not approved/i.test(seaboardTack.actionNotes));

// PCC curb / sidewalk uses admixture-cert language (issued M&R Lab note)
const pccGrid = gridFromObjects(FREY_HEADER, [[
  ['', 705001.0, 'PCC Sidewalk, 4"', '', 'Class B Concrete', 'Heritage Concrete', '', 'Wilmington, DE', 'Bear Concrete'],
  ['', '', '', '', '', '', '', '', 'Newark, DE'],
], [
  ['', 701013.0, 'PCC Curb, Type 1-8', '', 'Class B Concrete', 'Heritage Concrete', '', 'Wilmington, DE', 'Bear Concrete'],
  ['', '', '', '', '', '', '', '', 'Newark, DE'],
]]);
const pcc = Engine.processGrid(pccGrid).items.find(i => i.family === 'pcc');
assert.ok(pcc, 'PCC item present');
assert.ok(pcc.specs.includes('#705001') && pcc.specs.includes('#701013'));
assert.ok(Engine.letterSectionLines(pcc).some(l => /#705001 - PCC SIDEWALK, 4"/.test(l)));
assert.ok(Engine.letterSectionLines(pcc).some(l => /#701013 - PCC CURB, TYPE 1-8/.test(l)));
assert.ok(/admixture/i.test(pcc.actionNotes));
assert.ok(/M&R Lab/i.test(pcc.actionNotes));

// Sized RCP / FES / inlets / curb keep their own letter lines when grouped
const whitehallStruct = Engine.processGrid(gridFromObjects(FREY_HEADER, [
  [
    ['', 601011.0, 'RCP 15"', '', 'Precast Concrete', 'Rinker Materials', '', 'Middletown, DE', 'Rinker Materials'],
  ],
  [
    ['', 601012.0, 'RCP 18"', '', 'Precast Concrete', 'Rinker Materials', '', 'Middletown, DE', ''],
  ],
  [
    ['', 601014.0, 'RCP 24"', '', 'Precast Concrete', 'Rinker Materials', '', 'Middletown, DE', ''],
  ],
  [
    ['', 601016.0, 'RCP 30"', '', 'Precast Concrete', 'Rinker Materials', '', 'Middletown, DE', ''],
  ],
  [
    ['', 601142.0, 'FES 18"', '', 'Precast Concrete', 'Rinker Materials', '', 'Middletown, DE', ''],
  ],
  [
    ['', 601146.0, 'FES 30"', '', 'Precast Concrete', 'Rinker Materials', '', 'Middletown, DE', ''],
  ],
  [
    ['', 602003.0, 'DI 34x24', '', 'Precast Concrete', 'Gillespie Precast', '', 'Chestertown, MD', 'Gillespie Precast'],
  ],
  [
    ['', 602004.0, 'DI 48x30', '', 'Precast Concrete', 'Gillespie Precast', '', 'Chestertown, MD', ''],
  ],
  [
    ['', 602005.0, 'DI 48x48', '', 'Precast Concrete', 'Gillespie Precast', '', 'Chestertown, MD', ''],
  ],
  [
    ['', 602010.0, 'DI 72x48', '', 'Precast Concrete', 'Gillespie Precast', '', 'Chestertown, MD', ''],
  ],
  [
    ['', 602035.0, 'Manhole round', '', 'Precast Concrete', 'Gillespie Precast', '', 'Chestertown, MD', ''],
  ],
  [
    ['', 701012.0, 'PCC Curb Type 1-6', '', 'Class B Concrete', 'Heritage Concrete', '', 'Cheswold, DE', 'Bear Materials'],
    ['', '', '', '', '', '', '', '', 'Newark, DE'],
  ],
  [
    ['', 705001.0, 'PCC Sidewalk 4"', '', 'Class B Concrete', 'Heritage Concrete', '', 'Cheswold, DE', 'Bear Materials'],
    ['', '', '', '', '', '', '', '', 'Newark, DE'],
  ],
  [
    ['', 705002.0, 'PCC Sidewalk 6"', '', 'Class B Concrete', 'Heritage Concrete', '', 'Cheswold, DE', 'Bear Materials'],
    ['', '', '', '', '', '', '', '', 'Newark, DE'],
  ],
  [
    ['', 701012.0, 'PCC Curb Type 1-6', '', 'REFLEX Rubber Expansion', 'J&K Foam Fabricating', '', 'Pottstown, PA', ''],
  ],
  [
    ['', 705001.0, 'PCC Sidewalk 4"', '', 'White Pigmented Curing', 'Tri Supply', '', 'WR Meadows', ''],
    ['', '', '', '', '1600-White', '', '', 'York, PA', ''],
  ],
]));
const rcpGroup = whitehallStruct.items.find(i => i.family === 'rcp');
const rcpLines = Engine.letterSectionLines(rcpGroup).join('\n');
assert.ok(/#601011 - REINFORCED CONCRETE PIPE, 15", CLASS III/.test(rcpLines));
assert.ok(/#601012 - REINFORCED CONCRETE PIPE, 18", CLASS III/.test(rcpLines));
assert.ok(/#601014 - REINFORCED CONCRETE PIPE, 24", CLASS III/.test(rcpLines), rcpLines);
assert.ok(/#601016 - REINFORCED CONCRETE PIPE, 30", CLASS III/.test(rcpLines));
assert.ok(/#601142 - REINFORCED CONCRETE FLARED END SECTION, 18"/.test(rcpLines), rcpLines);
assert.ok(/#601146 - REINFORCED CONCRETE FLARED END SECTION, 30"/.test(rcpLines));
assert.ok(!/#601014 - REINFORCED CONCRETE PIPE, 15"/.test(rcpLines));
assert.ok(!rcpGroup.altName, 'same-name Rinker alt is omitted');
assert.ok(!(rcpGroup.subItems || []).some(s => /precast/i.test(s)));

const inletGroup = whitehallStruct.items.find(i => i.family === 'precast');
const inletLines = Engine.letterSectionLines(inletGroup).join('\n');
assert.ok(/#602003 - DRAINAGE INLET, 34" X 24"/.test(inletLines));
assert.ok(/#602010 - DRAINAGE INLET, 72" X 48"/.test(inletLines), inletLines);
assert.ok(/#602035 - MANHOLE, ROUND/.test(inletLines), inletLines);
assert.ok(!/#602010 - DRAINAGE INLET, 34"/.test(inletLines));
assert.ok(!/CAST IN PLACE/i.test(inletLines));

const curbWalk = whitehallStruct.items.find(i => i.family === 'pcc');
const curbLines = Engine.letterSectionLines(curbWalk).join('\n');
assert.ok(/#701012 - PCC CURB, TYPE 1-6/.test(curbLines), curbLines);
assert.ok(/#705001 - PCC SIDEWALK, 4"/.test(curbLines));
assert.ok(/#705002 - PCC SIDEWALK, 6"/.test(curbLines));
assert.ok(!/#701012 - PCC SIDEWALK/.test(curbLines));
assert.ok(!(curbWalk.subItems || []).some(s => /class b/i.test(s)));
assert.strictEqual((curbWalk.actionNotes.match(/only one source at a time/gi) || []).length, 1);

assert.strictEqual(DATA.SPEC_CATALOG['#701012'].desc, 'PCC CURB, TYPE 1-6');
assert.ok(!/sidewalk/i.test(DATA.SPEC_CATALOG['#701012'].desc));
assert.strictEqual(DATA.SPEC_CATALOG['#601014'].desc, 'REINFORCED CONCRETE PIPE, 24", CLASS III');
assert.strictEqual(DATA.SPEC_CATALOG['#602010'].desc, 'DRAINAGE INLET, 72" X 48"');
assert.strictEqual(DATA.SPEC_CATALOG['#602035'].desc, 'MANHOLE, ROUND');

const stalePcc = Engine.applyWorkflow({
  project: { contract: 'CA2589', title: 'Whitehall', contractor: 'George & Lynch', district: 'Canal' },
  items: [{
    specs: ['#701012', '#705001', '#705002'],
    desc: 'PCC SIDEWALK, 4"',
    material: 'Class B Concrete',
    subItems: [],
    srcName: 'Heritage Concrete',
    srcLoc: 'Cheswold, DE',
    specDescs: {
      '#701012': 'PCC SIDEWALK, 4"',
      '#705001': 'PCC SIDEWALK, 4"',
      '#705002': 'PCC SIDEWALK, 4"',
    },
  }],
  warnings: [],
}).items.find(i => i.family === 'pcc');
const staleLines = Engine.letterSectionLines(stalePcc).join('\n');
assert.ok(/#701012 - PCC CURB, TYPE 1-6/.test(staleLines), staleLines);
assert.ok(!/#701012 - PCC SIDEWALK/.test(staleLines), staleLines);
assert.ok(/#705001 - PCC SIDEWALK, 4"/.test(staleLines), staleLines);

const expansion = whitehallStruct.items.find(i => i.family === 'expansion');
assert.ok(expansion, 'Reflex expansion is not kept as PCC curb');
assert.deepStrictEqual(expansion.letterSpecs, ['#701/705xxx']);
assert.strictEqual(expansion.desc, 'CONCRETE ITEMS');
assert.ok(/reflex/i.test((expansion.subItems || []).join(' ')));

const curing = whitehallStruct.items.find(i => i.family === 'curing');
assert.ok(curing, '1600-White curing is not kept as sidewalk');
assert.deepStrictEqual(curing.letterSpecs, ['#701/705xxx']);
assert.strictEqual(curing.desc, 'CONCRETE ITEMS');
assert.ok(/WR Meadows/i.test(curing.srcName));

// Clearing / excavation / removal listed N/A are omitted
const skipGrid = gridFromObjects(FREY_HEADER, [[
  ['', 201000.0, 'Clearing and Grubbing', '', 'N/A', 'N/A', '', '', ''],
], [
  ['', 202000.0, 'Excavation and Embankment', '', 'N/A', 'N/A', '', '', ''],
], [
  ['', 211000.0, 'Removal of Structures and Obstructions', '', 'N/A', 'N/A', '', '', ''],
], [
  ['', 301001.0, 'GABC', '', 'GABC', 'Vulcan Materials', '', 'Salisbury, MD', ''],
]]);
const skipped = Engine.processGrid(skipGrid);
assert.ok(!skipped.items.some(i => (i.specs || []).some(s => /#201000|#202000|#211000/.test(s))));
assert.ok(skipped.warnings.some(w => /Omitted N\/A earthwork/i.test(w)));
assert.ok(skipped.items.some(i => i.family === 'aggregate'));

// High Performance Bituminous is pending JMF, not grouped with Superpave
const jmfGrid = gridFromObjects(FREY_HEADER, [[
  ['', 401005.0, 'Superpave Type C', '', 'Superpave Type C', 'Allan Myers', '', 'Dover, DE', ''],
], [
  ['', 401505.0, 'High Performance Bituminous Concrete (9.5mm)', '', 'HP Bituminous', 'Allan Myers', '', 'Dover, DE', ''],
]]);
const jmfItems = Engine.processGrid(jmfGrid).items;
const hp = jmfItems.find(i => (i.specs || []).includes('#401505'));
const mix = jmfItems.find(i => (i.specs || []).includes('#401005'));
assert.ok(hp && mix);
assert.strictEqual(hp.action, 'not-approved');
assert.ok(/pending JMF/i.test(hp.actionNotes));
assert.ok(/mix designs/i.test(mix.actionNotes));

// Riprap visual; water/sewer utility-owner language; Ennis Flint striping APL
const miscGrid = gridFromObjects(FREY_HEADER, [[
  ['', 707015.0, 'Riprap, R-4', '', 'R-4', 'Vulcan Materials', '', 'Seaford, DE', ''],
], [
  ['', 710030.0, 'PVC Water Main, 8"', '', 'PVC', 'Fortline Waterworks', '', 'Frankford, DE', ''],
], [
  ['', 817560.0, 'Straight Arrow Thermoplastic', '', 'Thermoplastic Striping', 'Zone Striping', '', 'Ennis Flint', ''],
  ['', '', '', '', '', '', '', 'Greensboro, NC', ''],
]]);
const misc = Engine.processGrid(miscGrid).items;
const riprap = misc.find(i => i.family === 'riprap');
const util = misc.find(i => i.family === 'utility');
const stripe = misc.find(i => i.family === 'striping');
assert.ok(riprap && /visual inspection/i.test(riprap.actionNotes));
assert.ok(util && /utility owners/i.test(util.actionNotes));
assert.ok(stripe && /Ennis Flint/i.test(stripe.srcName));
assert.ok(/choose a product from the APL/i.test(stripe.actionNotes));

assert.ok(/GABC \(CRUSHED CONCRETE\)/.test(Engine.letterPlainText(
  { contract: '644071456', title: 'MCDONALDS', docKind: 'application' },
  [crush],
  []
)));

// Last-run: keep #301003 for GABC / crusher run (Capitol Trail / Luxor issued 301003, not 301001)
const capitolGabc = Engine.processGrid(gridFromObjects(FREY_HEADER, [[
  ['', 301003.0, 'GABC', '', 'GABC Bases', 'Allan Myers', '', 'Elk Mills, MD', 'Martin Marietta'],
  ['', '', '', '', '', '', '', '', 'North East, MD'],
]])).items.find(i => i.family === 'aggregate');
assert.deepStrictEqual(capitolGabc.letterSpecs || capitolGabc.specs, ['#301003']);
assert.ok(/CRUSHER RUN|GABC/.test(capitolGabc.desc));
assert.ok(!/301001/.test(Engine.processGrid(gridFromObjects(FREY_HEADER, [[
  ['', 301003.0, 'GABC', '', 'GABC Bases', 'Allan Myers', '', 'Elk Mills, MD', ''],
]])).warnings.join(' ')));

// Channel bed fill is aggregate (not generic other); chart loc-only Harrington → Diamond Principio
const cbfChart = {
  kind: 'aggregate',
  entries: [
    { name: 'Diamond Materials - Harrington', source: 'York Principio', loc: 'Harrington', material: 'CBF', status: 'rejected', testDate: '' },
    { name: 'Diamond Materials - Harrington', source: 'York Principio', loc: 'Harrington', material: 'CBF Light', status: 'approved', testDate: '2026-08-10' },
  ],
};
const cbfGrid = gridFromObjects(FREY_HEADER, [[
  ['', 707021.0, 'CHANNEL BED FILL LITE', '', 'CBF Light', '', '', 'Harrington, DE', ''],
]]);
const cbf = Engine.processGrid(cbfGrid, { lists: { aggregate: cbfChart } }).items[0];
assert.strictEqual(cbf.family, 'aggregate');
assert.strictEqual(cbf.action, 'approved');
assert.ok(/Diamond Materials/i.test(cbf.srcName));
assert.ok(/Principio/i.test(cbf.srcName));
assert.ok(/Approved for use/.test(cbf.actionNotes));
assert.ok(!/conforms to the requirements/i.test(cbf.actionNotes));

// Alternate source is looked up on the chart (York Building Products / Port Deposit = York-Principio)
const whitehallChart = {
  kind: 'aggregate',
  entries: [
    { name: 'Eastbay Aggregate', source: 'York', loc: '', material: 'GABC', status: 'approved', testDate: '2026-07-27' },
    { name: 'Diamond Materials - Harrington', source: 'York Principio', loc: 'Harrington', material: 'GABC', status: 'approved', testDate: '2026-07-31' },
    { name: 'Diamond Materials - Harrington', source: 'York Principio', loc: 'Harrington', material: '#57', status: 'rejected', testDate: '' },
    { name: 'York - Principio', source: '', loc: 'Principio', material: 'GABC', status: 'approved', testDate: '2026-06-29' },
    { name: 'Martin Marietta', source: '', loc: '', material: 'GABC', status: 'approved', testDate: '2026-06-15' },
  ],
};
const whitehallGabc = Engine.processGrid(gridFromObjects(FREY_HEADER, [[
  ['', 301003.0, 'GABC • Granite Gneiss', '', 'GABC', '', '', 'Martin Marietta', 'York Building Products'],
  ['', '', '', '', '', '', '', 'North East, MD', 'Port Deposit, MD'],
]]), { lists: { aggregate: whitehallChart } }).items.find(i => i.family === 'aggregate');
assert.strictEqual(whitehallGabc.action, 'approved');
assert.strictEqual(whitehallGabc.rule, 'aggregate-chart');
assert.ok(/York Building Products/i.test(whitehallGabc.altName));
assert.strictEqual(whitehallGabc.altTestDate, '2026-06-29');
assert.ok(/Approved for use/.test(whitehallGabc.actionNotes.replace(/\n/g, ' ')));
assert.ok(!/Must be tested/i.test(whitehallGabc.actionNotes));
assert.ok(/tested 6\.29\.26/.test(Engine.sourceLine(whitehallGabc)));

// Storm conveyance / 601012 is RCP, not HDPE
const rcpPipe = Engine.processGrid(gridFromObjects(FREY_HEADER, [[
  ['', 601012.0, 'STORM CONVEYANCE PIPE', '', 'RCP 18"', 'Heritage Concrete', '', 'Middletown, DE', ''],
]])).items[0];
assert.strictEqual(rcpPipe.family, 'rcp');
assert.ok(/state inspected stock/i.test(rcpPipe.actionNotes));
assert.ok(!/AASHTO M294/i.test(rcpPipe.actionNotes));

// Truncated striping rows recover Ennis Flint and group
const stripePdf = Engine.processGrid(gridFromObjects(FREY_HEADER, [[
  ['', 817560.0, 'STRAIGHT', '', 'Arrow Thermoplastic Thermoplastic Striping', '', '', '4161 Piedmont Pkwy Greensboro, NC', ''],
], [
  ['', 861001.0, 'PERMANENT PAVEMENT STRIPING, EPOXY RESIN, 6"', '', 'EPOXY RESIN PAINT 4161 PIEDMONT PKWY', '', '', 'Greensboro, NC', ''],
]]));
const stripeItems = stripePdf.items.filter(i => i.family === 'striping');
assert.ok(stripeItems.length >= 1);
assert.ok(stripeItems.every(i => /Ennis Flint/i.test(i.srcName)));
assert.ok(stripeItems.some(i => /choose a product from the APL/i.test(i.actionNotes)));
assert.ok(stripeItems.some(i => (i.letterSpecs || i.specs).includes('#817560') && (i.letterSpecs || i.specs).includes('#861001'))
  || stripeItems.length === 2);

const mixedCc = [
  { name: 'Hunter McCabe', org: 'DelDOT' },
  { name: 'James Smith', org: 'DelDOT' },
  { name: 'Jason Denson', org: 'DelDOT' },
];
const keptCc = DATA.filterRetiredCcPeople(mixedCc, ['hunter mccabe', 'Jason Denson']);
assert.strictEqual(keptCc.length, 1);
assert.strictEqual(keptCc[0].name, 'James Smith');
assert.strictEqual(DATA.filterRetiredCcPeople(mixedCc, []).length, 3);
assert.strictEqual(DATA.filterRetiredCcPeople(['Hunter McCabe', 'Ray Glanden'], ['HUNTER MCCABE']).join(), 'Ray Glanden');
console.log('Retired CC names are skipped on harvest / library load');

const prevJob = {
  contract: '301003999',
  title: 'Old Pit Job',
  contractor: 'Yesterday Paving',
  contractorAddr: '1 Old Rd\nDover, DE',
  contact: 'Jane Doe',
  district: 'South',
  docKind: 'contract',
};
const freyLike = { title: 'Bobby Frey Entrance(s)', contractor: 'Terra Firma of Delmarva, Inc.', contractorAddr: '38156 Brittingham Rd., Delmar, DE 19940', contact: 'James Smith', district: 'South' };
const merged = Engine.overlayProject(prevJob, freyLike, false);
assert.strictEqual(merged.contract, '301003999', 'old merge kept prior application # when the form left it blank');
const replaced = Engine.overlayProject(prevJob, freyLike, true);
assert.strictEqual(replaced.contract, '', 'new letter clears a blank application # instead of keeping the last job');
assert.strictEqual(replaced.title, 'Bobby Frey Entrance(s)');
assert.strictEqual(replaced.contractor, 'Terra Firma of Delmarva, Inc.');
assert.strictEqual(replaced.contact, 'James Smith');
assert.strictEqual(replaced.docKind, 'application');
assert.strictEqual(replaced.date, Engine.todayISO(), 'new letter uses today, not a date from a previous job or SOS form');
const keptDate = Engine.overlayProject({ date: '2020-01-01', title: 'Old' }, { date: '2026-07-06', title: 'New' }, false);
assert.strictEqual(keptDate.date, '2020-01-01', 're-import preview does not rewrite the open letter date');
const blankForm = Engine.overlayProject(prevJob, {}, true);
assert.strictEqual(blankForm.contractor, '');
assert.strictEqual(blankForm.contact, '');
assert.strictEqual(blankForm.title, '');
console.log('New-letter header replace clears the previous job when the form is blank');

function compactCover(extra) {
  extra = extra || {};
  return [
    ['DELAWARE DEPARTMENT OF TRANSPORTATION', '', '', 'Contract:', extra.contract || 'T202606103'],
    ['', '', '', 'Title of Contract:', extra.title || 'Pave & Rehab, North I, SR 1, 2026'],
    ['', '', '', 'CONTRACTOR:', extra.contractor || 'Greggo & Ferrara, Inc.'],
    ['SOURCE OF SUPPLY MOT', '', '', 'ADDRESS:', '4048 New Castle Ave., New Castle, DE 19720'],
    ['District:', extra.district || 'North Group I', '', 'DELDOT CONTACT:', extra.contact || 'Brian Locke'],
    ['Spec', 'Item Description', 'Material', 'Supplier', 'Manufacturer', 'Alternate Manufacturer'],
    ['#', '', '', '', 'Address & Contact', 'Address & Contact'],
  ];
}

const compactSizes = compactCover().concat([
  ['601011', '15" RCP CL III', '', 'Rinker Materials', 'Middletown, DE', ''],
  ['601012', '18" RCP CL III', '', 'Rinker Materials', 'Middletown, DE', ''],
  ['601014', '24" RCP CL III', '', 'Rinker Materials', 'Middletown, DE', ''],
  ['601016', '30" RCP CL III', '', 'Rinker Materials', 'Middletown, DE', ''],
  ['601142', '18" RCP FES', '', 'Rinker Materials', 'Middletown, DE', ''],
  ['601146', '30" RCP FES', '', 'Rinker Materials', 'Middletown, DE', ''],
  ['602010', 'Drainage Inlet 72 x 48', '', 'Gillespie Precast', 'Chestertown, MD', ''],
  ['602035', 'Manhole 48" Diameter', '', 'Gillespie Precast', 'Chestertown, MD', ''],
  ['701012', 'PCC Curb, Type 1-6', 'Class B', 'Heritage Concrete', 'Cheswold, DE', 'Bear Materials'],
  ['705001', 'PCC Sidewalk, 4"', 'Class B', 'Heritage Concrete', 'Cheswold, DE', 'Bear Materials'],
]);
const compactSized = Engine.processGrid(compactSizes);
const compactRcp = compactSized.items.find(i => i.family === 'rcp');
const compactRcpLines = Engine.letterSectionLines(compactRcp).join('\n');
assert.ok(/#601014 - REINFORCED CONCRETE PIPE, 24", CLASS III/.test(compactRcpLines), compactRcpLines);
assert.ok(/#601142 - REINFORCED CONCRETE FLARED END SECTION, 18"/.test(compactRcpLines), compactRcpLines);
assert.ok(!/#601014 - REINFORCED CONCRETE PIPE, 15"/.test(compactRcpLines));
const compactPcc = compactSized.items.find(i => i.family === 'pcc');
const compactPccLines = Engine.letterSectionLines(compactPcc).join('\n');
assert.ok(/#701012 - PCC CURB, TYPE 1-6/.test(compactPccLines), compactPccLines);
assert.ok(!/#701012 - PCC SIDEWALK/.test(compactPccLines));
assert.ok(/#602010 - DRAINAGE INLET, 72" X 48"/.test(Engine.letterSectionLines(compactSized.items.find(i => i.family === 'precast')).join('\n')));
assert.ok(/#602035 - MANHOLE, ROUND/.test(Engine.letterSectionLines(compactSized.items.find(i => i.family === 'precast')).join('\n')));

const compactHma = compactCover().concat([
  ['', 'SUPERPAVE TYPE C, PG 64-22', 'SUPERPAVE TYPE C, PG 64-22', 'CONTRACTORS', 'CONTRACTORS MATERIALS', ''],
  [401036, 'WEDGE', 'WEDGE', 'MATERIALS', '4048 NEW CASTLE AVE', ''],
  ['', '', '', '', 'NEW CASTLE, DE 19720', ''],
  ['', '', '', '', '302-658-5241', ''],
  ['', 'RECYCLED ASPHALT PAVEMENT', 'RECYCLED ASPHALT PAVEMENT', 'CONTRACTORS', 'CONTRACTORS MATERIALS', ''],
  [401755, 'MILLINGS FOR ROADWAY EDGE', 'MILLINGS FOR ROADWAY EDGE', 'MATERIALS', '4048 NEW CASTLE AVE', ''],
  ['', '', '', '', 'NEW CASTLE, DE 19720', ''],
  ['', '', '', '', '302-658-5241', ''],
]);
assert.ok(Engine.findHeaderRow(compactHma) >= 0, 'compact Spec / Item Description header');
const compactOne = Engine.processGrid(compactHma);
assert.strictEqual(compactOne.project.contract, 'T2026-061-03');
assert.strictEqual(compactOne.project.docKind, 'contract');
assert.ok(/Greggo/.test(compactOne.project.contractor));
const wedge = compactOne.items.find(i => (i.specs || []).includes('#401036'));
const millings = compactOne.items.find(i => (i.specs || []).includes('#401755'));
assert.ok(wedge, 'Superpave wedge parsed');
assert.strictEqual(wedge.family, 'hma-mix');
assert.ok(/CONTRACTORS MATERIALS/i.test(wedge.srcName));
assert.ok(millings, 'RAP millings parsed');
assert.strictEqual(millings.family, 'aggregate');
assert.strictEqual(millings.action, 'test');

// Compact GABC + RAP + topsoil share one plant block with no blank row.
// Issued Kirkwood letters keep three SECTIONs (crushed concrete vs RAP vs visual topsoil).
const kirkwoodStone = compactCover({
  contract: 'T202506101',
  title: 'Pave & Rehab, New Castle 5A, Kirkwood Highway',
  contractor: 'Greggo & Ferrara, Inc.',
  district: 'North',
}).concat([
  [301001, 'GABC', 'GABC - Crushed Concrete', 'Contractor Materials', 'Contractor Materials', 'Diamond Materials'],
  [301008, 'Recycled Asphalt Pavement', 'Millings', 'Wilmington Crusher Plant', '925 South Heald Street', '924 S. Heald Street'],
  [908004, 'Topsoil 6"', 'Topsoil', '', 'Wilmington, DE 19801', 'Wilmington, DE 19801'],
  ['', '', '', '', '302-654-5241', '302-658-6524'],
]);
const kirkwood = Engine.processGrid(kirkwoodStone, { filename: 'SOS T202506101 Kirkwood Highway.xls' });
const kirkwoodGabc = kirkwood.items.find(i => (i.letterSpecs || i.specs).join() === '#301001');
const kirkwoodRap = kirkwood.items.find(i => (i.letterSpecs || i.specs).join() === '#301008');
const kirkwoodTop = kirkwood.items.find(i => (i.letterSpecs || i.specs).join() === '#908004');
assert.ok(kirkwoodGabc, 'GABC #301001 is its own letter item');
assert.ok(kirkwoodRap, 'RAP #301008 is its own letter item');
assert.ok(kirkwoodTop, 'topsoil #908004 is its own letter item');
assert.strictEqual(kirkwoodGabc.family, 'aggregate');
assert.ok(/CRUSHED CONCRETE/i.test(kirkwoodGabc.desc), kirkwoodGabc.desc);
assert.ok(!/#301008|#908004/.test((kirkwoodGabc.letterSpecs || kirkwoodGabc.specs).join()), 'GABC is not lumped with RAP/topsoil');
assert.strictEqual(kirkwoodRap.family, 'aggregate');
assert.ok(/RECYCLED ASPHALT PAVEMENT/i.test(kirkwoodRap.desc), kirkwoodRap.desc);
assert.ok(!/CRUSHED CONCRETE/i.test(kirkwoodRap.desc));
assert.strictEqual(kirkwoodTop.family, 'topsoil');
assert.strictEqual(kirkwoodTop.action, 'visual');
assert.ok(/visual inspection/i.test(kirkwoodTop.actionNotes));
[kirkwoodGabc, kirkwoodRap, kirkwoodTop].forEach((it) => {
  assert.ok(/Contractor Materials/i.test(it.srcName), it.srcName);
  assert.ok(/Wilmington/i.test(it.srcLoc), it.srcLoc);
  assert.ok(/Diamond Materials/i.test(it.altName), it.altName);
  assert.ok(/Heald/i.test(Engine.sourceLine(it)), Engine.sourceLine(it));
});
const kirkwoodLetter = Engine.letterPlainText(kirkwood.project, kirkwood.items, kirkwood.cc);
assert.ok(/SECTION: #301001 - GABC \(CRUSHED CONCRETE\)/.test(kirkwoodLetter), kirkwoodLetter);
assert.ok(/SECTION: #301008 - RECYCLED ASPHALT PAVEMENT/.test(kirkwoodLetter), kirkwoodLetter);
assert.ok(/SECTION: #908004 - TOPSOIL, 6" DEPTH/.test(kirkwoodLetter), kirkwoodLetter);
const gabcHeading = (kirkwoodLetter.split('SECTION:').find(s => s.includes('#301001')) || '').split('\n')[0];
assert.ok(!/#301008|#908004/.test(gabcHeading), gabcHeading);

const kirkwoodAggChart = {
  kind: 'aggregate',
  format: 'approved-source-list',
  entries: [
    { name: 'Contractors Materials', source: 'Martin Marietta', loc: '', material: 'GABC', status: 'approved', testDate: '2026-07-14' },
    { name: 'Contractors Materials', source: 'Martin Marietta', loc: '', material: 'Crushed Concrete', status: 'approved', testDate: '2026-07-14' },
    { name: 'Contractors Materials', source: 'Martin Marietta', loc: '', material: 'Millings', status: 'approved', testDate: '2026-08-11' },
    { name: 'Diamond Materials - Wilmington', source: '', loc: 'Wilmington', material: 'Crushed Concrete', status: 'approved', testDate: '2026-07-31' },
    { name: 'Diamond Materials - Wilmington', source: '', loc: 'Wilmington', material: 'Millings', status: 'approved', testDate: '2026-07-14' },
    { name: 'Diamond Materials - Harrington', source: 'York Principio', loc: 'Harrington', material: 'GABC', status: 'approved', testDate: '2026-07-31' },
  ],
};
const kirkwoodDated = Engine.processGrid(kirkwoodStone, {
  filename: 'SOS T202506101 Kirkwood Highway.xls',
  lists: { aggregate: kirkwoodAggChart },
});
const datedGabc = kirkwoodDated.items.find(i => (i.letterSpecs || i.specs).join() === '#301001');
const datedRap = kirkwoodDated.items.find(i => (i.letterSpecs || i.specs).join() === '#301008');
assert.strictEqual(datedGabc.testDate, '2026-07-14', 'Kirkwood crushed concrete uses Contractors Materials, not Diamond 7/31');
assert.strictEqual(datedGabc.altTestDate, '2026-07-31');
assert.strictEqual(datedRap.testDate, '2026-08-11', 'Kirkwood RAP uses the Millings column');
assert.strictEqual(datedRap.altTestDate, '2026-07-14');
assert.ok(/Approved for use/.test(datedGabc.actionNotes));
assert.ok(/Approved for use/.test(datedRap.actionNotes));
assert.ok(!/Contractor Materials Approved/i.test(datedGabc.actionNotes), datedGabc.actionNotes);
assert.ok(!/7\.31\.26/.test(Engine.sourceLine(datedRap)), Engine.sourceLine(datedRap));
assert.strictEqual(Engine.cleanContractNo('T202506101'), 'T2025-061-01');

// Superpave Type C + Type B in one compact plant block still group.
const compactSuperpavePair = compactCover().concat([
  [401005, 'Superpave Type C, PG 64-22', 'Superpave Type C', 'River Asphalt, LLC', 'River Asphalt, LLC', 'River Asphalt, LLC'],
  [401014, 'Superpave Type B, PG 64-22', 'Superpave Type B', '', '30548 Thorogoods Rd.', '36393 Sussex Highway'],
  ['', '', '', '', 'Dagsboro, DE 19939', 'Delmar, DE 19940'],
  ['', '', '', '', '302-934-0881', '302-907-6400'],
]);
const compactPair = Engine.processGrid(compactSuperpavePair);
const compactHmaPair = compactPair.items.filter(i => i.family === 'hma-mix');
assert.strictEqual(compactHmaPair.length, 1, 'Type C + Type B from one plant stay one SECTION');
assert.ok(compactHmaPair[0].specs.includes('#401005') && compactHmaPair[0].specs.includes('#401014'));

const liveKirkwood = '/home/ubuntu/.cursor/projects/workspace/uploads/SOS_T202506101_Kirkwood_Highway_6-24-26_Corrected_2bb6.xls';
if (fs.existsSync(liveKirkwood)) {
  let XLSX;
  try { XLSX = require('xlsx'); } catch (e) { XLSX = null; }
  if (XLSX) {
    const wb = XLSX.readFile(liveKirkwood);
    const live = Engine.processWorkbook(wb, {
      filename: path.basename(liveKirkwood),
      lists: fs.existsSync('/home/ubuntu/.cursor/projects/workspace/uploads/Approved_Source_List_770b.xlsx')
        ? { aggregate: require('./sos-lists.js').parseAggregateChartGrid(
          require('./fetch-lists.js').readSpreadsheetGrid(
            '/home/ubuntu/.cursor/projects/workspace/uploads/Approved_Source_List_770b.xlsx',
            { preferSheet: 'Reference Summary' }
          ),
          { filename: 'Approved Source List.xlsx' }
        ) }
        : {},
    });
    const gabc = live.items.find(i => (i.letterSpecs || i.specs).join() === '#301001');
    const rap = live.items.find(i => (i.letterSpecs || i.specs).join() === '#301008');
    const top = live.items.find(i => (i.letterSpecs || i.specs).join() === '#908004');
    assert.ok(gabc && rap && top, 'live Kirkwood xls splits GABC / RAP / topsoil');
    assert.ok(/CRUSHED CONCRETE/i.test(gabc.desc));
    assert.strictEqual(top.family, 'topsoil');
    assert.strictEqual(top.action, 'visual');
    assert.strictEqual(live.project.contract, 'T2025-061-01');
    assert.ok(/4048 NEW CASTLE AVE/i.test(live.project.contractorAddr), live.project.contractorAddr);
    assert.ok(/New Castle,\s*DE/i.test(live.project.contractorAddr), live.project.contractorAddr);
    assert.ok(!/AVE NEW$/im.test(live.project.contractorAddr));
    const bear = live.items.find(i => i.family === 'pcc');
    assert.ok(bear, 'Class B inlets/curb/sidewalk/gas/sanitary are one PCC section');
    const bearSpecs = (bear.letterSpecs || bear.specs || []).join(' ');
    assert.ok(/#602130/.test(bearSpecs) && /#701013/.test(bearSpecs) && /#705001/.test(bearSpecs));
    assert.ok(/#710503/.test(bearSpecs) && /#711500/.test(bearSpecs));
    assert.ok((bear.hiddenSpecs || []).includes('#701016'), 'hidden IPCC curb #701016 still on the letter');
    assert.ok((bear.hiddenSpecs || []).includes('#701023'));
    assert.ok((bear.hiddenSpecs || []).includes('#705002'), 'hidden 6" sidewalk');
    assert.ok((bear.hiddenSpecs || []).includes('#705011'), 'hidden ped connection special');
    const hiddenFlag = (bear.reviewFlags || []).find(f => /hidden on the contractor spreadsheet/i.test(f));
    assert.ok(hiddenFlag && /#701016/.test(hiddenFlag) && /#705011/.test(hiddenFlag), hiddenFlag);
    assert.ok(/Bear Materials/i.test(bear.srcName), bear.srcName);
    assert.ok(/Newark/i.test(bear.srcLoc), bear.srcLoc);
    assert.ok(/New Castle/i.test(bear.altLoc), bear.altLoc);
    assert.ok(/admixture/i.test(bear.actionNotes));
    assert.ok(!live.items.some(i => i.family === 'utility'), 'gas/sanitary are not leftover utility sections');
    assert.ok(!/hanover/i.test(Engine.sourceLine(bear)), Engine.sourceLine(bear));
    const curing = live.items.find(i => i.family === 'curing');
    const expansion = live.items.find(i => i.family === 'expansion');
    assert.ok(curing, '1600-White curing is its own CONCRETE ITEMS section');
    assert.ok(/WR Meadows/i.test(curing.srcName), curing.srcName);
    assert.ok(/Hampshire/i.test(curing.srcLoc), curing.srcLoc);
    assert.ok(/1600/i.test((curing.subItems || []).join(' ')), (curing.subItems || []).join(' '));
    assert.ok(expansion, 'Reflex expansion is not merged into curing');
    assert.ok(/flex/i.test(expansion.srcName), expansion.srcName);
    assert.ok(/Utica/i.test(expansion.srcLoc), expansion.srcLoc);
    assert.ok(!/meadows/i.test(expansion.srcName));
    const dws = live.items.find(i => (i.letterSpecs || i.specs || []).includes('#705013') || /truncated dome/i.test(i.desc || ''));
    assert.ok(dws);
    assert.ok(/Hanover/i.test(dws.srcName));
    assert.strictEqual((dws.actionNotes.match(/prodlists/gi) || []).length, 1, dws.actionNotes);
    if (gabc.testDate) {
      assert.strictEqual(gabc.testDate, '2026-07-14');
      assert.strictEqual(rap.testDate, '2026-08-11');
      assert.ok(/924/i.test(Engine.sourceLine(gabc)), Engine.sourceLine(gabc));
      assert.ok(!/Contractor Materials Approved/i.test(gabc.actionNotes), gabc.actionNotes);
    }
    console.log('live Kirkwood items:', live.items.map(i => `${(i.letterSpecs||i.specs).join('/')} ${i.family} ${i.action} ${i.srcName}`).join(' | '));
  }
}

const tieSheet = compactCover().concat([
  ['', '', '', '', 'RE-STEEL SUPPLY, CO., INC', ''],
  [503002, "PATCHING PCC PAV'T, 15' TO 100'", '#5 TIE BARS', 'RE-STEEL SUPPLY', '2000 INDUSTRIAL HIGHWAY', ''],
  ['', 'TYPE B', '', 'COMPANY, INC.', 'EDDYSTONE, PA 19022', ''],
  ['', '', '', '', '(800) 876-8216', ''],
]);
const pccSheet = compactCover().concat([
  ['', '', '', 'Bear Concrete', 'Bear Concrete Co.', ''],
  [503001, "PATCHING PCC PAV'T, 6' TO 15'", 'ROAD PATCH (NC-1)', 'Company', '595 Walther Rd.', ''],
  ['', 'TYPE A', '', '', 'Newark, DE 19702', ''],
  ['', '', '', '', '302-834-3333', ''],
]);
const multi = Engine.processSosSheets([
  { name: 'SOS CM', rows: compactHma },
  { name: 'SOS TIE-BAR', rows: tieSheet },
  { name: 'SOS Concrete', rows: pccSheet },
]);
assert.ok(multi.warnings.some(w => /3 SOS tabs/.test(w)));
assert.ok(multi.items.some(i => i.family === 'hardware' && (i.specs || []).includes('#503002')));
assert.ok(multi.items.some(i => i.family === 'pcc' && (i.specs || []).includes('#503001')));
assert.ok(multi.items.some(i => (i.specs || []).includes('#401036')));
assert.ok(multi.items.some(i => (i.specs || []).includes('#401755')));
assert.ok(/Re-Steel|RE-STEEL/i.test(multi.items.find(i => i.family === 'hardware').srcName));
console.log('Compact Spec/Item Description SOS list (multi-tab) parses');

assert.strictEqual(Engine.cleanContractNo('Application 642721600'), '642721600');
assert.strictEqual(Engine.detectDocKind('Application 642721600'), 'application');
assert.strictEqual(Engine.detectDocKind('642721600'), 'application');

function easternRow() {
  const row = Array(7).fill('');
  for (let i = 0; i < arguments.length; i++) {
    if (arguments[i] !== undefined && arguments[i] !== null) row[i] = arguments[i];
  }
  return row;
}

const easternTypoHeader = [
  easternRow('Specfication #', '', 'Item Description', 'Material', ' Supplier', 'Manufacturer', 'Alternate Manufacturer'),
  easternRow('', '', '', '', '', 'Address & Contact', 'Address & Contact'),
];
assert.ok(Engine.findHeaderRow(easternTypoHeader) === 0, 'Specfication # typo is still an item header');

const easternGrid = [
  easternRow('', '', '', '', 'Agreement /Permit/Contract No:', 'Application 642721600'),
  easternRow('', '', '', '', 'Title of Contract:', '2229 DuPont Parkway'),
  easternRow('Source of Supply'),
  easternRow('Materials & Research', '', '', 'Contractor Email: tgleason@eastern-states.net', '', 'Contractor: Eastern States Construction Service, Inc'),
  easternRow('', '', '', '', '', 'Address: 702 First State Blvd., Wilm, DE 19804'),
  easternRow('Delaware Department of Transportation', '', '', '', '', 'Sub-Contractor: N/A'),
  easternRow('', '', '', '', '', 'Date: 6/18/26'),
  easternRow('', 'District: Canal'),
  easternRow('', '', '', '', '', 'DelDOT Contact: Raymond Brittingham'),
  easternRow(),
  easternRow('Specfication #', '', 'Item Description', 'Material', ' Supplier', 'Manufacturer', 'Alternate Manufacturer'),
  easternRow('', '', '', '', '', 'Address & Contact', 'Address & Contact'),
  easternRow('', ' ', '', '', 'Martin Marietta', '233 Stevenson Rd.', 'Allan Myers, Inc.'),
  easternRow('', 301001, 'GABC, Type B', 'Crushed Stone', '', 'North East, MD 21901', '896 Elk Mills Road'),
  easternRow('', 707001, 'Rip Rap R-4', '', '', '410-287-8177', 'Elk Mills, MD 21291'),
  easternRow('', '', '', '', '', '', '410-392-6061'),
  easternRow('', ' ', '', '', 'Martin Marietta', '233 Stevenson Rd.'),
  easternRow('', 301003, 'GABC, Type B', 'Crushed Stone', '', 'North East, MD 21901'),
  easternRow('', 'Alternate', '', '', '', '410-287-8177'),
  easternRow(),
  easternRow('', ' ', '', '', 'Greggo & Ferrara, Inc', 'Greggo & Ferrara, Inc'),
  easternRow('', 302005, 'GABC, Type B', 'Crushed Concrete', 'Newark Crusher Plant', '4048 New Castle Ave'),
  easternRow('', '', '', '', '', 'New Castle, DE 19720'),
  easternRow('', '', '', '', '', '302-654-5241'),
  easternRow('', '', '', '', '', 'Bear Materials, LLC', 'Bear Materials, LLC'),
  easternRow('', 701023, 'PCC Curb & Gutter Type 3-8', 'Class B', 'Bear Materials, LLC', '600 Industrial Drive', 'Newark Plant'),
  easternRow('', 701032, 'Curb / Sidewalk Opening', 'Class B'),
  easternRow('', '', '', '', '', 'Middletown, DE 19709', '595 Walther Rd'),
  easternRow('', '', '', '', '', '(302) 376-5280', '302-834-3333'),
  easternRow('', 401005, 'Superpave Type C', 'PG 64-22 160 Gyrations', 'Contractors Materials LLC', '', 'Allan Myers, Inc.'),
  easternRow('', 401014, 'Superpave Type B', 'PG 64-22 160 Gyrations', 'Heald Street Plant', '4048 New Castle Ave', '896 Elk Mills Road'),
  easternRow('', '', '', '', '', 'New Castle, DE 19720', 'Elk Mills, MD 21291'),
  easternRow('', '', '', '', '', '302-654-5241', '410-392-6061'),
  easternRow('', '', 'Permanent Pavement Striping,', 'AASHTO M-247 TY 1 80% ROUND', 'Potters Industries', 'Potters Industries'),
  easternRow('', 817002, 'Symbol/Legend,', 'Spherical Glass Beads', 'PO BOX 840', 'PO BOX 840'),
  easternRow('', '', 'Alkyd-Thermoplastic', '', 'Valley Forge, PA', 'Valley Forge, PA'),
  easternRow('', '', '', '', '610-651-4200', '610-651-4200'),
  easternRow(),
  easternRow('', 817005, 'Permanent Pavement Striping,', 'Ennis: 884490 (White)', 'PPG/Ennis Flint, Inc.', 'PPG/Ennis Flint, Inc.'),
  easternRow('', '', 'Symbol/Legend,', 'Ennis: 884685 (Yellow)', '4400 Vawter Ave', '4400 Vawter Ave'),
  easternRow('', '', 'Alkyd-Thermoplastic', '', 'Richmond, VA 23222', 'Richmond, VA 23222'),
  easternRow('', '', '', '', '(800)331-8118', '(800)331-8118'),
  easternRow(),
  easternRow('', 817042, 'Permanent Pavement', 'Ennis: HPS-3 (White)', 'PPG/Ennis Flint, Inc.', 'PPG/Ennis Flint, Inc.'),
  easternRow('', '', 'Striping, Epoxy Resin ', 'Ennis: HPS-3 (Yellow)', '4400 Vawter Ave', '4400 Vawter Ave'),
  easternRow('', '', 'Paint, White/Yellow, 6"', '', 'Richmond, VA 23222', 'Richmond, VA 23222'),
  easternRow('', '', '', '', '(800)331-8118', '(800)331-8118'),
];

const eastern = Engine.processGrid(easternGrid, { filename: 'DelDot SOS Application #642721600.xlsx' });
assert.ok(!eastern.warnings.some(w => /Could not find Specification/i.test(w)), eastern.warnings.join(' | '));
assert.strictEqual(eastern.project.contract, '642721600');
assert.strictEqual(eastern.project.docKind, 'application');
assert.strictEqual(eastern.project.submittedDate, '2026-06-18');
assert.strictEqual(eastern.project.date, Engine.todayISO());
assert.ok(/Eastern States Construction/i.test(eastern.project.contractor));
assert.ok(!/@/.test(eastern.project.contractor), 'contractor name is not the email');
assert.strictEqual(eastern.project.title, '2229 DuPont Parkway');
assert.ok(/Canal/i.test(eastern.project.district));
assert.ok(/Raymond Brittingham/i.test(eastern.project.contact));

const easternGabc = eastern.items.find(i => (i.letterSpecs || i.specs).includes('#301001'));
assert.ok(easternGabc, 'GABC #301001 parsed');
assert.strictEqual(easternGabc.family, 'aggregate');
assert.ok(/Martin Marietta/i.test(easternGabc.srcName));

const easternRip = eastern.items.find(i => (i.letterSpecs || i.specs).includes('#707001'));
assert.ok(easternRip, 'Rip rap #707001 is its own item');
assert.strictEqual(easternRip.family, 'riprap');
assert.ok(/visual inspection/i.test(easternRip.actionNotes));
assert.ok(/Martin Marietta/i.test(easternRip.srcName), 'riprap keeps Martin Marietta from the shared contact block');
assert.ok(!(easternGabc.letterSpecs || easternGabc.specs).includes('#707001'), 'GABC is not merged with riprap');
assert.ok(!/, 233 Stevenson Rd/i.test(easternRip.srcAddr || ''), 'riprap address is not duplicated from inherit');

const easternAltGabc = eastern.items.find(i => (i.letterSpecs || i.specs).includes('#301003'));
assert.ok(easternAltGabc, 'GABC alternate #301003 parsed');
assert.ok(/Martin Marietta/i.test(easternAltGabc.srcName));
assert.ok(!(easternRip.letterSpecs || easternRip.specs).includes('#301003'));

const easternCrush = eastern.items.find(i => (i.letterSpecs || i.specs).includes('#302005'));
assert.ok(easternCrush, 'crushed concrete #302005 parsed');
assert.strictEqual(easternCrush.family, 'aggregate');
assert.ok(/Greggo/i.test(easternCrush.srcName));
assert.ok(/CRUSHED CONCRETE/i.test(easternCrush.desc), 'GABC Type B + crushed concrete is not chart GABC / #57 stone');
assert.ok(!/57 STONE/i.test(easternCrush.desc));

const easternPcc = eastern.items.find(i => i.family === 'pcc');
assert.ok(easternPcc && easternPcc.specs.includes('#701023') && easternPcc.specs.includes('#701032'));
assert.ok(/Bear Materials/i.test(easternPcc.srcName));

const easternHma = eastern.items.find(i => i.family === 'hma-mix');
assert.ok(easternHma && easternHma.specs.includes('#401005') && easternHma.specs.includes('#401014'));

const easternBeads = eastern.items.find(i => (i.letterSpecs || i.specs).includes('#817002'));
assert.ok(easternBeads, 'glass beads #817002 parsed');
assert.ok(/Potters/i.test(easternBeads.srcName));

const easternStripe = eastern.items.filter(i => i.family === 'striping' && (i.letterSpecs || i.specs).some(s => /#817005|#817042/.test(s)));
assert.ok(easternStripe.length >= 1);
assert.ok(easternStripe.some(i => /Ennis Flint/i.test(i.srcName)));
console.log('Eastern States Application 642721600 (Specfication # typo) parses');

const liveSnap = require('./lists/apl-snapshot.json');
assert.ok(liveSnap.tack.entries.length >= 10, 'bundled tack APL snapshot');
assert.strictEqual(require('./sos-lists.js').lookupTack(liveSnap.tack, 'Russell Standard', 'Baltimore MD', 'CRS-1').listed, true);
assert.ok(require('./sos-lists.js').lookupTack(liveSnap.tack, 'Russell Standard', 'Chambersburg PA', 'CRS-1H Tack Coat').gradeMismatch);

const harvestedLang = {
  kind: 'issued-language',
  letters: 12,
  bySpec: {
    '#202888': {
      action: 'Approved: Conduct a visual inspection to ensure specification compliance.',
      intent: 'visual',
      uses: 8,
    },
    '#301001': {
      action: 'Approved for use.',
      intent: 'approved',
      uses: 40,
    },
  },
  byFamily: {},
};
const unknownGrid = gridFromObjects(FREY_HEADER, [[
  ['', 202888.0, 'Inclinometers', '', 'Inclinometers', 'Acme Instruments', '', 'Dover, DE', ''],
]]);
const unknownHarvested = Engine.processGrid(unknownGrid, { lists: { language: harvestedLang } }).items[0];
assert.strictEqual(unknownHarvested.family, 'other');
assert.strictEqual(unknownHarvested.action, 'visual', 'issued-letter language fills unknown specs');
assert.ok(/visual inspection/i.test(unknownHarvested.actionNotes));
assert.strictEqual(unknownHarvested.rule, 'harvested-language');

const testChart = {
  kind: 'aggregate',
  entries: [{ name: 'Vulcan Materials', loc: 'Salisbury MD', material: 'GABC', status: 'test' }],
};
const harvestCannotApprove = Engine.processGrid(gridFromObjects(FREY_HEADER, [[
  ['', 301001.0, 'GABC', '', 'GABC', 'Vulcan Materials', '', 'Salisbury, MD', ''],
]]), { lists: { aggregate: testChart, language: harvestedLang } }).items.find(i => i.family === 'aggregate');
assert.strictEqual(harvestCannotApprove.action, 'test', 'chart must-be-tested is not overwritten by harvested Approved');
assert.ok(/Must be tested/i.test(harvestCannotApprove.actionNotes));

const overlayLang = {
  kind: 'issued-language',
  bySpec: {
    '#707001': {
      action: 'Approved: Conduct a visual inspection to ensure specification compliance. Check stone size in the field.',
      intent: 'visual',
      uses: 5,
    },
  },
  byFamily: {},
};
const ripHarvest = Engine.processGrid(gridFromObjects(FREY_HEADER, [[
  ['', 707001.0, 'Riprap', '', 'Riprap', 'Martin Marietta', '', 'North East, MD', ''],
]]), { lists: { language: overlayLang } }).items[0];
assert.strictEqual(ripHarvest.action, 'visual');
assert.ok(/Check stone size/i.test(ripHarvest.actionNotes), 'matching intent overlays more specific issued wording');

const instructionThenHeader = [
  ['If material requirements are not provided in the Standard Specifications or a Special Provision, submit all Plan sheets that contain relevant material requirements as documentation with the source of supply submission.'],
  ['Specification #', '', 'Item Description', 'Plan sheet included with', 'Material', 'Supplier', '', 'Manufacturer', 'Alternate Product', 'Alternate Manufacturer'],
  ['', '', '', 'Material Requirements?', '', '', '', 'Address & Contact', 'Material', 'Address & Contact'],
];
assert.strictEqual(Engine.findHeaderRow(instructionThenHeader), 1, 'Special Provision instruction is not the item header');
const triCols = Engine.detectItemColumns(instructionThenHeader, 1);
assert.strictEqual(triCols.alt, 9, 'Alternate Manufacturer wins over Alternate Product');
assert.strictEqual(triCols.altProduct, 8);
assert.ok(Engine.expandContactLines('Geo Tech - 1510 Newport Gap Pike, Wilmington, DE 19808 - +13023539769').includes('Geo Tech'));
assert.ok(Engine.expandContactLines('Geo Tech - 1510 Newport Gap Pike, Wilmington, DE 19808 - +13023539769').some(s => /Wilmington/i.test(s)));

const liveTriCounty = '/home/ubuntu/.cursor/projects/workspace/uploads/Tri-County_SOS_c1ee.xlsx';
if (fs.existsSync(liveTriCounty)) {
  let XLSX;
  try { XLSX = require('xlsx'); } catch (e) { XLSX = null; }
  if (XLSX) {
    const Lists = require('./sos-lists.js');
    const wb = XLSX.readFile(liveTriCounty);
    const lists = { tack: require('./lists/apl-snapshot.json').tack };
    const aslPath = '/home/ubuntu/.cursor/projects/workspace/uploads/Approved_Source_List_770b.xlsx';
    if (fs.existsSync(aslPath)) {
      const aslWb = XLSX.readFile(aslPath);
      const aslRows = XLSX.utils.sheet_to_json(aslWb.Sheets[aslWb.SheetNames[0]], { header: 1, raw: true, defval: '' });
      lists.aggregate = Lists.parseApprovedSourceListGrid(aslRows, { filename: 'Approved Source List.xlsx' });
    }
    const tri = Engine.processWorkbook(wb, { filename: 'Tri-County SOS.xlsx', lists });
    const letter = Engine.letterPlainText(tri.project, tri.items, tri.cc);
    assert.strictEqual(tri.project.contract, 'T2026-049-08');
    assert.ok(/Allan Myers/i.test(tri.project.contractor));
    assert.ok(/1262 Horsepond/i.test(tri.project.contractorAddr));
    const gabc = tri.items.find(i => (i.letterSpecs || i.specs).includes('#301001'));
    assert.ok(gabc && /CRUSHED CONCRETE/i.test(gabc.desc), gabc && gabc.desc);
    assert.ok(/Geo Tech/i.test(gabc.srcName), gabc.srcName);
    assert.ok(/Cirillo/i.test(gabc.altName), gabc.altName);
    assert.ok(/Newport Gap/i.test(Engine.sourceLine(gabc)), Engine.sourceLine(gabc));
    const hma = tri.items.find(i => i.family === 'hma-mix');
    assert.ok(hma.specs.includes('#401029') && hma.specs.includes('#401030'));
    assert.ok(/Allan Myers/i.test(hma.srcName));
    assert.ok(/Christiana/i.test(hma.altName), hma.altName);
    assert.ok(!(hma.subItems || []).some(s => /bituminous|concrete/i.test(s)));
    const tack = tri.items.find(i => i.family === 'tack');
    assert.ok(/Russell Standard/i.test(tack.srcName), tack.srcName);
    assert.ok(/Specialty Emulsions/i.test(tack.altName), tack.altName);
    assert.ok(/CNTT/i.test((tack.subItems || []).join(' ')));
    assert.ok(/EM-50-TT/i.test((tack.subItems || []).join(' ')));
    assert.ok(/Seaford/i.test(tack.actionNotes) && /not approved/i.test(tack.actionNotes), tack.actionNotes);
    assert.ok(/Specialty Emulsions/i.test(tack.actionNotes) && /on APL/i.test(tack.actionNotes), tack.actionNotes);
    const pcc = tri.items.find(i => i.family === 'pcc');
    ['#701013', '#701019', '#705001', '#705002', '#705008', '#705009'].forEach(s => {
      assert.ok(pcc.specs.includes(s), 'PCC missing ' + s + ' got ' + pcc.specs.join());
    });
    assert.ok(/Bear Materials/i.test(pcc.srcName), pcc.srcName);
    assert.ok(/Heritage/i.test(pcc.altName), pcc.altName);
    const curing = tri.items.find(i => i.family === 'curing');
    assert.ok(/ChemMasters/i.test(curing.srcName), curing.srcName);
    assert.ok(/Meadows/i.test(curing.altName), curing.altName);
    assert.ok(/[Ss]ilencure/i.test((curing.subItems || []).join(' ')));
    const expansion = tri.items.find(i => i.family === 'expansion');
    assert.ok(/J&K Foam/i.test(expansion.srcName), expansion.srcName);
    assert.ok(/Russell/i.test(expansion.altName), expansion.altName);
    const dws = tri.items.find(i => (i.letterSpecs || i.specs).includes('#705013'));
    assert.ok(/Nitterhouse/i.test(dws.srcName), dws.srcName);
    assert.ok(/Hanover/i.test(dws.altName), dws.altName);
    const seed = tri.items.find(i => (i.letterSpecs || i.specs).includes('#908016'));
    assert.ok(/Dynamic Green/i.test(seed.srcName), seed.srcName);
    const top = tri.items.find(i => i.family === 'topsoil');
    assert.ok(/Cirillo/i.test(top.srcName), top.srcName);
    assert.ok(/Middletown/i.test(top.altName), top.altName);
    const blanket = tri.items.find(i => (i.letterSpecs || i.specs).includes('#908020'));
    assert.ok(/North American Green/i.test(blanket.srcName), blanket.srcName);
    assert.ok(/American Excelsior/i.test(blanket.altName), blanket.altName);
    assert.ok(/Curlex not approved/i.test(blanket.actionNotes), blanket.actionNotes);
    assert.ok(!/White Cap/i.test(letter), letter);
    console.log('live Tri-County T2026-049-08 parses stacked PCC / packed manufacturers');
  }
}

(function contractorErrorFlags() {
  const fake = Engine.processGrid(gridFromObjects([
    { 6: 'Agreement /Permit/Contract/Application #:', 7: '0000016055' },
    { 6: 'Title of Contract:', 7: 'Fake Spec' },
    { 7: 'Contractor: Acme' },
    { 7: 'Address: 1 Main St, Dover, DE 19901' },
  ], [[
    ['', 123456.0, 'Magic Pavement', '', 'Magic', 'Acme', '', 'Dover, DE', ''],
  ]]));
  const fakeWarn = (fake.warnings || []).join(' | ');
  assert.ok(/#123456/.test(fakeWarn) && /not in the DelDOT catalog/i.test(fakeWarn), fakeWarn);
  assert.ok(fake.items.some(i => (i.specs || []).includes('#123456')), 'unknown spec still listed');
  assert.ok(fake.items.some(i => (i.reviewFlags || []).some(f => /#123456/.test(f))));
  assert.ok(Engine.isKnownItemNumber('#401005'));
  assert.ok(Engine.isKnownItemNumber('#602130'), 'adjust existing DI is a Standard Spec item');
  assert.ok(Engine.isKnownItemNumber('#710503'), 'adjust gas valve boxes is a Standard Spec item');
  assert.ok(Engine.isKnownItemNumber('#711500'), 'adjust sanitary MH is a Standard Spec item');
  assert.ok(!Engine.isKnownItemNumber('#123456'));

  const adjust = Engine.processGrid(gridFromObjects([
    { 6: 'Agreement /Permit/Contract/Application #:', 7: 'T2025-061-01' },
    { 6: 'Title of Contract:', 7: 'PAVE & REHAB, NEW CASTLE 5A, KIRKWOOD HIGHWAY' },
    { 7: 'Contractor: Greggo & Ferrara, Inc.' },
    { 7: 'Address: 4048 New Castle Ave, New Castle, DE 19720' },
    { 1: 'District: North ' },
  ], [[
    ['', 602130.0, 'Adjusting and Repairing Existing Drainage Inlet', '', 'Class B Concrete', 'Bear Concrete', '', 'Newark, DE', ''],
    ['', 710503.0, 'Adjust Gas Valve Boxes', '', 'Class B Concrete', '', '', '', ''],
    ['', 711500.0, 'Adjust and Repair Existing Sanitary Manhole', '', 'Class B Concrete', '', '', '', ''],
  ]]));
  const adjustWarn = (adjust.warnings || []).join(' | ');
  assert.ok(!/not in the DelDOT catalog/i.test(adjustWarn), adjustWarn);
  const adjustPcc = adjust.items.find(i => i.family === 'pcc');
  assert.ok(adjustPcc, 'adjust/repair Class B stays on the letter with the concrete plant');
  assert.ok((adjustPcc.specs || []).includes('#602130'));
  assert.ok((adjustPcc.specs || []).includes('#710503'));
  assert.ok((adjustPcc.specs || []).includes('#711500'));
  assert.ok(/Bear Materials/i.test(adjustPcc.srcName), adjustPcc.srcName);
  assert.ok(Engine.letterSectionLines(adjustPcc).some(l => /#602130 - ADJUSTING AND REPAIRING EXISTING DRAINAGE INLET/.test(l)));

  const mismatch = Engine.processGrid(gridFromObjects(FREY_HEADER, [[
    ['', 401005.0, 'Tack Coat', '', 'Tack Coat CRS-1', 'Tri County Materials', '', 'Russell Standard', ''],
    ['', '', '', '', '', '3800 Dover AFB Rd.', '', '3450 Asiatic Ave.', ''],
    ['', '', '', '', '', 'Dover, DE', '', 'Baltimore, MD 21226', ''],
  ]]));
  const tack = mismatch.items.find(i => i.family === 'tack');
  assert.ok(tack, 'wrong spec still treated as tack');
  assert.ok((tack.letterSpecs || []).includes('#401xxx'));
  assert.ok((tack.reviewFlags || []).some(f => /#401005/.test(f) && /Tack Coat/i.test(f)), JSON.stringify(tack.reviewFlags));

  const freyFlags = (result.items || []).flatMap(i => i.reviewFlags || []);
  assert.ok(!freyFlags.some(f => /not in the DelDOT catalog|confirm the item number/i.test(f)), freyFlags.join(' | '));
  assert.ok(!result.warnings.some(w => /not in the DelDOT catalog|confirm the item number|address looks incomplete/i.test(w)), result.warnings.join(' | '));

  const badAddr = Engine.processGrid(gridFromObjects([
    { 6: 'Agreement /Permit/Contract/Application #:', 7: '0000016055' },
    { 7: 'Contractor: Acme Paving' },
    { 7: 'Address: asdfgh' },
  ], [FREY_ITEMS[0]]));
  assert.ok((badAddr.warnings || []).some(w => /address looks incomplete/i.test(w)), badAddr.warnings.join(' | '));

  const chart = {
    kind: 'aggregate',
    entries: [
      { name: 'Vulcan Materials', loc: 'Salisbury MD', material: 'GABC', status: 'approved', testDate: '2026-03-30' },
    ],
  };
  const wrongCity = Engine.processGrid(gridFromObjects([
    { 6: 'Agreement /Permit/Contract/Application #:', 7: '0000016055' },
    { 6: 'Title of Contract:', 7: 'GABC city' },
    { 7: 'Contractor: Acme' },
    { 7: 'Address: 1 Main St, Dover, DE 19901' },
  ], [[
    ['', 301003.0, 'Graded Aggregate', '', 'GABC', 'Vulcan Materials', '', 'Seaford, DE 19973', ''],
  ]]), { lists: { aggregate: chart } });
  const g = wrongCity.items.find(i => i.family === 'aggregate');
  assert.ok(g, 'GABC row present');
  assert.ok((g.reviewFlags || []).some(f => /does not match the aggregate chart/i.test(f)), JSON.stringify(g.reviewFlags));
  assert.strictEqual(g.action, 'test');
  console.log('OK contractor error flags');
})();

(function specYearItemChecks() {
  const Lists = require('./sos-lists.js');
  const kirk = Lists.lookupAwardedContract({}, 'T2025-061-01');
  assert.ok(kirk, 'Kirkwood is on the awarded list');
  assert.strictEqual(kirk.specYear, '2025 January');
  assert.strictEqual(kirk.catalogYear, 25);
  assert.strictEqual(kirk.fap, 'ESTP-2025(08)');
  const old = Lists.lookupAwardedContract({}, 'T2012-009-03');
  assert.ok(old && old.catalogYear === 15, JSON.stringify(old));
  assert.ok(/4\/29\/19/.test(old.specYear), old.specYear);

  assert.ok(Lists.lookupSpecYearItem({}, 25, '#602130'));
  assert.ok(!Lists.lookupSpecYearItem({}, 25, '#701004'), 'valley gutter 8" moved off 701004 in spec 25');
  assert.ok(Lists.lookupSpecYearItem({}, 15, '#701004'));
  const from15 = Lists.lookupSpecYearItem({}, 15, '#701004');
  const equiv = Lists.findSpecYearEquivalent({}, 25, from15.desc);
  assert.ok(equiv && equiv.num === '701513', JSON.stringify(equiv));

  assert.ok(Engine.isKnownItemNumber('#701004', {}, { catalogYear: 15 }));
  assert.ok(!Engine.isKnownItemNumber('#701004', {}, { catalogYear: 25 }));
  assert.ok(!Engine.isKnownItemNumber('#123456', {}, { catalogYear: 25 }));

  const kirkwood = Engine.processGrid(gridFromObjects([
    { 6: 'Agreement /Permit/Contract/Application #:', 7: 'T2025-061-01' },
    { 6: 'Title of Contract:', 7: 'PAVE & REHAB, NEW CASTLE 5A, KIRKWOOD HIGHWAY' },
    { 7: 'Contractor: Greggo & Ferrara, Inc.' },
    { 7: 'Address: 4048 New Castle Ave, New Castle, DE 19720' },
    { 1: 'District: North ' },
  ], [[
    ['', 602130.0, 'Adjusting and Repairing Existing Drainage Inlet', '', 'Class B Concrete', 'Bear Concrete', '', 'Newark, DE', ''],
    ['', 701013.0, 'PCC Curb Type 1-8', '', 'Class B Concrete', 'Bear Concrete', '', 'Newark, DE', ''],
  ]]));
  assert.strictEqual(kirkwood.project.specYear, '2025 January');
  assert.strictEqual(kirkwood.project.catalogYear, 25);
  assert.ok(!/not in the/i.test((kirkwood.warnings || []).join(' | ')), (kirkwood.warnings || []).join(' | '));

  const moved = Engine.processGrid(gridFromObjects([
    { 6: 'Agreement /Permit/Contract/Application #:', 7: 'T202506101' },
    { 6: 'Title of Contract:', 7: 'Kirkwood' },
    { 7: 'Contractor: Greggo & Ferrara, Inc.' },
    { 7: 'Address: 4048 New Castle Ave, New Castle, DE 19720' },
  ], [[
    ['', 701004.0, 'PCC Valley Gutter 8"', '', 'Class B Concrete', 'Bear Concrete', '', 'Newark, DE', ''],
  ]]));
  const movedWarn = (moved.warnings || []).join(' | ');
  assert.ok(/#701004/.test(movedWarn), movedWarn);
  assert.ok(/2025 January/.test(movedWarn), movedWarn);
  assert.ok(/#701513/.test(movedWarn), movedWarn);
  assert.ok(moved.items.some(i => (i.specs || []).includes('#701004')), 'wrong-year item still listed');

  const spec2016 = Engine.processGrid(gridFromObjects([
    { 6: 'Agreement /Permit/Contract/Application #:', 7: 'T201200903' },
    { 6: 'Title of Contract:', 7: 'HSIP SR24' },
    { 7: 'Contractor: A-Del Construction Co., Inc.' },
    { 7: 'Address: 1 Main St, Dover, DE 19901' },
  ], [[
    ['', 701004.0, 'Valley Gutter 8"', '', 'Class B Concrete', 'Bear Concrete', '', 'Newark, DE', ''],
  ]]));
  assert.strictEqual(spec2016.project.catalogYear, 15);
  assert.ok(!/#701004/.test((spec2016.warnings || []).join(' | ')), (spec2016.warnings || []).join(' | '));
  console.log('OK spec-year item catalog checks');
})();

(function hiddenSpreadsheetRows() {
  const rows = gridFromObjects([
    { 6: 'Agreement /Permit/Contract/Application #:', 7: 'T2025-061-01' },
    { 6: 'Title of Contract:', 7: 'Kirkwood' },
    { 7: 'Contractor: Greggo & Ferrara, Inc.' },
    { 7: 'Address: 4048 New Castle Ave, New Castle, DE 19720' },
  ], [[
    ['', 701013.0, 'PCC Curb, Type 1-8', '', 'Class B Concrete', 'Bear Concrete', '', 'Newark, DE', ''],
    ['', 701016.0, 'IPCC Curb, Type 1-4', '', 'Class B Concrete', 'Bear Concrete', '', 'Newark, DE', ''],
  ]]);
  const hiddenIdx = rows.findIndex(r => String(r[1]).replace(/\.0$/, '') === '701016');
  const hidden = Engine.processGrid(rows, { hiddenRows: [hiddenIdx] });
  const pcc = hidden.items.find(i => i.family === 'pcc');
  assert.ok(pcc, 'PCC row present');
  assert.ok((pcc.specs || []).includes('#701016'), 'hidden spec still listed');
  assert.ok((pcc.hiddenSpecs || []).includes('#701016'), 'idx=' + hiddenIdx + ' ' + JSON.stringify(pcc.hiddenSpecs));
  assert.ok(!(pcc.hiddenSpecs || []).includes('#701013'));
  const flag = (pcc.reviewFlags || []).join(' | ');
  assert.ok(/hidden on the contractor spreadsheet/i.test(flag) && /#701016/.test(flag), flag);
  console.log('OK hidden spreadsheet rows');
})();

console.log('--- letter ---\n' + letter);
