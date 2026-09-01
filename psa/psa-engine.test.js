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
assert("Migrate forces IDIQ type", migrated.contracts[0].agreementType === "IDIQ");
var migratedPay = Tpl.migrateState({
  version: 1,
  contracts: [{ id: "x", code: "x", paymentMethod: "Cost plus fixed fee", agreementType: "Multiphase" }],
});
assert("Migrate drops cost plus onto unit price", migratedPay.contracts[0].paymentMethod === "Cost per unit of work");
assert("Migrate relabels Multiphase as IDIQ", migratedPay.contracts[0].agreementType === "IDIQ");

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

/* Delete a mistaken QP from the ledger — gone, not canceled */
var delTask = E.emptyTask("1", 100000);
var delOpen = E.emptyQp(delTask, "7");
delOpen.ntpAmount = 8000;
delOpen.ntpDate = "2026-08-01";
delOpen.invoices = [{ id: "inv-del", amount: 1200, status: "posted" }];
var delClosed = E.emptyQp(delTask, "8");
delClosed.ntpAmount = 5000;
delClosed.ntpDate = "2026-07-01";
delClosed.invoices = [{ id: "inv-c", amount: 4800, status: "posted" }];
var delDraft = E.emptyQp(delTask, "9");
delTask.qps = [delOpen, delClosed, delDraft];
E.closeQp(delClosed, { date: "2026-08-01" });
assert("Before delete: NTP + closed spend on the task", nearly(E.taskUnallocated(delTask), 100000 - 8000 - 4800), E.taskUnallocated(delTask));
assert("Missing QP delete returns null", E.deleteQp(delTask, "nope") == null);
var freeBeforeOpenDel = E.taskUnallocated(delTask);
var gone = E.deleteQp(delTask, delOpen.id);
assert("Deletes the open QP record", gone && gone.qpNumber === "7" && delTask.qps.length === 2);
assert("Open NTP is released to the task", nearly(E.taskUnallocated(delTask), freeBeforeOpenDel + 8000), E.taskUnallocated(delTask));
assert("Posted spend on the deleted QP is gone", nearly(E.taskSpent(delTask), 4800), E.taskSpent(delTask));
E.deleteQp(delTask, delDraft.id);
assert("Draft delete does not change money", nearly(E.taskUnallocated(delTask), 100000 - 4800), E.taskUnallocated(delTask));
E.deleteQp(delTask, delClosed.id);
assert("After all deletes the task is fully free", nearly(E.taskUnallocated(delTask), 100000), E.taskUnallocated(delTask));
assert("Ledger empty after deletes", delTask.qps.length === 0);

var delBulkTask = E.emptyTask("2", 50000);
function makeDel(num, ntp, spent) {
  var q = E.emptyQp(delBulkTask, num);
  q.ntpAmount = ntp;
  q.ntpDate = "2026-04-01";
  if (spent) q.invoices = [{ id: "i" + num, amount: spent, status: "posted" }];
  delBulkTask.qps.push(q);
  return q;
}
var d1 = makeDel("1", 1000, 1000);
var d2 = makeDel("2", 2000, 1500);
var d3 = makeDel("3", 3000, 3000);
var delBatch = E.bulkCloseQps(delBulkTask, [d1.id, d2.id, d3.id], { date: "2026-08-26" });
assert("Delete-bulk starts with 3 QPs", delBatch && delBatch.rows.length === 3);
E.deleteQp(delBulkTask, d2.id);
var leftoverBatch = E.findBulkCloseout(delBulkTask, delBatch.id);
assert("Deleted QP drops from the bulk letter", leftoverBatch && leftoverBatch.rows.length === 2 && leftoverBatch.qpIds.indexOf(d2.id) < 0);
E.deleteQp(delBulkTask, d1.id);
E.deleteQp(delBulkTask, d3.id);
assert("Empty bulk letter is removed", !E.findBulkCloseout(delBulkTask, delBatch.id));

