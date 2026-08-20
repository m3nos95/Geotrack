'use strict';
const assert = require('assert');
const Lists = require('./sos-lists.js');
const Engine = require('./sos-engine.js');

const TACK_TEXT = `
Delaware Department of Transportation Approved Products List Emulsified Asphalt Tack Coats
Asphalt Paving Systems (Hammonton, NJ) CSS-1, CSS-1H, CRS-2, CRS-1H, CRS-1 6/13/2024 Russell Standard (Baltimore, MD) CRS-1, CRS-2, CRS-1H 9/11/2024
Asphalt Emulsion Industries, Inc. (Dumfries, VA) CRS-1, CRS-2, CRS-2L, CSS-1h, CQS-1h 6/13/2024
Specialty Emulsions Inc (York, PA) CRS-1H, CRS-2, CSS-1H 6/13/2024 Christiana Materials (Newark, DE) CRS-1 8/13/2026
Russell Standard (Chambersburg, PA) CSS-1H, CRS-2, CRS-2L 8/21/2025 Russell Standard (Reading, PA) CRS-1, CRS-1h, CRS-2, CRS-2L, CSS-1h, CQS-1h 8/21/2025
Seaboard Asphalt Products (Baltimore, MD) EM-50-TT 6/13/2024
Russell Standard (Baltimore, MD) CNTT 9/11/2024
Date Last Modified: 8/13/2026
`;

const tack = Lists.parseTackAplText(TACK_TEXT);
assert.ok(tack.entries.length >= 6, 'parsed tack sources, got ' + tack.entries.length);
assert.strictEqual(tack.modified, '8/13/2026');
assert.strictEqual(Lists.lookupTack(tack, 'Russell Standard', 'Baltimore MD', 'CRS-1 Tack Coat').listed, true);
assert.strictEqual(Lists.lookupTack(tack, 'Russell Standard', 'Seaford DE', 'CRS-1').listed, false);
assert.ok(Lists.lookupTack(tack, 'Russell Standard', 'Chambersburg PA', 'CRS-1H Tack Coat').gradeMismatch);
assert.strictEqual(Lists.lookupTack(tack, 'Seaboard Asphalt', 'Baltimore MD', 'EM-50-TT').listed, true);
assert.strictEqual(Lists.lookupTack(tack, 'Specialty Emulsions', 'York PA', 'CRS-1H').listed, true);
assert.strictEqual(Lists.lookupTack(tack, 'Unknown Coatings', 'Dover DE', 'CRS-1').listed, null);

const chart = Lists.parseAggregateChartGrid([
  ['Producer', 'Location', 'Material', 'Status', 'Test Date'],
  ['Vulcan Materials', 'Salisbury MD', 'GABC', 'Approved', '6/15/26'],
  ['Vulcan Materials', 'Seaford DE', 'GABC', 'Rejected', ''],
  ['Allan Myers', 'Elk Mills MD', 'GABC', 'Approved', '6/15/2026'],
  ['Porter Road Materials', 'Bear DE', 'Crushed Concrete', 'Approved', '8/1/26'],
]);
assert.strictEqual(chart.entries.length, 4);
assert.ok(Lists.looksLikeAggregateChart('Approved Aggregate Chart.xlsx', []));
const vulc = Lists.lookupAggregate(chart, 'Vulcan Materials', 'Salisbury MD', 'GABC');
assert.strictEqual(vulc.status, 'approved');
assert.strictEqual(vulc.testDate, '2026-06-15');
assert.strictEqual(Lists.lookupAggregate(chart, 'Vulcan Materials', 'Seaford DE', 'GABC').status, 'rejected');
assert.ok(!Lists.lookupAggregate(chart, 'Fake Pit', 'Dover DE', 'GABC').found);

