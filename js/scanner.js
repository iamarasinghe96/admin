/* =====================================================
   Staff Interface – QR Scanner + Queue Management
   ===================================================== */

/* ── State ────────────────────────────────────────── */
let html5QrCode  = null;
let scanning     = false;
let usbMode      = false;
let currentSlot  = null;   // "HH:MM" — Now Serving
let queueSlots   = [];     // ["HH:MM", ...]  upcoming
let autoSkip     = false;  // auto-advance after each announcement cycle
let _announceSeq = 0;      // invalidates stale announcement callbacks

/* ── Beep (Web Audio API) ─────────────────────────── */
function beep() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const t    = ctx.currentTime;

    // First short beep — barcode scanner style
    const osc1  = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.type            = 'square';
    osc1.frequency.value = 3800;          // high-pitched buzzer tone
    gain1.gain.setValueAtTime(0.18, t);
    gain1.gain.setValueAtTime(0.18, t + 0.07);
    gain1.gain.linearRampToValueAtTime(0, t + 0.09);
    osc1.start(t);
    osc1.stop(t + 0.09);

    // Second short beep (classic double-beep of a scanner)
    const osc2  = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type            = 'square';
    osc2.frequency.value = 3800;
    gain2.gain.setValueAtTime(0, t + 0.12);
    gain2.gain.setValueAtTime(0.18, t + 0.12);
    gain2.gain.setValueAtTime(0.18, t + 0.19);
    gain2.gain.linearRampToValueAtTime(0, t + 0.21);
    osc2.start(t + 0.12);
    osc2.stop(t + 0.21);
    osc2.onended = () => ctx.close();
  } catch (e) { /* audio not available */ }
}

/* ── Field IDs ────────────────────────────────────── */
const FIELDS = [
  'timeSlot',
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

  // Time slot — parse the raw slot number to HH:MM for the field
  if (data.slot) {
    const parsed = parseSlotNumber(String(data.slot));
    if (parsed) {
      setInput('timeSlot', parsed.time);
      setValid('timeSlot');
    } else {
      setInput('timeSlot', '');
    }
  }

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

  // Time slot — manual entry updates the queue
  const timeSlotEl = document.getElementById('timeSlot');
  if (timeSlotEl) {
    timeSlotEl.addEventListener('blur', () => {
      const val = timeSlotEl.value.trim();
      if (!val) { clearValidation('timeSlot'); return; }
      if (/^\d{1,2}:\d{2}$/.test(val)) {
        const [hh, mm] = val.split(':');
        const formatted = `${hh.padStart(2, '0')}:${mm}`;
        timeSlotEl.value = formatted;
        setNowServing(formatted, null);
        setValid('timeSlot');
      } else {
        setError('timeSlot', 'Use HH:MM format e.g. 09:30');
      }
    });
    timeSlotEl.addEventListener('input', () => clearValidation('timeSlot'));
  }

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
    // If the continuous auto-scanner already succeeded during the await
    // (scanning was set to false by freezeCamera inside onScanSuccess),
    // silently ignore — the form is already populated.
    if (!scanning) return;
    console.log('[QR] Freeze & Scan: no QR found in frame', err);
    video.play();                     // resume live preview
    if (btn) btn.disabled = false;    // re-enable for another try
    showToast('No QR found — try again.');
  }
}

