/* Node tests for ConTrak engine. Run: node psa/psa-engine.test.js */
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function load(file) {
  var code = fs.readFileSync(path.join(__dirname, file), "utf8");
  vm.runInThisContext(code, { filename: file });
}

load("psa-engine.js");
load("psa-catalog.js");
load("psa-templates.js");
load("psa-seed.js");

var E = global.PsaEngine;
var fails = 0;
function assert(name, cond, extra) {
  if (!cond) {
    fails++;
    console.error("FAIL", name, extra || "");
  } else {
    console.log("ok  ", name);
  }
}
function nearly(a, b) {
  return Math.abs(E.money(a) - E.money(b)) < 0.011;
}

var hist = global.PSA_SEED_HISTORICAL;
var t3 = hist.cgc2019.tasks[0];
var t4 = hist.cgc2019.tasks[1];
var hcea = hist.hcea2018.tasks[0];

assert("T3 spent matches spreadsheet", nearly(E.taskSpent(t3), 497482.26), E.taskSpent(t3));
assert("T3 allocated matches spreadsheet", nearly(E.taskAllocated(t3), 594993.26), E.taskAllocated(t3));
assert("T3 unallocated matches spreadsheet", nearly(E.taskUnallocated(t3), 4981.74), E.taskUnallocated(t3));
assert("T3 returned remainder", nearly(
  t3.qps.reduce(function (s, q) { return s + E.qpReturned(q); }, 0),
  13588.24
));
assert("T4 spent", nearly(E.taskSpent(t4), 157705.02), E.taskSpent(t4));
assert("T4 allocated", nearly(E.taskAllocated(t4), 228671.50), E.taskAllocated(t4));
assert("HCEA spent", nearly(E.taskSpent(hcea), 35540.25), E.taskSpent(hcea));
assert("HCEA allocated", nearly(E.taskAllocated(hcea), 73754.50), E.taskAllocated(hcea));

var port = t3.qps.find(function (q) { return q.qpNumber === "1"; });
assert("Port Mahon remaining", nearly(E.qpRemaining(port), 72789.75), E.qpRemaining(port));
assert("Port Mahon status invoicing", E.deriveQpStatus(port) === "invoicing", E.deriveQpStatus(port));

var closed = t3.qps.find(function (q) { return q.qpNumber === "2"; });
assert("Closed QP remaining is 0", E.qpRemaining(closed) === 0);
assert("Closed QP returns leftover", nearly(E.qpReturned(closed), 2300.75), E.qpReturned(closed));

var canceled = t3.qps.find(function (q) { return q.qpNumber === "9"; });
assert("Canceled QP status", E.deriveQpStatus(canceled) === "canceled");

/* Proposal → NTP → invoice checklist */
var contract = {
  payItems: global.PsaCatalog.cloneCatalog().map(function (it) {
    if (it.code === "605545") it.unitPrice = 42;
    if (it.code === "763589N") it.unitPrice = 1500;
    if (it.code === "605541") it.unitPrice = 85;
    return it;
  }),
};
var task = E.emptyTask("1", 50000);
var qp = E.emptyQp(task, "1");
qp.project = "Example Bridge";
qp.proposal = {
  status: "draft",
  lines: [
    { itemCode: "763589N", description: "Mob truck NCC", unit: "EA", proposedQty: 1, unitPrice: 1500 },
    { itemCode: "605545", description: "Soil borings land", unit: "LF", proposedQty: 80, unitPrice: 42 },
    { itemCode: "605541", description: "Shelby", unit: "EA", proposedQty: 4, unitPrice: 85 },
  ],
};
var review = E.reviewProposal(contract, qp.proposal);
assert("Clean proposal has no fail flags", review.flags.filter(function (f) { return f.severity === "fail"; }).length === 0);
assert("Proposal total 5240", nearly(review.total, 1500 + 80 * 42 + 4 * 85), review.total);

qp.proposal.lines[1].reviewedQty = 60;
assert("Adjusted proposal total 4360", nearly(E.proposalTotal(qp.proposal), 1500 + 60 * 42 + 4 * 85));

E.issueNtp(qp, "2026-08-01", "Proceed");
assert("NTP amount uses reviewed qty", nearly(qp.ntpAmount, 4360), qp.ntpAmount);
assert("NTP has 3 lines", qp.ntpLines.length === 3);

task.qps = [qp];