function gridFrom(headerRows, items) {
  const rows = headerRows.map(r => {
    const row = Array(9).fill('');
    Object.entries(r).forEach(([k, v]) => { row[Number(k)] = v; });
    return row;
  });
  rows.push(['Specification #', '', 'Item Description', '', 'Material', 'Supplier', '', 'Manufacturer', 'Alternate Manufacturer']);
  rows.push(['', '', '', '', '', '', '', 'Address & Contact', 'Address & Contact']);
  for (const item of items) {
    rows.push(item[0]);
    for (const cont of item.slice(1)) rows.push(cont);
    rows.push(Array(9).fill(''));
  }
  return rows;
}

const header = [
  { 6: 'Agreement /Permit/Contract/Application #:' },
  { 6: 'Title of Contract:', 7: 'Chart Check' },
  { 0: 'Source of Supply' },
  { 7: 'Contractor: Test' },
  { 7: 'Date:8/18/26' },
  { 1: 'District: North ' },
];

const lists = Lists.mergeBundle(Lists.emptyBundle(), { tack, aggregate: chart });

const gabcGrid = gridFrom(header, [[
  ['', 301001.0, 'GABC', '', 'GABC', 'Vulcan Materials', '', 'Salisbury, MD', ''],
]]);
const approved = Engine.processGrid(gabcGrid, { lists }).items.find(i => i.family === 'aggregate');
assert.strictEqual(approved.action, 'approved');
assert.strictEqual(approved.testDate, '2026-06-15');
assert.ok(/Approved for use/.test(approved.actionNotes));
assert.ok(/Damian Blakely/.test(Engine.processGrid(gabcGrid, { lists: { aggregate: { entries: [] } } }).items[0].actionNotes));

const seafordGabc = Engine.processGrid(gridFrom(header, [[
  ['', 301001.0, 'GABC', '', 'GABC', 'Vulcan Materials', '', 'Seaford, DE', ''],
]]), { lists }).items.find(i => i.family === 'aggregate');
assert.strictEqual(seafordGabc.action, 'not-approved');

const chambersburg = Engine.processGrid(gridFrom(header, [[
  ['', 401501.0, 'Tack Coat', '', 'CRS-1H', 'Tri County', '', 'Russell Standard', ''],
  ['', '', '', '', '', '', '', 'Chambersburg, PA', ''],
]]), { lists }).items.find(i => i.family === 'tack');
assert.strictEqual(chambersburg.action, 'not-approved');
assert.ok(/not listed on tack coat APL/i.test(chambersburg.actionNotes));

const baltimore = Engine.processGrid(gridFrom(header, [[
  ['', 401501.0, 'Tack Coat', '', 'CRS-1', 'Tri County', '', 'Russell Standard', ''],
  ['', '', '', '', '', '', '', 'Baltimore, MD', ''],
]]), { lists }).items.find(i => i.family === 'tack');
assert.ok(baltimore.action === 'apl' || baltimore.action === 'approved');

console.log('OK live APL + aggregate chart lookups');

const sourceList = [
  ['Stockpile Location', 'Source', '209B (sand)', '', '209C  (#10 Screenings)', '', 'GABC', '', 'Crushed Concrete'],
  ['', '', 'Sample Date', 'Expire Date', 'Sample Date', 'Expire Date', 'Sample Date', 'Expire Date', 'Sample Date', 'Expire Date'],
  ['Allan Myers - Elk Mills', '', '', '', '2026-06-15', '2026-09-23', '2026-06-15', '2026-09-23', '', ''],
  ['Vulcan Seaford', 'Havre De Grace', '', '', '', '', '2026-07-27', '2026-11-04', '', ''],
  ['New Enterprise - Denver', '', '', '', '', '', 'Failed', '', '', ''],
  ['Patuxent Companies (FKA Goldsboro)', '', '', '', '', '', '2025-04-11', '2025-07-20', 'Failed 2nd', ''],
  ['Greggo Newark Crusher', 'Greggo & Ferrara', '', '', '', '', '2026-06-15', '2026-09-23', '', ''],
  ['Pennsy Supply Dover', '', '', '', '', '', 'Failed', '', '2026-06-01', '2026-09-01'],
];
assert.ok(Lists.looksLikeApprovedSourceList('Approved Source List.xlsx', []));
assert.ok(Lists.looksLikeApprovedSourceList('', sourceList));
const asl = Lists.parseApprovedSourceListGrid(sourceList, { filename: 'Approved Source List.xlsx' });
assert.ok(asl.entries.length >= 4);
const elk = Lists.lookupAggregate(asl, 'Allan Myers', 'Elk Mills MD', 'GABC');
assert.strictEqual(elk.status, 'approved');
assert.strictEqual(elk.testDate, '2026-06-15');
const seaford = Lists.lookupAggregate(asl, 'Vulcan Materials', 'Seaford DE', 'GABC');
assert.strictEqual(seaford.status, 'approved');
assert.ok(!Lists.lookupAggregate(asl, 'Vulcan Materials', 'Salisbury MD', 'GABC').found);
assert.strictEqual(Lists.lookupAggregate(asl, 'New Enterprise', 'Denver', 'GABC').status, 'rejected');
assert.strictEqual(Lists.lookupAggregate(asl, 'Patuxent', 'Goldsboro', 'GABC').status, 'expired');

