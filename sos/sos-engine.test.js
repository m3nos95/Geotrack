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
assert.strictEqual(result.project.date, '2026-07-06');
assert.ok(!result.project.contract, 'Frey form leaves application # blank');
assert.ok(result.warnings.some(w => /blank/i.test(w)));

const families = result.items.map(i => i.family);
const specs = result.items.map(i => (i.letterSpecs || i.specs).join(','));

// GABC corrected 301003 → 301001, must be tested
const gabc = result.items.find(i => i.family === 'aggregate');
assert.ok(gabc, 'GABC item present');
assert.deepStrictEqual(gabc.letterSpecs || gabc.specs, ['#301001']);
assert.strictEqual(gabc.action, 'test');
assert.ok(/Vulcan/i.test(gabc.srcName));
assert.ok(/Salisbury/i.test(gabc.srcLoc));
assert.ok(/Ray Glanden/.test(gabc.actionNotes));
assert.ok(/Aaron Wieczorek/.test(gabc.actionNotes));

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

// CC includes DelDOT contact first
assert.strictEqual(result.cc[0].name, 'James Smith');
assert.ok(result.cc.some(c => c.name === 'Ray Glanden'));
assert.ok(result.cc.some(c => c.name === 'Aaron Wieczorek'));

const phrase = Engine.contractPhrase({ contract: '0000016055', title: 'BOBBY FREY ENTRANCE(S)', docKind: 'application' });
assert.strictEqual(phrase, 'Application No. 0000016055, BOBBY FREY ENTRANCE(S)');

// Seaford Russell Standard must reject
const seafordGrid = gridFromObjects(FREY_HEADER, [[
  ['', 401501.0, 'Tack Coat', '', 'CRS-1', 'Tri County', '', 'Russell Standard', ''],
  ['', '', '', '', '', '', '', 'Seaford, DE 19973', ''],
]]);
const seaford = Engine.processGrid(seafordGrid);
const seafordTack = seaford.items.find(i => i.family === 'tack');
assert.strictEqual(seafordTack.action, 'not-approved');
assert.ok(/not listed on tack coat APL/i.test(seafordTack.actionNotes));

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
assert.ok(/#301001 - GABC/.test(letter));
assert.ok(/Must be tested/.test(letter));
assert.ok(/River Asphalt 1/.test(letter) && /River Asphalt 2/.test(letter));
assert.ok(/#401xxx/.test(letter) && /CRS-1 Tack Coat/.test(letter));
assert.ok(/Russell Standard - Baltimore/.test(letter));
assert.ok(/Elastoflex 61/.test(letter));
assert.ok(/James Smith/.test(letter));
console.log('--- letter ---\n' + letter);