var inv = E.emptyInvoice("INV-1");
inv.date = "2026-08-20";
inv.lines = [
  { itemCode: "763589N", description: "Mob", unit: "EA", qty: 1, unitPrice: 1500 },
  { itemCode: "605545", description: "SPT", unit: "LF", qty: 40, unitPrice: 42 },
];
inv.amount = E.sumLines(inv.lines);
inv.adminChecks = { logs_received: true, samples_delivered: true, mot_ok: true, work_complete: true, backup: true };

var ck = E.buildInvoiceChecklist(contract, task, qp, inv);
assert("Partial invoice overall pass", ck.overall === "pass", JSON.stringify(ck.checks.filter(function (c) { return c.status !== "pass"; })));
assert("Remaining after 1180", nearly(ck.remainingAfter, 4360 - 3180), ck.remainingAfter);

/* Over-quantity should fail */
var inv2 = E.emptyInvoice("INV-2");
inv2.date = "2026-09-01";
inv2.lines = [
  { itemCode: "605545", description: "SPT", unit: "LF", qty: 30, unitPrice: 42 },
];
inv2.amount = E.sumLines(inv2.lines);
qp.invoices = [Object.assign({}, inv, { status: "posted" })];
var ck2 = E.buildInvoiceChecklist(contract, task, qp, inv2);
var qtyCheck = ck2.checks.find(function (c) { return c.id === "quantities"; });
assert("Over remaining qty fails", qtyCheck.status === "fail", qtyCheck.detail);

/* Over NTP dollars */
var inv3 = E.emptyInvoice("INV-3");
inv3.date = "2026-09-01";
inv3.amount = 99999;
inv3.lines = [];
var ck3 = E.buildInvoiceChecklist(contract, task, qp, inv3);
var ntpCheck = ck3.checks.find(function (c) { return c.id === "within_ntp_balance"; });
assert("Over NTP dollars fails", ntpCheck.status === "fail");

/* Price mismatch */
var inv4 = E.emptyInvoice("INV-4");
inv4.date = "2026-08-20";
inv4.lines = [{ itemCode: "763589N", qty: 1, unitPrice: 2000, unit: "EA" }];
inv4.amount = 2000;
qp.invoices = [];
var ck4 = E.buildInvoiceChecklist(contract, task, qp, inv4);
var priceCheck = ck4.checks.find(function (c) { return c.id === "unit_prices"; });
assert("Wrong unit price fails", priceCheck.status === "fail", priceCheck.detail);

/* Invoice before NTP */
var inv5 = E.emptyInvoice("INV-5");
inv5.date = "2026-07-01";
inv5.amount = 100;
var ck5 = E.buildInvoiceChecklist(contract, task, qp, inv5);
var dateCheck = ck5.checks.find(function (c) { return c.id === "invoice_date"; });
assert("Invoice before NTP fails", dateCheck.status === "fail");

/* Catalog has expected drilling items */
var codes = global.PsaCatalog.ITEMS.map(function (i) { return i.code; });
assert("Catalog includes land borings", codes.indexOf("605545") >= 0);
assert("Catalog includes barge mob", codes.indexOf("763591N") >= 0);
assert("Catalog includes lab UCS", codes.indexOf("LAB-UCS") >= 0);

/* Tracker sheet parser */
var rows = [
  ["Task #:", "", 3],
  ["QP #", "Contract", "Project", "Notes", "x", "y", "QP Closed", "spent", "Date", "NTP Amount", "Date", "Amount"],
  [1, "T202270302", "Port Mahon", "", "", "", "", "", "2024-08-22", 246252, "2024-09-24", 51660.75],
  [2, "T202109001", "I-95 Lighting", "taken from consultant", "", "", "Yes", "", "2024-08-29", 17496, "2024-09-30", 15195.25],
];
var parsed = E.parseTrackerSheet(rows);
assert("Parsed 2 QPs", parsed.qps && parsed.qps.length === 2, parsed.error || (parsed.qps && parsed.qps.length));
assert("Parsed NTP amount", nearly(parsed.qps[0].ntpAmount, 246252));
assert("Parsed closed leftover", nearly(parsed.qps[1].returnedRemainder, 17496 - 15195.25));

/* ConTrak templates — Finance can turn checks off and rename the assignment */
var Tpl = global.ConTrakTemplates;
var unit = Tpl.byId(Tpl.UNIT_PRICE_ID);
assert("Unit-price template uses QP", unit.assignmentNoun === "QP");
assert("Unit-price template has proposal+NTP+pay items", unit.workflow.proposal && unit.workflow.ntp && unit.workflow.payItems);
var lump = Tpl.byId(Tpl.LUMP_SUM_ID);
assert("Lump-sum template hides pay items", lump.workflow.payItems === false);
assert("Lump-sum skips unit-price checks", lump.autoChecks.unit_prices === false);

