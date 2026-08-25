/* PSA Trak — money, proposal, NTP, and invoice-checklist engine.
   Works in the browser and in Node tests. */
(function (global) {
  "use strict";

  function money(n) {
    var x = Number(n);
    if (!isFinite(x)) x = 0;
    return Math.round(x * 100) / 100;
  }

  function uid(prefix) {
    return (
      (prefix || "id") +
      "-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function fmtMoney(n) {
    var x = money(n);
    var neg = x < 0;
    var s = Math.abs(x).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (neg ? "-$" : "$") + s;
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    var p = String(iso).slice(0, 10).split("-");
    if (p.length !== 3) return String(iso);
    return p[1] + "/" + p[2] + "/" + p[0];
  }

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function lineExt(line) {
    var qty = Number(line.qty != null ? line.qty : line.reviewedQty);
    var price = Number(
      line.unitPrice != null ? line.unitPrice : line.reviewedUnitPrice
    );
    if (line.amount != null && line.amount !== "" && !(qty && price)) {
      return money(line.amount);
    }
    return money(qty * price);
  }

  function sumLines(lines) {
    return money((lines || []).reduce(function (s, l) {
      return s + lineExt(l);
    }, 0));
  }

  function qpSpent(qp) {
    return money(
      (qp.invoices || [])
        .filter(function (i) {
          return i.status !== "void";
        })
        .reduce(function (s, i) {
          return s + Number(i.amount || 0);
        }, 0)
    );
  }

  function qpNtp(qp) {
    return money(qp.ntpAmount || 0);
  }

  function qpReturned(qp) {
    if (!qp.qpClosed && qp.status !== "canceled") return 0;
    if (qp.returnedRemainder != null && qp.returnedRemainder !== "") {
      return money(qp.returnedRemainder);
    }
    return money(Math.max(qpNtp(qp) - qpSpent(qp), 0));
  }

  function qpRemaining(qp) {
    if (qp.qpClosed || qp.status === "canceled") return 0;
    return money(qpNtp(qp) - qpSpent(qp));
  }

  function qpVariance(qp) {
    return money(qpNtp(qp) - qpSpent(qp));
  }

  function deriveQpStatus(qp) {
    if (qp.status === "canceled" || qp.canceled) return "canceled";
    if (qp.qpClosed) return "closed";
    if (qpNtp(qp) > 0) {
      if (qpSpent(qp) > 0) return qpRemaining(qp) <= 0 ? "spent" : "invoicing";
      return "ntp";
    }
    if (qp.proposal && qp.proposal.status === "approved") return "approved";
    if (qp.proposal && qp.proposal.status === "revision") return "revision";
    if (qp.proposal && (qp.proposal.lines || []).length) return "proposal";
    return "draft";
  }

  function taskAllocated(task) {
    return money(
      (task.qps || []).reduce(function (s, q) {
        return s + qpNtp(q) - qpReturned(q);
      }, 0)
    );
  }

  function taskSpent(task) {
    return money(
      (task.qps || []).reduce(function (s, q) {
        return s + qpSpent(q);
      }, 0)
    );
  }

  function taskUnallocated(task) {
    return money(Number(task.poAmount || 0) - taskAllocated(task));
  }

  function contractRollup(contract) {
    var tasks = contract.tasks || [];
    var po = money(
      tasks.reduce(function (s, t) {
        return s + Number(t.poAmount || 0);
      }, 0)
    );
    var allocated = money(
      tasks.reduce(function (s, t) {
        return s + taskAllocated(t);
      }, 0)
    );
    var spent = money(
      tasks.reduce(function (s, t) {
        return s + taskSpent(t);
      }, 0)
    );
    var cap = money(contract.cap || 0);
    var openQps = 0;
    var closedQps = 0;
    var pendingProposals = 0;
    tasks.forEach(function (t) {
      (t.qps || []).forEach(function (q) {
        var st = deriveQpStatus(q);
        if (st === "closed" || st === "canceled") closedQps++;
        else openQps++;
        if (st === "proposal" || st === "revision") pendingProposals++;
      });
    });
    return {
      cap: cap,
      po: po,
      allocated: allocated,
      spent: spent,
      unallocated: money(po - allocated),
      remainingCap: money(cap - allocated),
      ntpBalance: money(allocated - spent),
      openQps: openQps,
      closedQps: closedQps,
      pendingProposals: pendingProposals,
    };
  }

  function catalogPrice(contract, itemCode) {
    var items = contract.payItems || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].code === itemCode) return Number(items[i].unitPrice || 0);
    }
    return 0;
  }

  function catalogItem(contract, itemCode) {
    var items = contract.payItems || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].code === itemCode) return items[i];
    }
    return null;
  }

  function proposalTotal(proposal) {
    if (!proposal) return 0;
    return money(
      (proposal.lines || []).reduce(function (s, l) {
        var qty =
          l.reviewedQty != null && l.reviewedQty !== ""
            ? Number(l.reviewedQty)
            : Number(l.proposedQty || 0);
        var price =
          l.reviewedUnitPrice != null && l.reviewedUnitPrice !== ""
            ? Number(l.reviewedUnitPrice)
            : Number(l.unitPrice || 0);
        return s + qty * price;
      }, 0)
    );
  }

  function reviewProposal(contract, proposal) {
    var flags = [];
    var lines = (proposal && proposal.lines) || [];
    lines.forEach(function (l, idx) {
      var cat = catalogItem(contract, l.itemCode);
      var proposed = Number(l.proposedQty || 0);
      var reviewed =
        l.reviewedQty != null && l.reviewedQty !== ""
          ? Number(l.reviewedQty)
          : proposed;
      var price = Number(
        l.reviewedUnitPrice != null && l.reviewedUnitPrice !== ""
          ? l.reviewedUnitPrice
          : l.unitPrice || 0
      );
      if (!l.itemCode) {
        flags.push({
          line: idx,
          severity: "warn",
          code: "no_item",
          message: "Line has no pay item code.",
        });
      } else if (!cat) {
        flags.push({
          line: idx,
          severity: "warn",
          code: "unknown_item",
          message: l.itemCode + " is not in this agreement's Appendix C catalog.",
        });
      } else if (cat.unitPrice && money(price) !== money(cat.unitPrice)) {
        flags.push({
          line: idx,
          severity: "fail",
          code: "price_mismatch",
          message:
            l.itemCode +
            " unit price " +
            fmtMoney(price) +
            " does not match catalog " +
            fmtMoney(cat.unitPrice) +
            ".",
        });
      }
      if (reviewed < 0 || proposed < 0) {
        flags.push({
          line: idx,
          severity: "fail",
          code: "neg_qty",
          message: "Quantity cannot be negative.",
        });
      }
      if (reviewed !== proposed) {
        flags.push({
          line: idx,
          severity: "info",
          code: "qty_adjusted",
          message:
            "Engineer quantity " +
            reviewed +
            " differs from proposed " +
            proposed +
            ".",
        });
      }
    });
    var total = proposalTotal(proposal);
    return { flags: flags, total: total };
  }

  function ntpLinesFromProposal(proposal) {
    return ((proposal && proposal.lines) || [])
      .map(function (l) {
        var qty =
          l.reviewedQty != null && l.reviewedQty !== ""
            ? Number(l.reviewedQty)
            : Number(l.proposedQty || 0);
        var price =
          l.reviewedUnitPrice != null && l.reviewedUnitPrice !== ""
            ? Number(l.reviewedUnitPrice)
            : Number(l.unitPrice || 0);
        if (!qty) return null;
        return {
          itemCode: l.itemCode || "",
          description: l.description || "",
          unit: l.unit || "",
          qty: qty,
          unitPrice: money(price),
          amount: money(qty * price),
        };
      })
      .filter(Boolean);
  }

  function issueNtp(qp, dateISO, notes) {
    var lines = ntpLinesFromProposal(qp.proposal);
    var amount = lines.length ? sumLines(lines) : money(qp.proposalAmount || 0);
    if (!amount) amount = money(qp.ntpAmount || 0);
    qp.ntpDate = dateISO || todayISO();
    qp.ntpAmount = amount;
    qp.ntpNotes = notes || "";
    qp.ntpLines = lines;
    if (qp.proposal) qp.proposal.status = "approved";
    qp.status = "ntp";
    qp.qpClosed = false;
    return qp;
  }

  function billedQty(qp, itemCode, excludeInvoiceId) {
    var qty = 0;
    (qp.invoices || []).forEach(function (inv) {
      if (inv.status === "void") return;
      if (excludeInvoiceId && inv.id === excludeInvoiceId) return;
      (inv.lines || []).forEach(function (l) {
        if (l.itemCode === itemCode) qty += Number(l.qty || 0);
      });
    });
    return qty;
  }

  function ntpQty(qp, itemCode) {
    var lines = qp.ntpLines || [];
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].itemCode === itemCode) return Number(lines[i].qty || 0);
    }
    return 0;
  }

  function ntpLine(qp, itemCode) {
    var lines = qp.ntpLines || [];
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].itemCode === itemCode) return lines[i];
    }
    return null;
  }

  var ADMIN_CHECKS = [
    {
      id: "logs_received",
      label: "Boring logs / field records received",
    },
    {
      id: "samples_delivered",
      label: "Samples delivered to the lab",
    },
    {
      id: "mot_ok",
      label: "MOT set up and TMC notified as specified",
    },
    {
      id: "work_complete",
      label: "Invoiced work is complete (or a partial bill is expected)",
    },
    {
      id: "backup",
      label: "Quantity backup (tickets, daily reports) attached",
    },
  ];

  function checkResult(id, label, status, detail, required) {
    return {
      id: id,
      label: label,
      status: status, // pass | fail | warn | na
      detail: detail || "",
      required: !!required,
    };
  }

  function buildInvoiceChecklist(contract, task, qp, invoice) {
    var checks = [];
    var ntpAmt = qpNtp(qp);
    var spentElse = money(
      (qp.invoices || [])
        .filter(function (i) {
          return i.status !== "void" && i.id !== invoice.id;
        })
        .reduce(function (s, i) {
          return s + Number(i.amount || 0);
        }, 0)
    );
    var remaining = money(ntpAmt - spentElse);
    var invAmt = money(invoice.amount || 0);
    var lines = invoice.lines || [];
    var lineSum = sumLines(lines);
    var hasLines = lines.length > 0;

    checks.push(
      checkResult(
        "ntp_issued",
        "NTP has been issued",
        ntpAmt > 0 && qp.ntpDate ? "pass" : "fail",
        ntpAmt > 0
          ? "NTP " + fmtDate(qp.ntpDate) + " for " + fmtMoney(ntpAmt)
          : "No NTP on this QP — do not pay.",
        true
      )
    );

    var open = !qp.qpClosed && qp.status !== "canceled";
    checks.push(
      checkResult(
        "qp_open",
        "QP is open (not closed or canceled)",
        open ? "pass" : "fail",
        open ? "QP " + (qp.qpNumber || "") + " is open." : "QP is closed or canceled.",
        true
      )
    );

    var dateOk = true;
    var dateDetail = "Invoice date " + fmtDate(invoice.date);
    if (qp.ntpDate && invoice.date && invoice.date < qp.ntpDate) {
      dateOk = false;
      dateDetail = "Invoice " + fmtDate(invoice.date) + " is before NTP " + fmtDate(qp.ntpDate) + ".";
    } else if (!invoice.date) {
      dateOk = false;
      dateDetail = "Invoice date is missing.";
    }
    checks.push(
      checkResult(
        "invoice_date",
        "Invoice date is on or after NTP date",
        dateOk ? "pass" : "fail",
        dateDetail,
        true
      )
    );

    if (hasLines) {
      var match = money(invAmt) === money(lineSum);
      checks.push(
        checkResult(
          "total_vs_lines",
          "Invoice total matches line-item extensions",
          match ? "pass" : "fail",
          "Header " + fmtMoney(invAmt) + " vs lines " + fmtMoney(lineSum) + ".",
          true
        )
      );
    } else {
      checks.push(
        checkResult(
          "total_vs_lines",
          "Invoice total matches line-item extensions",
          "warn",
          "Lump-sum invoice — add pay-item quantities to verify against the NTP.",
          false
        )
      );
    }

    var withinNtp = invAmt <= remaining + 0.009;
    checks.push(
      checkResult(
        "within_ntp_balance",
        "Invoice does not exceed remaining NTP balance",
        withinNtp ? "pass" : "fail",
        "Invoice " +
          fmtMoney(invAmt) +
          " · remaining on QP " +
          fmtMoney(remaining) +
          (withinNtp ? "." : " — OVER NTP."),
        true
      )
    );

    var taskSpentElse = money(
      (task.qps || []).reduce(function (s, q) {
        if (q.id === qp.id) return s + spentElse;
        return s + qpSpent(q);
      }, 0)
    );
    var withinPo = taskSpentElse + invAmt <= money(task.poAmount || 0) + 0.009;
    checks.push(
      checkResult(
        "within_task_po",
        "Payment stays within the task PO",
        withinPo ? "pass" : "fail",
        "Task spent after this invoice " +
          fmtMoney(taskSpentElse + invAmt) +
          " of PO " +
          fmtMoney(task.poAmount || 0) +
          ".",
        true
      )
    );

    if (!hasLines) {
      checks.push(
        checkResult(
          "unit_prices",
          "Unit prices match the approved NTP / catalog",
          "na",
          "No line items entered.",
          false
        )
      );
      checks.push(
        checkResult(
          "quantities",
          "Billed quantities do not exceed remaining NTP quantities",
          "na",
          "No line items entered.",
          false
        )
      );
      checks.push(
        checkResult(
          "no_unknown_items",
          "All billed items appear on the NTP",
          "na",
          "No line items entered.",
          false
        )
      );
    } else {
      var priceFail = [];
      var qtyFail = [];
      var unknown = [];
      lines.forEach(function (l) {
        var nLine = ntpLine(qp, l.itemCode);
        if (!nLine && !l.extraWork) {
          unknown.push(l.itemCode || l.description || "(blank)");
        }
        if (nLine && money(l.unitPrice || 0) && money(l.unitPrice) !== money(nLine.unitPrice)) {
          priceFail.push(
            (l.itemCode || "") +
              " billed " +
              fmtMoney(l.unitPrice) +
              " vs NTP " +
              fmtMoney(nLine.unitPrice)
          );
        } else if (
          !nLine &&
          l.itemCode &&
          catalogItem(contract, l.itemCode) &&
          catalogItem(contract, l.itemCode).unitPrice &&
          money(l.unitPrice) !== money(catalogItem(contract, l.itemCode).unitPrice)
        ) {
          priceFail.push((l.itemCode || "") + " billed unit price does not match catalog.");
        }
        if (nLine) {
          var remainQty = nLine.qty - billedQty(qp, l.itemCode, invoice.id);
          if (Number(l.qty || 0) - remainQty > 0.0001) {
            qtyFail.push(
              (l.itemCode || "") +
                " billed " +
                l.qty +
                " " +
                (l.unit || "") +
                " · remaining " +
                remainQty
            );
          }
        }
      });
      checks.push(
        checkResult(
          "unit_prices",
          "Unit prices match the approved NTP / catalog",
          priceFail.length ? "fail" : "pass",
          priceFail.length ? priceFail.join("; ") : "Unit prices match.",
          true
        )
      );
      checks.push(
        checkResult(
          "quantities",
          "Billed quantities do not exceed remaining NTP quantities",
          qtyFail.length ? "fail" : "pass",
          qtyFail.length ? qtyFail.join("; ") : "Quantities within NTP.",
          true
        )
      );
      checks.push(
        checkResult(
          "no_unknown_items",
          "All billed items appear on the NTP (or are marked extra work)",
          unknown.length ? "fail" : "pass",
          unknown.length
            ? "Not on NTP: " + unknown.join(", ")
            : "Every billed item is on the NTP.",
          true
        )
      );
    }

    var admin = invoice.adminChecks || {};
    ADMIN_CHECKS.forEach(function (a) {
      var on = !!admin[a.id];
      checks.push(
        checkResult(
          a.id,
          a.label,
          on ? "pass" : "warn",
          on ? "Confirmed." : "Not confirmed.",
          false
        )
      );
    });

    var requiredFails = checks.filter(function (c) {
      return c.required && c.status === "fail";
    });
    var overall = requiredFails.length ? "fail" : "pass";
    if (overall === "pass" && checks.some(function (c) { return c.status === "warn"; })) {
      overall = "warn";
    }

    return {
      overall: overall,
      remainingBefore: remaining,
      remainingAfter: money(remaining - invAmt),
      lineSum: lineSum,
      checks: checks,
      requiredFailCount: requiredFails.length,
    };
  }

  function nextQpNumber(task) {
    var maxN = 0;
    (task.qps || []).forEach(function (q) {
      var m = String(q.qpNumber || "").match(/^(\d+)/);
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    });
    return String(maxN + 1);
  }

  function closeQp(qp) {
    qp.qpClosed = true;
    qp.status = "closed";
    qp.returnedRemainder = money(Math.max(qpNtp(qp) - qpSpent(qp), 0));
    return qp;
  }

  function reopenQp(qp) {
    qp.qpClosed = false;
    qp.returnedRemainder = 0;
    qp.status = deriveQpStatus(qp);
    return qp;
  }

  function parseTrackerSheet(rows) {
    /* rows: array of arrays from an Excel task sheet.
       Finds the header row with "QP #" and "NTP Amount". */
    var headerIdx = -1;
    var col = {};
    for (var r = 0; r < Math.min(rows.length, 20); r++) {
      var row = rows[r] || [];
      var labels = row.map(function (c) {
        return String(c || "").trim().toLowerCase();
      });
      var qpAt = labels.indexOf("qp #");
      var ntpAt = labels.indexOf("ntp amount");
      if (qpAt >= 0 && ntpAt >= 0) {
        headerIdx = r;
        col.qp = qpAt;
        col.contract = labels.indexOf("contract");
        col.project = labels.indexOf("project");
        col.notes = labels.indexOf("notes");
        col.closed = -1;
        col.ntpDate = -1;
        col.ntpAmt = ntpAt;
        for (var c = 0; c < labels.length; c++) {
          if (labels[c].indexOf("qp closed") >= 0) col.closed = c;
        }
        /* Date immediately left of NTP Amount is the NTP date. */
        col.ntpDate = ntpAt - 1;
        col.invStart = ntpAt + 1;
        break;
      }
    }
    if (headerIdx < 0) return { error: "Could not find a QP # / NTP Amount header row." };
    var qps = [];
    for (var i = headerIdx + 1; i < rows.length; i++) {
      var row = rows[i] || [];
      var qpNum = row[col.qp];
      var project = col.project >= 0 ? row[col.project] : "";
      var ntpAmt = row[col.ntpAmt];
      if (
        (qpNum == null || qpNum === "") &&
        (project == null || project === "") &&
        (ntpAmt == null || ntpAmt === "" || Number(ntpAmt) === 0)
      ) {
        continue;
      }
      if (qpNum == null || qpNum === "") continue;
      var invoices = [];
      var n = 1;
      for (var c = col.invStart; c + 1 < row.length && n <= 40; c += 2, n++) {
        var d = excelDate(row[c]);
        var a = Number(row[c + 1] || 0);
        if ((d || a) && a) {
          invoices.push({
            id: uid("inv"),
            number: "INV-" + n,
            date: d,
            amount: money(a),
            status: "posted",
            lines: [],
            adminChecks: {},
          });
        }
      }
      var notes = col.notes >= 0 ? String(row[col.notes] || "") : "";
      var closedVal = col.closed >= 0 ? row[col.closed] : "";
      var closed = String(closedVal || "").toLowerCase() === "yes";
      var canceled = notes.toLowerCase().indexOf("cancel") >= 0;
      var ntpAmount = money(ntpAmt || 0);
      var qp = {
        id: uid("qp"),
        qpNumber: String(qpNum),
        contractNo: col.contract >= 0 ? String(row[col.contract] || "").trim() : "",
        project: String(project || "").trim(),
        notes: notes,
        status: canceled ? "canceled" : closed ? "closed" : "draft",
        qpClosed: closed,
        ntpDate: excelDate(row[col.ntpDate]),
        ntpAmount: ntpAmount,
        returnedRemainder: 0,
        invoices: invoices,
        proposal: null,
        ntpLines: [],
      };
      if (closed) qp.returnedRemainder = money(Math.max(ntpAmount - qpSpent(qp), 0));
      qp.status = deriveQpStatus(qp);
      if (canceled) qp.status = "canceled";
      qps.push(qp);
    }
    return { qps: qps };
  }

  function excelDate(v) {
    if (v == null || v === "") return null;
    if (v instanceof Date) {
      var m = String(v.getMonth() + 1).padStart(2, "0");
      var d = String(v.getDate()).padStart(2, "0");
      return v.getFullYear() + "-" + m + "-" + d;
    }
    if (typeof v === "number" && v > 20000 && v < 80000) {
      /* Excel serial */
      var epoch = new Date(Date.UTC(1899, 11, 30));
      var dt = new Date(epoch.getTime() + v * 86400000);
      var mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
      var dd = String(dt.getUTCDate()).padStart(2, "0");
      return dt.getUTCFullYear() + "-" + mm + "-" + dd;
    }
    var s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m2) {
      var y = m2[3].length === 2 ? "20" + m2[3] : m2[3];
      return y + "-" + String(m2[1]).padStart(2, "0") + "-" + String(m2[2]).padStart(2, "0");
    }
    return null;
  }

  function emptyQp(task, qpNumber) {
    return {
      id: uid("qp"),
      qpNumber: qpNumber || nextQpNumber(task || { qps: [] }),
      contractNo: "",
      project: "",
      notes: "",
      status: "draft",
      qpClosed: false,
      ntpDate: null,
      ntpAmount: 0,
      returnedRemainder: 0,
      invoices: [],
      proposal: { status: "draft", submittedDate: null, reviewNotes: "", lines: [] },
      ntpLines: [],
      ntpNotes: "",
    };
  }

  function emptyTask(number, poAmount) {
    return {
      id: uid("task"),
      number: String(number || "1"),
      poAmount: money(poAmount || 0),
      closed: false,
      qps: [],
    };
  }

  function emptyInvoice(n) {
    return {
      id: uid("inv"),
      number: n ? String(n) : "",
      date: todayISO(),
      amount: 0,
      status: "draft",
      lines: [],
      adminChecks: {},
    };
  }

  global.PsaEngine = {
    money: money,
    uid: uid,
    fmtMoney: fmtMoney,
    fmtDate: fmtDate,
    todayISO: todayISO,
    lineExt: lineExt,
    sumLines: sumLines,
    qpSpent: qpSpent,
    qpNtp: qpNtp,
    qpReturned: qpReturned,
    qpRemaining: qpRemaining,
    qpVariance: qpVariance,
    deriveQpStatus: deriveQpStatus,
    taskAllocated: taskAllocated,
    taskSpent: taskSpent,
    taskUnallocated: taskUnallocated,
    contractRollup: contractRollup,
    catalogPrice: catalogPrice,
    catalogItem: catalogItem,
    proposalTotal: proposalTotal,
    reviewProposal: reviewProposal,
    ntpLinesFromProposal: ntpLinesFromProposal,
    issueNtp: issueNtp,
    billedQty: billedQty,
    ntpQty: ntpQty,
    buildInvoiceChecklist: buildInvoiceChecklist,
    ADMIN_CHECKS: ADMIN_CHECKS,
    nextQpNumber: nextQpNumber,
    closeQp: closeQp,
    reopenQp: reopenQp,
    parseTrackerSheet: parseTrackerSheet,
    excelDate: excelDate,
    emptyQp: emptyQp,
    emptyTask: emptyTask,
    emptyInvoice: emptyInvoice,
  };
})(typeof window !== "undefined" ? window : global);