assert.strictEqual(Lists.materialKind('GABC, Type B Crusher Run'), 'gabc');
assert.strictEqual(Lists.materialKind('GABC Type B'), 'gabc');
assert.strictEqual(Lists.materialKind('Crushed Stone'), 'gabc');
assert.strictEqual(Lists.materialKind('GABC, Type B Crushed Concrete'), 'crushed-concrete');
assert.strictEqual(Lists.materialKind('Crushed Concrete'), 'crushed-concrete');
assert.ok(!Lists.materialMatch('GABC', 'GABC, Type B Crushed Concrete'));
assert.ok(Lists.materialMatch('Crushed Concrete', 'GABC, Type B Crushed Concrete'));
assert.ok(Lists.materialMatch('GABC', 'GABC, Type B Crusher Run'));
assert.ok(!Lists.materialMatch('Crushed Concrete', 'Crusher Run GABC Type B'));

const greggoGabc = Lists.lookupAggregate(asl, 'Greggo', 'Newark', 'GABC, Type B Crusher Run');
assert.strictEqual(greggoGabc.row.material, 'GABC');
assert.strictEqual(greggoGabc.status, 'approved');
const greggoCc = Lists.lookupAggregate(asl, 'Greggo', 'Newark', 'GABC, Type B Crushed Concrete');
assert.ok(!greggoCc.found, 'crushed concrete must not inherit the GABC chart column');
const pennsyCc = Lists.lookupAggregate(asl, 'Pennsy Supply', 'Dover', 'Crushed Concrete');
assert.strictEqual(pennsyCc.status, 'approved');
assert.strictEqual(pennsyCc.row.material, 'Crushed Concrete');
const pennsyGabc = Lists.lookupAggregate(asl, 'Pennsy Supply', 'Dover', 'GABC Type B');
assert.strictEqual(pennsyGabc.status, 'rejected');
assert.strictEqual(pennsyGabc.row.material, 'GABC');

assert.strictEqual(Lists.materialKind('Recycled Asphalt Pavement'), 'millings');
assert.strictEqual(Lists.materialKind('#301008'), 'millings');
assert.strictEqual(Lists.materialKind('RAP millings'), 'millings');
assert.strictEqual(Lists.materialKind('GABC'), 'gabc');
assert.strictEqual(Lists.materialKind('GABC (CRUSHED CONCRETE)'), 'crushed-concrete');
assert.ok(Lists.materialMatch('Millings', 'RECYCLED ASPHALT PAVEMENT'));
assert.ok(Lists.materialMatch('Millings', '#301008 RAP'));
assert.ok(!Lists.materialMatch('Crushed Concrete', 'RECYCLED ASPHALT PAVEMENT'));
assert.ok(!Lists.materialMatch('GABC', 'RECYCLED ASPHALT PAVEMENT'));
assert.ok(!Lists.materialMatch('GABC', 'GABC (CRUSHED CONCRETE)'));
assert.strictEqual(Lists.foldName('Contractor Materials'), Lists.foldName('Contractors Materials'));

