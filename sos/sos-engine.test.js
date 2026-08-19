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
assert.ok(result.cc.some(c => c.name === 'Ray Glanden'), 'South sampler on soil/stone letter');
assert.ok(result.cc.some(c => c.name === 'Aaron Wieczorek'), 'lab results on soil/stone');
assert.ok(result.cc.some(c => c.name === 'Mark Schafer'), 'HMA person on hot mix');
assert.ok(!result.cc.some(c => c.name === 'Jason Denson'), 'core dump removed — assign by material');
assert.ok(!result.cc.some(c => c.name === 'James Kwasnieski'));
assert.strictEqual(Engine.samplerName('South'), 'Ray Glanden');
assert.strictEqual(Engine.samplerName('North'), 'Damian Blakely');
assert.strictEqual(Engine.samplerName('Canal'), 'Rich Taylor');

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
assert.ok(northResult.cc.some(c => c.name === 'Damian Blakely'));
assert.ok(northResult.cc.some(c => c.name === 'Aaron Wieczorek'));
assert.ok(!northResult.cc.some(c => c.name === 'Ray Glanden'), 'South sampler is not copied on a North soil/stone letter');
assert.ok(!northResult.cc.some(c => c.name === 'Mark Schafer'), 'no hot mix on this letter');

const hmaOnly = Engine.processGrid(gridFromObjects(FREY_HEADER, [FREY_ITEMS[0]]));
assert.ok(hmaOnly.cc.some(c => c.name === 'Mark Schafer'));
assert.ok(!hmaOnly.cc.some(c => c.name === 'Aaron Wieczorek'), 'no soil/stone on HMA-only letter');
assert.ok(!hmaOnly.cc.some(c => c.name === 'Ray Glanden'));

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

// PCC curb / sidewalk uses mix-design language (not admixture certs)
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
assert.ok(/mix designs/i.test(pcc.actionNotes));
assert.ok(!/admixture/i.test(pcc.actionNotes));

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

const liveSnap = require('./lists/apl-snapshot.json');
assert.ok(liveSnap.tack.entries.length >= 10, 'bundled tack APL snapshot');
assert.strictEqual(require('./sos-lists.js').lookupTack(liveSnap.tack, 'Russell Standard', 'Baltimore MD', 'CRS-1').listed, true);
assert.ok(require('./sos-lists.js').lookupTack(liveSnap.tack, 'Russell Standard', 'Chambersburg PA', 'CRS-1H Tack Coat').gradeMismatch);

console.log('--- letter ---\n' + letter);
