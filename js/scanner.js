/* =====================================================
   Staff Interface – QR Scanner + Queue Management
   ===================================================== */

/* ── State ────────────────────────────────────────── */
let html5QrCode  = null;
let scanning     = false;
let currentSlot  = null;   // "HH:MM" — Now Serving
let queueSlots   = [];     // ["HH:MM", ...]  upcoming

/* ── Beep (Web Audio API) ─────────────────────────── */
function beep() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type            = 'sine';
    osc.frequency.value = 1046;  // C6 — clear, sharp beep
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.18);
    osc.onended = () => ctx.close();
  } catch (e) { /* audio not available */ }
}

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
  // For <input> fields: set value directly.
  // For <select> fields: if the value isn't a recognised option, fall back to
  // "Other" so the field isn't silently left empty (e.g. applicationType from
  // a custom "Other" entry in the registration app).
  const setInput = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };

  const setSelect = (id, val) => {
    const el = document.getElementById(id);
    if (!el || !val) return;
    const match = Array.from(el.options).some(o => o.value === val);
    el.value = match ? val : 'Other';
    // If we fell back to Other, log it so it's easy to spot
    if (!match) console.log(`[QR] select #${id}: "${val}" not in options, set to Other`);
  };

  setSelect('applicationType', data.applicationType);
  setInput('firstName',          toTitleCase(data.firstName || ''));
  setInput('preferredFirstName', toTitleCase(data.preferredFirstName || ''));
  setInput('middleName',         toTitleCase(data.middleName || ''));
  setInput('lastName',           toTitleCase(data.lastName || ''));
  setInput('dob',                data.dob || '');
  setSelect('reason',            data.reason);
  setInput('email',              (data.email || '').toLowerCase().trim());
  setInput('phone',              (data.phone || '').replace(/\s+/g, ''));
  setInput('position',           toTitleCase(data.position || ''));

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

/* ── Clear form + reset scanner to initial state ──── */
function clearForm() {
  FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
    clearValidation(id);
  });
  document.getElementById('scan-slot-info').textContent = '';

  // Fully stop the camera and restore the placeholder so the user
  // can start a fresh scan for the next person.
  stopScan();
  const box = document.getElementById('scanner-box');
  if (box && !document.getElementById('scan-placeholder')) {
    const ph = document.createElement('div');
    ph.id = 'scan-placeholder';
    ph.innerHTML = '<span class="big-icon">⬛</span>'
      + '<p style="font-size:.875rem;color:var(--gray-500);">Camera is off — click <strong>Start Scan</strong> to begin</p>';
    box.appendChild(ph);
  }
  box?.classList.remove('success');
}

/* ─────────────────────────────────────────────────────
   QR SCANNER
───────────────────────────────────────────────────── */

function startScan() {
  const readerEl = document.getElementById('qr-reader');
  if (!readerEl) return;

  document.getElementById('scan-placeholder')?.remove();
  document.getElementById('btn-start-scan').disabled   = true;

  document.getElementById('btn-freeze-scan').disabled  = false;
  document.getElementById('scanner-box').classList.add('active');

  html5QrCode = new Html5Qrcode('qr-reader');

  html5QrCode.start(
    { facingMode: 'environment' },
    {
      fps: 15,
      // No qrbox → scan the entire camera frame.
      // No aspectRatio override → use native 16:9 camera feed so the
      // display and detection coordinate space stay in sync.
    },
    onScanSuccess,
    () => { /* ignore per-frame decode errors */ }
  ).catch(err => {
    console.warn('Camera error:', err);
    stopScan();
    showToast('Camera unavailable — check permissions.');
  });
  scanning = true;
}

function stopScan() {
  if (html5QrCode) {
    html5QrCode.stop().catch(() => {});
    html5QrCode = null;
  }
  scanning = false;

  document.getElementById('btn-start-scan').disabled   = false;

  document.getElementById('btn-freeze-scan').disabled  = true;
  document.getElementById('scanner-box')?.classList.remove('active');
}