const kirkwoodChart = {
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
const cmCc = Lists.lookupAggregate(kirkwoodChart, 'Contractor Materials', 'Wilmington DE', 'GABC (CRUSHED CONCRETE)');
assert.strictEqual(cmCc.row.name, 'Contractors Materials', 'do not steal Diamond Wilmington crushed concrete');
assert.strictEqual(cmCc.row.material, 'Crushed Concrete');
assert.strictEqual(cmCc.testDate, '2026-07-14');
const cmRap = Lists.lookupAggregate(kirkwoodChart, 'Contractor Materials', 'Wilmington DE', 'RECYCLED ASPHALT PAVEMENT #301008');
assert.strictEqual(cmRap.row.material, 'Millings');
assert.strictEqual(cmRap.row.name, 'Contractors Materials');
assert.strictEqual(cmRap.testDate, '2026-08-11');
const cmRun = Lists.lookupAggregate(kirkwoodChart, 'Contractor Materials', 'Wilmington DE', 'GABC, Type B Crusher Run');
assert.strictEqual(cmRun.row.material, 'GABC');
assert.strictEqual(cmRun.testDate, '2026-07-14');
assert.ok(!Lists.lookupAggregate(kirkwoodChart, 'Diamond Materials', 'Wilmington DE', 'GABC').found, 'Wilmington crusher-run GABC is not Harrington 7/31');
const dmCc = Lists.lookupAggregate(kirkwoodChart, 'Diamond Materials', 'Wilmington DE', 'GABC (CRUSHED CONCRETE)');
assert.strictEqual(dmCc.testDate, '2026-07-31');
assert.strictEqual(dmCc.row.material, 'Crushed Concrete');
const dmRap = Lists.lookupAggregate(kirkwoodChart, 'Diamond Materials', 'Wilmington DE', '#301008 Recycled Asphalt Pavement');
assert.strictEqual(dmRap.row.material, 'Millings');
assert.strictEqual(dmRap.testDate, '2026-07-14');

const kirkwoodGrid = gridFrom(header, [[
  ['', 301001.0, 'GABC', '', 'GABC (CRUSHED CONCRETE)', 'Contractor Materials', '', '925 South Heald Street', 'Diamond Materials'],
  ['', '', '', '', '', '', '', 'Wilmington, DE 19801', '924 S. Heald Street'],
], [
  ['', 301008.0, 'Recycled Asphalt Pavement', '', 'Millings', 'Contractor Materials', '', '925 South Heald Street', 'Diamond Materials'],
  ['', '', '', '', '', '', '', 'Wilmington, DE 19801', 'Wilmington, DE 19801'],
]]);
const kirkwoodItems = Engine.processGrid(kirkwoodGrid, { lists: { aggregate: kirkwoodChart } }).items;
const kirkwoodCcItem = kirkwoodItems.find(i => (i.letterSpecs || i.specs).includes('#301001'));
const kirkwoodRapItem = kirkwoodItems.find(i => (i.letterSpecs || i.specs).includes('#301008'));
assert.strictEqual(kirkwoodCcItem.testDate, '2026-07-14', 'primary crushed concrete is Contractors Materials, not Diamond 7/31');
assert.strictEqual(kirkwoodCcItem.altTestDate, '2026-07-31');
assert.strictEqual(kirkwoodRapItem.testDate, '2026-08-11', 'RAP uses the Millings column');
assert.strictEqual(kirkwoodRapItem.altTestDate, '2026-07-14');
assert.ok(/Approved for use/.test(kirkwoodCcItem.actionNotes));
assert.ok(/Approved for use/.test(kirkwoodRapItem.actionNotes));
assert.ok(!/Contractor Materials Approved/i.test(kirkwoodCcItem.actionNotes), kirkwoodCcItem.actionNotes);

const cbfLiteChart = {
  kind: 'aggregate',
  entries: [
    { name: 'Diamond Materials - Harrington', source: 'York Principio', loc: 'Harrington', material: 'CBF', status: 'rejected' },
    { name: 'Diamond Materials - Harrington', source: 'York Principio', loc: 'Harrington', material: 'CBF Light', status: 'approved', testDate: '2026-08-10' },
  ],
};
const cbfHit = Lists.lookupAggregate(cbfLiteChart, '', 'Harrington DE', 'CHANNEL BED FILL LITE');
assert.strictEqual(cbfHit.status, 'approved');
assert.strictEqual(cbfHit.row.material, 'CBF Light');

const yorkChart = {
  kind: 'aggregate',
  format: 'approved-source-list',
  entries: [
    { name: 'Eastbay Aggregate', source: 'York', loc: '', material: 'GABC', status: 'approved', testDate: '2026-07-27' },
    { name: 'Eastbay Aggregate', source: 'York', loc: '', material: '#57', status: 'rejected', testDate: '' },
    { name: 'Diamond Materials - Harrington', source: 'York Principio', loc: 'Harrington', material: 'GABC', status: 'approved', testDate: '2026-07-31' },
    { name: 'Diamond Materials - Harrington', source: 'York Principio', loc: 'Harrington', material: '#57', status: 'rejected', testDate: '', notes: 'failed 1st' },
    { name: 'York - Principio', source: '', loc: 'Principio', material: 'GABC', status: 'approved', testDate: '2026-06-29' },
    { name: 'York - Principio', source: '', loc: 'Principio', material: '#57', status: 'approved', testDate: '2026-07-15' },
    { name: 'Martin Marietta', source: '', loc: '', material: 'GABC', status: 'approved', testDate: '2026-06-15' },
    { name: 'Contractors Materials', source: 'Martin Marietta', loc: '', material: 'GABC', status: 'approved', testDate: '2026-07-14' },
  ],
};
const ybpGabc = Lists.lookupAggregate(yorkChart, 'York Building Products', 'Port Deposit MD', 'GABC • Granite Gneiss');
assert.ok(ybpGabc.found, 'York Building Products / Port Deposit must hit the chart');
assert.strictEqual(ybpGabc.status, 'approved');
assert.strictEqual(ybpGabc.row.name, 'York - Principio');
assert.strictEqual(ybpGabc.row.material, 'GABC');
assert.strictEqual(ybpGabc.testDate, '2026-06-29');
assert.ok(!/eastbay/i.test(ybpGabc.row.name), 'do not treat Eastbay source tag York as York Building Products');
const ybp57 = Lists.lookupAggregate(yorkChart, 'York Building Products', 'Port Deposit MD', '#57');
assert.strictEqual(ybp57.status, 'approved', 'GABC granite must not inherit Harrington #57 fail');
assert.strictEqual(ybp57.row.name, 'York - Principio');
const ybpHarrington = Lists.lookupAggregate(yorkChart, 'York Building Products', 'Harrington DE', 'GABC');
assert.strictEqual(ybpHarrington.row.name, 'Diamond Materials - Harrington');
assert.ok(Lists.lookupAggregate(yorkChart, 'Eastbay Aggregate', '', 'GABC').found);

const yorkGrid = gridFrom(header, [[
  ['', 301003.0, 'GABC • Granite Gneiss', '', 'GABC', 'Martin Marietta', '', 'North East, MD', 'York Building Products'],
  ['', '', '', '', '', '', '', '', 'Port Deposit, MD'],
]]);
const yorkItem = Engine.processGrid(yorkGrid, { lists: { aggregate: yorkChart } }).items.find(i => i.family === 'aggregate');
assert.strictEqual(yorkItem.action, 'approved');
assert.ok(/York Building Products/i.test(yorkItem.altName));
assert.ok(/Port Deposit/i.test(yorkItem.altLoc));
assert.strictEqual(yorkItem.altTestDate, '2026-06-29');
assert.ok(/Approved for use/.test(yorkItem.actionNotes));
assert.ok(!/Must be tested/i.test(yorkItem.actionNotes));
const yorkSrc = Engine.sourceLine(yorkItem);
assert.ok(/Alt: York Building Products - Port Deposit/i.test(yorkSrc));
assert.ok(/tested 6\.29\.26/.test(yorkSrc), 'alt SOURCE line prints the chart test date, got: ' + yorkSrc);

const elkGrid = gridFrom(header, [[
  ['', 301001.0, 'GABC', '', 'GABC', 'Allan Myers', '', 'Elk Mills, MD', ''],
]]);
const elkItem = Engine.processGrid(elkGrid, { lists: { aggregate: asl } }).items.find(i => i.family === 'aggregate');
assert.strictEqual(elkItem.action, 'approved');
assert.ok(/Approved for use/.test(elkItem.actionNotes));

const goldsGrid = gridFrom(header, [[
  ['', 301001.0, 'GABC', '', 'GABC', 'Patuxent Companies', '', 'Goldsboro, MD', ''],
]]);
const golds = Engine.processGrid(goldsGrid, { lists: { aggregate: asl } }).items.find(i => i.family === 'aggregate');
assert.strictEqual(golds.action, 'test');
assert.ok(/expired/i.test(golds.actionNotes));

const greggoCcGrid = gridFrom(header, [[
  ['', 302005.0, 'GABC, Type B', '', 'Crushed Concrete', 'Greggo & Ferrara', '', 'New Castle, DE', ''],
]]);
const greggoCcItem = Engine.processGrid(greggoCcGrid, { lists: { aggregate: asl } }).items.find(i => i.family === 'aggregate');
assert.ok(/CRUSHED CONCRETE/i.test(greggoCcItem.desc));
assert.ok(!/57 STONE/i.test(greggoCcItem.desc));
assert.strictEqual(greggoCcItem.action, 'test', 'GABC chart approval is not used for crushed concrete');
assert.ok(/Must be tested/i.test(greggoCcItem.actionNotes));

const greggoRunGrid = gridFrom(header, [[
  ['', 301001.0, 'GABC, Type B', '', 'Crusher Run', 'Greggo & Ferrara', '', 'New Castle, DE', ''],
]]);
const greggoRunItem = Engine.processGrid(greggoRunGrid, { lists: { aggregate: asl } }).items.find(i => i.family === 'aggregate');
assert.ok(/CRUSHER RUN/i.test(greggoRunItem.desc));
assert.ok(!/CRUSHED CONCRETE/i.test(greggoRunItem.desc));
assert.strictEqual(greggoRunItem.action, 'approved');

const pennsyCcGrid = gridFrom(header, [[
  ['', 301003.0, 'GABC', '', 'Crushed Concrete', 'Pennsy Supply', '', 'Dover, DE', ''],
]]);
const pennsyCcItem = Engine.processGrid(pennsyCcGrid, { lists: { aggregate: asl } }).items.find(i => i.family === 'aggregate');
assert.strictEqual(pennsyCcItem.action, 'approved');
assert.ok(/CRUSHED CONCRETE/i.test(pennsyCcItem.desc));

console.log('OK Approved Source List matrix');


const sosDbSheets = [{
  name: 'Standard Items',
  rows: [
    ['Standard Items Source of Supply Database Instructions'],
    ['8. This database was last modified on September 22nd, 2023.'],
    [], [], [], [], [], [], [], [],
    ['Item #', 'UOM', 'Item Description', 'Materials Referenced in Construction Specification', 'Material Requirements in Construction Specifications', 'Source of Supply Contractor Submittal', 'Includes Permanent Steel or Iron?', 'Department Source of Supply Submission Acceptance Method', 'Source of Supply BABA Category ', 'Buy America Requirement'],
    [201000.0, 'LS', 'CLEARING AND GRUBBING', 'NA', 'NA', 'NA', 'No', 'NA', 'Non-Permanent Material - Exempt', 'No Buy America requirement.'],
    [209001.0, 'CY', 'BORROW, TYPE A', 'Borrow', 'Section 1001', 'Borrow', 'No', 'Acceptance Program (see Section 4.1)', 'Section 70917 (c) Material', 'No Buy America requirement.'],
    [207020.0, 'CY', 'STRUCTURAL BACKFILL, BORROW TYPE B, PROVIDING ONLY', 'Borrow', 'Sections 209 and 1001', 'Borrow', 'No', 'Acceptance Program (see Section 4.1)', '', ''],
    [301001.0, 'TON', 'GABC', 'Graded Aggregate', 'Section 1005', 'Graded Aggregate', 'No', 'Acceptance Program (see Section 4.1)', 'Section 70917 (c) Material', ''],
    ['', '', '', 'Geotextile', '', 'Geotextile', 'No', 'Certification of Compliance', '', ''],
    [705001.0, 'SF', 'PCC SIDEWALK, 4"', 'PCC, Class B', 'Section 1022', 'PCC, Class B', 'No', 'Acceptance Program (see Section 4.3)', '', ''],
  ],
}];
assert.ok(Lists.looksLikeSosDatabase('Source_of_Supply_Database.xlsx', []));
assert.ok(Lists.looksLikeSosDatabase('', sosDbSheets));
assert.ok(!Lists.looksLikeAggregateChart('Source_of_Supply_Database.xlsx', []));
const db = Lists.parseSosDatabaseSheets(sosDbSheets, { filename: 'Source of Supply Database.xlsx' });
assert.strictEqual(db.modified, 'September 22nd, 2023');
assert.strictEqual(db.items['201000'].na, true);
assert.strictEqual(db.items['209001'].desc, 'BORROW, TYPE A');
assert.ok(db.items['209001'].methods.includes('AP4.1'));
assert.ok(db.items['301001'].materials.includes('Graded Aggregate'));
assert.ok(db.items['301001'].methods.includes('cert'));
assert.strictEqual(Lists.lookupSosDatabase(db, '#209001').uom, 'CY');

assert.strictEqual(db.items['207020'].desc, 'STRUCTURAL BACKFILL, BORROW TYPE B, PROVIDING ONLY');

const unknownSpecGrid = gridFrom(header, [[
  ['', 207020.0, 'Structural Backfill', '', 'Borrow Type B', 'Kent Sand & Gravel', '', 'Massey, MD', ''],
]]);
const withDb = Engine.processGrid(unknownSpecGrid, { lists: { sosDatabase: db } });
assert.ok(withDb.items.some(i => i.desc === 'STRUCTURAL BACKFILL, BORROW TYPE B, PROVIDING ONLY'));
assert.ok(withDb.items.some(i => i.family === 'borrow'));

const inclinometerSheets = [{
  name: 'Special Provisions',
  rows: [
    ['Item #', 'UOM', 'Item Description', 'Materials Referenced in Construction Specification', '', 'Source of Supply Contractor Submittal', '', 'Department Source of Supply Submission Acceptance Method'],
    [202507.0, 'EACH', 'INCLINOMETERS', 'Inclinometers', '', 'Inclinometers', 'No', 'Certification of Compliance'],
  ],
}];
const spDb = Lists.parseSosDatabaseSheets(inclinometerSheets, { filename: 'db.xlsx' });
const inclGrid = gridFrom(header, [[
  ['', 202507.0, '', '', 'Inclinometers', 'Acme', '', 'Dover, DE', ''],
]]);
const incl = Engine.processGrid(inclGrid, { lists: { sosDatabase: spDb } }).items[0];
assert.strictEqual(incl.desc, 'INCLINOMETERS');
assert.ok(!/Not in the Source of Supply Database/.test((Engine.processGrid(inclGrid, { lists: { sosDatabase: spDb } }).warnings || []).join(' ')));

const snap = require('./lists/sos-database-snapshot.json');
assert.ok(Object.keys(snap.items).length >= 1500, 'bundled SOS Database snapshot');
assert.strictEqual(snap.items['209001'].desc, 'BORROW, TYPE A');
assert.strictEqual(snap.items['201000'].na, true);
assert.ok(snap.items['202507']);
console.log('OK Source of Supply Database snapshot');

const issuedLang = {
  kind: 'issued-language',
  letters: 3,
  bySpec: { '#202888': { action: 'Approved.', intent: 'approved', uses: 3 } },
  byFamily: {},
};
const withLang = Lists.mergeBundle(Lists.emptyBundle(), issuedLang);
assert.strictEqual(withLang.language.kind, 'issued-language');
assert.ok(withLang.language.bySpec['#202888']);
assert.ok(/Issued language 1 specs/.test(Lists.summary(withLang)));
console.log('OK issued-language harvest merge');

try {
  const liveChart = require('./lists/aggregate-snapshot.json');
  const liveYbp = Lists.lookupAggregate(liveChart, 'York Building Products', 'Port Deposit MD', 'GABC');
  assert.ok(liveYbp.found, 'live chart should list York Principio GABC');
  assert.ok(/principio/i.test((liveYbp.row.name || '') + ' ' + (liveYbp.row.source || '')));
  assert.ok(!/eastbay/i.test(liveYbp.row.name));
  assert.strictEqual(liveYbp.status, 'approved');
  console.log('OK live aggregate snapshot York Principio');
} catch (err) {
  if (err && err.code === 'MODULE_NOT_FOUND') console.log('skip live aggregate snapshot');
  else throw err;
}

(function liveApprovedSourceList() {
  const fs = require('fs');
  const path = require('path');
  const liveAsl = [
    '/home/ubuntu/.cursor/projects/workspace/uploads/Approved_Source_List_770b.xlsx',
    '/home/ubuntu/.cursor/projects/workspace/uploads/Approved_Source_List_5b4b.xlsx',
  ].find(p => fs.existsSync(p));
  if (!liveAsl) {
    console.log('skip live Approved Source List.xlsx');
    return;
  }
  const Fetch = require('./fetch-lists.js');
  const grid = Fetch.readSpreadsheetGrid(liveAsl, { preferSheet: 'Reference Summary' });
  const live = Lists.parseAggregateChartGrid(grid, { filename: path.basename(liveAsl), path: liveAsl });
  assert.ok(live.entries.length > 10, 'parsed live chart rows');
  const liveCc = Lists.lookupAggregate(live, 'Contractor Materials', 'Wilmington DE', 'GABC (CRUSHED CONCRETE)');
  assert.ok(liveCc.found, 'Contractors Materials crushed concrete is on the live chart');
  assert.ok(/contractor/i.test(liveCc.row.name), liveCc.row.name);
  assert.strictEqual(liveCc.row.material, 'Crushed Concrete');
  assert.ok(liveCc.testDate !== '2026-07-31', 'Contractors Materials crushed concrete is not Diamond Wilmington 7/31, got ' + liveCc.testDate + ' @ ' + liveCc.row.name);
  const liveRap = Lists.lookupAggregate(live, 'Contractor Materials', 'Wilmington DE', 'RECYCLED ASPHALT PAVEMENT #301008');
  assert.ok(liveRap.found, 'RAP millings for Contractors Materials');
  assert.strictEqual(liveRap.row.material, 'Millings');
  assert.ok(/contractor/i.test(liveRap.row.name), liveRap.row.name);
  const liveWilmGabc = Lists.lookupAggregate(live, 'Diamond Materials', 'Wilmington DE', 'GABC, Type B Crusher Run');
  if (liveWilmGabc.found) {
    assert.ok(!/harrington/i.test(liveWilmGabc.row.name), 'Wilmington GABC must not be Harrington, got ' + liveWilmGabc.row.name);
    assert.strictEqual(liveWilmGabc.row.material, 'GABC');
  }
  console.log('OK live Approved Source List millings/GABC columns', liveCc.testDate, liveRap.testDate);
})();