var closedDel = E.emptyTask("9", 10000);
var cq = E.emptyQp(closedDel, "1");
cq.ntpAmount = 1000;
closedDel.qps = [cq];
E.closeTask(closedDel, { date: "2026-08-01" });
assert("Cannot delete QP on a closed task", E.deleteQp(closedDel, cq.id) == null);
assert("Closed-task QP still there", closedDel.qps.length === 1);

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
assert("IDIQ is the only agreement type", E.AGREEMENT_TYPES.length === 1 && E.AGREEMENT_TYPES[0] === "IDIQ");
assert("IDIQ payment methods are unit price and lump sum", E.PAYMENT_METHODS.indexOf("Cost per unit of work") >= 0 && E.PAYMENT_METHODS.indexOf("Lump sum") >= 0 && E.PAYMENT_METHODS.length === 2);
assert("Cost plus is not an IDIQ option", E.PAYMENT_METHODS.indexOf("Cost plus fixed fee") < 0);
assert("Unit-price template maps to cost per unit", E.paymentMethodFromPayItems(true) === "Cost per unit of work");
assert("Lump-sum template maps to lump sum", E.paymentMethodFromPayItems(false) === "Lump sum");
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

/* CGC PDF extract often splits the first pay-item rows (header rules / different Y). */
var cgcSplit = [
  "Date: September 1, 2026",
  "Project Name: SR 10 @ South State Street",
  "Project Design Number: T202504703",
  "AGR: 2019F",
  "Task: Task 4 QP 21",
  "Project Billing Number: T2022-703-02",
  "Item No. Description Units Unit Measure Price Total 2 ADDITIONAL STANDARD PENETRATION TESTS (SPT)",
  "50.00 Each X $ 18.00 = $ 900.00",
  "8 SOIL BORINGS, ATV *including permit if needed",
  "600.00 Linear Foot X $ 16.00 = $ 9,600.00",
  "14 MOBILIZATION OF ATV OR SKID BORING RIG - Kent County",
  "1.00 Each X $ 500.00 = $ 500.00",
  "19 MAN-HOUR OF PROJECT MANAGEMENT 12.00 Per Hour X $ 75.00 = $ 900.00",
  "20 MOT - TWO LANE, TWO-WAY WITH SHOULDER CLOSURE (TA-3) 1.00 Each X $ 450.00 = $ 450.00",
  "43 BOREHOLE ABANDONMENT New Castle, Kent, Sussex County 40.00 Linear Foot X $ 5.75 = $ 230.00",
  "46 QUALIFIED LOGGER 8.00 Per Hour X $ 70.00 = $ 560.00",
  "59 GPS 1.00 each X $ 100.00 = $ 100.00",
  "DNREC Boring Permit 1.00 Each x $ 275.00 = $ 275.00",
  "Total Amount Due: $ 13,515.00",
].join("\n");
var cgc = E.parseConsultantProposal(cgcSplit);
assert("CGC split still finds item 2 SPT", cgc.lines.some(function (l) { return l.itemNo === "2" && nearly(l.amount, 900); }), JSON.stringify(cgc.lines.map(function (l) { return l.itemNo; })));
assert("CGC split still finds item 8 ATV borings", cgc.lines.some(function (l) { return l.itemNo === "8" && nearly(l.qty, 600) && nearly(l.amount, 9600); }));
assert("CGC split still finds item 14 mob", cgc.lines.some(function (l) { return l.itemNo === "14" && nearly(l.amount, 500); }));
assert("CGC split keeps later items", cgc.lines.some(function (l) { return l.itemNo === "19"; }) && cgc.lines.some(function (l) { return l.itemNo === "DNREC"; }));
assert("CGC split has 9 pay items", cgc.lines.length === 9, cgc.lines.length);
assert("CGC split total 13515", nearly(cgc.total, 13515), cgc.total);