function freezeCamera() {
  const video = document.querySelector('#qr-reader video');
  if (video) video.pause();

  if (html5QrCode) {
    html5QrCode.stop().catch(() => {});
  }
  scanning = false;
  document.getElementById('btn-start-scan').disabled   = false;

  document.getElementById('btn-freeze-scan').disabled  = true;
  document.getElementById('scanner-box')?.classList.remove('active');
}

/* ── Freeze & Scan: capture current frame and decode it ── */
async function freezeAndScan() {
  if (!scanning) { showToast('Start the camera first.'); return; }

  const video = document.querySelector('#qr-reader video');
  if (!video || video.readyState < 2) { showToast('Camera not ready.'); return; }

  const btn = document.getElementById('btn-freeze-scan');
  if (btn) btn.disabled = true;

  // Capture the current frame
  const canvas = document.createElement('canvas');
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  // Freeze the preview so the user can see what was captured
  video.pause();

  try {
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', 0.92);
    });

    const file = new File([blob], 'snap.jpg', { type: 'image/jpeg' });

    // Temporary off-screen element required by html5-qrcode scanFile
    let tempEl = document.getElementById('_qr_snap_tmp');
    if (!tempEl) {
      tempEl = document.createElement('div');
      tempEl.id = '_qr_snap_tmp';
      tempEl.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);pointer-events:none;';
      document.body.appendChild(tempEl);
    }

    const snap = new Html5Qrcode('_qr_snap_tmp');
    const decodedText = await snap.scanFile(file, /* showImage */ false);

    // Success — hand off to the normal success handler
    onScanSuccess(decodedText);

  } catch (err) {
    console.log('[QR] Freeze & Scan: no QR found in frame', err);
    video.play();                     // resume live preview
    if (btn) btn.disabled = false;    // re-enable for another try
    showToast('No QR found — try again.');
  }
}

function onScanSuccess(decodedText) {
  if (!scanning) return;   // guard against duplicate fires
  beep();
  freezeCamera();

  console.log('[QR] raw decoded text:', decodedText);

  let data;
  try {
    // Primary format: JSON (new registration app)
    data = JSON.parse(decodedText);
    console.log('[QR] parsed as JSON:', data);
  } catch {
    // Fallback: tab-separated format (legacy registration app)
    // Format: slot\tappType\tfirstName\tprefFirstName\tmiddleName\tlastName\tDOB\treason\temail\tphone\tposition
    const parts = decodedText.split('\t');
    console.log('[QR] not JSON, tab parts:', parts.length, parts);
    if (parts.length >= 10) {
      data = {
        slot:               parts[0] || '',
        applicationType:    parts[1] || '',
        firstName:          parts[2] || '',
        preferredFirstName: parts[3] || '',
        middleName:         parts[4] || '',
        lastName:           parts[5] || '',
        dob:                parts[6] || '',
        reason:             parts[7] || '',
        email:              parts[8] || '',
        phone:              parts[9] || '',
        position:           parts[10] || '',
      };
    } else {
      // Show raw text so staff can see what was decoded
      document.getElementById('scan-slot-info').textContent =
        'Unknown format — raw: ' + decodedText.substring(0, 80);
      showToast('Unrecognised QR format — check console.');
      return;
    }
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
  const slotInfo = document.getElementById('scan-slot-info');
  if (data.slot) {
    const parsed = parseSlotNumber(data.slot);
    if (parsed) {
      setNowServing(parsed.time, data.slot);
      slotInfo.textContent = `Slot: ${data.slot} · ${parsed.date} ${parsed.time}`;
    } else {
      slotInfo.textContent = `Slot value: ${data.slot} (could not parse)`;
    }
  } else {
    slotInfo.textContent = `No slot in QR — name: ${data.firstName || '?'} ${data.lastName || '?'}`;
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
