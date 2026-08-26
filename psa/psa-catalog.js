/* Default Appendix C-style pay item catalog for 2216F / 2217F.
   Item list is taken from DelDOT subsurface-investigation IDIQ practice
   (prior 1692/1693-style agreements) plus lab / geo-probe items named in
   RFP 2216-2217F. `itemNo` is the contractor proposal Appendix item number
   (the column on mailed QP proposals). Unit prices are blank until awarded. */
(function (global) {
  "use strict";

  var ITEMS = [
    { code: "605539", itemNo: "8", description: "Soil boring, ATV — incl. permit if needed", unit: "LF", unitMeasure: "Linear Foot", category: "Drilling" },
    { code: "605540", itemNo: "2", description: "Additional standard penetration tests (SPT)", unit: "EA", unitMeasure: "Each", category: "Drilling" },
    { code: "605541", itemNo: "3", description: "Undisturbed sampling (Shelby tube)", unit: "EA", unitMeasure: "Each", category: "Drilling" },
    { code: "605542", itemNo: "", description: "Auger drill without sampling — incl. permit if needed", unit: "LF", unitMeasure: "Linear Foot", category: "Drilling" },
    { code: "605543", itemNo: "5", description: "Rock core drilling (NXM) — incl. permit if needed", unit: "LF", unitMeasure: "Linear Foot", category: "Drilling" },
    { code: "605544", itemNo: "", description: "Observation wells — incl. permit if needed", unit: "LF", unitMeasure: "Linear Foot", category: "Instrumentation" },
    { code: "605545", itemNo: "7", description: "Soil borings, land — incl. permit if needed", unit: "LF", unitMeasure: "Linear Foot", category: "Drilling" },
    { code: "GEOPROBE", itemNo: "", description: "Geo-probe (as designated by the Engineer)", unit: "LF", unitMeasure: "Linear Foot", category: "Drilling" },
    { code: "763587", itemNo: "9", description: "Man-hour of miscellaneous work", unit: "HR", unitMeasure: "Per Hour", category: "Labor" },
    { code: "18", itemNo: "19", description: "Man-hour of project management", unit: "HR", unitMeasure: "Per Hour", category: "Labor" },
    { code: "36", itemNo: "", description: "Man-hour, weekend / overtime rate", unit: "HR", unitMeasure: "Per Hour", category: "Labor" },
    { code: "763589N", itemNo: "10", description: "Mobilization of truck-mounted boring rig — New Castle", unit: "EA", unitMeasure: "Each", category: "Mobilization" },
    { code: "763589K", itemNo: "11", description: "Mobilization of truck-mounted boring rig — Kent", unit: "EA", unitMeasure: "Each", category: "Mobilization" },
    { code: "763589S", itemNo: "12", description: "Mobilization of truck-mounted boring rig — Sussex", unit: "EA", unitMeasure: "Each", category: "Mobilization" },
    { code: "763590N", itemNo: "13", description: "Mobilization of ATV or skid-mounted boring rig — New Castle", unit: "EA", unitMeasure: "Each", category: "Mobilization" },
    { code: "763590K", itemNo: "14", description: "Mobilization of ATV or skid-mounted boring rig — Kent", unit: "EA", unitMeasure: "Each", category: "Mobilization" },
    { code: "763590S", itemNo: "15", description: "Mobilization of ATV or skid-mounted boring rig — Sussex", unit: "EA", unitMeasure: "Each", category: "Mobilization" },
    { code: "763591N", itemNo: "", description: "Mobilization of barge-mounted boring rig — New Castle", unit: "EA", unitMeasure: "Each", category: "Mobilization" },
    { code: "763591K", itemNo: "", description: "Mobilization of barge-mounted boring rig — Kent", unit: "EA", unitMeasure: "Each", category: "Mobilization" },
    { code: "763591S", itemNo: "", description: "Mobilization of barge-mounted boring rig — Sussex", unit: "EA", unitMeasure: "Each", category: "Mobilization" },
    { code: "44", itemNo: "", description: "Mobilization for cone penetrometer equipment", unit: "EA", unitMeasure: "Each", category: "Mobilization" },
    { code: "45", itemNo: "", description: "Soil boring — cone penetration test (CPT)", unit: "LF", unitMeasure: "Linear Foot", category: "Drilling" },
    { code: "19", itemNo: "", description: "Piezometer installation & removal — incl. permit if needed", unit: "EA", unitMeasure: "Each", category: "Instrumentation" },
    { code: "37", itemNo: "", description: "Well development", unit: "HR", unitMeasure: "Per Hour", category: "Instrumentation" },
    { code: "38", itemNo: "", description: "Slope inclinometers, 3 in. or greater", unit: "LF", unitMeasure: "Linear Foot", category: "Instrumentation" },
    { code: "39", itemNo: "", description: "Settlement plates", unit: "EA", unitMeasure: "Each", category: "Instrumentation" },
    { code: "40", itemNo: "", description: "Standpipes or curb-boxes furnished and installed", unit: "EA", unitMeasure: "Each", category: "Instrumentation" },
    { code: "27", itemNo: "", description: "Double-ring infiltration test — New Castle", unit: "EA", unitMeasure: "Each", category: "Infiltration" },
    { code: "28", itemNo: "", description: "Double-ring infiltration test — Kent", unit: "EA", unitMeasure: "Each", category: "Infiltration" },
    { code: "29", itemNo: "", description: "Double-ring infiltration test — Sussex", unit: "EA", unitMeasure: "Each", category: "Infiltration" },
    { code: "41", itemNo: "", description: "Borehole infiltration test — New Castle", unit: "EA", unitMeasure: "Each", category: "Infiltration" },
    { code: "42", itemNo: "52", description: "Borehole infiltration test — Kent", unit: "EA", unitMeasure: "Each", category: "Infiltration" },
    { code: "43", itemNo: "", description: "Borehole infiltration test — Sussex", unit: "EA", unitMeasure: "Each", category: "Infiltration" },
    { code: "763605", itemNo: "20", description: "MOT — two-lane two-way with shoulder closure (TA-3)", unit: "EA", unitMeasure: "Each", category: "MOT" },
    { code: "763606", itemNo: "21", description: "MOT — two-lane two-way with lane closure (TA-10)", unit: "EA", unitMeasure: "Each", category: "MOT" },
    { code: "763607", itemNo: "", description: "TTC — multilane divided, non-access-controlled, shoulder closure", unit: "EA", unitMeasure: "Each", category: "MOT" },
    { code: "763608", itemNo: "", description: "TTC — multilane divided / interstate lane closure", unit: "EA", unitMeasure: "Each", category: "MOT" },
    { code: "763609", itemNo: "", description: "TTC — access-controlled / interstate shoulder work, off shoulder", unit: "EA", unitMeasure: "Each", category: "MOT" },
    { code: "763610", itemNo: "", description: "TTC — access-controlled highways and interstates", unit: "EA", unitMeasure: "Each", category: "MOT" },
    { code: "763611", itemNo: "", description: "TTC — multilane divided, double lane closure", unit: "EA", unitMeasure: "Each", category: "MOT" },
    { code: "763670", itemNo: "", description: "TTC — work in the vicinity of an exit ramp", unit: "EA", unitMeasure: "Each", category: "MOT" },
    { code: "763671", itemNo: "", description: "TTC — work in the vicinity of an entrance ramp", unit: "EA", unitMeasure: "Each", category: "MOT" },
    { code: "47", itemNo: "", description: "MOT weekend / overtime rate", unit: "EA", unitMeasure: "Each", category: "MOT" },
    { code: "30", itemNo: "", description: "Backhoe — operated and maintained", unit: "DAY", unitMeasure: "Day", category: "Equipment" },
    { code: "31", itemNo: "", description: "Dozer — operated and maintained", unit: "DAY", unitMeasure: "Day", category: "Equipment" },
    { code: "32", itemNo: "", description: "Hand auger — mobilization and demobilization", unit: "EA", unitMeasure: "Each", category: "Drilling" },
    { code: "33", itemNo: "", description: "Hand auger", unit: "DAY", unitMeasure: "Day", category: "Drilling" },
    { code: "34", itemNo: "43", description: "Borehole abandonment", unit: "LF", unitMeasure: "Linear Foot", category: "Drilling" },
    { code: "35", itemNo: "", description: "Test pits, greater than 10 ft in depth", unit: "DAY", unitMeasure: "Day", category: "Drilling" },
    { code: "46", itemNo: "", description: "Light-duty support vehicle", unit: "DAY", unitMeasure: "Day", category: "Equipment" },
    { code: "LOGGER", itemNo: "46", description: "Qualified logger", unit: "HR", unitMeasure: "Per Hour", category: "Labor" },
    { code: "PAVECORE", itemNo: "58", description: "Roadway pavement coring", unit: "LF", unitMeasure: "Linear Foot", category: "Drilling" },
    { code: "GPS", itemNo: "59", description: "GPS location of borings", unit: "EA", unitMeasure: "Each", category: "Survey" },
    { code: "DNREC", itemNo: "DNREC", description: "DNREC boring permit", unit: "EA", unitMeasure: "Each", category: "Permit" },
    { code: "LAB-INDEX", itemNo: "", description: "Soil index tests", unit: "EA", unitMeasure: "Each", category: "Laboratory" },
    { code: "LAB-TX", itemNo: "", description: "Triaxial shear", unit: "EA", unitMeasure: "Each", category: "Laboratory" },
    { code: "LAB-DS", itemNo: "", description: "Direct shear", unit: "EA", unitMeasure: "Each", category: "Laboratory" },
    { code: "LAB-UCS", itemNo: "", description: "Unconfined compressive strength of intact rock core", unit: "EA", unitMeasure: "Each", category: "Laboratory" },
    { code: "LAB-PHR", itemNo: "", description: "pH / resistivity", unit: "EA", unitMeasure: "Each", category: "Laboratory" },
  ];

  function cloneItem(it, unitPrice) {
    return {
      code: it.code,
      itemNo: it.itemNo || "",
      description: it.description,
      unit: it.unit,
      unitMeasure: it.unitMeasure || "",
      category: it.category,
      unitPrice: unitPrice != null ? unitPrice : 0,
    };
  }

  function cloneCatalog() {
    return ITEMS.map(function (it) {
      return cloneItem(it, 0);
    });
  }

  function applyPrices(items, prices) {
    return (items || []).map(function (it) {
      var n = Object.assign({}, it);
      if (prices && prices[n.code] != null) n.unitPrice = prices[n.code];
      return n;
    });
  }

  function mergeCatalog(existing) {
    var list = (existing || []).map(function (it) {
      return Object.assign({}, it);
    });
    var have = {};
    list.forEach(function (it) {
      have[it.code] = it;
    });
    ITEMS.forEach(function (def) {
      if (have[def.code]) {
        if (!have[def.code].itemNo && def.itemNo) have[def.code].itemNo = def.itemNo;
        if (!have[def.code].unitMeasure && def.unitMeasure) {
          have[def.code].unitMeasure = def.unitMeasure;
        }
      } else {
        list.push(cloneItem(def, 0));
      }
    });
    return list;
  }

  global.PsaCatalog = {
    ITEMS: ITEMS,
    cloneCatalog: cloneCatalog,
    applyPrices: applyPrices,
    mergeCatalog: mergeCatalog,
  };
})(typeof window !== "undefined" ? window : global);