/* Task 4 QP20.pdf — Excel font maps unit prices to Greek digits; only MOT 20 stayed ASCII. */
function cgcPdfDigits(s) {
  return String(s).replace(/[0-9.]/g, function (ch) {
    if (ch === ".") return String.fromCharCode(856);
    return String.fromCharCode(1004 + Number(ch));
  });
}
var psi = String.fromCharCode(936);
var qp20Pdf = [
  "Date:",
  "August 28, 2026",
  "Project Name: SR1 0 and S outh State Street",
  "Project Design Number: T202104202",
  "AGR: 2019F - Geotechnical Subsurface Investigation",
  "Task: 4, QP 20",
  "Project Billing Number: T2022-703-02",
  "Item No. Description Units Unit",
  "Measure",
  "Price Total",
  "2 ADDITIONAL STANDARD PENETRATION TESTS (SPT) 21.00 Each X " + cgcPdfDigits("18.00") + " " + psi + " = 378.00 $",
  "8 SOIL BORINGS, ATV *including permit if needed 70.00 Linear Foot X " + cgcPdfDigits("16.00") + " " + psi + " = 1,120.00 $",
  "14 MOBILIZATION OF ATV OR SKID BORING RIG - Kent County 7.00 Each X " + cgcPdfDigits("500.00") + " " + psi + " = 3,500.00 $",
  "19 MAN-HOUR OF PROJECT MANAGEMENT 14.00 Per Hour X " + cgcPdfDigits("75.00") + " " + psi + " = 1,050.00 $",
  "20 MOT - TWO LANE, TWO-WAY WITH SHOULDER CLOSURE (TA-3) 2.00 Each X 450.00 $ = 900.00 $",
  "43 BOREHOLE ABANDONMENT New Castle, Kent, Sussex County 70.00 Linear Foot X " + cgcPdfDigits("5.75") + " " + psi + " = 402.50 $",
  "46 QUALIFIED LOGGER 10.00 Per Hour X " + cgcPdfDigits("70.00") + " " + psi + " = 700.00 $",
  "52 BOREHOLE INFILTRATION TEST Kent County 7.00 Each X " + cgcPdfDigits("650.00") + " " + psi + " = 4,550.00 $",
  "59 GPS 1.00 ĞĂĐŚ X " + cgcPdfDigits("100.00") + " " + psi + " = 100.00 $",
  "DNREC Boring Permit " + cgcPdfDigits("1.00") + " " + String.fromCharCode(28) + "ĂĐŚ x " + cgcPdfDigits("275.00") + " " + psi + " = 275.00 $",
  "*including permit if needed Total Amount Due: 12,975.50 $",
].join("\n");
assert("QP20 font decode 18.00", E.decodeConsultantPdfText(cgcPdfDigits("18.00")) === "18.00");
var qp20 = E.parseConsultantProposal(qp20Pdf);
assert("QP20 agreement 2019F", qp20.agreementCode === "2019F", qp20.agreementCode);
assert("QP20 task 4 from '4, QP 20'", qp20.taskNumber === "4", qp20.taskNumber);
assert("QP20 qp number 20", qp20.qpNumber === "20", qp20.qpNumber);
assert("QP20 date August 28", qp20.dateISO === "2026-08-28", qp20.dateISO);
assert("QP20 design T202104202", qp20.designNo === "T202104202", qp20.designNo);
assert("QP20 has 10 pay items not just MOT 20", qp20.lines.length === 10, JSON.stringify(qp20.lines.map(function (l) { return l.itemNo; })));
assert("QP20 item 2 SPT 378", qp20.lines.some(function (l) { return l.itemNo === "2" && nearly(l.qty, 21) && nearly(l.unitPrice, 18) && nearly(l.amount, 378); }));
assert("QP20 item 8 ATV 1120", qp20.lines.some(function (l) { return l.itemNo === "8" && nearly(l.qty, 70) && nearly(l.unitPrice, 16) && nearly(l.amount, 1120); }));
assert("QP20 item 14 Kent mob 3500", qp20.lines.some(function (l) { return l.itemNo === "14" && nearly(l.amount, 3500); }));
assert("QP20 item 19 PM 1050", qp20.lines.some(function (l) { return l.itemNo === "19" && nearly(l.amount, 1050); }));
assert("QP20 item 20 MOT still 900", qp20.lines.some(function (l) { return l.itemNo === "20" && nearly(l.qty, 2) && nearly(l.amount, 900); }));
assert("QP20 item 43 abandon 402.50", qp20.lines.some(function (l) { return l.itemNo === "43" && nearly(l.unitPrice, 5.75) && nearly(l.amount, 402.5); }));
assert("QP20 item 46 logger 700", qp20.lines.some(function (l) { return l.itemNo === "46" && nearly(l.amount, 700); }));
assert("QP20 item 52 infiltration 4550", qp20.lines.some(function (l) { return l.itemNo === "52" && nearly(l.amount, 4550); }));
assert("QP20 GPS each 100", qp20.lines.some(function (l) { return l.itemNo === "59" && l.unit === "EA" && nearly(l.amount, 100); }));
assert("QP20 DNREC 275", qp20.lines.some(function (l) { return l.itemNo === "DNREC" && nearly(l.qty, 1) && nearly(l.amount, 275); }));
assert("QP20 total 12975.50", nearly(qp20.total, 12975.5), qp20.total);

