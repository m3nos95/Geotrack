'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const FormPdf = require('./sos-formpdf.js');
const Engine = require('./sos-engine.js');

const CHASELYND = `Agreement /Permit/Contract/Application #: 2525
Title of Contract: Chaselynd Ph 3
Source of Supply
Materials & Research Contractor: Nichols Excavation
Address: 324 Markus Ct Newark, DE 19713
E-Mail spnichols@nicholsconstructiongroup.com
Delaware Department of Transportation Sub-Contractor:
Date: 8/4/2026
District: Central
DelDOT Contact: David Scott
Specification # Item Description Plan sheet included with Material Supplier Manufacturer Alternate Manufacturer
Material Requirements? Address & Contact Address & Contact
 
302005 Stone DE #57 Stone Allan Myers Martin Marietta
(per astm d1557) Elk Mills Quarry Northeast, MD 21901
301001 Stone Graded Aggregate Base Course Martin Marietta Allan Myers
Type B, Crusher Run Northeast, MD 21901 Elk Mills Quarry
Specs: Superpave Type C, PG64-22, 160 
gyration 
401014 Asphalt Superpave type B, PG64-22, Tri County Materials Diamond Materials
401005 160 gyration Dover, DE Newport, DE
601011 15" Concrete Pipe Concrete Pipe-Call III Reinforced concrete pipe Rinker Materials
800 Industrial Dr
Middletown, DE 19709
601014 24" Concrete Pipe Concrete Pipe-Call III Reinforced concrete pipe 302-378-8920
601012 18" Concrete Pipe Concrete Pipe-Call III Reinforced concrete pipe
601016 30" Concrete Pipe Concrete Pipe-Call III Reinforced concrete pipe
602005 Drainage Inlet Drainage Inlet 48x48 Gillespie Precast
602003 Drainage Inlet Drainage Inlet 34x24 PO Box 450 Chestertown, MD 21620
602004 Drainage Inlet Drainage Inlet 48x30 Neenah Foundry
602009 Drainage Inlet Drainage Inlet 72x24
602006 Drainage Inlet Drainage Inlet 66x30
Heritage Concrete
701023 Concrete Concrete and curbing concrete 307 A Street 
Type 3-8 Wilmington, DE 
207021 Grading/Earthwork Structural Backfill select Type C Borrow Hoskinson Gravel Pit Allan Myers
403 Mt Friendship Rd Elk Mills Quarry
Smyrna, DE 19977
817036 Paint (white) #HPS-3 Epoxy Resin 6"
Ennis Paint Inc 115 Todd Court 
Thomasville, NC 273600
817042 Paint (white & yellow) L550 Epoxy Resin 6"
Epoplex 1000 E Park Ave Maple 
Shade, NJ 08052
If material requirements are not provided in the Standard Specifications or a Special Provision, submit all Plan sheets that contain relevant material requirements as documentation with the source of supply submission.
2-2019
Specification # Item Description Plan sheet included with Material Supplier Manufacturer Alternate Manufacturer
Material Requirements? Address & Contact Address & Contact
908020 Erosion NAG SC150BN North American Green 
908022 NAG C350 Poseyville, IN
706500 Rebar Capped Rebar Gerdau
6601 Lakeview Rd
Charlotte, NC 28269
401501 Tack Coat BITUMINOUS ASPHALT TACK COAT Asphalt Paving Systems
Hammonton, NJ
624001 Expansion
PREFABRICATED EXPANSION JOINT 
SYSTEM, 4" J&K Foam Fabricating Inc
Reflex Expansion Joint Material Pottstown, PA 
613001 Concrete Sealer Silicone-Based Acrylic Concrete Sealer WR Meadows
Silencure DOT York, PA 
808002 Truck Mounted Attenuator Safe-Stop 180 TMA Trinity Highway
805001 Traffic Control Drums plastic drums
811002 Flagger, Kent County Flaggers
810001 Temporary Warning signs SS620A 60" and 84" Temporary Plasticade
Plastic Signs
2-2019`;

assert.strictEqual(FormPdf.mapDistrict('Central'), 'Canal');
assert.strictEqual(FormPdf.mapDistrict('North'), 'North');
assert.ok(!FormPdf.isLikelySpec('273600', 'NC '));
assert.ok(FormPdf.isLikelySpec('302005', '\n'));
assert.ok(FormPdf.looksLikeIssuedLetter('The following material sources have been reviewed by this office'));
assert.ok(!FormPdf.looksLikeContractorForm('The following material sources have been reviewed by this office for Application No. 2525. Specification Item Description'));

const issued = FormPdf.parseFormText('The following material sources have been reviewed by this office for Contract T2025-061-01.');
assert.strictEqual(issued.kind, 'issued-letter');
assert.strictEqual(issued.items.length, 0);

const empty = FormPdf.parseFormText('   ');
assert.strictEqual(empty.kind, 'unknown');
assert.ok(/selectable text/i.test(empty.error));

const parsed = FormPdf.parseFormText(CHASELYND, { filename: 'Chaselynd Ph 3 Source Materials.pdf' });
assert.strictEqual(parsed.kind, 'contractor-form', parsed.error || parsed.kind);
assert.strictEqual(parsed.project.contract, '2525');
assert.strictEqual(parsed.project.docKind, 'agreement');
assert.strictEqual(parsed.project.title, 'Chaselynd Ph 3');
assert.ok(/Nichols Excavation/i.test(parsed.project.contractor), parsed.project.contractor);
assert.ok(/324 Markus/i.test(parsed.project.address), parsed.project.address);
assert.ok(!/Specification/i.test(parsed.project.contact), parsed.project.contact);
assert.strictEqual(parsed.project.contact, 'David Scott');
assert.strictEqual(parsed.project.district, 'Canal');

