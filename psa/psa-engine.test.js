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

/* Bulk QP close-out: several QPs on one task, leftover NTP returns to the task */
var bulkAgr = { cap: 3000000, tasks: [] };
var bulkTask = E.emptyTask("4", 200000);
function makeCloseable(num, ntp, spent) {
  var q = E.emptyQp(bulkTask, num);
  q.ntpAmount = ntp;
  q.ntpDate = "2026-04-01";
  if (spent) q.invoices = [{ id: "i-" + num, amount: spent, status: "posted" }];
  bulkTask.qps.push(q);
  return q;
}
var b1 = makeCloseable("2", 4558, 4558);
var b2 = makeCloseable("3", 18703, 18703);
var b3 = makeCloseable("10A", 3150, 3107.03);
var bKeep = makeCloseable("13", 46124, 0);
var bClosed = makeCloseable("1", 8000, 5000);
E.closeQp(bClosed, { date: "2026-05-01" });
var beforeFree = E.taskUnallocated(bulkTask);
var batch = E.bulkCloseQps(bulkTask, [b1.id, b2.id, b3.id, bClosed.id, "missing"], {
  date: "2026-08-26",
  notes: "Old jobs complete",
});
assert("Bulk closes 3 open QPs", batch && batch.rows.length === 3, batch && batch.rows.length);
assert("Bulk skips already closed", batch.qpIds.indexOf(bClosed.id) < 0);
assert("Bulk letter lists QP 2, 3, 10A in order", batch.rows.map(function (r) { return r.qpNumber; }).join(",") === "2,3,10A");
assert("Bulk returned is leftover sum", nearly(batch.totals.returned, 0 + 0 + 42.97), batch.totals.returned);
assert("Bulk NTP total", nearly(batch.totals.ntpAmount, 4558 + 18703 + 3150), batch.totals.ntpAmount);
assert("Closed QPs remaining 0", E.qpRemaining(b1) === 0 && E.qpRemaining(b3) === 0);
assert("Unselected QP 13 still open", E.deriveQpStatus(bKeep) === "ntp");
assert("Task free includes bulk leftovers", nearly(E.taskUnallocated(bulkTask), beforeFree + 42.97), E.taskUnallocated(bulkTask));
bulkAgr.tasks = [bulkTask];
assert("Agreement available unchanged after bulk QP close-out", nearly(E.contractAvailable(bulkAgr), 2800000));
assert("Empty bulk close returns null", E.bulkCloseQps(bulkTask, [bKeep.id + "-no"]) == null);
assert("Finds stored bulk close-out", E.findBulkCloseout(bulkTask, batch.id) && E.findBulkCloseout(bulkTask, batch.id).notes === "Old jobs complete");
var afterBulkFree = E.taskUnallocated(bulkTask);
E.reopenQp(b3, bulkTask);
assert("Undo one QP restores leftover on that QP", nearly(E.qpRemaining(b3), 42.97), E.qpRemaining(b3));
assert("Reopened QP drops out of the bulk letter", !E.findBulkCloseout(bulkTask, batch.id) || E.findBulkCloseout(bulkTask, batch.id).rows.every(function (r) { return r.qpNumber !== "10A"; }));
assert("Task free drops when one QP is reopened", nearly(E.taskUnallocated(bulkTask), afterBulkFree - 42.97), E.taskUnallocated(bulkTask));
var batch2 = E.bulkCloseQps(bulkTask, [bKeep.id], { date: "2026-08-26", cc: ["DOT Profservices"] });
var freeBeforeUndo = E.taskUnallocated(bulkTask);
E.undoBulkCloseout(bulkTask, batch2.id);
assert("Undo bulk reopens those QPs", E.deriveQpStatus(bKeep) === "ntp");
assert("Undo bulk removes the batch", !E.findBulkCloseout(bulkTask, batch2.id));
assert("Undo bulk puts leftover back on the QPs", nearly(E.taskUnallocated(bulkTask), freeBeforeUndo - 46124), E.taskUnallocated(bulkTask));
var ccDef = E.resolveLetterCc(null, E.defaultLetterhead());
assert("Default cc includes Profservices", ccDef.indexOf("DOT Profservices") >= 0);
assert("Override cc can drop a name", E.resolveLetterCc(["DOT Audit Management"], E.defaultLetterhead()).length === 1);
assert("Add cc skips duplicates", E.addLetterCc(["A"], "A").length === 1);
assert("Remove cc by index", E.removeLetterCc(["A", "B"], 0).join(",") === "B");

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