var qp20DateOrphan = [
  "Date:",
  "Project Name: SR 10 and South State Street",
  "AGR: 2019F",
  "Task: 4, QP 20",
  "2 ADDITIONAL STANDARD PENETRATION TESTS (SPT) 21.00 Each X 18.00 = 378.00",
  "Total Amount Due: 378.00",
  "August 28, 2026",
].join("\n");
assert("QP20 date still found when Excel parks it off the Date: line", E.parseConsultantProposal(qp20DateOrphan).dateISO === "2026-08-28");

var gpsBare = E.parseProposalLine("GPS 1.00 Each X 100.00 100.00");
assert("GPS line without = still parses", gpsBare && gpsBare.itemNo === "GPS" && nearly(gpsBare.amount, 100), gpsBare);

var inv5986Text = [
  "CGC Geoservices, LLC",
  "Invoice #: 5986",
  "Date:",
  "Project Name: SR48 and SR41 Intersection Safety Improvements",
  "Project Design Number: T202104104",
  "AGR: 2019F - Geotechnical Subsurface Investigation",
  "Task: 4, QP14",
  "Project Billing Number: T2022-703-02",
  "2 ADDITIONAL STANDARD PENETRATION TESTS (SPT) 17.00 Each X 18.00 = 306.00",
  "5 ROCK CORE DRILLING (NXM) *including permit if needed 9.00 Linear Foot X 60.00 = 540.00",
  "7 SOIL BORINGS, LAND *including permit if needed 66.00 Linear Foot X 12.00 = 792.00",
  "10 MOBILIZATION OF TRUCK MOUNTED BORING RIG NCC 2.00 Each X 400.00 = 800.00",
  "19 MAN-HOUR OF PROJECT MANAGEMENT 14.00 Per Hour X 75.00 = 1,050.00",
  "20 MOT - TWO LANE, TWO-WAY WITH SHOULDER CLOSURE (TA-3) 1.00 Each X 450.00 = 450.00",
  "21 MOT - TWO LANE, TWO-WAY WITH LANE CLOSURE (TA-10) 1.00 Each X 1,350.00 = 1,350.00",
  "43 BOREHOLE ABANDONMENT New Castle, Kent, Sussex County 75.00 Linear Foot X 5.75 = 431.25",
  "46 QUALIFIED LOGGER 11.00 Per Hour X 70.00 = 770.00",
  "58 ROADWAY PAVEMENT CORING 1.00 Linear Foot X 130.00 = 130.00",
  "DNREC Boring Permit 1.00 Each X 275.00 = 275.00",
  "GPS 1.00 Each X 100.00 100.00",
  "Total Amount Due: 6,994.25",
  "July 12, 2026",
].join("\n");
var inv5986 = E.parseConsultantProposal(inv5986Text);
assert("Invoice 5986 is an invoice", E.isConsultantInvoice(inv5986) && inv5986.invoiceNumber === "5986");
assert("Invoice 5986 finds Task 4 QP 14", inv5986.taskNumber === "4" && inv5986.qpNumber === "14");
assert("Invoice 5986 date July 12", inv5986.dateISO === "2026-07-12", inv5986.dateISO);
assert("Invoice 5986 total 6994.25", nearly(inv5986.total, 6994.25), inv5986.total);
assert("Invoice 5986 has 12 pay items", inv5986.lines.length === 12, inv5986.lines.map(function (l) { return l.itemNo; }).join(","));
assert("Invoice 5986 GPS 100", inv5986.lines.some(function (l) { return l.itemNo === "GPS" && nearly(l.amount, 100); }));