const specs = parsed.items.map(it => '#' + String(it.spec).replace(/\D/g, ''));
assert.ok(!specs.includes('#273600'), 'zip must not become a spec: ' + specs.join(','));
['#302005', '#301001', '#401014', '#401005', '#601011', '#601014', '#701023', '#401501', '#207021', '#817036', '#706500', '#624001', '#613001'].forEach((s) => {
  assert.ok(specs.includes(s), 'missing ' + s + ' in ' + specs.join(','));
});

function item(spec) {
  return parsed.items.find(it => String(it.spec).replace(/\D/g, '') === spec.replace(/\D/g, ''));
}

assert.strictEqual(item('302005').desc, 'DELAWARE NO. 57 STONE');
assert.ok(!/Allan Myers|Martin Marietta|Middletown/i.test(item('302005').desc), item('302005').desc);
assert.ok(/Allan Myers/i.test(item('302005').supplier), item('302005').supplier);
assert.ok(/Martin Marietta/i.test(item('302005').alt), item('302005').alt);
assert.ok(/Elk Mills/i.test(item('302005').loc), item('302005').loc);
assert.ok(/Northeast/i.test(item('302005').altLoc) || /Northeast/i.test(item('302005').loc), item('302005').altLoc);

assert.ok(/GABC/i.test(item('301001').desc), item('301001').desc);
assert.ok(/Martin Marietta/i.test(item('301001').supplier), item('301001').supplier);
assert.ok(/Northeast/i.test(item('301001').loc), item('301001').loc);

assert.ok(/SUPERPAVE TYPE B/i.test(item('401014').desc), item('401014').desc);
assert.ok(/Tri County/i.test(item('401014').supplier), item('401014').supplier);
assert.ok(/Diamond Materials/i.test(item('401014').alt), item('401014').alt);
assert.ok(/Dover/i.test(item('401014').loc) || /Dover/i.test(item('401005').loc), item('401014').loc + ' / ' + item('401005').loc);

assert.ok(/Rinker/i.test(item('601011').supplier), item('601011').supplier);
assert.ok(/Middletown/i.test(item('601011').loc), item('601011').loc);
assert.ok(/Rinker/i.test(item('601014').supplier), '24" pipe should keep Rinker, got ' + item('601014').supplier);
assert.ok(/Gillespie/i.test(item('602005').supplier), item('602005').supplier);
assert.ok(/Heritage Concrete/i.test(item('701023').supplier), 'curb source ' + item('701023').supplier);
assert.ok(/Hoskinson/i.test(item('207021').supplier), item('207021').supplier);
assert.ok(/Ennis/i.test(item('817036').supplier), item('817036').supplier);
assert.ok(/Asphalt Paving Systems/i.test(item('401501').supplier), item('401501').supplier);
assert.ok(/J&K Foam/i.test(item('624001').supplier), item('624001').supplier);
assert.ok(/WR Meadows|W\.R\. Meadows/i.test(item('613001').supplier), item('613001').supplier);
assert.ok(/Plasticade/i.test(item('810001').supplier), item('810001').supplier);

parsed.items.forEach((it) => {
  assert.ok(!/Allan Myers|Martin Marietta|Middletown Materials|Tri County|Rinker|Gillespie/i.test(it.desc),
    it.spec + ' desc leaked a plant: ' + it.desc);
});

const grid = FormPdf.gridFromForm(parsed);
assert.ok(Engine.findHeaderRow(grid) >= 0);
const result = Engine.processGrid(grid, { filename: 'Chaselynd Ph 3 Source Materials.pdf' });
assert.strictEqual(result.project.contract, '2525');
assert.strictEqual(result.project.docKind, 'agreement');
assert.ok(/Chaselynd/i.test(result.project.title), result.project.title);
assert.ok(/Nichols/i.test(result.project.contractor), result.project.contractor);
assert.strictEqual(result.project.district, 'Canal');
assert.ok(result.items.length >= 10, 'letter items ' + result.items.length);

const letterSpecs = result.items.flatMap(it => it.letterSpecs || it.specs);
assert.ok(letterSpecs.includes('#302005'), letterSpecs.join(','));
assert.ok(!letterSpecs.includes('#273600'));

const stone = result.items.find(it => (it.specs || []).includes('#302005'));
assert.ok(stone, 'stone item missing');
assert.ok(/Allan Myers/i.test(stone.srcName), stone.srcName);
assert.ok(!/Middletown Materials/i.test(stone.desc + ' ' + (stone.subItems || []).join(' ')));

const pdfPath = '/home/ubuntu/.cursor/projects/workspace/uploads/Chaselynd_Ph_3_Source_Materials_2e52.pdf';
if (fs.existsSync(pdfPath)) {
  const py = spawnSync('python3', [path.join(__dirname, 'corpus-formpdf.py'), '--text', pdfPath], {
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
  });
  assert.strictEqual(py.status, 0, py.stderr || 'pypdf extract failed');
  const fromPdf = FormPdf.parseFormText(py.stdout, { filename: path.basename(pdfPath) });
  assert.strictEqual(fromPdf.kind, 'contractor-form');
  assert.strictEqual(fromPdf.project.contract, '2525');
  assert.ok(fromPdf.items.some(it => String(it.spec) === '302005'));
  assert.ok(!fromPdf.items.some(it => String(it.spec) === '273600'));
}

console.log('OK sos-formpdf ' + parsed.items.length + ' form rows → ' + result.items.length + ' letter items');
