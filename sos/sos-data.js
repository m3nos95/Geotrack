/* DelDOT Source of Supply — catalogs, APL lists, and letter language.
   Shared by the browser app and Node tests (no DOM). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SOSData = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const APL_URL = 'https://deldot.gov/Business/prodlists/';
  const APL_FOOTNOTE =
    '*Approved Products List Item (APL) – only products listed on the APL are approved for use. ' + APL_URL;

  const CONTACTS = {
    sampling: {
      name: 'Ray Glanden',
      phone: '302-233-2381',
      org: 'Materials & Research',
    },
    samplingCanal: {
      name: 'Rich Taylor',
      phone: '302-593-7158',
      org: 'Materials & Research',
    },
    samplingNorth: {
      name: 'Damian Blakely',
      phone: '302-593-7158',
      org: 'Materials & Research',
    },
    results: {
      name: 'Aaron Wieczorek',
      phone: '302-760-2583',
    },
    letterAuthor: {
      name: 'Steven Peretiatko',
      title: 'Materials Technician',
      phone: '302-760-2375',
    },
    secretary: 'Shanté A. Hastings',
  };

  /** Material groups used to decide who is copied on a letter. Editable in the CC tab. */
  const CC_MATERIAL_GROUPS = [
    { id: 'soil-stone', label: 'Soil / stone / GABC / borrow', families: ['borrow', 'aggregate', 'riprap', 'topsoil', 'geotextile'] },
    { id: 'hma', label: 'Hot mix / Superpave / tack', families: ['hma-mix', 'tack'] },
    { id: 'pcc', label: 'PCC curb / sidewalk', families: ['pcc'] },
    { id: 'pipe-precast', label: 'RCP / precast / pipe', families: ['rcp', 'precast', 'hdpe', 'utility', 'castings'] },
    { id: 'striping', label: 'Pavement marking', families: ['striping'] },
    { id: 'other-apl', label: 'Crack seal / curing / TTC / APL', families: ['crack-seal', 'curing', 'ttc', 'signs', 'apl-product', 'erosion', 'expansion'] },
  ];

  /**
   * Default CC assignments. Change the name if someone leaves; checkboxes decide
   * which letter items pull that person onto cc. role: 'results' also fills the
   * "contact … for test results" sentence on must-be-tested soil/stone.
   */
  const CC_ASSIGNMENT_SEEDS = [
    {
      id: 'cc-aaron',
      name: 'Aaron Wieczorek',
      org: 'DelDOT',
      phone: '302-760-2583',
      role: 'results',
      always: false,
      groups: ['soil-stone'],
    },
    {
      id: 'cc-mark',
      name: 'Mark Schafer',
      org: 'DelDOT',
      phone: '',
      role: '',
      always: false,
      groups: ['hma'],
    },
  ];

  const STANDARD_CC = CC_ASSIGNMENT_SEEDS.filter(a => a.always).map(a => a.name);

  function filterRetiredCcPeople(people, retiredNames) {
    const retired = new Set((retiredNames || []).map(n => String(n || '').trim().toLowerCase()).filter(Boolean));
    if (!retired.size) return people || [];
    return (people || []).filter(p => {
      const name = typeof p === 'string' ? p : (p && p.name);
      return name && !retired.has(String(name).trim().toLowerCase());
    });
  }

  const CC_LIBRARY_SEEDS = [
    { name: 'Hunter McCabe', org: 'DelDOT' },
    { name: 'Ray Glanden', org: 'DelDOT' },
    { name: 'Aaron Wieczorek', org: 'DelDOT' },
    { name: 'Raymond Morris', org: 'DelDOT' },
    { name: 'Matt Szelestei', org: 'DelDOT' },
    { name: 'Dave Bunting', org: 'DelDOT' },
    { name: 'David Short', org: 'DelDOT' },
    { name: 'Gerald Nagyiski', org: 'DelDOT' },
    { name: 'Ting Guo', org: 'DelDOT' },
    { name: 'Mark Schafer', org: 'DelDOT' },
    { name: 'Jason Denson', org: 'DelDOT' },
    { name: 'James Kwasnieski', org: 'DelDOT' },
    { name: 'Brian Johnson', org: 'DelDOT' },
    { name: 'Damian Blakely', org: 'DelDOT' },
    { name: 'Erik Ball', org: 'DelDOT' },
    { name: 'James Smith', org: 'DelDOT' },
    { name: 'Matthew Goins', org: 'DelDOT' },
    { name: 'John Mastrobuono', org: 'DelDOT' },
    { name: 'Rich Taylor', org: 'DelDOT' },
    { name: 'Steven Peretiatko', org: 'DelDOT', role: 'Materials Technician' },
  ];

  /** Common spec numbers → letter description (uppercase, as printed). */
  const SPEC_CATALOG = {
    '#207021': { desc: 'STRUCTURAL BACKFILL, (BORROW TYPE C)', family: 'borrow', tags: ['Borrow'] },
    '#209001': { desc: 'BORROW, TYPE A', family: 'borrow', tags: ['Borrow'] },
    '#209002': { desc: 'BORROW, TYPE B', family: 'borrow', tags: ['Borrow'] },
    '#209004': { desc: 'BORROW, TYPE C', family: 'borrow', tags: ['Borrow'] },
    '#209006': { desc: 'BORROW, TYPE F', family: 'borrow', tags: ['Borrow'] },
    '#301001': { desc: 'GABC', family: 'aggregate', tags: ['GABC'] },
    '#301002': { desc: 'GABC, PATCHING', family: 'aggregate', tags: ['GABC'] },
    '#301003': { desc: 'GABC', family: 'aggregate', tags: ['GABC'] },
    '#301007': { desc: 'RECYCLED CONCRETE AGGREGATE', family: 'aggregate', tags: ['GABC'] },
    '#302002': { desc: 'DELAWARE NO. 3 STONE', family: 'aggregate', tags: ['Stone'] },
    '#302005': { desc: 'DELAWARE NO. 57 STONE', family: 'aggregate', tags: ['Stone'] },
    '#401005': { desc: 'SUPERPAVE TYPE C, 9.5 mm, PG 64-22 (CARBONATE STONE)', family: 'hma-mix', tags: ['Asphalt'] },
    '#401014': { desc: 'SUPERPAVE TYPE B, PG 64-22', family: 'hma-mix', tags: ['Asphalt'] },
    '#401021': { desc: 'SUPERPAVE TYPE BCBC, PG 64-22', family: 'hma-mix', tags: ['Asphalt'] },
    '#401029': { desc: 'SUPERPAVE TYPE C, PG 64-22, PATCHING', family: 'hma-mix', tags: ['Asphalt'] },
    '#401030': { desc: 'SUPERPAVE TYPE B, PG 64-22, PATCHING', family: 'hma-mix', tags: ['Asphalt'] },
    '#401501': { desc: 'HMA ITEMS', family: 'tack', tags: ['Tack Coat', 'APL'] },
    '#401505': { desc: 'HIGH PERFORMANCE BITUMINOUS CONCRETE (9.5MM)', family: 'hma-mix', tags: ['Asphalt'] },
    '#401506': { desc: 'SPEED HUMP', family: 'hma-mix', tags: ['Asphalt'] },
    '#404001': { desc: 'BITUMINOUS CRACK/JOINT SEALING < THAN 3/4-INCH WIDE', family: 'crack-seal', tags: ['Crack Sealing', 'APL'] },
    '#504001': { desc: 'CRACK AND JOINT SEALING LESS THAN 3/4 INCH WIDE', family: 'crack-seal', tags: ['Crack Sealing'] },
    '#601011': { desc: 'REINFORCED CONCRETE PIPE, 15", CLASS III', family: 'rcp', tags: ['RCP'] },
    '#601012': { desc: 'REINFORCED CONCRETE PIPE, 18", CLASS III', family: 'rcp', tags: ['RCP'] },
    '#601031': { desc: 'REINFORCED CONCRETE PIPE, 12" CLASS IV', family: 'rcp', tags: ['RCP'] },
    '#601032': { desc: 'REINFORCED CONCRETE PIPE, 15", CLASS IV', family: 'rcp', tags: ['RCP'] },
    '#601033': { desc: 'REINFORCED CONCRETE PIPE, 18", CLASS IV', family: 'rcp', tags: ['RCP'] },
    '#601213': { desc: 'CORRUGATED POLYETHYLENE PIPE, TYPE C, 15"', family: 'hdpe', tags: ['Pipe', 'HDPE'] },
    '#602003': { desc: 'DRAINAGE INLET, 34" X 24"', family: 'precast', tags: ['Precast', 'Drainage'] },
    '#602004': { desc: 'DRAINAGE INLET, 48" X 30"', family: 'precast', tags: ['Precast', 'Drainage'] },
    '#602005': { desc: 'DRAINAGE INLET, 48" X 48"', family: 'precast', tags: ['Precast', 'Drainage'] },
    '#602031': { desc: 'MANHOLE, 48" X 48"', family: 'precast', tags: ['Precast', 'Drainage'] },
    '#602100': { desc: 'DRAINAGE INLET GRATE(S)', family: 'castings', tags: ['Drainage', 'APL'] },
    '#602101': { desc: 'DRAINAGE INLET FRAME(S)', family: 'castings', tags: ['Drainage', 'APL'] },
    '#701011': { desc: 'PCC CURB, TYPE 1-4', family: 'pcc', tags: ['Concrete'] },
    '#701013': { desc: 'PCC CURB, TYPE 1-8', family: 'pcc', tags: ['Concrete'] },
    '#701014': { desc: 'PCC CURB, TYPE 2', family: 'pcc', tags: ['Concrete'] },
    '#701023': { desc: 'I.PCC CURB AND GUTTER, TYPE 3-8', family: 'pcc', tags: ['Concrete'] },
    '#705001': { desc: 'PCC SIDEWALK, 4"', family: 'pcc', tags: ['Concrete'] },
    '#705002': { desc: 'PCC SIDEWALK, 6"', family: 'pcc', tags: ['Concrete'] },
    '#705007': { desc: 'DETECTABLE WARNING SURFACE', family: 'apl-product', tags: ['Concrete', 'APL'] },
    '#705008': { desc: 'PEDESTRIAN CONNECTION, TYPE 1', family: 'pcc', tags: ['Concrete'] },
    '#705009': { desc: 'PEDESTRIAN CONNECTION, TYPE 2, 3, AND/OR 4', family: 'pcc', tags: ['Concrete'] },
    '#705013': { desc: 'TRUNCATED DOME DETECTABLE WARNING SURFACE', family: 'apl-product', tags: ['Concrete', 'APL'] },
    '#707015': { desc: 'RIPRAP, R-4', family: 'riprap', tags: ['Riprap'] },
    '#707021': { desc: 'CHANNEL BED FILL (LIGHT)', family: 'aggregate', tags: ['Stone'] },
    '#708003': { desc: 'GEOTEXTILES, RIPRAP', family: 'geotextile', tags: ['Geotextile'] },
    '#709001': { desc: 'PERFORATED PIPE UNDERDRAINS, 6"', family: 'hdpe', tags: ['Pipe', 'HDPE'] },
    '#710030': { desc: 'PVC WATER MAIN, 8"', family: 'utility', tags: ['Pipe'] },
    '#710378': { desc: 'STEEL CASING PIPE, 18"', family: 'utility', tags: ['Pipe'] },
    '#710438': { desc: 'FIRE HYDRANTS', family: 'utility', tags: ['Pipe'] },
    '#711009': { desc: 'INSTALLING SANITARY SEWER, PVC, 8"', family: 'utility', tags: ['Pipe'] },
    '#817002': { desc: 'PERMANENT PAVEMENT STRIPING, SYMBOL/LEGEND, ALKYD-THERMOPLASTIC', family: 'striping', tags: ['APL'] },
    '#817042': { desc: 'PERMANENT PAVEMENT STRIPING, EPOXY RESIN PAINT, WHITE/YELLOW, 6"', family: 'striping', tags: ['APL'] },
    '#817560': { desc: 'STRAIGHT ARROW THERMOPLASTIC', family: 'striping', tags: ['APL'] },
    '#817561': { desc: 'RIGHT OR LEFT THERMOPLASTIC ARROW', family: 'striping', tags: ['APL'] },
    '#861001': { desc: 'PERMANENT PAVEMENT STRIPING, EPOXY RESIN PAINT, 6"', family: 'striping', tags: ['APL'] },
    '#862004': { desc: 'PERMANENT PAVEMENT STRIPING, ALKYD-THERMOPLASTIC, 12"', family: 'striping', tags: ['APL'] },
    '#862005': { desc: 'PERMANENT PAVEMENT STRIPING, ALKYD-THERMOPLASTIC, 16"', family: 'striping', tags: ['APL'] },
    '#862006': { desc: 'PERMANENT PAVEMENT STRIPING, ALKYD-THERMOPLASTIC, SYMBOL/LEGEND', family: 'striping', tags: ['APL'] },
    '#808002': { desc: 'PROVIDE/MAINTAIN TRUCK MOUNTED ATTENUATOR, T II', family: 'ttc', tags: ['Traffic Control', 'APL'] },
    '#810001': { desc: 'TEMPORARY WARNING SIGNS AND PLAQUES', family: 'ttc', tags: ['Signage', 'APL'] },
    '#813001': { desc: 'TEMPORARY BARRICADES, TYPE III', family: 'ttc', tags: ['Traffic Control', 'APL'] },
    '#818001': { desc: 'FLAT SHEET ALUMINUM SIGN PANEL, TYPE IV', family: 'signs', tags: ['Signage', 'APL'] },
    '#905001': { desc: 'SILT FENCE', family: 'erosion', tags: ['Erosion Control'] },
    '#905007': { desc: 'SUPER SILT FENCE', family: 'erosion', tags: ['Erosion Control'] },
    '#905004': { desc: 'INLET SEDIMENT CONTROL, DRAINAGE INLET', family: 'erosion', tags: ['Erosion Control'] },
    '#908001': { desc: 'TOPSOIL', family: 'topsoil', tags: ['Topsoil'] },
    '#908004': { desc: 'TOPSOIL, 6" DEPTH', family: 'topsoil', tags: ['Topsoil'] },
    '#908016': { desc: 'PERMANENT GRASS SEEDING, SUBDIVISION', family: 'seed', tags: ['Seed'] },
    '#908020': { desc: 'EROSION CONTROL BLANKET MULCH', family: 'apl-product', tags: ['Erosion Control', 'APL'] },
    '#908022': { desc: 'TURF REINFORCEMENT MATTING, TYPE 2', family: 'apl-product', tags: ['Erosion Control', 'APL'] },
  };

  /**
   * Contractor spec mistakes seen on submissions.
   * Do not rewrite #301003 → #301001: the SOS Database lists 301003 as GABC (TON),
   * and issued letters keep 301003 for crusher run / crushed concrete.
   */
  const SPEC_CORRECTIONS = [];

  /**
   * Known tack-coat APL producers. Location matters — Seaford Russell Standard
   * was rejected; Baltimore Russell Standard was approved.
   * `locations: null` means any location for that producer is treated as listed.
   */
  const TACK_COAT_APL = [
    { name: /asphalt emulsion industries/i, locations: null, label: 'Asphalt Emulsion Industries' },
    { name: /asphalt paving systems|\baps\b/i, locations: null, label: 'Asphalt Paving Systems' },
    { name: /russell standard/i, locations: [/baltimore/i, /wilmington/i], reject: [/seaford/i, /chambersburg/i], label: 'Russell Standard' },
    { name: /seaboard asphalt/i, locations: null, label: 'Seaboard Asphalt Products' },
    { name: /specialty emulsions/i, locations: null, label: 'Specialty Emulsions' },
    { name: /diamond materials/i, locations: [/wilmington/i], label: 'Diamond Materials' },
    { name: /gardner gibson/i, locations: null, label: 'Gardner Gibson' },
  ];

  const STRIPING_APL = [
    { name: /ennis[\s-]*fl[iy]nt/i, locations: null, label: 'Ennis Flint' },
    { name: /crown\s*tech/i, locations: null, label: 'Crown Technologies' },
    { name: /epoplex/i, locations: null, label: 'Epoplex' },
  ];

  const CRACK_SEAL_APL = [
    { name: /maxwell products/i, products: /elastoflex/i, label: 'Maxwell Products' },
    { name: /crafco/i, products: /roadsaver/i, label: 'Crafco' },
  ];

  const CURING_APL = [
    { name: /chemmasters/i, products: /silencure/i, label: 'ChemMasters' },
    { name: /w\.?\s*r\.?\s*meadows/i, products: /1600|white/i, label: 'W.R. Meadows' },
    { name: /kaufman|kauffman/i, label: 'Kaufman Products' },
  ];

  const ACTION_TEXT = {
    test: 'Must be tested and approved prior to use.',
    approved: 'Approved for use.',
    approvedBare: 'Approved.',
    mixDesigns: 'Approved. Only approved mix designs are approved for use.',
    mixOnFile: 'Approved; material sources and job mix formula are on file at the M&R Lab.',
    pccOnFile: 'Approved; material sources/admixture certifications are on file at the M&R Lab.',
    stockOnFile: 'Approved provided is shipped from state inspected stock. Test reports are on file at the M&R Lab.',
    visual: 'Approved: Conduct a visual inspection to ensure specification compliance.',
    seed: 'Approved provided seed conforms to the applicable table in the Standard Specifications, unless otherwise stipulated in the plans.',
    conforms: 'Approved provided material conforms to the requirements of the specifications.',
    utility: 'Approved provided material conforms to the utility owners specifications.',
    chooseApl: 'Approved. (choose a product from the APL)',
    pendingJmf: 'Not approved. (pending JMF approval)',
    expansionAashto: 'Approved provided Preformed Expansion Joint Material meets AASHTO M153, Type I, II, or IV.',
    hdpeM294: 'Approved provided pipe meets all requirements of AASHTO M294. Verify compliance through the AASHTO Product Evaluation & Audit Solutions.',
    hdpeM252: 'Approved provided pipe meets all requirements of AASHTO M252. Verify compliance through the AASHTO Product Evaluation & Audit Solutions.',
    apl: 'Approved for use. (on APL)',
    aplOn: 'Approved for use. (ON APL)',
    ttcInspect: 'Temporary Traffic control Devices will be inspected on-site by DelDOT or authorized representative.',
    oneSource: 'Only one source at a time may be used in a given area.',
    submitTack: 'Submit tack coat type (grade) and manufacturer.',
    submitCuring: 'Submit curing compound product name and manufacturer.',
    submitExpansion: 'Submit Preformed Expansion Material meeting AASHTO M153 Type I, II, or IV.',
    submitStriping: 'Submit manufacturer. (source listed is subcontractor)',
    notApproved: 'Not approved.',
  };

  function cloneContact(src, extra) {
    return Object.assign({ name: '', phone: '', org: 'Materials & Research' }, src || {}, extra || {});
  }

  function resolveContacts(lists) {
    const c = {
      sampling: cloneContact(CONTACTS.sampling),
      samplingNorth: cloneContact(CONTACTS.samplingNorth),
      samplingCanal: cloneContact(CONTACTS.samplingCanal),
      results: cloneContact(CONTACTS.results, { org: 'Materials & Research' }),
    };
    const ov = (lists && lists.contacts) || {};
    ['sampling', 'samplingNorth', 'samplingCanal', 'results'].forEach(k => {
      if (ov[k] && (ov[k].name || ov[k].phone)) c[k] = cloneContact(c[k], ov[k]);
    });
    const assignments = (lists && lists.ccAssignments) || CC_ASSIGNMENT_SEEDS;
    const res = assignments.find(a => a.role === 'results' && a.name);
    if (res) {
      c.results = cloneContact(c.results, { name: res.name, phone: res.phone || c.results.phone });
    }
    return c;
  }

  function samplerForDistrict(district, lists) {
    const c = resolveContacts(lists);
    const d = district || '';
    if (/canal/i.test(d)) return c.samplingCanal;
    if (/north/i.test(d)) return c.samplingNorth;
    return c.sampling;
  }

  function assignmentMatchesItems(assignment, items) {
    if (!assignment || !assignment.name) return false;
    if (assignment.always) return true;
    const families = new Set((items || []).map(it => it && it.family).filter(Boolean));
    const wanted = assignment.groups || assignment.families || [];
    for (const w of wanted) {
      if (families.has(w)) return true;
      const g = CC_MATERIAL_GROUPS.find(x => x.id === w);
      if (g && g.families.some(f => families.has(f))) return true;
    }
    return false;
  }

  function soilStoneOnLetter(items) {
    const g = CC_MATERIAL_GROUPS.find(x => x.id === 'soil-stone');
    const fams = g ? g.families : ['borrow', 'aggregate'];
    return (items || []).some(it => fams.includes(it && it.family));
  }

  function testCoordinationNotes(district, lists) {
    const sampler = samplerForDistrict(district, lists);
    const results = resolveContacts(lists).results;
    return (
      `Contact ${sampler.name}, ${sampler.org || 'Materials & Research'} at ${sampler.phone} at least ten (10) working days prior to shipment, from the source, for coordination of sampling. ` +
      `Contact ${results.name} at ${results.phone}, for test results.`
    );
  }

  const PRESET_TAGS = [
    'Borrow', 'GABC', 'Stone', 'Asphalt', 'Concrete', 'RCP', 'Precast',
    'Drainage', 'Electrical', 'Conduit', 'Wire', 'Geotextile', 'Seed',
    'Erosion Control', 'Signage', 'Sign Posts', 'Traffic Control', 'Rebar',
    'Topsoil', 'Riprap', 'Pipe', 'Ductile Iron', 'HDPE', 'PVC', 'Tack Coat', 'APL',
  ];

  const SOURCE_SEEDS = [
    { name: 'River Asphalt', loc: 'Dagsboro DE', addr: '30548 Thorogoods Rd', phone: '(302) 934-0881', tags: ['Asphalt', 'GABC', 'Stone'] },
    { name: 'River Asphalt', loc: 'Delmar DE', addr: '36393 Sussex Highway', phone: '(302) 907-6400', tags: ['Asphalt'] },
    { name: 'Vulcan Materials', loc: 'Salisbury MD', addr: '1002 Parsons Rd', phone: '(410) 742-4645', tags: ['GABC', 'Stone', 'Riprap'] },
    { name: 'Vulcan Materials', loc: 'Seaford DE', addr: '26056 River Rd', phone: '', tags: ['GABC', 'Stone', 'Riprap'] },
    { name: 'Russell Standard', loc: 'Baltimore MD', addr: '3450 Asiatic Ave', phone: '', tags: ['Tack Coat', 'Asphalt', 'APL'] },
    { name: 'Russell Standard', loc: 'Seaford DE', addr: '', phone: '', tags: ['Tack Coat', 'Asphalt'] },
    { name: 'Russell Standard', loc: 'Wilmington DE', addr: '', phone: '', tags: ['Tack Coat', 'Asphalt', 'APL'] },
    { name: 'Russell Standard', loc: 'Chambersburg PA', addr: '', phone: '', tags: ['Tack Coat', 'Asphalt'] },
    { name: 'Seaboard Asphalt Products', loc: 'Baltimore MD', addr: '', phone: '', tags: ['Tack Coat', 'Asphalt', 'APL'] },
    { name: 'Specialty Emulsions', loc: 'York PA', addr: '', phone: '', tags: ['Tack Coat', 'Asphalt', 'APL'] },
    { name: 'Ennis Flint', loc: 'Greensboro NC', addr: '4161 Piedmont Pkwy Suite 370', phone: '', tags: ['APL'] },
    { name: 'Maxwell Products', loc: 'Salt Lake City UT', addr: '650 South Delong St', phone: '1-800-266-2090', tags: ['Crack Sealing', 'APL'] },
    { name: 'Crafco', loc: 'Chandler AZ', addr: '', phone: '', tags: ['Crack Sealing', 'APL'] },
    { name: 'Allan Myers', loc: 'Elk Mills MD', addr: '896 Elk Mill Road', phone: '', tags: ['GABC', 'Stone', 'Asphalt'] },
    { name: 'Allan Myers', loc: 'Wilmington DE', addr: '1230 Railcar Ave', phone: '(302) 922-5166', tags: ['GABC', 'Stone', 'Asphalt'] },
    { name: 'Allan Myers', loc: 'Dover DE', addr: '', phone: '', tags: ['Asphalt', 'GABC'] },
    { name: 'Allan Myers', loc: 'Georgetown DE', addr: '', phone: '', tags: ['Asphalt', 'GABC', 'Stone'] },
    { name: 'Martin Marietta', loc: 'North East MD', addr: '233 Stevenson Rd', phone: '(410) 287-8177', tags: ['GABC', 'Stone'] },
    { name: 'Tri County Materials', loc: 'Dover DE', addr: '3700 South Bay Road', phone: '(302) 677-0156', tags: ['GABC', 'Stone', 'Asphalt'] },
    { name: 'Diamond Materials', loc: 'Wilmington DE', addr: '924 S Heald Street', phone: '(302) 922-5166', tags: ['Asphalt', 'GABC'] },
    { name: 'Contractors Materials', loc: 'Middletown DE', addr: '1133 Marl Pit RD', phone: '(302) 378-0421', tags: ['Borrow', 'GABC', 'Topsoil'] },
    { name: 'Contractors Materials', loc: 'Wilmington DE', addr: '925 S Heald St', phone: '', tags: ['GABC', 'Borrow', 'Topsoil'] },
    { name: 'Rinker Materials', loc: 'Middletown DE', addr: '800 Industrial Drive', phone: '(302) 378-8920', tags: ['RCP', 'Precast'] },
    { name: 'Gillespie Precast', loc: 'Chestertown MD', addr: '102 Brickyard Rd', phone: '(410) 778-0940', tags: ['Precast', 'Drainage'] },
    { name: 'Heritage Concrete', loc: 'Wilmington DE', addr: '', phone: '', tags: ['Concrete'] },
    { name: 'Heritage Concrete', loc: 'Cheswold DE', addr: '376 Holly Oak Lane', phone: '', tags: ['Concrete'] },
    { name: 'Bear Concrete', loc: 'Newark DE', addr: '595 Walther Rd', phone: '(302) 834-3333', tags: ['Concrete'] },
    { name: 'Atlantic Concrete', loc: 'Milford DE', addr: 'PO Box 321', phone: '(302) 422-8017', tags: ['Concrete'] },
    { name: 'Atlantic Concrete', loc: 'Lewes DE', addr: '', phone: '', tags: ['Concrete'] },
    { name: 'Atlantic Concrete Co', loc: 'Cheswold DE', addr: '161 Twin Oaks', phone: '', tags: ['Concrete'] },
    { name: 'Farmington Hotmix', loc: 'Farmington DE', addr: '', phone: '', tags: ['Asphalt'] },
    { name: 'Christiana Materials', loc: 'Newark DE', addr: '', phone: '', tags: ['Asphalt'] },
    { name: 'Asphalt Emulsion Industries', loc: 'Dumfries VA', addr: '', phone: '', tags: ['Tack Coat', 'Asphalt', 'APL'] },
    { name: 'Asphalt Paving Systems', loc: 'Hammonton NJ', addr: '', phone: '', tags: ['Tack Coat', 'Asphalt', 'APL'] },
    { name: 'ChemMasters', loc: 'Madison OH', addr: '300 Edwards St', phone: '', tags: ['Concrete', 'Curing Compound', 'APL'] },
    { name: 'W.R. Meadows', loc: 'Hampshire IL', addr: '', phone: '', tags: ['Concrete', 'Curing Compound', 'Expansion', 'APL'] },
    { name: 'Hanover Architectural Products', loc: 'Hanover PA', addr: '', phone: '', tags: ['Concrete', 'APL'] },
    { name: 'Nitterhouse Masonry Products', loc: 'Chambersburg PA', addr: '', phone: '', tags: ['Concrete', 'APL'] },
    { name: 'J&K Foam Fabricating', loc: 'Pottstown PA', addr: '', phone: '', tags: ['Concrete', 'Expansion'] },
    { name: 'ADS', loc: 'Logan Township NJ', addr: '', phone: '', tags: ['Pipe', 'HDPE'] },
    { name: 'East Jordan Iron Works', loc: 'Middletown DE', addr: '', phone: '', tags: ['Drainage', 'APL'] },
    { name: 'Neenah Foundry', loc: 'Neenah WI', addr: '2121 Brooks Ave', phone: '(920) 725-7000', tags: ['Drainage'] },
    { name: 'Kent Sand & Gravel', loc: 'Massey MD', addr: '13505 Alexander Road', phone: '(410) 928-5522', tags: ['Borrow', 'Stone'] },
    { name: 'Porter Sand & Gravel', loc: 'Harrington DE', addr: '640 Sandbox Rd', phone: '', tags: ['Borrow', 'Topsoil'] },
    { name: 'Melvin Joseph', loc: 'Georgetown DE', addr: '25136 DuPont Blvd', phone: '', tags: ['Borrow', 'Topsoil'] },
    { name: 'Clark Seeds', loc: 'Clayton DE', addr: '', phone: '', tags: ['Seed'] },
    { name: 'North American Green', loc: 'Poseyville IN', addr: '', phone: '', tags: ['Erosion Control', 'APL'] },
    { name: 'TrafFix Devices', loc: 'San Clemente CA', addr: '220 Calle Pintoresco', phone: '(949) 361-5663', tags: ['Traffic Control', 'APL'] },
    { name: 'Hanes Geo Components', loc: 'Winston Salem NC', addr: '815 Buxton St', phone: '(888) 239-4539', tags: ['Geotextile', 'Erosion Control'] },
  ];

  return {
    APL_URL,
    APL_FOOTNOTE,
    CONTACTS,
    STANDARD_CC,
    CC_MATERIAL_GROUPS,
    CC_ASSIGNMENT_SEEDS,
    CC_LIBRARY_SEEDS,
    filterRetiredCcPeople,
    resolveContacts,
    samplerForDistrict,
    assignmentMatchesItems,
    soilStoneOnLetter,
    SPEC_CATALOG,
    SPEC_CORRECTIONS,
    TACK_COAT_APL,
    STRIPING_APL,
    CRACK_SEAL_APL,
    CURING_APL,
    ACTION_TEXT,
    PRESET_TAGS,
    SOURCE_SEEDS,
    testCoordinationNotes,
  };
});
