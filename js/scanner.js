/* =====================================================
   Staff Interface – QR Scanner + Queue Management
   ===================================================== */

/* ── State ────────────────────────────────────────── */
let html5QrCode  = null;
let scanning     = false;
let currentSlot  = null;   // "HH:MM" — Now Serving
let queueSlots   = [];     // ["HH:MM", ...]  upcoming

/* ── Field IDs ────────────────────────────────────── */
const FIELDS = [
  'applicationType','firstName','preferredFirstName',
  'middleName','lastName','dob','reason','email','phone','position'
];

/* ── Utility: show a toast message ───────────────── */
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2400);
}

/* ── Field helpers ────────────────────────────────── */
function setError(fieldId, msg) {
  const wrap = document.getElementById(fieldId + '-wrap');
  const msgEl = document.getElementById(fieldId + '-msg');
  if (!wrap) return;
  wrap.classList.remove('is-valid','has-warning');
  wrap.classList.add('has-error');
  if (msgEl) { msgEl.textContent = msg; msgEl.className = 'field-msg error'; }
}

function setWarning(fieldId, msg) {
  const wrap = document.getElementById(fieldId + '-wrap');
  const msgEl = document.getElementById(fieldId + '-msg');
  if (!wrap) return;
  wrap.classList.remove('has-error','is-valid');
  wrap.classList.add('has-warning');
  if (msgEl) { msgEl.textContent = msg; msgEl.className = 'field-msg warning'; }
}

function setValid(fieldId) {
  const wrap = document.getElementById(fieldId + '-wrap');
  const msgEl = document.getElementById(fieldId + '-msg');
  if (!wrap) return;
  wrap.classList.remove('has-error','has-warning');
  wrap.classList.add('is-valid');
  if (msgEl) { msgEl.textContent = ''; }
}

function clearValidation(fieldId) {
  const wrap = document.getElementById(fieldId + '-wrap');
  const msgEl = document.getElementById(fieldId + '-msg');
  if (!wrap) return;
  wrap.classList.remove('has-error','has-warning','is-valid');
  if (msgEl) msgEl.textContent = '';
}

/* ── Populate form from scanned QR data ──────────── */
function populateForm(data) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };

  // Auto-capitalize names
  set('applicationType',    data.applicationType || '');
  set('firstName',          toTitleCase(data.firstName || ''));
  set('preferredFirstName', toTitleCase(data.preferredFirstName || ''));
  set('middleName',         toTitleCase(data.middleName || ''));
  set('lastName',           toTitleCase(data.lastName || ''));
  set('dob',                data.dob || '');
  set('reason',             data.reason || '');
  set('email',              (data.email || '').toLowerCase().trim());
  set('phone',              data.phone || '');
  set('position',           toTitleCase(data.position || ''));

  // Run all validations after populating
  validateAllFields();
}

/* ── Validate all form fields and highlight ──────── */
function validateAllFields() {
  let hasErrors = false;

  // Email
  const emailEl = document.getElementById('email');
  if (emailEl) {
    const v = validateEmail(emailEl.value);
    if (!v.valid) { setError('email', v.message); hasErrors = true; }
    else if (v.warning) setWarning('email', v.message);
    else setValid('email');
  }

  // Phone
  const phoneEl = document.getElementById('phone');
  if (phoneEl) {
    const v = validatePhone(phoneEl.value);
    if (!v.valid) { setError('phone', v.message); hasErrors = true; }
    else setValid('phone');
  }

  // DOB
  const dobEl = document.getElementById('dob');
  if (dobEl) {
    const v = validateDOB(dobEl.value);
    if (!v.valid) { setError('dob', v.message); hasErrors = true; }
    else if (v.warning) setWarning('dob', v.message);
    else setValid('dob');
  }

  // Required select fields
  ['applicationType','reason'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.value) { setError(id, 'This field is required.'); hasErrors = true; }
    else if (el && el.value) setValid(id);
  });

  // Required text fields
  ['firstName','lastName'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.value.trim()) { setError(id, 'This field is required.'); hasErrors = true; }
    else if (el && el.value.trim()) setValid(id);
  });

  // Optional name fields — just clear
  ['preferredFirstName','middleName','position'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value.trim()) setValid(id);
    else clearValidation(id);
  });

  return !hasErrors;
}