var ckLump = E.buildInvoiceChecklist(contract, task, qp, inv, lump);
assert("Lump-sum checklist has no unit_prices row", !ckLump.checks.some(function (c) { return c.id === "unit_prices"; }));
assert("Lump-sum checklist still has NTP money check", ckLump.checks.some(function (c) { return c.id === "within_ntp_balance"; }));
assert("Lump-sum uses Task Order in open check", ckLump.checks.some(function (c) {
  return c.id === "qp_open" && c.label.indexOf("Task Order") >= 0;
}));

var custom = Tpl.duplicate(unit, "Bridge design PSA");
custom.adminChecks = [{ id: "pe_seal", label: "PE sealed drawings attached" }];
custom.autoChecks.quantities = false;
var ckCustom = E.buildInvoiceChecklist(contract, task, qp, inv, custom);
assert("Custom admin check appears", ckCustom.checks.some(function (c) { return c.id === "pe_seal"; }));
assert("Disabled quantity check omitted", !ckCustom.checks.some(function (c) { return c.id === "quantities"; }));

var migrated = Tpl.migrateState({ version: 1, contracts: [{ id: "2216F", code: "2216F", paymentMethod: "Cost per unit of work" }] });
assert("Migrate adds templates", migrated.templates && migrated.templates.length >= 2);
assert("Migrate binds unit-price template", migrated.contracts[0].templateId === Tpl.UNIT_PRICE_ID);
assert("Migrate default role is PM", migrated.role === "pm");

/* Close-out: leftover NTP returns to the task; leftover task PO returns to the agreement */
var agr = { cap: 3000000, tasks: [] };
var fundedTask = E.emptyTask("1", 500000);
var qpA = E.emptyQp(fundedTask, "1");
qpA.ntpAmount = 8000;
qpA.ntpDate = "2026-08-01";
qpA.invoices = [{ id: "i1", amount: 3790, status: "posted" }];
fundedTask.qps = [qpA];
agr.tasks = [fundedTask];
assert("Task PO funds 40+ QPs room", nearly(E.taskUnallocated(fundedTask), 492000), E.taskUnallocated(fundedTask));
assert("Agreement available is cap minus task PO", nearly(E.contractAvailable(agr), 2500000), E.contractAvailable(agr));
E.closeQp(qpA, { date: "2026-08-26", notes: "Work complete" });
assert("Closed QP remaining is 0 after close-out", E.qpRemaining(qpA) === 0);
assert("Unspent NTP returned to task", nearly(E.qpReturned(qpA), 4210), E.qpReturned(qpA));
assert("Task free after QP close-out includes leftover", nearly(E.taskUnallocated(fundedTask), 496210), E.taskUnallocated(fundedTask));
assert("Agreement available unchanged until task closes", nearly(E.contractAvailable(agr), 2500000));
var forty = E.emptyTask("2", 500000);
for (var n = 1; n <= 40; n++) forty.qps.push(E.emptyQp(forty, String(n)));
assert("41st QP number after 40", E.nextQpNumber(forty) === "41");
assert("QP count 40", E.qpCounts(forty).total === 40);
E.closeTask(fundedTask, { date: "2026-08-26", notes: "Task complete" });
assert("Task close-out returns leftover PO to agreement", nearly(E.taskReturnedToContract(fundedTask), 496210), E.taskReturnedToContract(fundedTask));
assert("Agreement available after task close-out", nearly(E.contractAvailable(agr), 3000000 - 3790), E.contractAvailable(agr));
assert("Closed task committed is spent only", nearly(E.taskCommitted(fundedTask), 3790), E.taskCommitted(fundedTask));

assert("Long date April 29, 2026", E.fmtDateLong("2026-04-29") === "April 29, 2026");
assert("Letterhead secretary matches SOS app", E.defaultLetterhead().secretaryName === "Shanté A. Hastings");
assert("Letter money omits .00", E.fmtMoneyLetter(46124) === "$46,124", E.fmtMoneyLetter(46124));
assert("Letter money keeps cents", E.fmtMoneyLetter(12975.5) === "$12,975.50", E.fmtMoneyLetter(12975.5));

var codes = global.PsaCatalog.ITEMS.map(function (i) { return i.code; });
assert("Catalog includes qualified logger", codes.indexOf("LOGGER") >= 0);
assert("Catalog includes GPS", codes.indexOf("GPS") >= 0);
assert("Catalog includes DNREC permit", codes.indexOf("DNREC") >= 0);
assert("SPT has Appendix item 2", global.PsaCatalog.ITEMS.some(function (i) {
  return i.code === "605540" && i.itemNo === "2";
}));