function onScanSuccess(decodedText) {
  if (!scanning && !usbMode) return;   // guard against duplicate fires
  beep();
  if (!usbMode) freezeCamera();

  // Stop any ongoing announcement / auto-skip cycle
  _announceSeq++;
  if (window.speechSynthesis) window.speechSynthesis.cancel();

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

  // Update queue from slot and set the Time Slot field
  const slotInfo = document.getElementById('scan-slot-info');
  if (data.slot) {
    const parsed = parseSlotNumber(String(data.slot));
    if (parsed) {
      try { setNowServing(parsed.time, data.slot); } catch(e) { console.error('[QR] setNowServing error:', e); }
      const tsEl = document.getElementById('timeSlot');
      if (tsEl) {
        tsEl.value = parsed.time;
        setValid('timeSlot');
      }
      slotInfo.textContent = `Slot: ${data.slot} · ${parsed.date} ${parsed.time}${tsEl ? '' : ' · ⚠ timeSlot field not found'}`;
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
  if (typeof updateQueueStats === 'function') updateQueueStats();

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

/* ── Text-to-speech announcement (repeats 3×) ────── */
function announce(timeStr) {
  if (!window.speechSynthesis) return;

  const text = timeToWords(timeStr.replace(':', ''));
  const seq  = ++_announceSeq;   // invalidates any in-flight cycle
  window.speechSynthesis.cancel();

  setTimeout(() => {
    if (seq !== _announceSeq) return;

    const voices = window.speechSynthesis.getVoices();
    const pref   = voices.find(v => /en.*AU|en.*GB|en.*US/i.test(v.lang));
    let count = 0;

    function sayOnce() {
      if (seq !== _announceSeq) return;
      count++;
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate  = 0.88;
      utter.pitch = 1.0;
      utter.lang  = 'en-AU';
      if (pref) utter.voice = pref;
      utter.onend = () => {
        if (seq !== _announceSeq) return;
        if (count < 3) {
          setTimeout(sayOnce, 600);          // 600 ms gap between repeats
        } else if (autoSkip) {
          setTimeout(() => {
            if (autoSkip && seq === _announceSeq) proceedToNext();
          }, 900);                           // brief pause before advancing
        }
      };
      window.speechSynthesis.speak(utter);
    }

    sayOnce();
  }, 300);
}

/* ── Auto-Skip toggle ─────────────────────────────── */
function toggleAutoSkip() {
  autoSkip = !autoSkip;
  const btn = document.getElementById('btn-auto-skip');
  if (btn) {
    btn.textContent = autoSkip ? '⏭ Auto-Skip: ON' : '⏭ Auto-Skip: OFF';
    btn.classList.toggle('btn-on', autoSkip);
  }
  showToast('Auto-Skip ' + (autoSkip ? 'ON' : 'OFF'));
}

/* ── Manual announce current slot ────────────────── */
function reAnnounce() {
  if (!currentSlot) { showToast('Nothing is being served yet.'); return; }
  announce(currentSlot);
  showToast('Announcing: ' + timeToWords(currentSlot.replace(':', '')));
}

/* ── USB Scanner Mode ─────────────────────────────── */
function setMode(mode) {
  const webcamLayout = document.getElementById('webcam-layout');
  const usbUI        = document.getElementById('usb-scanner-ui');
  const btnWebcam    = document.getElementById('btn-mode-webcam');
  const btnUSB       = document.getElementById('btn-mode-usb');

  if (mode === 'usb') {
    usbMode = true;
    if (scanning) stopScan();
    webcamLayout.style.display = 'none';
    usbUI.style.display        = 'block';
    btnWebcam.classList.remove('active');
    btnUSB.classList.add('active');
    const input = document.getElementById('usb-input');
    if (input) { input.value = ''; input.focus(); }
    document.getElementById('usb-status-box').classList.add('usb-ready');
  } else {
    usbMode = false;
    webcamLayout.style.display = '';
    usbUI.style.display        = 'none';
    btnWebcam.classList.add('active');
    btnUSB.classList.remove('active');
    document.getElementById('usb-status-box').classList.remove('usb-ready');
  }
}

function processUSBScan(text) {
  if (!text) return;

  // Flash success on the USB status box
  const box        = document.getElementById('usb-status-box');
  const statusText = document.getElementById('usb-status-text');
  const icon       = document.getElementById('usb-icon');
  box.classList.add('usb-success');
  icon.textContent        = '✓';
  statusText.textContent  = 'Scan successful!';
  setTimeout(() => {
    box.classList.remove('usb-success');
    icon.textContent       = '🔌';
    statusText.textContent = 'Ready — pull the scanner trigger to scan';
    document.getElementById('usb-input')?.focus();
  }, 900);

  onScanSuccess(text);
}

function setupUSBScanner() {
  const input = document.getElementById('usb-input');
  if (!input) return;

  // Physical scanners type the decoded text then send Enter
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = input.value.trim();
      input.value = '';
      if (text) processUSBScan(text);
    }
  });

  // Visual cue when focused vs blurred
  input.addEventListener('focus', () => {
    document.getElementById('usb-focus-hint').textContent = 'Scanner connected — ready to scan';
  });
  input.addEventListener('blur', () => {
    document.getElementById('usb-focus-hint').textContent = 'Click here if the scanner stops responding';
  });
}

/* ── Init ─────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setupLiveValidation();
  setupUSBScanner();

  // Pre-load speech voices
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }

  // Queue starts empty
  document.getElementById('btn-next').disabled = true;
});
