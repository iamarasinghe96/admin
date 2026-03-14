/* =====================================================
   Customer Registration – QR Code Generation
   ===================================================== */

let qrInstance = null;

/* ── Field references ─────────────────────────────── */
const F = {
  applicationType:     () => document.getElementById('c-applicationType'),
  firstName:           () => document.getElementById('c-firstName'),
  preferredFirstName:  () => document.getElementById('c-preferredFirstName'),
  middleName:          () => document.getElementById('c-middleName'),
  lastName:            () => document.getElementById('c-lastName'),
  dob:                 () => document.getElementById('c-dob'),
  reason:              () => document.getElementById('c-reason'),
  email:               () => document.getElementById('c-email'),
  phone:               () => document.getElementById('c-phone'),
  position:            () => document.getElementById('c-position'),
};

/* ── Helpers ─────────────────────────────────────── */
function setFieldError(id, message) {
  const wrapper = document.getElementById(id + '-wrap');
  const msg     = document.getElementById(id + '-msg');
  if (!wrapper) return;
  wrapper.classList.remove('is-valid', 'has-warning');
  wrapper.classList.toggle('has-error', !!message);
  if (msg) { msg.textContent = message || ''; msg.className = 'field-msg error'; }
}

function setFieldWarning(id, message) {
  const wrapper = document.getElementById(id + '-wrap');
  const msg     = document.getElementById(id + '-msg');
  if (!wrapper) return;
  wrapper.classList.remove('has-error', 'is-valid');
  wrapper.classList.toggle('has-warning', !!message);
  if (msg) { msg.textContent = message || ''; msg.className = 'field-msg warning'; }
}

function clearField(id) {
  const wrapper = document.getElementById(id + '-wrap');
  const msg     = document.getElementById(id + '-msg');
  if (wrapper) wrapper.classList.remove('has-error', 'has-warning', 'is-valid');
  if (msg) { msg.textContent = ''; msg.className = 'field-msg'; }
}

/* ── Live validation ─────────────────────────────── */
function setupCustomerValidation() {
  F.email().addEventListener('blur', () => {
    const v = validateEmail(F.email().value);
    if (!v.valid)         setFieldError('c-email', v.message);
    else if (v.warning)   setFieldWarning('c-email', v.message);
    else                  clearField('c-email');
  });

  F.phone().addEventListener('blur', () => {
    const v = validatePhone(F.phone().value);
    if (!v.valid) setFieldError('c-phone', v.message);
    else          clearField('c-phone');
  });

  F.dob().addEventListener('blur', () => {
    const v = validateDOB(F.dob().value);
    if (!v.valid)       setFieldError('c-dob', v.message);
    else if (v.warning) setFieldWarning('c-dob', v.message);
    else                clearField('c-dob');
  });
}

/* ── Full form validation before QR generation ──── */
function validateCustomerForm() {
  let errors = [];

  if (!F.applicationType().value) errors.push('Application Type is required.');
  if (!F.firstName().value.trim()) errors.push('First Name is required.');
  if (!F.lastName().value.trim()) errors.push('Last Name is required.');

  const dobV = validateDOB(F.dob().value);
  if (!dobV.valid) errors.push('Date of Birth: ' + dobV.message);

  if (!F.reason().value) errors.push('Reason of Admission is required.');

  const emailV = validateEmail(F.email().value);
  if (!emailV.valid) errors.push('Email: ' + emailV.message);

  const phoneV = validatePhone(F.phone().value);
  if (!phoneV.valid) errors.push('Phone: ' + phoneV.message);

  return errors;
}

/* ── Generate QR Code ───────────────────────────── */
function generateQR() {
  const errors = validateCustomerForm();
  const summaryEl = document.getElementById('c-validation-summary');
  const summaryList = document.getElementById('c-validation-list');

  if (errors.length > 0) {
    summaryEl.classList.add('visible');
    summaryList.innerHTML = errors.map(e => `<li>${e}</li>`).join('');
    return;
  }

  summaryEl.classList.remove('visible');

  const slot = generateSlotNumber();

  const data = {
    slot:               slot,
    applicationType:    F.applicationType().value,
    firstName:          F.firstName().value.trim(),
    preferredFirstName: F.preferredFirstName().value.trim(),
    middleName:         F.middleName().value.trim(),
    lastName:           F.lastName().value.trim(),
    dob:                F.dob().value.trim(),
    reason:             F.reason().value,
    email:              F.email().value.trim().toLowerCase(),
    phone:              F.phone().value.trim(),
    position:           F.position().value.trim(),
  };

  const canvas = document.getElementById('qrcode-canvas');
  canvas.innerHTML = '';

  if (qrInstance) {
    try { qrInstance.clear(); } catch(e) {}
  }

  qrInstance = new QRCode(canvas, {
    text:          JSON.stringify(data),
    width:         220,
    height:        220,
    colorDark:     '#111827',
    colorLight:    '#ffffff',
    correctLevel:  QRCode.CorrectLevel.H,
  });

  // Show output section
  const output = document.getElementById('qr-output');
  output.classList.add('visible');

  // Display slot info
  const parsed = parseSlotNumber(slot);
  document.getElementById('slot-display').textContent = slot;
  document.getElementById('slot-time-display').textContent =
    `${parsed.date} at ${parsed.time}`;

  output.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ── Print QR code ──────────────────────────────── */
function printQR() {
  const canvas = document.querySelector('#qrcode-canvas canvas');
  const img    = document.querySelector('#qrcode-canvas img');
  let src = '';

  if (canvas) src = canvas.toDataURL();
  else if (img) src = img.src;
  else return;

  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>QR Code</title>
    <style>
      body { display:flex; align-items:center; justify-content:center;
             height:100vh; margin:0; }
      img  { max-width: 300px; }
    </style></head>
    <body onload="window.print()">
      <img src="${src}" alt="QR Code"/>
    </body></html>
  `);
  win.document.close();
}

/* ── Reset form ─────────────────────────────────── */
function resetCustomerForm() {
  document.getElementById('registration-form').reset();
  document.getElementById('qr-output').classList.remove('visible');
  document.getElementById('c-validation-summary').classList.remove('visible');
  ['c-email','c-phone','c-dob'].forEach(id => clearField(id));
}

/* ── Init ─────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setupCustomerValidation();
});
