/**
 * Page wiring for handwritten sheets and the next-sample QR.
 * Photographing a sheet takes a still and fills the review. It does not scan the next-sample code.
 * A sample is created when the tech confirms.
 */
(function () {
  'use strict';

  const Sheets = window.LabTrakHandSheet;
  const Next = window.LabTrakNextSample;
  const AI_FUNCTION = 'labtrak-ai';
  const AI_MODEL = 'claude-sonnet-4-20250514';
  let pending = null;
  let confirmBusy = false;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function aiKey() {
    return (localStorage.getItem('ai_key') || '').trim();
  }

  function database() {
    return (typeof db !== 'undefined' && db) ? db : null;
  }

  function clampCount(value) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < 0) return '0';
    if (n > 3) return '3';
    return String(n);
  }

  function pageUrl() {
    return window.location.href.split('#')[0].split('?')[0];
  }

  function reportIdForSheet(kind) {
    if (kind === 'concrete') {
      const typed = (document.getElementById('ci_set_id')?.value || '').trim();
      if (typed && (typeof loadConcreteSets === 'function') && loadConcreteSets().some(function (set) { return set.id === typed; })) {
        return typed;
      }
      return '';
    }
    if (typeof activeFC_linkedSampleId !== 'undefined' && activeFC_linkedSampleId) return activeFC_linkedSampleId;
    if (typeof activeFC_table !== 'undefined' && activeFC_table === 'samples' && activeFC_sessionId) return activeFC_sessionId;
    return '';
  }

  function qrImage(text) {
    if (!text || typeof QRCode === 'undefined') return '';
    const holder = document.createElement('div');
    holder.setAttribute('aria-hidden', 'true');
    holder.style.position = 'absolute';
    holder.style.left = '-9999px';
    document.body.appendChild(holder);
    try {
      new QRCode(holder, {
        text: text,
        width: 180,
        height: 180,
        colorDark: '#111111',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
      const canvas = holder.querySelector('canvas');
      if (canvas) return canvas.toDataURL('image/png');
      const img = holder.querySelector('img');
      return img ? img.src : '';
    } catch (e) {
      return '';
    } finally {
      holder.remove();
    }
  }

  function qrDataUrl(section, reportId) {
    if (!Next) return '';
    return qrImage(Next.payloadUrl(pageUrl(), section, reportId));
  }

  function thisCaption(section) {
    if (section === 'concrete') return 'Scan to open this set in Concrete';
    if (section === 'lab') return 'Scan to open this lab sample';
    return 'Scan to open this sample in Field Control';
  }

  window.ltThisQrHtml = function (section, reportId) {
    if (!Next || !String(reportId || '').trim()) return '';
    const src = qrImage(Next.payloadThisUrl(pageUrl(), section, reportId));
    if (!src) return '';
    const caption = thisCaption(section);
    return '<span class="lt-next-qr-wrap"><img class="lt-next-qr" alt="Internal use only. ' + esc(caption) + '" src="' + src + '">' +
      '<span class="lt-next-qr-cap"><span class="lt-next-qr-internal">Internal use only</span>' + esc(caption) + '</span></span>';
  };

  function setStatus(kind, text) {
    document.querySelectorAll('[data-hs-status="' + kind + '"]').forEach(function (el) {
      el.textContent = text || '';
    });
  }

  function whenQrReady() {
    return new Promise(function (resolve) {
      if (typeof QRCode === 'function') { resolve(); return; }
      let n = 0;
      const timer = setInterval(function () {
        n += 1;
        if (typeof QRCode === 'function' || n > 20) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  }

  window.hsPrintSheet = async function (kind) {
    const sheet = Sheets && Sheets.sheetById(kind);
    if (!sheet) return;
    await whenQrReady();
    const html = Sheets.printDocument(sheet, { qrDataUrl: qrDataUrl(sheet.section, reportIdForSheet(kind)) });
    const win = window.open('', '_blank', 'width=820,height=900');
    if (!win) {
      if (typeof showToast === 'function') showToast('Pop-up blocked — allow pop-ups to print the sheet', 'error');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(function () {
      try { win.print(); } catch (e) {}
    }, 250);
  };

  let sheetCameraKind = '';
  let sheetCameraStream = null;

  function stopSheetCamera() {
    if (sheetCameraStream) {
      sheetCameraStream.getTracks().forEach(function (track) { track.stop(); });
      sheetCameraStream = null;
    }
    const video = document.getElementById('hsCameraVideo');
    if (video) video.srcObject = null;
  }

  function fileInput(kind) {
    let input = document.getElementById('hs-file-' + kind);
    if (input) return input;
    input = document.createElement('input');
    input.type = 'file';
    input.id = 'hs-file-' + kind;
    input.accept = 'image/*';
    input.hidden = true;
    input.addEventListener('change', function () {
      const file = input.files && input.files[0];
      input.value = '';
      if (file) readPhoto(kind, file);
    });
    document.body.appendChild(input);
    return input;
  }

  function cameraTitle(kind) {
    if (kind === 'concrete') return 'Photograph the concrete sheet';
    if (kind === 'aggregate') return 'Photograph the aggregate sheet';
    return 'Photograph the soil sheet';
  }

  window.hsCloseSheetCamera = function () {
    stopSheetCamera();
    const overlay = document.getElementById('hsCamera');
    if (overlay) overlay.hidden = true;
    sheetCameraKind = '';
  };

  window.hsPhotograph = async function (kind) {
    sheetCameraKind = kind;
    const overlay = document.getElementById('hsCamera');
    const title = document.getElementById('hsCameraTitle');
    if (title) title.textContent = cameraTitle(kind);
    const canCamera = overlay && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
    if (!canCamera) {
      fileInput(kind).click();
      return;
    }
    try {
      stopSheetCamera();
      sheetCameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } }
      });
      const video = document.getElementById('hsCameraVideo');
      if (video) {
        video.srcObject = sheetCameraStream;
        const played = video.play();
        if (played && typeof played.catch === 'function') played.catch(function () {});
      }
      overlay.hidden = false;
    } catch (e) {
      stopSheetCamera();
      if (typeof showToast === 'function') showToast('Camera unavailable. Choose a photo of the sheet.', 'info');
      fileInput(kind).click();
    }
  };

  window.hsTakeSheetPhoto = function () {
    const kind = sheetCameraKind;
    const video = document.getElementById('hsCameraVideo');
    if (!kind || !video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(function (blob) {
      window.hsCloseSheetCamera();
      if (!blob) return;
      readPhoto(kind, new File([blob], 'sheet.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  };

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read the photo')); };
      reader.onload = function () {
        const img = new Image();
        img.onload = function () {
          const max = 1600;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          const url = canvas.toDataURL('image/jpeg', 0.85);
          const comma = url.indexOf(',');
          resolve({ data: url.slice(comma + 1), mediaType: 'image/jpeg' });
        };
        img.onerror = function () { reject(new Error('Could not open that photo')); };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function parseAiJson(raw) {
    const text = String(raw || '').replace(/```json|```/g, '').trim();
    try { return JSON.parse(text); }
    catch (e) {
      const match = text.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : null;
    }
  }

  async function callLabTrakAI(prompt, image) {
    const databaseClient = database();
    if (!databaseClient || !databaseClient.functions || typeof databaseClient.functions.invoke !== 'function') {
      throw new Error('Connect to Supabase before reading a sheet.');
    }
    const featureKey = aiKey();
    if (!featureKey) {
      throw new Error('Enter the LabTrak product key in Settings. Handwritten sheets use the labtrak-ai key.');
    }
    const { data, error } = await databaseClient.functions.invoke(AI_FUNCTION, {
      body: {
        prompt: prompt,
        model: AI_MODEL,
        max_tokens: 3500,
        image: { data: image.data, media_type: image.mediaType }
      },
      headers: { 'x-labtrak-ai-key': featureKey }
    });
    if (error) throw new Error(error.message || 'Sheet reader failed');
    if (!data) throw new Error('Sheet reader returned nothing');
    if (data.error) throw new Error(data.error.message || data.error);
    const parsed = parseAiJson(data.text || '');
    if (!parsed) throw new Error('Could not read the sheet. Try a clearer photo.');
    return parsed;
  }

  async function readPhoto(kind, file) {
    if (!Sheets) return;
    const sheet = Sheets.sheetById(kind);
    if (!sheet) return;
    setStatus(kind, 'Reading the sheet. Nothing is saved yet.');
    try {
      const image = await compressImage(file);
      const raw = await callLabTrakAI(Sheets.buildPrompt(sheet), image);
      const values = Sheets.normalizeRead(sheet, raw);
      pending = { kind: kind, values: values };
      showReview(sheet, values);
      setStatus(kind, 'Review the read. Nothing is saved until you confirm.');
    } catch (e) {
      pending = null;
      setStatus(kind, '');
      if (typeof showToast === 'function') showToast(e.message || 'Could not read the sheet', 'error');
    }
  }

  function showReview(sheet, values) {
    const body = document.getElementById('hsReviewFields');
    const title = document.getElementById('hsReviewTitle');
    const overlay = document.getElementById('hsReview');
    if (!body || !overlay) return;
    if (title) title.textContent = 'Review the ' + sheet.title.toLowerCase();
    const lead = document.getElementById('hsReviewLead');
    const confirmBtn = document.getElementById('hsConfirmBtn');
    const noun = sheet.id === 'concrete' ? 'set' : 'sample';
    if (lead) lead.textContent = 'Check every box. Nothing becomes a ' + noun + ' until you confirm.';
    if (confirmBtn) confirmBtn.textContent = 'Confirm and create ' + noun;
    body.innerHTML = Sheets.fieldsOf(sheet).map(function (field) {
      const value = values[field.id] || '';
      const inputType = field.kind === 'date' ? 'date' : (field.kind === 'time' ? 'time' : 'text');
      return '<label class="hs-field"><span>' + esc(field.label) + '</span>' +
        '<input data-hs-field="' + esc(field.id) + '" type="' + inputType + '" value="' + esc(value) + '"></label>';
    }).join('');
    overlay.hidden = false;
    const first = body.querySelector('input');
    if (first) first.focus();
  }

  window.hsCloseReview = function () {
    const overlay = document.getElementById('hsReview');
    if (overlay) overlay.hidden = true;
    pending = null;
    confirmBusy = false;
  };

  function reviewValues() {
    const values = {};
    document.querySelectorAll('#hsReviewFields [data-hs-field]').forEach(function (input) {
      values[input.getAttribute('data-hs-field')] = input.value.trim();
    });
    return values;
  }

  function setInput(id, value) {
    const el = document.getElementById(id);
    if (!el || value == null || value === '') return;
    el.value = value;
  }

  async function confirmField(values, kind) {
    if (typeof activeFC_sessionId !== 'undefined' && activeFC_sessionId) {
      if (typeof showToast === 'function') showToast('End the open field session before creating a sample from a sheet.', 'info');
      return;
    }
    const category = kind === 'aggregate' ? 'aggregate' : 'soil';
    if (category === 'soil' && !values.contract) {
      if (typeof showToast === 'function') showToast('Contract number is required', 'error');
      return;
    }
    if (category === 'aggregate' && !values.agg_material) {
      if (typeof showToast === 'function') showToast('Material type is required', 'error');
      return;
    }
    if (typeof switchView === 'function') switchView('fieldcontrol');
    if (typeof fcSetModuleMode === 'function') fcSetModuleMode('event');
    if (typeof fcSetIntent === 'function') fcSetIntent('lab');
    setInput('fc_s_category', category);
    setInput('fc_s_testno', values.sample_number);
    setInput('fc_s_contract', values.contract);
    setInput('fc_s_location', category === 'aggregate' ? values.sampled_at : values.location);
    setInput('fc_s_material', category === 'aggregate' ? values.agg_material : values.material);
    setInput('fc_s_tech', category === 'aggregate' ? values.agg_sampled_by : values.technician);
    setInput('fc_s_road', values.road);
    setInput('fc_s_date', category === 'aggregate' ? values.agg_date : values.date);
    const testInput = document.getElementById('fc_s_testno');
    if (testInput && values.sample_number) testInput.dataset.userTouched = '1';
    await startFC_Session();
    if (!activeFC_sessionId) return;
    const catEl = document.getElementById('f_test_category');
    if (catEl) {
      catEl.value = category;
      if (typeof updateTestCategoryUI === 'function') updateTestCategoryUI();
    }
    if (category === 'aggregate') {
      setInput('f_agg_type', values.agg_size);
      setInput('a_size_no', values.size_no);
      setInput('a_lab_no', values.lab_no);
      setInput('a_material', values.agg_material || values.material);
      setInput('a_est_qty', values.est_qty);
      setInput('a_sampled_at', values.sampled_at || values.location);
      setInput('a_examined_for', values.examined_for);
      setInput('a_sampled_from', values.sampled_from);
      setInput('a_contract', values.contract);
      setInput('a_supplied_by', values.supplied_by);
      setInput('a_supply_location', values.supply_location);
      setInput('a_contractor', values.agg_contractor || values.contractor);
      setInput('a_sampled_by', values.agg_sampled_by || values.technician);
      setInput('a_date_sampled', values.agg_date || values.date);
    } else {
      setInput('f_contract', values.contract);
      setInput('f_fa_project', values.fa_project);
      setInput('f_contractor', values.contractor);
      setInput('f_road', values.road);
      setInput('f_location', values.location);
      setInput('f_depth', values.depth);
      setInput('f_elevation', values.elevation);
      setInput('f_source', values.source);
      setInput('f_material_type', values.material);
      setInput('f_method_placed', values.method_placed);
      setInput('f_sample_type', values.sample_type || 'Field Control');
      setInput('f_date_sampled', values.date);
      setInput('f_sampled_by', values.technician);
      setInput('f_remarks', values.remarks);
      setInput('f_special_requests', values.special_requests);
      if (typeof renderFcRequestTags === 'function') renderFcRequestTags();
    }
    await submitFieldSample();
    window.hsCloseReview();
  }

  async function confirmConcrete(values) {
    if (!values.cast_date) {
      if (typeof showToast === 'function') showToast('Cast date is required', 'error');
      return;
    }
    if (!values.required_fc) {
      if (typeof showToast === 'function') showToast("Required f'c is required", 'error');
      return;
    }
    const ages = ['age_7', 'age_14', 'age_28', 'age_56'].reduce(function (sum, key) {
      return sum + (parseInt(values[key], 10) || 0);
    }, 0);
    if (ages < 1) {
      if (typeof showToast === 'function') showToast('Add at least one cylinder', 'error');
      return;
    }
    if (typeof switchView === 'function') switchView('concrete');
    if (typeof switchConcreteTab === 'function') switchConcreteTab('intake');
    setInput('ci_set_id', values.sample_number);
    setInput('ci_contract', values.contract);
    setInput('ci_fa_project', values.fa_project);
    setInput('ci_contractor', values.contractor);
    setInput('ci_supplier', values.supplier);
    setInput('ci_mix_design', values.mix_design);
    setInput('ci_pour_location', values.pour_location);
    setInput('ci_cast_date', values.cast_date);
    setInput('ci_cast_time', values.cast_time);
    setInput('ci_truck_no', values.truck_no);
    setInput('ci_ticket_no', values.ticket_no);
    setInput('ci_sampled_by', values.sampled_by);
    setInput('ci_tech_no', values.tech_no);
    setInput('ci_slump', values.slump);
    setInput('ci_air', values.air);
    setInput('ci_unit_wt', values.unit_wt);
    setInput('ci_conc_temp', values.conc_temp);
    setInput('ci_amb_temp', values.amb_temp);
    setInput('ci_cyl_diam', values.cyl_diam === '6' ? '6' : '4');
    setInput('ci_required_fc', values.required_fc);
    setInput('ci_age_7', clampCount(values.age_7));
    setInput('ci_age_14', clampCount(values.age_14));
    setInput('ci_age_28', clampCount(values.age_28));
    setInput('ci_age_56', clampCount(values.age_56));
    setInput('ci_remarks', values.remarks);
    setInput('ci_test_no', values.test_no);
    setInput('ci_section_no', values.section_no);
    setInput('ci_class', values.concrete_class);
    setInput('ci_county', values.county);
    setInput('ci_cement_sks', values.cement_sks);
    setInput('ci_station', values.station);
    setInput('ci_date_received', values.date_received);
    setInput('ci_subcontractor', values.subcontractor);
    setInput('ci_precast', /^y/i.test(values.precast || '') ? 'Yes' : 'No');
    setInput('ci_cement1', values.cement1);
    setInput('ci_cement1_pct', values.cement1_pct);
    setInput('ci_cement2', values.cement2);
    setInput('ci_cement2_pct', values.cement2_pct);
    setInput('ci_cement3', values.cement3);
    setInput('ci_cement3_pct', values.cement3_pct);
    setInput('ci_admix1', values.admix1);
    setInput('ci_admix1_oz', values.admix1_oz);
    setInput('ci_admix2', values.admix2);
    setInput('ci_admix2_oz', values.admix2_oz);
    setInput('ci_admix3', values.admix3);
    setInput('ci_admix3_oz', values.admix3_oz);
    setInput('ci_admix4', values.admix4);
    setInput('ci_admix4_oz', values.admix4_oz);
    setInput('ci_aea', values.aea);
    setInput('ci_aea_oz', values.aea_oz);
    setInput('ci_water', values.water);
    setInput('ci_fine_agg', values.fine_agg);
    setInput('ci_coarse_agg', values.coarse_agg);
    setInput('ci_fibers', values.fibers);
    setInput('ci_plant', values.plant);
    setInput('ci_corr_factor', values.corr_factor);
    await submitConcreteIntake();
    window.hsCloseReview();
  }

  window.hsConfirmRead = async function () {
    if (!pending || confirmBusy) return;
    confirmBusy = true;
    const values = reviewValues();
    try {
      if (pending.kind === 'concrete') await confirmConcrete(values);
      else await confirmField(values, pending.kind);
    } finally {
      confirmBusy = false;
    }
  };

  function showScanNote(msg) {
    if (typeof showToast === 'function') showToast(msg, 'info');
    if (typeof switchView === 'function') switchView('scan');
    const note = document.getElementById('scanNextNote');
    if (note) {
      note.hidden = false;
      note.textContent = msg;
    }
  }

  async function fieldList() {
    let rows = (typeof allSamples !== 'undefined' ? allSamples : []) || [];
    const databaseClient = database();
    if (databaseClient && typeof databaseClient.from === 'function') {
      try {
        const { data, error } = await databaseClient.from('samples')
          .select('id,test_no,created_at,deleted_at,test_category,sample_type,record_kind')
          .is('deleted_at', null)
          .order('created_at', { ascending: true })
          .limit(2000);
        if (!error && data) rows = data;
      } catch (e) { /* keep the samples already on this phone */ }
    }
    return Next.sortFieldSamples(rows);
  }

  async function concreteList() {
    if (typeof pullAndMergeConcreteSets === 'function' && database()) {
      try { await pullAndMergeConcreteSets(); } catch (e) {}
    }
    const local = typeof loadConcreteSets === 'function' ? loadConcreteSets() : [];
    return Next.sortConcreteSets(local);
  }

  window.ltOpenNextSample = async function (section, reportId) {
    if (!Next) return;
    if (section !== 'field' && section !== 'concrete') {
      showScanNote('That code is not a Field Control or Concrete report.');
      return;
    }
    const items = section === 'concrete' ? await concreteList() : await fieldList();
    const result = Next.nextAfter(items, reportId);
    if (result.status === 'missing') {
      showScanNote(Next.missingMessage(section));
      return;
    }
    if (result.status !== 'next' || !result.item) {
      showScanNote(Next.noneMessage(section));
      return;
    }
    const note = document.getElementById('scanNextNote');
    if (note) note.hidden = true;
    if (section === 'concrete') {
      const loaded = typeof loadConcreteSets === 'function'
        ? loadConcreteSets().some(function (set) { return set.id === result.item.id; })
        : true;
      if (!loaded) {
        showScanNote('That concrete set is not on this phone yet.');
        return;
      }
      if (typeof switchView === 'function') switchView('concrete');
      if (typeof switchConcreteTab === 'function') switchConcreteTab('log');
      if (typeof openConcreteSet === 'function') openConcreteSet(result.item.id);
      if (typeof showToast === 'function') showToast('Opened the next concrete set', 'success');
      return;
    }
    if (typeof fcResumeSessionById === 'function') await fcResumeSessionById(result.item.id);
  };

  window.ltOpenThisSample = async function (section, reportId) {
    const id = String(reportId || '').trim();
    if (section !== 'field' && section !== 'concrete' && section !== 'lab') {
      showScanNote('That code is not a Field Control, Concrete, or lab report.');
      return;
    }
    if (!id) {
      showScanNote('That code does not name a sample.');
      return;
    }
    const note = document.getElementById('scanNextNote');
    if (note) note.hidden = true;
    if (section === 'concrete') {
      if (typeof pullAndMergeConcreteSets === 'function' && database()) {
        try { await pullAndMergeConcreteSets(); } catch (e) {}
      }
      const loaded = typeof loadConcreteSets === 'function' && loadConcreteSets().some(function (set) { return set.id === id; });
      if (!loaded) {
        showScanNote('That set is not in Concrete.');
        return;
      }
      if (typeof switchView === 'function') switchView('concrete');
      if (typeof switchConcreteTab === 'function') switchConcreteTab('log');
      if (typeof openConcreteSet === 'function') openConcreteSet(id);
      if (typeof showToast === 'function') showToast('Opened this concrete set', 'success');
      return;
    }
    if (section === 'lab') {
      const sample = typeof fetchSample === 'function' ? await fetchSample(id) : null;
      if (!sample || sample.deleted_at) {
        showScanNote('That lab sample is not in LabTrak.');
        return;
      }
      if (typeof switchView === 'function') switchView('soillab');
      if (typeof slLoadSample === 'function') await slLoadSample(id);
      return;
    }
    if (typeof fcResumeSessionById === 'function') await fcResumeSessionById(id);
  };

  window.ltHandleScanText = async function (text) {
    if (!Next) return false;
    const parsed = Next.parseScan(text);
    if (parsed.type === 'this') {
      await window.ltOpenThisSample(parsed.section, parsed.report);
      return true;
    }
    if (parsed.type !== 'next') return false;
    await window.ltOpenNextSample(parsed.section, parsed.report);
    return true;
  };

  window.saveAiKey = function () {
    const input = document.getElementById('aiKey');
    const err = document.getElementById('aiKeyErr');
    const value = (input && input.value || '').trim();
    if (err) err.style.display = 'none';
    if (!value) {
      if (err) {
        err.textContent = 'Enter the LabTrak product key.';
        err.style.display = 'block';
      }
      return;
    }
    localStorage.setItem('ai_key', value);
    if (typeof showToast === 'function') showToast('Handwritten sheet key saved on this browser', 'success');
  };

  const origShowSetup = window.showSetup;
  if (typeof origShowSetup === 'function') {
    window.showSetup = function () {
      origShowSetup.apply(this, arguments);
      const input = document.getElementById('aiKey');
      if (input && !input.value) input.value = aiKey();
    };
  }
})();