var ntp14Text = [
  "Project Name: SR48 and SR41 Intersection Safety Improvements",
  "Project Design Number: T202104104",
  "AGR: 2019F - Geotechnical Subsurface Investigation",
  "Task: 4, QP14",
  "2 ADDITIONAL STANDARD PENETRATION TESTS (SPT) 18.00 Each X 18.00 = 324.00",
  "5 ROCK CORE DRILLING (NXM) 10.00 Linear Foot X 60.00 = 600.00",
  "8 SOIL BORINGS, ATV *including permit if needed 80.00 Linear Foot X 16.00 = 1,280.00",
  "13 MOBILIZATION OF ATV OR SKID BORING RIG - New Castle County 2.00 Each X 450.00 = 900.00",
  "19 MAN-HOUR OF PROJECT MANAGEMENT 12.00 Per Hour X 75.00 = 900.00",
  "21 MOT - TWO LANE, TWO-WAY WITH LANE CLOSURE (TA-10) 1.00 Each X 1,350.00 = 1,350.00",
  "43 BOREHOLE ABANDONMENT New Castle, Kent, Sussex County 80.00 Linear Foot X 5.75 = 460.00",
  "46 QUALIFIED LOGGER 12.00 Per Hour X 70.00 = 840.00",
  "59 GPS 1.00 each X 100.00 = 100.00",
  "DNREC Boring Permit 1.00 Each x 275.00 = 275.00",
  "Total Amount Due: 7,029.00",
  "April 27, 2026",
].join("\n");
var ntp14 = E.parseConsultantProposal(ntp14Text);
assert("NTP packet is not an invoice", !E.isConsultantInvoice(ntp14));
assert("NTP 14 total 7029", nearly(ntp14.total, 7029), ntp14.total);

var agr14 = { code: "2019F", payItems: global.PsaCatalog.cloneCatalog(), tasks: [] };
var task14 = E.emptyTask("4", 599975);
var qp14 = E.emptyQp(task14, "14");
qp14.project = "SR 48 and SR 41";
qp14.ntpAmount = 7029;
qp14.ntpDate = "2026-04-27";
task14.qps = [qp14];
agr14.tasks = [task14];
E.applyConsultantProposal(agr14, qp14, ntp14);
assert("NTP PDF fills ntpLines on an already-issued QP", qp14.ntpLines && qp14.ntpLines.length === 10, qp14.ntpLines && qp14.ntpLines.length);

var found14 = E.findQpForAssignment(agr14, inv5986);
assert("Finds QP 14 on the ledger", found14 && found14.qp.id === qp14.id);
assert("Missing QP is not created", E.findQpForAssignment(agr14, { taskNumber: "4", qpNumber: "99" }) == null);

var seedInv = E.emptyInvoice("INV-1");
seedInv.date = "2026-07-12";
seedInv.amount = 6994.25;
seedInv.status = "posted";
qp14.invoices = [seedInv];
var applied = E.applyConsultantInvoice(agr14, qp14, inv5986);
assert("Reuses the line-less seed invoice of the same amount", applied.id === seedInv.id && qp14.invoices.length === 1);
assert("Sets invoice number 5986", applied.number === "5986");
assert("Invoice lines attached", applied.lines.length === 12);

var rec14 = E.reconcileInvoiceToNtp(qp14, applied);
assert("Invoice 5986 stays under the NTP dollar cap", nearly(rec14.invoiceAmount, 6994.25) && rec14.remainingAfter > 0 && !rec14.overDollars, rec14.remainingAfter);
assert("PM hours over NTP qty", rec14.rows.some(function (r) { return r.itemNo === "19" && r.status === "over_qty"; }));
assert("Land borings 7 not on NTP", rec14.rows.some(function (r) { return r.itemNo === "7" && r.status === "not_on_ntp"; }));
assert("Truck mob 10 not on NTP", rec14.rows.some(function (r) { return r.itemNo === "10" && r.status === "not_on_ntp"; }));
assert("MOT TA-3 20 not on NTP", rec14.rows.some(function (r) { return r.itemNo === "20" && r.status === "not_on_ntp"; }));
assert("Pavement core 58 not on NTP", rec14.rows.some(function (r) { return r.itemNo === "58" && r.status === "not_on_ntp"; }));
assert("MOT TA-10 matches NTP", rec14.rows.some(function (r) { return r.itemNo === "21" && r.status === "ok"; }));
assert("Review form is blocked", rec14.hasBlocker === true);
var ck14 = E.buildInvoiceChecklist(agr14, task14, qp14, applied);
assert("Checklist will not post Invoice 5986", ck14.requiredFailCount > 0 && ck14.overall === "fail");

if (fails) {
  console.error("\n" + fails + " failed");
  process.exit(1);
}
console.log("\nAll tests passed");
