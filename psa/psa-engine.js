/* ConTrak — IDIQ money, proposal, NTP, and invoice-checklist engine.
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

  var MONTHS_LONG = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  function fmtDateLong(iso) {
    if (!iso) return "";
    var p = String(iso).slice(0, 10).split("-");
    if (p.length !== 3) return String(iso);
    var m = Number(p[1]);
    var d = Number(p[2]);
    if (!m || !d || !MONTHS_LONG[m - 1]) return String(iso);
    return MONTHS_LONG[m - 1] + " " + d + ", " + p[0];
  }

  function fmtMoneyLetter(n) {
    var x = money(n);
    var neg = x < 0;
    var abs = Math.abs(x);
    var s;
    if (Math.abs(abs - Math.round(abs)) < 0.005) {
      s = Math.round(abs).toLocaleString("en-US");
    } else {
      s = abs.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    return (neg ? "-$" : "$") + s;
  }

  function unitMeasureOf(line) {
    if (!line) return "";
    if (line.unitMeasure) return line.unitMeasure;
    var u = String(line.unit || "").toUpperCase();
    if (u === "EA" || u === "EACH") return "Each";
    if (u === "LF") return "Linear Foot";
    if (u === "HR") return "Per Hour";
    if (u === "LS") return "LS";
    if (u === "DAY") return "Day";
    return line.unit || "";
  }

  function defaultLetterhead() {
    return {
      secretaryName: "Shanté A. Hastings",
      secretaryTitle: "Secretary",
      officeAddress: "800 BAY ROAD · P.O. BOX 778 · DOVER, DELAWARE 19903",
      deldotMailName: "Department of Transportation",
      deldotStreet: "800 Bay Road",
      deldotPoBox: "P.O. Box 778",
      deldotCity: "Dover, Delaware 19903",
      attention: "Aaron Wieczorek",
      billingLeadIn: "billing ",
      billingContractNo: "T2022-703-02",
      billingContractTitle:
        "Geotechnical Subsurface Investigation (Soil Borings) - Statewide",
      signerName: "Aaron Wieczorek",
      signerTitle: "Soil Lab Supervisor",
      signerPhone: "(302) 760-2395",
      contractorContact: "",
      contractorCredentials: "",
      contractorName: "",
      contractorAddress: "",
      contractorSalutation: "Dear Sir or Madam:",
      contractorPhone: "",
      cc: ["DOT Profservices", "DOT Audit Management", "Kathi Kressman, DelDOT"],
    };
  }

  function ensureLetterhead(contract) {
    var base = defaultLetterhead();
    var extra = (contract && contract.letterhead) || {};
    var lh = Object.assign({}, base, extra);
    if (!lh.contractorName) lh.contractorName = (contract && contract.contractor) || "";
    if (!Array.isArray(lh.cc) || !lh.cc.length) lh.cc = base.cc.slice();
    if (lh.billingLeadIn == null) lh.billingLeadIn = "billing ";
    return lh;
  }

  function ntpPacketLines(qp) {
    if (qp && qp.ntpLines && qp.ntpLines.length) return qp.ntpLines;
    return ntpLinesFromProposal(qp && qp.proposal);
  }

  function buildNtpPacket(contract, task, qp) {
    contract = contract || {};
    task = task || {};
    qp = qp || {};
    var lh = ensureLetterhead(contract);
    var lines = ntpPacketLines(qp);
    var amt = lines.length ? sumLines(lines) : money(qp.ntpAmount || 0);
    var letterDate = qp.ntpLetterDate || qp.ntpDate || todayISO();
    var proposalDate =
      (qp.proposal && qp.proposal.submittedDate) || qp.ntpDate || letterDate;
    var tnum = task.number != null ? String(task.number) : "";
    var qpnum = qp.qpNumber != null ? String(qp.qpNumber) : "";
    var tcode = qp.contractNo || "";
    var project = qp.project || "";
    var ref = tcode && project ? tcode + ", " + project : tcode || project;
    var assignment =
      "Agreement #" +
      (contract.code || "") +
      ", Task " +
      tnum +
      ", Quick Proposal " +
      qpnum;
    if (ref) assignment += " (" + ref + ")";
    var lead = lh.billingLeadIn == null ? "billing " : String(lh.billingLeadIn);
    var body =
      "This letter is in reference to " +
      lead +
      "Contract No. " +
      (lh.billingContractNo || "") +
      " " +
      (lh.billingContractTitle || "") +
      ".\n\nPlease consider this letter as your official notice “Notice to Proceed” with work under the terms of " +
      assignment +
      " in the amount of " +
      fmtMoneyLetter(amt) +
      " per your proposal dated " +
      fmtDateLong(proposalDate) +
      " requested by the Department for the referenced contract. This work may begin immediately.\n\nShould you have any questions, please contact me at " +
      (lh.signerPhone || "") +
      ".";
    var cc = resolveLetterCc(qp.cc, lh, qp.ccExtra);
    return {
      letterDate: letterDate,
      letterDateLong: fmtDateLong(letterDate),
      proposalDate: proposalDate,
      proposalDateLong: fmtDateLong(proposalDate),
      amount: amt,
      amountLetter: fmtMoneyLetter(amt),
      assignment: assignment,
      body: body,
      salutation: lh.contractorSalutation || "Dear Sir or Madam:",
      cc: cc,
      lines: lines,
      proposalRows: lines.map(function (l) {
        return {
          itemNo: l.itemNo || l.itemCode || "",
          description: l.description || "",
          qty: l.qty != null ? l.qty : l.proposedQty,
          unit: l.unit || "",
          unitMeasure: unitMeasureOf(l),
          unitPrice: money(l.unitPrice),
          amount: l.amount != null ? money(l.amount) : lineExt(l),
        };
      }),
      proposalTotal: amt,
      letterhead: lh,
      projectName: (qp.proposal && qp.proposal.projectName) || qp.project || "",
      designNo: qp.contractNo || "",
      billingNo: qp.billingNo || lh.billingContractNo || "",
      agrLine: (contract.code || "") + " - " + (contract.title || ""),
      taskLine: tnum + ", QP" + qpnum,
    };
  }

  function resolveLetterCc(override, letterhead, extra) {
    if (Array.isArray(override)) {
      return override
        .map(function (x) {
          return String(x || "").trim();
        })
        .filter(Boolean);
    }
    var lh = letterhead && letterhead.cc ? letterhead : ensureLetterhead({ letterhead: letterhead || {} });
    var cc = (lh.cc || []).slice();
    (extra || []).forEach(function (x) {
      var s = String(x || "").trim();
      if (s && cc.indexOf(s) < 0) cc.push(s);
    });
    return cc;
  }

  function addLetterCc(list, name) {
    var s = String(name || "").trim();
    var out = (list || []).slice();
    if (!s || out.indexOf(s) >= 0) return out;
    out.push(s);
    return out;
  }

  function removeLetterCc(list, index) {
    return (list || []).filter(function (_x, i) {
      return i !== Number(index);
    });
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

  function taskReturnedToContract(task) {
    if (!task || !task.closed) return 0;
    if (task.returnedToContract != null && task.returnedToContract !== "") {
      return money(task.returnedToContract);
    }
    return money(Math.max(Number(task.poAmount || 0) - taskSpent(task), 0));
  }

  function taskCommitted(task) {
    var po = money(task && task.poAmount);
    if (task && task.closed) return money(po - taskReturnedToContract(task));
    return po;
  }

  function contractAvailable(contract, exceptTaskId) {
    var committed = money(
      (contract.tasks || []).reduce(function (s, t) {
        if (exceptTaskId && t.id === exceptTaskId) return s;
        return s + taskCommitted(t);
      }, 0)
    );
    return money(Number(contract.cap || 0) - committed);
  }

  function qpCounts(task) {
    var total = (task && task.qps ? task.qps.length : 0) || 0;
    var open = 0;
    var closed = 0;
    ((task && task.qps) || []).forEach(function (q) {
      var st = deriveQpStatus(q);
      if (st === "closed" || st === "canceled") closed++;
      else open++;
    });
    return { total: total, open: open, closed: closed };
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
    var funded = money(
      tasks.reduce(function (s, t) {
        return s + taskCommitted(t);
      }, 0)
    );
    var returnedQps = money(
      tasks.reduce(function (s, t) {
        return (
          s +
          (t.qps || []).reduce(function (ss, q) {
            return ss + qpReturned(q);
          }, 0)
        );
      }, 0)
    );
    var returnedTasks = money(
      tasks.reduce(function (s, t) {
        return s + taskReturnedToContract(t);
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
      funded: funded,
      allocated: allocated,
      spent: spent,
      unallocated: money(po - allocated),
      remainingCap: money(cap - allocated),
      availableOnAgreement: money(cap - funded),
      ntpBalance: money(allocated - spent),
      returnedQps: returnedQps,
      returnedTasks: returnedTasks,
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

  function catalogItemByNo(contract, itemNo) {
    var no = String(itemNo || "").trim().toUpperCase();
    if (!no) return null;
    var items = (contract && contract.payItems) || [];
    for (var i = 0; i < items.length; i++) {
      if (String(items[i].itemNo || "").trim().toUpperCase() === no) return items[i];
    }
    return null;
  }

  var UNIT_WORDS = {
    each: { unit: "EA", unitMeasure: "Each" },
    ea: { unit: "EA", unitMeasure: "Each" },
    "linear foot": { unit: "LF", unitMeasure: "Linear Foot" },
    lf: { unit: "LF", unitMeasure: "Linear Foot" },
    "per hour": { unit: "HR", unitMeasure: "Per Hour" },
    hr: { unit: "HR", unitMeasure: "Per Hour" },
    hour: { unit: "HR", unitMeasure: "Per Hour" },
    day: { unit: "DAY", unitMeasure: "Day" },
    ls: { unit: "LS", unitMeasure: "LS" },
    "lump sum": { unit: "LS", unitMeasure: "LS" },
  };

  function parseMoneyToken(s) {
    return money(String(s || "").replace(/[$,]/g, "").trim());
  }

  function parseProposalDate(s) {
    if (!s) return null;
    var iso = excelDate(s);
    if (iso) return iso;
    var m = String(s).match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
    if (!m) return null;
    var mi = -1;
    var name = m[1].toLowerCase();
    MONTHS_LONG.forEach(function (mo, i) {
      if (mo.toLowerCase() === name || mo.toLowerCase().slice(0, 3) === name.slice(0, 3)) {
        mi = i;
      }
    });
    if (mi < 0) return null;
    return m[3] + "-" + String(mi + 1).padStart(2, "0") + "-" + String(m[2]).padStart(2, "0");
  }

  function fieldAfter(text, label, nextLabels) {
    var src = " " + text + " ";
    var start = src.search(new RegExp(label + "\\s*[:\\-]?\\s*", "i"));
    if (start < 0) return "";
    var rest = src.slice(start).replace(new RegExp("^.*?" + label + "\\s*[:\\-]?\\s*", "i"), "");
    var cut = rest.length;
    (nextLabels || []).forEach(function (n) {
      var at = rest.search(new RegExp("\\s" + n + "(?:\\s*[:.\\-]|$|\\s)", "i"));
      if (at >= 0 && at < cut) cut = at;
    });
    return rest.slice(0, cut).replace(/\s+/g, " ").trim();
  }

  function stripProposalHeader(s) {
    return String(s || "")
      .replace(/\u00a0/g, " ")
      .replace(/\t/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\s*\$\s*/g, " ")
      .replace(
        /^item\s*no\.?\s+description\s+units\s+unit\s+measure\s+price\s+total\s+/i,
        ""
      )
      .trim();
  }

  function parseProposalLine(line) {
    var s = stripProposalHeader(line);
    if (!s || /total amount due/i.test(s)) return null;
    var m = s.match(
      /^(\d{1,3}|DNREC)\s+(.+?)\s+([\d,]+\.\d{2})\s+(Each|Linear Foot|Per Hour|ls|LS|Day|EA|LF|HR)\s*[Xx×]\s*([\d,]+\.\d{2})\s*=\s*([\d,]+\.\d{2})/i
    );
    if (!m) return null;
    var unitKey = m[4].toLowerCase();
    var u = UNIT_WORDS[unitKey] || { unit: m[4], unitMeasure: m[4] };
    return {
      itemNo: String(m[1]).toUpperCase() === "DNREC" ? "DNREC" : m[1],
      description: m[2].replace(/\*including permit if needed/i, "").trim(),
      qty: parseMoneyToken(m[3]),
      unit: u.unit,
      unitMeasure: u.unitMeasure,
      unitPrice: parseMoneyToken(m[5]),
      amount: parseMoneyToken(m[6]),
    };
  }

  function looksLikeItemStart(line) {
    return /^(\d{1,3}|DNREC)\s+[A-Za-z*]/i.test(stripProposalHeader(line));
  }

  function collectProposalLines(raw) {
    var chunks = String(raw || "")
      .split(/\n/)
      .map(function (ln) {
        return ln.replace(/\s+/g, " ").trim();
      })
      .filter(Boolean);
    var lines = [];
    var seen = {};
    function add(row) {
      if (!row || seen[String(row.itemNo)]) return;
      seen[String(row.itemNo)] = true;
      lines.push(row);
    }
    var i;
    for (i = 0; i < chunks.length; i++) {
      var buf = chunks[i];
      var row = parseProposalLine(buf);
      while (
        !row &&
        i + 1 < chunks.length &&
        !looksLikeItemStart(chunks[i + 1]) &&
        !/total amount due/i.test(chunks[i + 1])
      ) {
        i += 1;
        buf += " " + chunks[i];
        row = parseProposalLine(buf);
      }
      add(row);
    }
    var flat = stripProposalHeader(chunks.join(" "));
    var re = /(\d{1,3}|DNREC)\s+/gi;
    var mm;
    while ((mm = re.exec(flat))) {
      add(parseProposalLine(flat.slice(mm.index)));
    }
    return lines;
  }

  function parseConsultantProposal(text) {
    var raw = String(text || "").replace(/\u00a0/g, " ");
    var flat = raw.replace(/[ \t]+/g, " ");
    var one = flat.replace(/\n+/g, " ");
    var labels = [
      "Date",
      "Project Name",
      "Project Design Number",
      "AGR",
      "Task",
      "Project Billing Number",
      "Item No",
    ];
    var agr = fieldAfter(one, "AGR", ["Task", "Project Billing Number", "Item No"]);
    var agrCode = "";
    var agrM = agr.match(/^([A-Za-z0-9]+)/);
    if (agrM) agrCode = agrM[1];
    var taskRaw = fieldAfter(one, "Task", ["Project Billing Number", "Item No", "Date"]);
    var taskNumber = "";
    var qpNumber = "";
    var tqp = taskRaw.match(/(?:Task\s*)?(\d+)\s*(?:QP|Quick Proposal)?\s*(\d+[A-Za-z]?)/i);
    if (tqp) {
      taskNumber = tqp[1];
      qpNumber = tqp[2];
    }
    var lines = collectProposalLines(raw);
    var totalM = one.match(/Total Amount Due:\s*\$?\s*([\d,]+\.\d{2})/i);
    var total = totalM ? parseMoneyToken(totalM[1]) : sumLines(lines);
    var designNo = fieldAfter(one, "Project Design Number", labels);
    if (/X{3,}/i.test(designNo)) designNo = "";
    var billingRaw = fieldAfter(one, "Project Billing Number", ["Item No", "Date"]);
    var billM = billingRaw.match(/T[A-Z0-9\-]+/i);
    var billingNo = billM ? billM[0] : billingRaw.split(/\s+/)[0] || "";
    return {
      dateISO: parseProposalDate(fieldAfter(one, "Date", ["Project Name", "AGR"])),
      projectName: fieldAfter(one, "Project Name", ["Project Design Number", "AGR", "Task"]),
      designNo: designNo,
      agreementCode: agrCode,
      agreementLine: agr,
      taskNumber: taskNumber,
      qpNumber: qpNumber,
      billingNo: billingNo,
      total: total,
      lines: lines,
    };
  }

  function applyConsultantProposal(contract, qp, parsed) {
    parsed = parsed || {};
    qp = qp || emptyQp();
    if (parsed.qpNumber) qp.qpNumber = String(parsed.qpNumber);
    if (parsed.projectName) qp.project = parsed.projectName;
    if (parsed.designNo) qp.contractNo = parsed.designNo;
    if (parsed.billingNo) qp.billingNo = parsed.billingNo;
    qp.proposal = qp.proposal || {
      status: "draft",
      submittedDate: null,
      projectName: "",
      reviewNotes: "",
      lines: [],
    };
    if (parsed.dateISO) qp.proposal.submittedDate = parsed.dateISO;
    if (parsed.projectName) qp.proposal.projectName = parsed.projectName;
    qp.proposal.source = "consultant-pdf";
    qp.proposal.status = "draft";
    qp.proposal.lines = (parsed.lines || []).map(function (l) {
      var cat = catalogItemByNo(contract, l.itemNo);
      return {
        itemCode: cat ? cat.code : String(l.itemNo || ""),
        itemNo: l.itemNo || (cat && cat.itemNo) || "",
        description: (cat && cat.description) || l.description || "",
        unit: (cat && cat.unit) || l.unit || "",
        unitMeasure: (cat && cat.unitMeasure) || l.unitMeasure || "",
        proposedQty: l.qty,
        unitPrice: l.unitPrice,
        amount: l.amount,
      };
    });
    if (parsed.total) qp.proposalAmount = parsed.total;
    return qp;
  }

  function findOrCreateQpForProposal(contract, parsed) {
    parsed = parsed || {};
    contract.tasks = contract.tasks || [];
    var taskNum = parsed.taskNumber ? String(parsed.taskNumber) : "";
    var task = null;
    if (taskNum) {
      contract.tasks.forEach(function (t) {
        if (String(t.number) === taskNum) task = t;
      });
    }
    if (!task) {
      task = contract.tasks[0] || emptyTask(taskNum || "1", 0);
      if (contract.tasks.indexOf(task) < 0) contract.tasks.push(task);
    }
    var qp = null;
    if (parsed.qpNumber) {
      (task.qps || []).forEach(function (q) {
        if (String(q.qpNumber) === String(parsed.qpNumber)) qp = q;
      });
    }
    var created = !qp;
    if (!qp) {
      qp = emptyQp(task, parsed.qpNumber || nextQpNumber(task));
      task.qps = task.qps || [];
      task.qps.push(qp);
    }
    applyConsultantProposal(contract, qp, parsed);
    return { task: task, qp: qp, created: created };
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

  var AGREEMENT_TYPES = ["IDIQ"];
  var PAYMENT_METHODS = ["Cost per unit of work", "Lump sum"];

  function paymentMethodFromPayItems(payItems) {
    return payItems ? "Cost per unit of work" : "Lump sum";
  }

  function emptyPspm() {
    return {
      workPlan: false,
      schedule: false,
      auditReview: false,
      dbeGoal: false,
      dbeNa: false,
      fundingAuthorized: false,
    };
  }

  function ensurePspm(qp) {
    if (!qp) return emptyPspm();
    var base = emptyPspm();
    var extra = qp.pspm && typeof qp.pspm === "object" ? qp.pspm : {};
    qp.pspm = Object.assign({}, base, extra);
    return qp.pspm;
  }

  function usesFederalFunds(contract) {
    var f = String((contract && contract.funding) || "").toLowerCase();
    if (!f) return true;
    if (/\bstate\b/.test(f) && !/federal|fhwa|fahp|cfda/.test(f)) return false;
    return true;
  }

  function estimateVariance(independentEstimate, proposedTotal) {
    var est = money(independentEstimate || 0);
    var tot = money(proposedTotal || 0);
    if (!est) {
      return {
        status: "missing",
        delta: tot,
        pct: null,
        message:
          "Independent estimate not entered. PSPM §14 requires the PM to prepare a scope of work and independent estimate before reviewing the consultant cost proposal.",
      };
    }
    var delta = money(tot - est);
    var pct = est ? delta / est : 0;
    if (delta > 0.009) {
      return {
        status: "over",
        delta: delta,
        pct: pct,
        message:
          "Proposal " +
          fmtMoney(tot) +
          " exceeds independent estimate " +
          fmtMoney(est) +
          " by " +
          fmtMoney(delta) +
          " (" +
          Math.round(pct * 100) +
          "%). Negotiate against the estimate (PSPM §9).",
      };
    }
    return {
      status: "ok",
      delta: delta,
      pct: pct,
      message:
        "Proposal " +
        fmtMoney(tot) +
        " is at or under independent estimate " +
        fmtMoney(est) +
        ".",
    };
  }

  function ntpScopeChange(previousNtp, nextAmount) {
    var oldAmt = money(previousNtp || 0);
    var next = money(nextAmount || 0);
    if (!oldAmt) {
      return { kind: "initial", previous: oldAmt, next: next, pct: 0, message: "" };
    }
    var delta = money(next - oldAmt);
    var pct = oldAmt ? Math.abs(delta) / oldAmt : 0;
    if (delta > 0.009) {
      return {
        kind: "increase",
        previous: oldAmt,
        next: next,
        pct: pct,
        message:
          "Additional work outside the initial scope needs a new proposal (work plan, cost, schedule) and a new NTP (PSPM §14).",
      };
    }
    if (pct + 1e-9 >= 0.2 && delta < -0.009) {
      return {
        kind: "reduction",
        previous: oldAmt,
        next: next,
        pct: pct,
        message:
          "Cost reduced " +
          Math.round(pct * 100) +
          "% from the issued NTP. PSPM §14 requires an adjusted proposal when the work is 20% or more below the original.",
      };
    }
    return { kind: "revise", previous: oldAmt, next: next, pct: pct, message: "" };
  }

  function ntpGate(contract, qp) {
    qp = qp || {};
    var pspm = ensurePspm(qp);
    var proposal = qp.proposal || {};
    var total = proposalTotal(proposal);
    if (!total) total = money(qp.ntpAmount || qp.proposalAmount || 0);
    var hasCost = (proposal.lines && proposal.lines.length > 0) || total > 0;
    var federal = usesFederalFunds(contract);
    var est = estimateVariance(qp.independentEstimate, total);
    var steps = [];

    steps.push({
      id: "independent_estimate",
      label: "PM prepared a scope of work and independent estimate",
      required: true,
      status: est.status === "missing" ? "fail" : "pass",
      detail:
        est.status === "missing"
          ? est.message
          : "Estimate " +
            fmtMoney(qp.independentEstimate) +
            (est.status === "over" ? " — " + est.message : "."),
    });

    var proposalOk = !!(hasCost && pspm.workPlan && pspm.schedule);
    steps.push({
      id: "proposal_complete",
      label: "Consultant proposal includes work plan, cost, and schedule",
      required: true,
      status: proposalOk ? "pass" : "fail",
      detail: proposalOk
        ? "Work plan, cost, and schedule marked complete."
        : [
            hasCost ? "" : "Cost proposal missing.",
            pspm.workPlan ? "" : "Work plan not confirmed.",
            pspm.schedule ? "" : "Schedule not confirmed.",
          ]
            .filter(Boolean)
            .join(" "),
    });

    steps.push({
      id: "audit_review",
      label: "Audit pre-award review or risk assessment complete",
      required: true,
      status: pspm.auditReview ? "pass" : "fail",
      detail: pspm.auditReview
        ? "CCC forwarded the proposal; Audit review recorded."
        : "PSPM §14: CCC sends the proposal to Audit for a pre-award review (or a risk assessment if below the mandatory threshold).",
    });

    if (federal && !pspm.dbeNa) {
      steps.push({
        id: "dbe_goal",
        label: "DBE goal set for this assignment (federal funds)",
        required: true,
        status: pspm.dbeGoal ? "pass" : "fail",
        detail: pspm.dbeGoal
          ? "DBE review recorded."
          : "Federal funds: CCC sends the proposal to DBE so a goal can be set for the assignment.",
      });
    } else {
      steps.push({
        id: "dbe_goal",
        label: "DBE goal (federal funds only)",
        required: false,
        status: "na",
        detail: "Not required on this agreement (state-only, or marked N/A).",
      });
    }

    steps.push({
      id: "funding",
      label: "Funding authorized for this task",
      required: true,
      status: pspm.fundingAuthorized ? "pass" : "fail",
      detail: pspm.fundingAuthorized
        ? "Funding authorization recorded."
        : "NTP issues after funding approval for the task is received (PSPM §14).",
    });

    var requiredFails = steps.filter(function (s) {
      return s.required && s.status === "fail";
    });
    return {
      ready: requiredFails.length === 0,
      federal: federal,
      estimate: est,
      steps: steps,
      requiredFailCount: requiredFails.length,
      missingLabels: requiredFails.map(function (s) {
        return s.label;
      }),
    };
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
          itemNo: l.itemNo || l.itemCode || "",
          description: l.description || "",
          unit: l.unit || "",
          unitMeasure: l.unitMeasure || "",
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

  function templateOrDefault(template) {
    if (template && typeof template === "object") return template;
    return {
      assignmentNoun: "QP",
      assignmentNounPlural: "QPs",
      taskNoun: "Task",
      workflow: { proposal: true, ntp: true, payItems: true, invoices: true },
      autoChecks: {},
      adminChecks: ADMIN_CHECKS,
    };
  }

  function autoWanted(template, id) {
    var ac = template.autoChecks || {};
    if (ac[id] === false) return false;
    var wf = template.workflow || {};
    if (wf.ntp === false && (id === "ntp_issued" || id === "within_ntp_balance")) {
      return false;
    }
    if (wf.payItems === false && (id === "unit_prices" || id === "quantities" || id === "no_unknown_items")) {
      return false;
    }
    return true;
  }

  function buildInvoiceChecklist(contract, task, qp, invoice, template) {
    template = templateOrDefault(template);
    var noun = template.assignmentNoun || "QP";
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

    if (autoWanted(template, "ntp_issued")) {
      checks.push(
        checkResult(
          "ntp_issued",
          "NTP has been issued",
          ntpAmt > 0 && qp.ntpDate ? "pass" : "fail",
          ntpAmt > 0
            ? "NTP " + fmtDate(qp.ntpDate) + " for " + fmtMoney(ntpAmt)
            : "No NTP on this " + noun + " — do not pay.",
          true
        )
      );
    }

    var open = !qp.qpClosed && qp.status !== "canceled";
    if (autoWanted(template, "qp_open")) {
      checks.push(
        checkResult(
          "qp_open",
          noun + " is open (not closed or canceled)",
          open ? "pass" : "fail",
          open
            ? noun + " " + (qp.qpNumber || "") + " is open."
            : noun + " is closed or canceled.",
          true
        )
      );
    }

    var dateOk = true;
    var dateDetail = "Invoice date " + fmtDate(invoice.date);
    if (qp.ntpDate && invoice.date && invoice.date < qp.ntpDate) {
      dateOk = false;
      dateDetail = "Invoice " + fmtDate(invoice.date) + " is before NTP " + fmtDate(qp.ntpDate) + ".";
    } else if (!invoice.date) {
      dateOk = false;
      dateDetail = "Invoice date is missing.";
    }
    if (autoWanted(template, "invoice_date")) {
      checks.push(
        checkResult(
          "invoice_date",
          qp.ntpDate
            ? "Invoice date is on or after NTP date (earliest date work may begin)"
            : "Invoice date is present",
          dateOk ? "pass" : "fail",
          dateOk
            ? dateDetail
            : dateDetail +
              (qp.ntpDate
                ? " PSPM §14: the NTP date is the earliest date work may begin."
                : ""),
          true
        )
      );
    }

    if (autoWanted(template, "total_vs_lines")) {
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
    }

    var withinNtp = invAmt <= remaining + 0.009;
    if (autoWanted(template, "within_ntp_balance")) {
      checks.push(
        checkResult(
          "within_ntp_balance",
          "Invoice does not exceed remaining NTP balance",
          withinNtp ? "pass" : "fail",
          "Invoice " +
            fmtMoney(invAmt) +
            " · remaining on " +
            noun +
            " " +
            fmtMoney(remaining) +
            (withinNtp ? "." : " — OVER NTP."),
          true
        )
      );
    }

    var taskSpentElse = money(
      (task.qps || []).reduce(function (s, q) {
        if (q.id === qp.id) return s + spentElse;
        return s + qpSpent(q);
      }, 0)
    );
    var withinPo = taskSpentElse + invAmt <= money(task.poAmount || 0) + 0.009;
    if (autoWanted(template, "within_task_po")) {
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
    }

    if (autoWanted(template, "unit_prices") || autoWanted(template, "quantities") || autoWanted(template, "no_unknown_items")) {
      if (!hasLines) {
        if (autoWanted(template, "unit_prices")) {
          checks.push(
            checkResult(
              "unit_prices",
              "Unit prices match the approved NTP / catalog",
              "na",
              "No line items entered.",
              false
            )
          );
        }
        if (autoWanted(template, "quantities")) {
          checks.push(
            checkResult(
              "quantities",
              "Billed quantities do not exceed remaining NTP quantities",
              "na",
              "No line items entered.",
              false
            )
          );
        }
        if (autoWanted(template, "no_unknown_items")) {
          checks.push(
            checkResult(
              "no_unknown_items",
              "All billed items appear on the NTP",
              "na",
              "No line items entered.",
              false
            )
          );
        }
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
        if (autoWanted(template, "unit_prices")) {
          checks.push(
            checkResult(
              "unit_prices",
              "Unit prices match the approved NTP / catalog",
              priceFail.length ? "fail" : "pass",
              priceFail.length ? priceFail.join("; ") : "Unit prices match.",
              true
            )
          );
        }
        if (autoWanted(template, "quantities")) {
          checks.push(
            checkResult(
              "quantities",
              "Billed quantities do not exceed remaining NTP quantities",
              qtyFail.length ? "fail" : "pass",
              qtyFail.length ? qtyFail.join("; ") : "Quantities within NTP.",
              true
            )
          );
        }
        if (autoWanted(template, "no_unknown_items")) {
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
      }
    }

    var admin = invoice.adminChecks || {};
    var adminList = Array.isArray(template.adminChecks) && template.adminChecks.length
      ? template.adminChecks
      : ADMIN_CHECKS;
    adminList.forEach(function (a) {
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

  function qpLeftover(qp) {
    return money(Math.max(qpNtp(qp) - qpSpent(qp), 0));
  }

  function isQpCloseable(qp) {
    return !!(qp && !qp.qpClosed && qp.status !== "canceled" && !qp.canceled);
  }

  function closeableQps(task) {
    return (task && task.qps ? task.qps : []).filter(isQpCloseable);
  }

  function qpNumberSortKey(n) {
    var s = String(n || "");
    var m = s.match(/^(\d+)(.*)$/);
    return m ? [parseInt(m[1], 10), m[2] || ""] : [99999, s];
  }

  function sortQpsByNumber(qps) {
    return (qps || []).slice().sort(function (a, b) {
      var ka = qpNumberSortKey(a.qpNumber);
      var kb = qpNumberSortKey(b.qpNumber);
      if (ka[0] !== kb[0]) return ka[0] - kb[0];
      if (ka[1] < kb[1]) return -1;
      if (ka[1] > kb[1]) return 1;
      return 0;
    });
  }

  function qpsByIds(task, ids) {
    var wanted = {};
    (ids || []).forEach(function (id) {
      wanted[String(id)] = true;
    });
    return sortQpsByNumber(
      (task && task.qps ? task.qps : []).filter(function (q) {
        return wanted[String(q.id)];
      })
    );
  }

  function closeoutSnapshot(qp) {
    qp = qp || {};
    return {
      id: qp.id,
      qpNumber: qp.qpNumber,
      project: qp.project || "",
      contractNo: qp.contractNo || "",
      billingNo: qp.billingNo || "",
      ntpAmount: qpNtp(qp),
      spent: qpSpent(qp),
      returned: qp.qpClosed ? qpReturned(qp) : qpLeftover(qp),
    };
  }

  function sumCloseoutRows(rows) {
    var ntpAmount = 0;
    var spent = 0;
    var returned = 0;
    (rows || []).forEach(function (r) {
      ntpAmount += Number(r.ntpAmount || 0);
      spent += Number(r.spent || 0);
      returned += Number(r.returned || 0);
    });
    return {
      count: (rows || []).length,
      ntpAmount: money(ntpAmount),
      spent: money(spent),
      returned: money(returned),
    };
  }

  function closeQp(qp, opts) {
    opts = opts || {};
    qp.qpClosed = true;
    qp.status = "closed";
    qp.closeoutDate = opts.date || qp.closeoutDate || todayISO();
    if (opts.notes != null) qp.closeoutNotes = opts.notes;
    qp.returnedRemainder = qpLeftover(qp);
    return qp;
  }

  function reopenQp(qp, task) {
    qp.qpClosed = false;
    qp.returnedRemainder = 0;
    qp.closeoutDate = null;
    qp.status = deriveQpStatus(qp);
    if (task) detachQpFromBulkCloseouts(task, qp.id);
    return qp;
  }

  function detachQpFromBulkCloseouts(task, qpId) {
    if (!task || !task.bulkCloseouts) return;
    task.bulkCloseouts = task.bulkCloseouts
      .map(function (b) {
        var rows = (b.rows || []).filter(function (r) {
          return String(r.id) !== String(qpId);
        });
        var qpIds = (b.qpIds || []).filter(function (id) {
          return String(id) !== String(qpId);
        });
        if (!rows.length) return null;
        b.rows = rows;
        b.qpIds = qpIds;
        b.totals = sumCloseoutRows(rows);
        return b;
      })
      .filter(Boolean);
  }

  function bulkCloseQps(task, qpIds, opts) {
    opts = opts || {};
    if (!task) return null;
    var date = opts.date || todayISO();
    var notes = opts.notes != null ? opts.notes : "";
    var closed = [];
    qpsByIds(task, qpIds).forEach(function (q) {
      if (!isQpCloseable(q)) return;
      closeQp(q, { date: date, notes: notes });
      closed.push(q);
    });
    if (!closed.length) return null;
    var batch = {
      id: opts.id || uid("bulk"),
      date: date,
      notes: notes,
      cc: Array.isArray(opts.cc) ? opts.cc.slice() : null,
      qpIds: closed.map(function (q) {
        return q.id;
      }),
      rows: closed.map(closeoutSnapshot),
    };
    batch.totals = sumCloseoutRows(batch.rows);
    task.bulkCloseouts = task.bulkCloseouts || [];
    task.bulkCloseouts.push(batch);
    return batch;
  }

  function findBulkCloseout(task, id) {
    var list = (task && task.bulkCloseouts) || [];
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(id)) return list[i];
    }
    return null;
  }

  function undoBulkCloseout(task, batchId) {
    var batch = findBulkCloseout(task, batchId);
    if (!batch) return null;
    qpsByIds(task, batch.qpIds).forEach(function (q) {
      if (!q.qpClosed) return;
      q.qpClosed = false;
      q.returnedRemainder = 0;
      q.closeoutDate = null;
      q.status = deriveQpStatus(q);
    });
    task.bulkCloseouts = (task.bulkCloseouts || []).filter(function (b) {
      return String(b.id) !== String(batchId);
    });
    return batch;
  }

  function closeTask(task, opts) {
    opts = opts || {};
    var date = opts.date || todayISO();
    (task.qps || []).forEach(function (q) {
      if (!q.qpClosed && q.status !== "canceled") {
        closeQp(q, {
          date: date,
          notes: q.closeoutNotes || "Closed with task close-out.",
        });
      }
    });
    task.closed = true;
    task.closeoutDate = date;
    if (opts.notes != null) task.closeoutNotes = opts.notes;
    task.returnedToContract = money(
      Math.max(Number(task.poAmount || 0) - taskSpent(task), 0)
    );
    return task;
  }

  function reopenTask(task) {
    task.closed = false;
    task.returnedToContract = 0;
    task.closeoutDate = null;
    return task;
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
      proposal: { status: "draft", submittedDate: null, projectName: "", reviewNotes: "", lines: [] },
      ntpLines: [],
      ntpNotes: "",
      ntpLetterDate: null,
      billingNo: "",
      ccExtra: [],
      cc: null,
      closeoutCc: null,
      closeoutDate: null,
      closeoutNotes: "",
      independentEstimate: 0,
      pspm: emptyPspm(),
      proposalPdf: null,
    };
  }

  function emptyTask(number, poAmount) {
    return {
      id: uid("task"),
      number: String(number || "1"),
      poAmount: money(poAmount || 0),
      closed: false,
      closeoutDate: null,
      closeoutNotes: "",
      returnedToContract: 0,
      bulkCloseouts: [],
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
    fmtDateLong: fmtDateLong,
    fmtMoneyLetter: fmtMoneyLetter,
    unitMeasureOf: unitMeasureOf,
    defaultLetterhead: defaultLetterhead,
    ensureLetterhead: ensureLetterhead,
    buildNtpPacket: buildNtpPacket,
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
    taskReturnedToContract: taskReturnedToContract,
    taskCommitted: taskCommitted,
    contractAvailable: contractAvailable,
    qpCounts: qpCounts,
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
    qpLeftover: qpLeftover,
    isQpCloseable: isQpCloseable,
    closeableQps: closeableQps,
    qpsByIds: qpsByIds,
    closeoutSnapshot: closeoutSnapshot,
    sumCloseoutRows: sumCloseoutRows,
    closeQp: closeQp,
    resolveLetterCc: resolveLetterCc,
    addLetterCc: addLetterCc,
    removeLetterCc: removeLetterCc,
    reopenQp: reopenQp,
    undoBulkCloseout: undoBulkCloseout,
    bulkCloseQps: bulkCloseQps,
    findBulkCloseout: findBulkCloseout,
    closeTask: closeTask,
    reopenTask: reopenTask,
    parseTrackerSheet: parseTrackerSheet,
    excelDate: excelDate,
    emptyQp: emptyQp,
    emptyTask: emptyTask,
    emptyInvoice: emptyInvoice,
    AGREEMENT_TYPES: AGREEMENT_TYPES,
    PAYMENT_METHODS: PAYMENT_METHODS,
    paymentMethodFromPayItems: paymentMethodFromPayItems,
    emptyPspm: emptyPspm,
    ensurePspm: ensurePspm,
    usesFederalFunds: usesFederalFunds,
    estimateVariance: estimateVariance,
    ntpScopeChange: ntpScopeChange,
    ntpGate: ntpGate,
    catalogItemByNo: catalogItemByNo,
    parseConsultantProposal: parseConsultantProposal,
    parseProposalLine: parseProposalLine,
    applyConsultantProposal: applyConsultantProposal,
    findOrCreateQpForProposal: findOrCreateQpForProposal,
  };
})(typeof window !== "undefined" ? window : global);