var cgc = JSON.parse(JSON.stringify(hist.cgc2019));
cgc.payItems = global.PsaCatalog.applyPrices(global.PsaCatalog.cloneCatalog(), global.PsaSeed.CGC_PRICES);
global.PsaSeed.applyPackets(cgc);
cgc.letterhead = E.ensureLetterhead(cgc);
var t4p = cgc.tasks.find(function (t) { return String(t.number) === "4"; });
var qp13 = t4p.qps.find(function (q) { return q.qpNumber === "13"; });
assert("QP13 proposal total 46124", nearly(E.proposalTotal(qp13.proposal), 46124), E.proposalTotal(qp13.proposal));
assert("QP13 has 11 proposal lines", qp13.proposal.lines.length === 11, qp13.proposal.lines.length);
var pkt13 = E.buildNtpPacket(cgc, t4p, qp13);
assert("QP13 letter amount $46,124", pkt13.amountLetter === "$46,124", pkt13.amountLetter);
assert("QP13 letter names Agreement 2019F Task 4 QP 13", pkt13.body.indexOf("Agreement #2019F, Task 4, Quick Proposal 13") >= 0, pkt13.assignment);
assert("QP13 letter uses T# and Washington Street", pkt13.body.indexOf("T202566301, Washington Street") >= 0);
assert("QP13 proposal dated April 17, 2026", pkt13.proposalDateLong === "April 17, 2026");
assert("QP13 letter dated April 29, 2026", pkt13.letterDateLong === "April 29, 2026");
assert("QP13 salutation Ms. Ziegler", pkt13.salutation.indexOf("Ziegler") >= 0);
assert("QP13 cc includes Paul Moser", pkt13.cc.indexOf("Paul Moser, DelDOT") >= 0);

var qp18 = t4p.qps.find(function (q) { return q.qpNumber === "18"; });
assert("QP18 proposal total 12975.50", nearly(E.proposalTotal(qp18.proposal), 12975.5), E.proposalTotal(qp18.proposal));
var pkt18 = E.buildNtpPacket(cgc, t4p, qp18);
assert("QP18 letter amount keeps cents", pkt18.amountLetter === "$12,975.50", pkt18.amountLetter);

var qp19 = t4p.qps.find(function (q) { return q.qpNumber === "19"; });
assert("QP19 proposal total 3817", nearly(E.proposalTotal(qp19.proposal), 3817), E.proposalTotal(qp19.proposal));

var hceaC = JSON.parse(JSON.stringify(hist.hcea2018));
hceaC.payItems = global.PsaCatalog.applyPrices(global.PsaCatalog.cloneCatalog(), global.PsaSeed.HCEA_PRICES);
global.PsaSeed.applyPackets(hceaC);
hceaC.letterhead = E.ensureLetterhead(hceaC);
var t3h = hceaC.tasks.find(function (t) { return String(t.number) === "3"; });
var qp4 = t3h.qps.find(function (q) { return q.qpNumber === "4"; });
assert("HCEA QP4 proposal total 23841", nearly(E.proposalTotal(qp4.proposal), 23841), E.proposalTotal(qp4.proposal));
var pkt4 = E.buildNtpPacket(hceaC, t3h, qp4);
assert("HCEA letter date August 10", pkt4.letterDateLong === "August 10, 2026");
assert("HCEA letter omits billing lead-in", pkt4.body.indexOf("to billing Contract") < 0);
assert("HCEA letter has Contract No.", pkt4.body.indexOf("Contract No. T2022-703-02") >= 0);
assert("HCEA proposal billing T201870301", pkt4.billingNo === "T201870301");
assert("HCEA salutation Mr. Opdyke", pkt4.salutation.indexOf("Opdyke") >= 0);

var cloned = global.PsaCatalog.cloneCatalog();
assert("cloneCatalog copies itemNo", cloned.some(function (i) { return i.code === "605545" && i.itemNo === "7"; }));
var merged = global.PsaCatalog.mergeCatalog([{ code: "605545", description: "land", unit: "LF", unitPrice: 12 }]);
assert("mergeCatalog fills itemNo on stored items", merged.some(function (i) { return i.code === "605545" && i.itemNo === "7"; }));
assert("mergeCatalog adds logger", merged.some(function (i) { return i.code === "LOGGER"; }));

if (fails) {
  console.error("\n" + fails + " failed");
  process.exit(1);
}
console.log("\nAll tests passed");
