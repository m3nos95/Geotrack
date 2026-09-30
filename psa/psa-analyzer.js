/* ConTrak project analyzer — drop a boring request, estimate each contractor
   from how they billed similar jobs (extras included). Browser + Node tests. */
(function (global) {
  "use strict";

  function engine() {
    return global.PsaEngine;
  }

  function catalog() {
    return global.PsaCatalog;
  }

  function money(n) {
    return engine().money(n);
  }

  function median(arr) {
    var s = (arr || []).filter(function (x) {
      return isFinite(Number(x));
    }).map(Number).sort(function (a, b) {
      return a - b;
    });
    if (!s.length) return 0;
    var m = Math.floor(s.length / 2);
    if (s.length % 2) return s[m];
    return (s[m - 1] + s[m]) / 2;
  }

  function qtyOf(line) {
    if (!line) return 0;
    var q = line.proposedQty != null && line.proposedQty !== "" ? line.proposedQty : line.qty;
    return Number(q || 0);
  }

  function codeOf(line) {
    return String((line && (line.itemCode || line.code)) || "").trim().toUpperCase();
  }

  function itemNoOf(line) {
    return String((line && line.itemNo) || "").trim().toUpperCase();
  }

  function catalogByCode(code) {
    var list = (catalog() && catalog().ITEMS) || [];
    var want = String(code || "").toUpperCase();
    var i;
    for (i = 0; i < list.length; i++) {
      if (String(list[i].code).toUpperCase() === want) return list[i];
    }
    return null;
  }

  function emptyScope() {
    return {
      projectName: "",
      contractNo: "",
      county: "",
      access: "",
      boringCount: 0,
      soilLf: 0,
      landLf: 0,
      atvLf: 0,
      rockLf: 0,
      extraSpt: null,
      continuousFt: 0,
      shelby: 0,
      infilCount: 0,
      pavementLf: 0,
      mot: "",
      motCount: null,
      dnrec: false,
      gps: true,
      notes: "",
      borings: [],
      warnings: [],
    };
  }

  function detectCounty(text) {
    var t = String(text || "");
    if (/new\s*castle|\bncc\b|wilmington|newark(?!\s+regional)|christiana|new castle/i.test(t)) return "N";
    if (/\bkent\b|dover|smyrna|milford(?!\s+neck)|camden|wyoming/i.test(t)) return "K";
    if (/\bsussex\b|georgetown|lewes|rehoboth|millsboro|seaford|delmar|laurel/i.test(t)) return "S";
    return "";
  }

  function detectAccess(text) {
    var t = String(text || "");
    if (/\bbarge\b|over\s*water|marsh/i.test(t)) return "barge";
    if (/\batv\b|skid[-\s]?mount|off[-\s]?road|wetland|soft\s*ground/i.test(t)) return "atv";
    if (/\btruck\b|\bland\b|pavement|roadway/i.test(t)) return "truck";
    return "";
  }

  function detectMot(text) {
    var t = String(text || "");
    if (/\bta[-\s]?10\b|lane\s*closure/i.test(t)) return "lane";
    if (/\bta[-\s]?3\b|shoulder/i.test(t)) return "shoulder";
    if (/off[-\s]?road|no\s*mot|outside\s*(the\s*)?(travel|lane)|in\s*a\s*field/i.test(t)) return "none";
    return "";
  }

  function fieldAfterLabel(text, label) {
    var src = " " + String(text || "").replace(/\u00a0/g, " ") + " ";
    var re = new RegExp(label + "\\s*[:\\-]?\\s*", "i");
    var start = src.search(re);
    if (start < 0) return "";
    var rest = src.slice(start).replace(re, "");
    rest = rest.replace(/\s+/g, " ").trim();
    var cut = rest.search(
      /\s(?:Contract\s+Name|Contract\s+Number|Funding|M&R|PD\/Bridge|Boring\s+No|Total\s+Depth|County|Access|MOT|Notes)\b/i
    );
    if (cut >= 0) rest = rest.slice(0, cut);
    return rest.replace(/\s+/g, " ").trim().slice(0, 160);
  }

  function uniqueBoringLabels(text) {
    var seen = {};
    var n = 0;
    var re = /\b(?:B|BH|SB)[-\s]?(\d{1,3}[A-Z]?)\b/gi;
    var m;
    while ((m = re.exec(text))) {
      var key = String(m[1]).toUpperCase();
      if (!seen[key]) {
        seen[key] = true;
        n += 1;
      }
    }
    return n;
  }

  function parseSheetRows(raw) {
    var rows = [];
    String(raw || "").split(/\n/).forEach(function (ln) {
      var m = ln.match(/\b(?:B|BH|SB)[-\s]?(\d{1,3}[A-Z]?)\b(.*)$/i);
      if (!m) return;
      var rest = m[2] || "";
      if (/boring\s*no/i.test(ln) && /total\s*depth/i.test(ln)) return;
      var nums = [];
      var nre = /(\d{1,3}(?:\.\d+)?)/g;
      var nm;
      while ((nm = nre.exec(rest))) nums.push(Number(nm[1]));
      var ys = rest.match(/\bY\b/gi) || [];
      rows.push({
        label: m[1],
        depthFt: nums[0] || 0,
        continuousFt: nums[1] || 0,
        rockFt: nums.length > 2 ? nums[nums.length - 1] : 0,
        infil: ys.length >= 1,
        dnrec: ys.length >= 2,
      });
    });
    return rows;
  }

  function parseBoringRequest(text) {
    var raw = String(text || "").replace(/\u00a0/g, " ");
    var one = raw.replace(/[ \t]+/g, " ");
    var scope = emptyScope();
    if (!raw.trim()) {
      scope.warnings.push("No request text to read.");
      return scope;
    }

    scope.contractNo = (one.match(/\bT\s*-?\s*\d{6,}(?:-\d+)*/i) || [""])[0]
      .replace(/\s+/g, "")
      .replace(/t-/i, "T")
      .replace(/^t/i, "T");
    var named = fieldAfterLabel(one, "Contract Name") || fieldAfterLabel(one, "Project Name") || fieldAfterLabel(one, "Project");
    if (!named) {
      var nm = one.match(/(?:project|contract name)\s*[:\-]\s*([^\n]{4,80})/i);
      if (nm) named = nm[1].trim();
    }
    scope.projectName = (named || "").replace(/\s+/g, " ").trim();

    var countyLabel = fieldAfterLabel(one, "County");
    scope.county = detectCounty(countyLabel) || detectCounty(one);
    var accessLabel = fieldAfterLabel(one, "Access");
    scope.access = detectAccess(accessLabel) || detectAccess(one);
    scope.mot = detectMot(one);
    scope.dnrec = /dnrec/i.test(one) && !/dnrec[^\n]{0,40}\bN\b/i.test(one);
    if (/gps/i.test(one) && /no\s+gps|gps\s*:?\s*n\b/i.test(one)) scope.gps = false;

    var rows = parseSheetRows(raw);
    scope.borings = rows;
    var countHit = one.match(
      /(\d{1,3})\s*(?:soil\s*)?borings?\b|\b(?:number of|no\.? of)\s+borings?\s*[:\-]?\s*(\d{1,3})/i
    );
    var stated = 0;
    if (countHit) stated = Number(countHit[1] || countHit[2] || 0);
    var labeled = uniqueBoringLabels(raw);
    scope.boringCount = Math.max(stated, labeled, rows.length);

    var atDepth = one.match(
      /(\d{1,3})\s*borings?\s+(?:at|to|of|@)\s+(\d{1,3}(?:\.\d+)?)\s*(?:ft|feet)/i
    );
    if (atDepth) {
      scope.boringCount = Math.max(scope.boringCount, Number(atDepth[1]));
      scope.soilLf = money(Number(atDepth[1]) * Number(atDepth[2]));
    }
    var eachDepth = one.match(
      /(\d{1,3}(?:\.\d+)?)\s*(?:ft|feet)\s*(?:each|per\s*boring)|(?:each|per\s*boring)[^\d]{0,12}(\d{1,3}(?:\.\d+)?)\s*(?:ft|feet)/i
    );
    if (!scope.soilLf && eachDepth && scope.boringCount) {
      scope.soilLf = money(Number(eachDepth[1] || eachDepth[2] || 0) * scope.boringCount);
    }
    if (!scope.soilLf && rows.length) {
      scope.soilLf = money(rows.reduce(function (s, r) { return s + Number(r.depthFt || 0); }, 0));
      scope.continuousFt = rows.reduce(function (s, r) { return s + Number(r.continuousFt || 0); }, 0);
      scope.rockLf = rows.reduce(function (s, r) { return s + Number(r.rockFt || 0); }, 0);
      scope.infilCount = rows.filter(function (r) { return r.infil; }).length;
      if (rows.some(function (r) { return r.dnrec; })) scope.dnrec = true;
    }

    var depths = [];
    var depthRe = /(?:total\s*depth|depth)\s*(?:\(ft\))?\s*[:\-]?\s*(\d{1,3}(?:\.\d+)?)\s*(?:ft|feet)?/gi;
    var dm;
    while ((dm = depthRe.exec(one))) depths.push(Number(dm[1]));
    var rockHits = [];
    var rockRe = /rock(?:\s*core)?\s*(?:\(ft\))?\s*[:\-]?\s*(\d{1,3}(?:\.\d+)?)/gi;
    var rm;
    while ((rm = rockRe.exec(one))) rockHits.push(Number(rm[1]));
    if (!scope.rockLf && rockHits.length) {
      scope.rockLf = rockHits.reduce(function (s, x) { return s + x; }, 0);
    }

    var contHits = [];
    var cRe = /(?:t206\s*)?continuous\s*(?:\(ft\))?\s*[:\-]?\s*(\d{1,3}(?:\.\d+)?)/gi;
    var cm;
    while ((cm = cRe.exec(one))) contHits.push(Number(cm[1]));
    if (!scope.continuousFt && contHits.length) {
      scope.continuousFt = contHits.reduce(function (s, x) { return s + x; }, 0);
    }

    if (!scope.soilLf && depths.length) {
      if (scope.boringCount && depths.length === 1) {
        scope.soilLf = money(depths[0] * scope.boringCount);
      } else {
        scope.soilLf = money(depths.reduce(function (s, x) { return s + x; }, 0));
        if (!scope.boringCount) scope.boringCount = depths.length;
      }
    }
    if (!scope.soilLf && scope.boringCount) {
      scope.soilLf = money(scope.boringCount * 20);
      scope.warnings.push("Depths were not listed — assumed 20 ft per boring (edit before relying on the estimate).");
    }
    if (scope.soilLf && !scope.boringCount) {
      scope.boringCount = Math.max(1, Math.round(scope.soilLf / 20));
      scope.warnings.push("Boring count was not listed — inferred from footage.");
    }

    if (scope.access === "atv") scope.atvLf = scope.soilLf;
    else scope.landLf = scope.soilLf;

    if (!scope.infilCount) {
      var infilY = (one.match(/\binfil(?:tration)?\b[^\n]{0,20}\bY\b/gi) || []).length;
      var infilN = one.match(/(\d{1,3})\s+infil|\binfil(?:tration)?\s*(?:tests?)?\s*[:\-]?\s*(\d{1,3})/i);
      if (infilN) scope.infilCount = Number(infilN[1] || infilN[2] || 0);
      else if (infilY) scope.infilCount = infilY;
      else if (/infil/i.test(one) && /each boring|all borings|at each/i.test(one) && scope.boringCount) {
        scope.infilCount = scope.boringCount;
      }
    }

    var motN = one.match(/(\d{1,3})\s*(?:ea(?:ch)?\s*)?(?:mot|lane closures?|shoulder closures?)/i);
    if (motN) scope.motCount = Number(motN[1]);
    else if (scope.mot && scope.mot !== "none" && scope.boringCount) scope.motCount = scope.boringCount;

    var shelby = one.match(/(\d{1,3})\s*(?:shelby|undisturbed)/i) || one.match(/(?:shelby|undisturbed)[^\d]{0,12}(\d{1,3})/i);
    if (shelby) scope.shelby = Number(shelby[1]);

    var spt = one.match(/(\d{1,3})\s*(?:additional\s*)?spt/i);
    if (spt) scope.extraSpt = Number(spt[1]);
    else if (scope.continuousFt) scope.extraSpt = Math.max(0, Math.round(scope.continuousFt / 5));

    if (/pavement\s*cor|roadway\s*pavement|core\s*the\s*pavement/i.test(one) && scope.boringCount) {
      scope.pavementLf = scope.boringCount;
    }

    if (!scope.projectName && /soil boring request/i.test(one)) {
      scope.warnings.push("Read a boring request sheet but no project name — fill it in if you want it on the estimate.");
    }
    if (!scope.boringCount && !scope.soilLf) {
      scope.warnings.push("Could not find a boring count or footage. Type the program in the fields below.");
    }
    return scope;
  }

  function looksLikeProposal(text) {
    var t = String(text || "");
    if (/total amount due/i.test(t) && /item\s*no/i.test(t)) return true;
    var parsed = engine().parseConsultantProposal(t);
    return !!(parsed && parsed.lines && parsed.lines.length >= 2);
  }

  function looksLikeRequest(text) {
    var t = String(text || "");
    if (/soil boring request/i.test(t)) return true;
    if (/boring request/i.test(t) && /depth/i.test(t)) return true;
    if (looksLikeProposal(t)) return false;
    return /\bborings?\b/i.test(t) && /(\d+\s*(?:ft|feet)|total depth)/i.test(t);
  }

  var MOB_TRUCK = { N: "763589N", K: "763589K", S: "763589S" };
  var MOB_ATV = { N: "763590N", K: "763590K", S: "763590S" };
  var INFIL_BH = { N: "41", K: "42", S: "43" };

  function lineQtyByCode(lines, codes) {
    var want = {};
    (codes || []).forEach(function (c) {
      want[String(c).toUpperCase()] = true;
    });
    var sum = 0;
    (lines || []).forEach(function (l) {
      if (want[codeOf(l)] || want[itemNoOf(l)]) sum += qtyOf(l);
    });
    return sum;
  }

  function firstLine(lines, codes) {
    var want = {};
    (codes || []).forEach(function (c) {
      want[String(c).toUpperCase()] = true;
    });
    var hit = null;
    (lines || []).forEach(function (l) {
      if (!hit && (want[codeOf(l)] || want[itemNoOf(l)])) hit = l;
    });
    return hit;
  }

  function scopeFromProposal(lines) {
    var scope = emptyScope();
    scope.landLf = lineQtyByCode(lines, ["605545"]);
    scope.atvLf = lineQtyByCode(lines, ["605539"]);
    scope.soilLf = money(scope.landLf + scope.atvLf);
    scope.rockLf = lineQtyByCode(lines, ["605543"]);
    scope.extraSpt = lineQtyByCode(lines, ["605540"]);
    scope.shelby = lineQtyByCode(lines, ["605541"]);
    scope.infilCount = lineQtyByCode(lines, ["41", "42", "43", "27", "28", "29"]);
    scope.pavementLf = lineQtyByCode(lines, ["PAVECORE"]);
    var truck = lineQtyByCode(lines, ["763589N", "763589K", "763589S"]);
    var atv = lineQtyByCode(lines, ["763590N", "763590K", "763590S"]);
    scope.boringCount = Math.max(truck, atv, 0);
    if (!scope.boringCount && scope.soilLf) {
      scope.boringCount = Math.max(1, Math.round(scope.soilLf / 20));
    }
    if (scope.atvLf && !scope.landLf) scope.access = "atv";
    else if (scope.landLf) scope.access = "truck";
    if (lineQtyByCode(lines, ["763589N", "763590N"])) scope.county = "N";
    else if (lineQtyByCode(lines, ["763589K", "763590K"])) scope.county = "K";
    else if (lineQtyByCode(lines, ["763589S", "763590S"])) scope.county = "S";
    var lane = lineQtyByCode(lines, ["763606"]);
    var shoulder = lineQtyByCode(lines, ["763605"]);
    if (lane) {
      scope.mot = "lane";
      scope.motCount = lane;
    } else if (shoulder) {
      scope.mot = "shoulder";
      scope.motCount = shoulder;
    }
    scope.dnrec = lineQtyByCode(lines, ["DNREC"]) > 0;
    scope.gps = lineQtyByCode(lines, ["GPS"]) > 0;
    return scope;
  }

  function extrasFromLines(lines, scope) {
    scope = scope || scopeFromProposal(lines);
    var borings = scope.boringCount || 1;
    var lf = scope.soilLf || 1;
    return {
      miscHours: lineQtyByCode(lines, ["763587"]),
      pmHours: lineQtyByCode(lines, ["18"]),
      loggerHours: lineQtyByCode(lines, ["LOGGER"]),
      gpsQty: lineQtyByCode(lines, ["GPS"]),
      gpsLs: (function () {
        var g = firstLine(lines, ["GPS"]);
        return !!(g && String(g.unit || g.unitMeasure || "").toUpperCase().indexOf("LS") >= 0);
      })(),
      dnrecQty: lineQtyByCode(lines, ["DNREC"]),
      abandonLf: lineQtyByCode(lines, ["34"]),
      motLane: lineQtyByCode(lines, ["763606"]),
      motShoulder: lineQtyByCode(lines, ["763605"]),
      boringCount: borings,
      soilLf: lf,
    };
  }

  function collectJobs(contracts, examples) {
    var jobs = [];
    (contracts || []).forEach(function (c) {
      (c.tasks || []).forEach(function (t) {
        (t.qps || []).forEach(function (q) {
          if (q.status === "canceled") return;
          var lines = (q.proposal && q.proposal.lines) || [];
          if (!lines.length) return;
          var scope = scopeFromProposal(lines);
          jobs.push({
            id: q.id,
            contractorId: c.id,
            contractorName: c.contractor || c.code,
            agreementCode: c.code,
            project: q.project || (q.proposal && q.proposal.projectName) || "",
            qpNumber: q.qpNumber,
            total: engine().proposalTotal(q.proposal),
            lines: lines,
            scope: scope,
            extras: extrasFromLines(lines, scope),
            prices: pricesFromContract(c),
            source: "ledger",
          });
        });
      });
    });
    (examples || []).forEach(function (ex) {
      if (!ex || !(ex.lines || []).length) return;
      var scope = ex.scope || scopeFromProposal(ex.lines);
      jobs.push({
        id: ex.id,
        contractorId: ex.contractorId,
        contractorName: ex.contractorName || ex.agreementCode,
        agreementCode: ex.agreementCode,
        project: (scope && scope.projectName) || ex.project || "",
        qpNumber: ex.qpNumber || "",
        total: ex.total != null ? ex.total : engine().proposalTotal({ lines: ex.lines }),
        lines: ex.lines,
        scope: scope,
        extras: extrasFromLines(ex.lines, scope),
        prices: ex.prices || {},
        source: ex.source || "trained",
      });
    });
    return jobs;
  }

  function pricesFromContract(contract) {
    var out = {};
    ((contract && contract.payItems) || []).forEach(function (it) {
      if (it && it.code && Number(it.unitPrice) > 0) out[String(it.code).toUpperCase()] = Number(it.unitPrice);
    });
    return out;
  }

  function pricesFromLines(lines) {
    var out = {};
    (lines || []).forEach(function (l) {
      var code = codeOf(l);
      var p = Number(l.unitPrice || 0);
      if (code && p > 0) out[code] = p;
    });
    return out;
  }

  function jobDistance(scope, jobScope) {
    var a = scope || emptyScope();
    var b = jobScope || emptyScope();
    var d = 0;
    var lfA = Math.max(a.soilLf || 1, 1);
    var lfB = Math.max(b.soilLf || 1, 1);
    d += Math.abs(Math.log(lfA / lfB));
    d += Math.abs((a.boringCount || 1) - (b.boringCount || 1)) / 5;
    if (a.access && b.access && a.access !== b.access) d += 0.5;
    if (a.county && b.county && a.county !== b.county) d += 0.15;
    if (!!a.infilCount !== !!b.infilCount) d += 0.25;
    if ((a.mot || "none") !== (b.mot || "none") && a.mot && b.mot) d += 0.2;
    return d;
  }

  function predictHours(values, sizes, newSize) {
    values = values || [];
    sizes = sizes || [];
    if (!values.length) return 0;
    if (values.length >= 2) {
      var mn = Math.min.apply(null, values);
      var mx = Math.max.apply(null, values);
      if (mn > 0 && mx / mn < 1.6) return median(values);
    }
    var ratios = values.map(function (v, i) {
      var sz = Number(sizes[i] || 0) || 1;
      return v / sz;
    });
    return median(ratios) * (newSize || 1);
  }

  function presenceRate(values) {
    if (!values.length) return 0;
    var n = 0;
    values.forEach(function (v) {
      if (Number(v) > 0) n += 1;
    });
    return n / values.length;
  }

  function buildProfile(contractorId, name, code, jobs, catalogPrices) {
    jobs = jobs || [];
    var prices = Object.assign({}, catalogPrices || {});
    jobs.forEach(function (j) {
      Object.assign(prices, j.prices || {}, pricesFromLines(j.lines));
    });
    var misc = jobs.map(function (j) { return j.extras.miscHours; });
    var pm = jobs.map(function (j) { return j.extras.pmHours; });
    var logger = jobs.map(function (j) { return j.extras.loggerHours; });
    var dnrec = jobs.map(function (j) { return j.extras.dnrecQty; });
    var gps = jobs.map(function (j) { return j.extras.gpsQty; });
    var gpsLs = jobs.filter(function (j) { return j.extras.gpsLs; }).length;
    var borings = jobs.map(function (j) { return j.extras.boringCount || 1; });
    var lfs = jobs.map(function (j) { return j.extras.soilLf || 1; });
    var habits = [];
    var miscRate = presenceRate(misc);
    if (miscRate >= 0.5) {
      habits.push(
        "Routinely adds miscellaneous man-hours (" +
          Math.round(miscRate * 100) +
          "% of jobs; about " +
          Math.round(predictHours(misc.filter(function (x) { return x > 0; }), borings, 1)) +
          " hr per boring)."
      );
    } else {
      habits.push("Does not bill miscellaneous man-hours on learned jobs.");
    }
    if (presenceRate(pm) >= 0.5) {
      var lump = jobs.length >= 2 && Math.max.apply(null, pm) / Math.max(Math.min.apply(null, pm.filter(Boolean)), 1) < 1.6;
      habits.push(
        lump
          ? "Project management stays near " + Math.round(median(pm)) + " hr even when the job is small."
          : "Project management runs about " +
            Math.round(predictHours(pm, borings, 1)) +
            " hr per boring."
      );
    }
    if (gpsLs > jobs.length / 2) habits.push("GPS is a lump sum, not per-hole.");
    else if (presenceRate(gps) >= 0.5) habits.push("GPS is billed as each (typically one locate).");
    if (presenceRate(dnrec) >= 0.5) habits.push("Includes a DNREC boring permit on most jobs.");
    else habits.push("Usually does not bill a DNREC permit line.");
    return {
      contractorId: contractorId,
      contractorName: name,
      agreementCode: code,
      jobs: jobs,
      prices: prices,
      miscRate: miscRate,
      dnrecRate: presenceRate(dnrec),
      gpsLs: gpsLs > jobs.length / 2,
      habits: habits,
      predict: {
        miscHours: function (scope) {
          if (miscRate < 0.5) return 0;
          return predictHours(
            misc.filter(function (x) { return x > 0; }),
            jobs.filter(function (j) { return j.extras.miscHours > 0; }).map(function (j) { return j.extras.boringCount || 1; }),
            scope.boringCount || 1
          );
        },
        pmHours: function (scope) {
          if (presenceRate(pm) < 0.5) return 0;
          return predictHours(pm, borings, scope.boringCount || 1);
        },
        loggerHours: function (scope) {
          if (presenceRate(logger) < 0.5) return 0;
          return predictHours(logger, lfs, scope.soilLf || 1);
        },
        gpsQty: function () {
          if (presenceRate(gps) < 0.5) return 0;
          return Math.max(1, Math.round(median(gps.filter(function (x) { return x > 0; })) || 1));
        },
        dnrecQty: function () {
          if (presenceRate(dnrec) < 0.5) return 0;
          return Math.max(1, Math.round(median(dnrec.filter(function (x) { return x > 0; })) || 1));
        },
      },
    };
  }

  function buildProfiles(contracts, examples) {
    var jobs = collectJobs(contracts, examples);
    var byId = {};
    jobs.forEach(function (j) {
      var id = j.contractorId || j.agreementCode;
      if (!byId[id]) byId[id] = [];
      byId[id].push(j);
    });
    var profiles = [];
    (contracts || []).forEach(function (c) {
      var list = byId[c.id] || byId[c.code] || [];
      if (!list.length && !Object.keys(pricesFromContract(c)).length) return;
      profiles.push(buildProfile(c.id, c.contractor || c.code, c.code, list, pricesFromContract(c)));
    });
    Object.keys(byId).forEach(function (id) {
      if (profiles.some(function (p) { return p.contractorId === id; })) return;
      var j0 = byId[id][0];
      profiles.push(buildProfile(id, j0.contractorName, j0.agreementCode, byId[id], j0.prices));
    });
    return profiles;
  }

  function pickPrice(profile, codes) {
    var i;
    for (i = 0; i < codes.length; i++) {
      var p = Number(profile.prices[String(codes[i]).toUpperCase()] || 0);
      if (p > 0) return { code: codes[i], price: p };
    }
    return { code: codes[0], price: 0 };
  }

  function withPrice(profile, code, price) {
    var next = Object.assign({}, profile);
    next.prices = Object.assign({}, profile.prices || {});
    if (price) next.prices[String(code).toUpperCase()] = price;
    return next;
  }

  function addPriced(lines, profile, picked, qty, note) {
    if (!picked || !picked.code) return;
    addLine(lines, withPrice(profile, picked.code, picked.price), picked.code, qty, note);
  }

  function addLine(lines, profile, code, qty, note) {
    qty = Number(qty || 0);
    if (!qty || qty < 0.009) return;
    var cat = catalogByCode(code) || { code: code, description: code, unit: "", itemNo: "" };
    var price = Number(profile.prices[String(code).toUpperCase()] || 0);
    if (!price) {
      lines.push({
        itemCode: cat.code,
        itemNo: cat.itemNo || "",
        description: cat.description,
        unit: cat.unit,
        qty: money(qty),
        unitPrice: 0,
        amount: 0,
        skipped: true,
        note: note || "No unit price on file for this contractor.",
      });
      return;
    }
    var amount = money(qty * price);
    lines.push({
      itemCode: cat.code,
      itemNo: cat.itemNo || "",
      description: cat.description,
      unit: cat.unit,
      qty: money(qty),
      unitPrice: price,
      amount: amount,
      note: note || "",
    });
  }

  function extraSptQty(scope) {
    if (scope.extraSpt != null && scope.extraSpt !== "" && Number(scope.extraSpt) >= 0) {
      return Number(scope.extraSpt);
    }
    if (scope.continuousFt) return Math.max(0, Math.round(Number(scope.continuousFt) / 5));
    if (scope.soilLf) return Math.max(0, Math.round(Number(scope.soilLf) / 5));
    return 0;
  }

  function motCode(scope) {
    if (scope.mot === "lane") return "763606";
    if (scope.mot === "shoulder") return "763605";
    return "";
  }

  function estimateContractor(scope, profile) {
    scope = scope || emptyScope();
    profile = profile || buildProfile("", "", "", [], {});
    var lines = [];
    var access = scope.access || (scope.atvLf && !scope.landLf ? "atv" : "truck");
    var county = scope.county || "N";
    var soil = Number(scope.soilLf || 0);
    var borings = Math.max(0, Math.round(Number(scope.boringCount || 0)));
    var notes = [];

    if (access === "atv") {
      var atvSoil = pickPrice(profile, ["605539", "605545"]);
      addPriced(lines, profile, atvSoil, soil || scope.atvLf, "ATV / off-road borings from the request");
      var atv = pickPrice(profile, [MOB_ATV[county] || MOB_ATV.N, MOB_ATV.N, MOB_ATV.K, MOB_ATV.S, MOB_TRUCK[county] || MOB_TRUCK.N, "763589N", "763589K", "763589S"]);
      addPriced(lines, profile, atv, borings, "One mobilization per boring (learned pattern)");
    } else {
      var landSoil = pickPrice(profile, ["605545", "605539"]);
      addPriced(lines, profile, landSoil, soil || scope.landLf, "Land borings from the request");
      var truck = pickPrice(profile, [MOB_TRUCK[county] || MOB_TRUCK.N, MOB_TRUCK.N, MOB_TRUCK.K, MOB_TRUCK.S, MOB_ATV[county] || MOB_ATV.N]);
      addPriced(lines, profile, truck, borings, "One mobilization per boring (learned pattern)");
    }

    addLine(lines, profile, "605540", extraSptQty(scope), "Additional SPTs — both firms usually bill ~1 per 5 ft");
    addLine(lines, profile, "605541", scope.shelby, "Undisturbed / Shelby from the request");
    addLine(lines, profile, "605543", scope.rockLf, "Rock core from the request");

    if (scope.infilCount) {
      var inf = pickPrice(profile, [INFIL_BH[county] || INFIL_BH.K, "42", "41", "43"]);
      addPriced(lines, profile, inf, scope.infilCount, "Borehole infiltration from the request");
    }

    var motC = motCode(scope);
    var motQty = scope.mot === "none" ? 0 : (scope.motCount != null ? Number(scope.motCount) : (motC ? borings : 0));
    if (motC && motQty) {
      var motPick = pickPrice(profile, [motC, "763605", "763606"]);
      addPriced(lines, profile, motPick, motQty, "Traffic control from the request");
    }

    addLine(lines, profile, "34", soil, "Borehole abandonment tracks boring footage on learned jobs");
    addLine(lines, profile, "PAVECORE", scope.pavementLf, "Pavement coring from the request");

    var miscH = profile.predict.miscHours(scope);
    if (miscH >= 0.5) {
      addLine(lines, profile, "763587", Math.round(miscH), "Habit: miscellaneous man-hours this firm adds on similar jobs");
      notes.push("Adds about " + Math.round(miscH) + " miscellaneous man-hours — the other firm may not.");
    }
    var pmH = profile.predict.pmHours(scope);
    if (pmH >= 0.5) addLine(lines, profile, "18", Math.round(pmH), "Habit: project management hours from past proposals");
    var logH = profile.predict.loggerHours(scope);
    if (logH >= 0.5) addLine(lines, profile, "LOGGER", Math.round(logH), "Habit: qualified logger hours from past proposals");

    var gpsQ = profile.predict.gpsQty();
    if (gpsQ && scope.gps !== false) addLine(lines, profile, "GPS", gpsQ, profile.gpsLs ? "Habit: GPS as a lump sum" : "Habit: GPS locate");
      var dnQ = profile.predict.dnrecQty();
    if (dnQ) addLine(lines, profile, "DNREC", dnQ, "Habit: DNREC boring permit");

    var priced = lines.filter(function (l) { return !l.skipped; });
    var skipped = lines.filter(function (l) { return l.skipped; });
    var total = money(priced.reduce(function (s, l) { return s + Number(l.amount || 0); }, 0));
    var similar = (profile.jobs || [])
      .map(function (j) {
        return {
          project: j.project,
          qpNumber: j.qpNumber,
          total: j.total,
          source: j.source,
          distance: jobDistance(scope, j.scope),
          miscHours: j.extras.miscHours,
          pmHours: j.extras.pmHours,
        };
      })
      .sort(function (a, b) { return a.distance - b.distance; })
      .slice(0, 3);

    skipped.forEach(function (l) {
      notes.push(l.description + " — no unit price on file.");
    });

    return {
      contractorId: profile.contractorId,
      contractorName: profile.contractorName,
      agreementCode: profile.agreementCode,
      total: total,
      lines: lines,
      habits: profile.habits.slice(),
      notes: notes,
      similar: similar,
      jobCount: (profile.jobs || []).length,
      cheapest: false,
    };
  }

  function analyze(scope, contracts, examples) {
    scope = scope || emptyScope();
    var profiles = buildProfiles(contracts, examples);
    var estimates = profiles.map(function (p) {
      return estimateContractor(scope, p);
    });
    estimates.sort(function (a, b) {
      if (!a.jobCount && !a.total) return 1;
      if (!b.jobCount && !b.total) return -1;
      return a.total - b.total;
    });
    if (estimates.length && estimates[0].total > 0) estimates[0].cheapest = true;
    var warnings = (scope.warnings || []).slice();
    if (!profiles.length) {
      warnings.push("No contractor packets with prices yet. Drop a request together with that firm’s proposal to start teaching.");
    }
    return {
      scope: scope,
      estimates: estimates,
      cheapest: estimates[0] && estimates[0].cheapest ? estimates[0] : null,
      warnings: warnings,
    };
  }

  function exampleFromPair(scope, parsed, contract) {
    parsed = parsed || {};
    var lines = (parsed.lines || []).map(function (l) {
      var cat = engine().catalogItemByNo(contract, l.itemNo) || catalogByCode(l.itemNo) || {};
      return {
        itemCode: cat.code || String(l.itemNo || ""),
        itemNo: l.itemNo || cat.itemNo || "",
        description: cat.description || l.description || "",
        unit: cat.unit || l.unit || "",
        proposedQty: l.qty,
        unitPrice: l.unitPrice,
        amount: l.amount,
      };
    });
    var fromProp = scopeFromProposal(lines);
    var used = scope && (Number(scope.boringCount) || Number(scope.soilLf)) ? scope : fromProp;
    if (!used.projectName && parsed.projectName) used.projectName = parsed.projectName;
    if (!used.contractNo && parsed.designNo) used.contractNo = parsed.designNo;
    if (!used.county && fromProp.county) used.county = fromProp.county;
    if (!used.access && fromProp.access) used.access = fromProp.access;
    return {
      id: engine().uid("az"),
      date: engine().todayISO(),
      contractorId: contract && contract.id,
      contractorName: (contract && contract.contractor) || parsed.agreementCode || "",
      agreementCode: (contract && contract.code) || parsed.agreementCode || "",
      project: used.projectName || parsed.projectName || "",
      scope: used,
      lines: lines,
      total: parsed.total || engine().proposalTotal({ lines: lines }),
      source: "trained",
    };
  }

  global.PsaAnalyzer = {
    parseBoringRequest: parseBoringRequest,
    looksLikeProposal: looksLikeProposal,
    looksLikeRequest: looksLikeRequest,
    scopeFromProposal: scopeFromProposal,
    extrasFromLines: extrasFromLines,
    collectJobs: collectJobs,
    buildProfiles: buildProfiles,
    estimateContractor: estimateContractor,
    analyze: analyze,
    exampleFromPair: exampleFromPair,
    emptyScope: emptyScope,
    detectCounty: detectCounty,
    detectAccess: detectAccess,
    detectMot: detectMot,
    jobDistance: jobDistance,
  };
})(typeof window !== "undefined" ? window : global);