/* ── Live validation hooks ────────────────────────── */
function setupLiveValidation() {
  const onBlurValidate = (id, fn) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('blur', () => {
      const v = fn(el.value);
      if (!v.valid) setError(id, v.message);
      else if (v.warning) setWarning(id, v.message);
      else setValid(id);
    });
    el.addEventListener('input', () => clearValidation(id));
  };

  onBlurValidate('email', validateEmail);
  onBlurValidate('phone', validatePhone);
  onBlurValidate('dob',   validateDOB);

  // Required selects
  ['applicationType','reason'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      if (el.value) setValid(id); else setError(id, 'This field is required.');
    });
  });

  // Required text fields
  ['firstName','lastName'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('blur', () => {
      if (el.value.trim()) setValid(id); else setError(id, 'This field is required.');
    });
    el.addEventListener('input', () => clearValidation(id));
  });
}

/* ── Copy names to clipboard ──────────────────────── */
function copyNames() {
  const fn  = document.getElementById('firstName')?.value.trim()  || '';
  const pfn = document.getElementById('preferredFirstName')?.value.trim() || '';
  const mn  = document.getElementById('middleName')?.value.trim() || '';
  const ln  = document.getElementById('lastName')?.value.trim()   || '';

  const parts = [fn, pfn, mn, ln].filter(Boolean);
  if (!parts.length) { showToast('No names to copy.'); return; }

  navigator.clipboard.writeText(parts.join(' ')).then(() => {
    showToast('Names copied to clipboard!');
  }).catch(() => {
    legacyCopy(parts.join(' '));
    showToast('Names copied!');
  });
}

/* ── Copy to Excel (tab-separated) ───────────────── */
function copyToExcel() {
  const val = id => (document.getElementById(id)?.value || '').trim();

  const row = [
    val('applicationType'),
    val('firstName'),
    val('preferredFirstName'),
    val('middleName'),
    val('lastName'),
    val('dob'),
    val('reason'),
    val('email'),
    val('phone'),
    val('position'),
  ].join('\t');

  navigator.clipboard.writeText(row).then(() => {
    showToast('Row copied — paste into Excel!');
  }).catch(() => {
    legacyCopy(row);
    showToast('Row copied — paste into Excel!');
  });
}

function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

/* ── Clear form ───────────────────────────────────── */
function clearForm() {
  FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
    clearValidation(id);
  });
  document.getElementById('scan-slot-info').textContent = '';
}

/* ─────────────────────────────────────────────────────
   QR SCANNER
───────────────────────────────────────────────────── */

function startScan() {
  const readerEl = document.getElementById('qr-reader');
  if (!readerEl) return;

  document.getElementById('scan-placeholder')?.remove();
  document.getElementById('btn-start-scan').disabled  = true;
  document.getElementById('btn-stop-scan').disabled   = false;
  document.getElementById('scanner-box').classList.add('active');

  html5QrCode = new Html5Qrcode('qr-reader');

  html5QrCode.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0 },
    onScanSuccess,
    () => { /* ignore frame errors */ }
  ).catch(err => {
    console.warn('Camera error:', err);
    stopScan();
    showToast('Camera unavailable — check permissions.');
  });
}

function stopScan() {
  if (html5QrCode && scanning) {
    html5QrCode.stop().catch(() => {});
  }
  html5QrCode = null;
  scanning = false;

  document.getElementById('btn-start-scan').disabled  = false;
  document.getElementById('btn-stop-scan').disabled   = true;
  document.getElementById('scanner-box')?.classList.remove('active');
}

function onScanSuccess(decodedText) {
  stopScan();

  let data;
  try { data = JSON.parse(decodedText); }
  catch {
    showToast('Invalid QR code — expected JSON data.');
    return;
  }

  // Flash success indicator
  const box = document.getElementById('scanner-box');
  box.classList.add('success');
  const flash = document.createElement('div');
  flash.className = 'scan-success-flash';
  flash.textContent = '✓';
  box.appendChild(flash);
  setTimeout(() => { flash.remove(); box.classList.remove('success'); }, 900);

  // Populate form
  populateForm(data);

  // Update queue from slot
  if (data.slot) {
    const parsed = parseSlotNumber(data.slot);
    if (parsed) {
      setNowServing(parsed.time, data.slot);
      document.getElementById('scan-slot-info').textContent =
        `Slot: ${data.slot} · ${parsed.date} ${parsed.time}`;
    }
  }

  showToast('QR scanned successfully!');
}