/* PSPM 2016 — agreement types, NTP §14 gate, independent estimate, 20% reduction */
assert("PSPM agreement types include IDIQ and State", E.AGREEMENT_TYPES.indexOf("IDIQ") >= 0 && E.AGREEMENT_TYPES.indexOf("State") >= 0);
assert("PSPM payment methods include cost per unit of work", E.PAYMENT_METHODS.indexOf("Cost per unit of work") >= 0);
assert("Federal CFDA counts as federal funds", E.usesFederalFunds({ funding: "Federal; CFDA 20.205" }) === true);
assert("State-only is not federal", E.usesFederalFunds({ funding: "State" }) === false);

var gateQp = E.emptyQp(E.emptyTask("1", 50000), "1");
gateQp.proposal = {
  status: "draft",
  lines: [{ itemCode: "605545", proposedQty: 10, unitPrice: 42 }],
};
var gate0 = E.ntpGate({ funding: "Federal; CFDA 20.205" }, gateQp);
assert("Empty PSPM gate is not ready", gate0.ready === false);
assert("Missing independent estimate fails", gate0.steps.some(function (s) {
  return s.id === "independent_estimate" && s.status === "fail";
}));
assert("Federal DBE step is required", gate0.steps.some(function (s) {
  return s.id === "dbe_goal" && s.required;
}));

gateQp.independentEstimate = 420;
gateQp.pspm = {
  workPlan: true,
  schedule: true,
  auditReview: true,
  dbeGoal: true,
  dbeNa: false,
  fundingAuthorized: true,
};
var gate1 = E.ntpGate({ funding: "Federal; CFDA 20.205" }, gateQp);
assert("Complete PSPM gate is ready", gate1.ready === true, JSON.stringify(gate1.missingLabels));

var stateGate = E.ntpGate({ funding: "State" }, gateQp);
assert("State-only DBE step is N/A", stateGate.steps.some(function (s) {
  return s.id === "dbe_goal" && s.status === "na";
}));

var overEst = E.estimateVariance(1000, 1300);
assert("Proposal over estimate is flagged", overEst.status === "over");
var underEst = E.estimateVariance(1000, 900);
assert("Proposal under estimate is ok", underEst.status === "ok");
var missEst = E.estimateVariance(0, 900);
assert("Missing estimate is missing", missEst.status === "missing");

var inc = E.ntpScopeChange(10000, 12000);
assert("NTP increase asks for new proposal", inc.kind === "increase" && inc.message.indexOf("new NTP") >= 0);
var red = E.ntpScopeChange(10000, 7000);
assert("20% NTP reduction requires adjusted proposal", red.kind === "reduction", red.kind + " " + red.pct);
var small = E.ntpScopeChange(10000, 9000);
assert("10% reduction is a revise not a 20% cut", small.kind === "revise");
var first = E.ntpScopeChange(0, 5000);
assert("First NTP is initial", first.kind === "initial");

var unitTpl = Tpl.byId(Tpl.UNIT_PRICE_ID);
assert("Unit-price template enables PSPM NTP gate", unitTpl.workflow.pspNtpGate === true);

var dateCk = ck5.checks.find(function (c) { return c.id === "invoice_date"; });
assert("Pre-NTP invoice cites earliest work date", dateCk.detail.indexOf("earliest date work may begin") >= 0, dateCk.detail);

