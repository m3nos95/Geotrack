/* Default Appendix C-style pay item catalog for 2216F / 2217F.
   Item list is taken from DelDOT subsurface-investigation IDIQ practice
   (prior 1692/1693-style agreements) plus lab / geo-probe items named in
   RFP 2216-2217F. Unit prices are blank until Appendix C is awarded. */
(function (global) {
  "use strict";

  var ITEMS = [
    { code: "605539", description: "Soil boring, water (ATV) — incl. permit if needed", unit: "LF", category: "Drilling" },
    { code: "605540", description: "Additional standard penetration tests (SPT)", unit: "EA", category: "Drilling" },
    { code: "605541", description: "Undisturbed sampling (Shelby tube)", unit: "EA", category: "Drilling" },
    { code: "605542", description: "Auger drill without sampling — incl. permit if needed", unit: "LF", category: "Drilling" },
    { code: "605543", description: "Rock core drilling (NXM) — incl. permit if needed", unit: "LF", category: "Drilling" },
    { code: "605544", description: "Observation wells — incl. permit if needed", unit: "LF", category: "Instrumentation" },
    { code: "605545", description: "Soil borings, land — incl. permit if needed", unit: "LF", category: "Drilling" },
    { code: "GEOPROBE", description: "Geo-probe (as designated by the Engineer)", unit: "LF", category: "Drilling" },
    { code: "763587", description: "Man-hour of miscellaneous work", unit: "HR", category: "Labor" },
    { code: "18", description: "Man-hour of project management", unit: "HR", category: "Labor" },
    { code: "36", description: "Man-hour, weekend / overtime rate", unit: "HR", category: "Labor" },
    { code: "763589N", description: "Mobilization of truck-mounted boring rig — New Castle", unit: "EA", category: "Mobilization" },
    { code: "763589K", description: "Mobilization of truck-mounted boring rig — Kent", unit: "EA", category: "Mobilization" },
    { code: "763589S", description: "Mobilization of truck-mounted boring rig — Sussex", unit: "EA", category: "Mobilization" },
    { code: "763590N", description: "Mobilization of ATV or skid-mounted boring rig — New Castle", unit: "EA", category: "Mobilization" },
    { code: "763590K", description: "Mobilization of ATV or skid-mounted boring rig — Kent", unit: "EA", category: "Mobilization" },
    { code: "763590S", description: "Mobilization of ATV or skid-mounted boring rig — Sussex", unit: "EA", category: "Mobilization" },
    { code: "763591N", description: "Mobilization of barge-mounted boring rig — New Castle", unit: "EA", category: "Mobilization" },
    { code: "763591K", description: "Mobilization of barge-mounted boring rig — Kent", unit: "EA", category: "Mobilization" },
    { code: "763591S", description: "Mobilization of barge-mounted boring rig — Sussex", unit: "EA", category: "Mobilization" },
    { code: "44", description: "Mobilization for cone penetrometer equipment", unit: "EA", category: "Mobilization" },
    { code: "45", description: "Soil boring — cone penetration test (CPT)", unit: "LF", category: "Drilling" },
    { code: "19", description: "Piezometer installation & removal — incl. permit if needed", unit: "EA", category: "Instrumentation" },
    { code: "37", description: "Well development", unit: "HR", category: "Instrumentation" },
    { code: "38", description: "Slope inclinometers, 3 in. or greater", unit: "LF", category: "Instrumentation" },
    { code: "39", description: "Settlement plates", unit: "EA", category: "Instrumentation" },
    { code: "40", description: "Standpipes or curb-boxes furnished and installed", unit: "EA", category: "Instrumentation" },
    { code: "27", description: "Double-ring infiltration test — New Castle", unit: "EA", category: "Infiltration" },
    { code: "28", description: "Double-ring infiltration test — Kent", unit: "EA", category: "Infiltration" },
    { code: "29", description: "Double-ring infiltration test — Sussex", unit: "EA", category: "Infiltration" },
    { code: "41", description: "Borehole infiltration test — New Castle", unit: "EA", category: "Infiltration" },
    { code: "42", description: "Borehole infiltration test — Kent", unit: "EA", category: "Infiltration" },
    { code: "43", description: "Borehole infiltration test — Sussex", unit: "EA", category: "Infiltration" },
    { code: "763605", description: "TTC — two-lane two-way with shoulder closure", unit: "EA", category: "MOT" },
    { code: "763606", description: "TTC — two-lane two-way with lane closure", unit: "EA", category: "MOT" },
    { code: "763607", description: "TTC — multilane divided, non-access-controlled, shoulder closure", unit: "EA", category: "MOT" },
    { code: "763608", description: "TTC — multilane divided / interstate lane closure", unit: "EA", category: "MOT" },
    { code: "763609", description: "TTC — access-controlled / interstate shoulder work, off shoulder", unit: "EA", category: "MOT" },
    { code: "763610", description: "TTC — access-controlled highways and interstates", unit: "EA", category: "MOT" },
    { code: "763611", description: "TTC — multilane divided, double lane closure", unit: "EA", category: "MOT" },
    { code: "763670", description: "TTC — work in the vicinity of an exit ramp", unit: "EA", category: "MOT" },
    { code: "763671", description: "TTC — work in the vicinity of an entrance ramp", unit: "EA", category: "MOT" },
    { code: "47", description: "MOT weekend / overtime rate", unit: "EA", category: "MOT" },
    { code: "30", description: "Backhoe — operated and maintained", unit: "DAY", category: "Equipment" },
    { code: "31", description: "Dozer — operated and maintained", unit: "DAY", category: "Equipment" },
    { code: "32", description: "Hand auger — mobilization and demobilization", unit: "EA", category: "Drilling" },
    { code: "33", description: "Hand auger", unit: "DAY", category: "Drilling" },
    { code: "34", description: "Borehole abandonment", unit: "LF", category: "Drilling" },
    { code: "35", description: "Test pits, greater than 10 ft in depth", unit: "DAY", category: "Drilling" },
    { code: "46", description: "Light-duty support vehicle", unit: "DAY", category: "Equipment" },
    { code: "LAB-INDEX", description: "Soil index tests", unit: "EA", category: "Laboratory" },
    { code: "LAB-TX", description: "Triaxial shear", unit: "EA", category: "Laboratory" },
    { code: "LAB-DS", description: "Direct shear", unit: "EA", category: "Laboratory" },
    { code: "LAB-UCS", description: "Unconfined compressive strength of intact rock core", unit: "EA", category: "Laboratory" },
    { code: "LAB-PHR", description: "pH / resistivity", unit: "EA", category: "Laboratory" },
  ];

  function cloneCatalog() {
    return ITEMS.map(function (it) {
      return {
        code: it.code,
        description: it.description,
        unit: it.unit,
        category: it.category,
        unitPrice: 0,
      };
    });
  }

  global.PsaCatalog = {
    ITEMS: ITEMS,
    cloneCatalog: cloneCatalog,
  };
})(typeof window !== "undefined" ? window : global);