/* ─────────────────────────────────────────────────────
   QUEUE MANAGEMENT
───────────────────────────────────────────────────── */

function setNowServing(timeStr, rawSlot) {
  currentSlot = timeStr;
  queueSlots  = generateQueueSlots(timeStr, 10);

  renderNowServing(timeStr, rawSlot);
  renderQueue();

  // Enable Next button
  const btn = document.getElementById('btn-next');
  if (btn) btn.disabled = false;
}

function renderNowServing(timeStr, rawSlot) {
  const card     = document.getElementById('now-serving-card');
  const timeDisp = document.getElementById('serving-time');
  const subDisp  = document.getElementById('serving-sub');

  timeDisp.textContent = timeStr || '--:--';
  subDisp.textContent  = rawSlot ? `Slot # ${rawSlot}` : 'Scan a QR code to begin';
  card.classList.toggle('now-serving-empty', !timeStr || timeStr === '--:--');
}

function renderQueue() {
  const list = document.getElementById('queue-list');
  list.innerHTML = '';

  queueSlots.forEach((slot, i) => {
    const card = document.createElement('div');
    card.className = 'slot-card';

    const badge = i === 0
      ? `<span class="slot-badge badge-next">Up Next</span>`
      : `<span class="slot-badge badge-waiting">Waiting</span>`;

    const delta = `+${i + 1}m`;

    card.innerHTML = `
      <span class="slot-index">${i + 1}</span>
      <span class="slot-time">${slot}</span>
      ${badge}
      <span class="slot-delta">${delta}</span>
    `;
    list.appendChild(card);
  });
}

function proceedToNext() {
  if (!currentSlot) { showToast('Scan a QR code first.'); return; }
  if (queueSlots.length === 0) return;

  // Advance: next slot becomes Now Serving
  const nextTime = queueSlots[0];
  currentSlot   = nextTime;
  queueSlots    = queueSlots.slice(1);
  queueSlots.push(addMinutes(queueSlots[queueSlots.length - 1] || nextTime, 1));

  renderNowServing(nextTime, null);
  renderQueue();

  // Announce
  announce(nextTime);

  // Pulse animation
  const card = document.getElementById('now-serving-card');
  card.classList.remove('announcing');
  void card.offsetWidth; // force reflow
  card.classList.add('announcing');
  setTimeout(() => card.classList.remove('announcing'), 3500);
}

/* ── Text-to-speech announcement ─────────────────── */
function announce(timeStr) {
  if (!window.speechSynthesis) return;

  const hhmm = timeStr.replace(':', '');
  const text  = timeToWords(hhmm);

  window.speechSynthesis.cancel();

  // Short pause then speak
  setTimeout(() => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate  = 0.88;
    utter.pitch = 1.0;
    utter.lang  = 'en-AU';

    // Pick a clear voice if available
    const voices = window.speechSynthesis.getVoices();
    const pref   = voices.find(v => /en.*AU|en.*GB|en.*US/i.test(v.lang));
    if (pref) utter.voice = pref;

    window.speechSynthesis.speak(utter);
  }, 300);
}

/* ── Manual announce current slot ────────────────── */
function reAnnounce() {
  if (!currentSlot) { showToast('Nothing is being served yet.'); return; }
  announce(currentSlot);
  showToast('Announcing: ' + timeToWords(currentSlot.replace(':', '')));
}

/* ── Manual "Set Current Time" ───────────────────── */
function setCurrentTime() {
  const now = new Date();
  const hh  = String(now.getHours()).padStart(2, '0');
  const mm  = String(now.getMinutes()).padStart(2, '0');
  const slot = generateSlotNumber();
  setNowServing(`${hh}:${mm}`, slot);
  showToast(`Queue set to current time: ${hh}:${mm}`);
}

/* ── Init ─────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setupLiveValidation();

  // Pre-load speech voices
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }

  // Queue starts empty
  document.getElementById('btn-next').disabled = true;
});