var hceaText = [
  "Hillis- Carnes",
  "Date: August 24, 2026",
  "Project Name: US9 @ Cool Spring Rd",
  "Project Design Number: TXXXXXXXXX",
  "AGR: 2018F - Geotechnical Subsurface Investigation",
  "Task: Task 3 QP 5",
  "Project Billing Number: T201870301",
  "Item No. Description Units Unit Measure Price Total",
  "2 ADDITIONAL STANDARD PENETRATION TESTS (SPT) 21.00 Each X 8.25\t$ = 173.25\t$",
  "8 SOIL BORINGS, ATV *including permit if needed 120.00 Linear Foot X 18.00\t$ = 2,160.00\t$",
  "9 MAN-HOUR OF MISCELLANEOUS WORK 90.00 Per Hour X 32.00\t$ = 2,880.00\t$",
  "15 MOBILIZATION OF ATV OR SKID BORING RIG - Sussex County 3.00 Each X 1,000.00\t$ = 3,000.00\t$",
  "19 MAN-HOUR OF PROJECT MANAGEMENT 30.00 Per Hour X 85.00\t$ = 2,550.00\t$",
  "43 BOREHOLE ABANDONMENT New Castle, Kent, Sussex County 120.00 Linear Foot X 8.00\t$ = 960.00\t$",
  "46 Qualified Logger 30.00 Per Hour X 75.00\t$ = 2,250.00\t$",
  "59 GPS 1.00 ls X $400.00 = 400.00\t$",
  "*including permit if needed Total Amount Due: 14,373.25\t$",
].join("\n");
var hcea = E.parseConsultantProposal(hceaText);
assert("HCEA QP5 date", hcea.dateISO === "2026-08-24", hcea.dateISO);
assert("HCEA QP5 project", hcea.projectName.indexOf("Cool Spring") >= 0, hcea.projectName);
assert("HCEA QP5 skips placeholder T#", hcea.designNo === "", hcea.designNo);
assert("HCEA QP5 agreement 2018F", hcea.agreementCode === "2018F", hcea.agreementCode);
assert("HCEA QP5 task 3", hcea.taskNumber === "3", hcea.taskNumber);
assert("HCEA QP5 qp 5", hcea.qpNumber === "5", hcea.qpNumber);
assert("HCEA QP5 billing T201870301", hcea.billingNo === "T201870301", hcea.billingNo);
assert("HCEA QP5 8 lines", hcea.lines.length === 8, hcea.lines.length);
assert("HCEA QP5 total 14373.25", nearly(hcea.total, 14373.25), hcea.total);
assert("HCEA QP5 item 15 qty 3", hcea.lines.some(function (l) { return l.itemNo === "15" && l.qty === 3; }));
assert("HCEA QP5 GPS 400", hcea.lines.some(function (l) { return l.itemNo === "59" && nearly(l.amount, 400); }));

var hceaAgr = { payItems: global.PsaCatalog.cloneCatalog(), tasks: [E.emptyTask("3", 200000)] };
var placed = E.findOrCreateQpForProposal(hceaAgr, hcea);
assert("Creates QP 5 on Task 3", placed.qp.qpNumber === "5" && String(placed.task.number) === "3");
assert("Maps item 2 to SPT catalog code", placed.qp.proposal.lines[0].itemCode === "605540", placed.qp.proposal.lines[0].itemCode);
assert("Maps logger item 46", placed.qp.proposal.lines.some(function (l) { return l.itemCode === "LOGGER"; }));
assert("Proposal total from PDF lines", nearly(E.proposalTotal(placed.qp.proposal), 14373.25), E.proposalTotal(placed.qp.proposal));

if (fails) {
  console.error("\n" + fails + " failed");
  process.exit(1);
}
console.log("\nAll tests passed");
