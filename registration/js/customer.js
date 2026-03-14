/* =====================================================
   Customer Registration App
   Steps: 1. Form → 2. Review → 3. QR Code
   ===================================================== */

let qrGenerated = false;
let qrInstance  = null;

/* ── Prevent accidental page close after QR shown ── */
window.addEventListener('beforeunload', e => {
  if (qrGenerated) {
    e.preventDefault();
    e.returnValue = 'Closing or refreshing this page will cancel your slot.';
    return e.returnValue;
  }
});

/* ── Step navigation ──────────────────────────────── */
const STEPS = ['step-form', 'step-review', 'step-qr'];

function showStep(id) {
  STEPS.forEach(s => {
    document.getElementById(s).classList.toggle('active', s === id);
  });
  // Update step indicator dots
  const idx = STEPS.indexOf(id);
  document.querySelectorAll('.step').forEach((el, i) => {
    el.classList.toggle('active',    i === idx);
    el.classList.toggle('completed', i < idx);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── "Other" field toggle ─────────────────────────── */
function toggleOther(selectEl, otherId) {
  const other = document.getElementById(otherId);
  if (!other) return;
  const show = selectEl.value === 'Other';
  other.style.display = show ? 'block' : 'none';
  if (show) other.focus();
  else other.value = '';
}

/* ── Date auto-format DD/MM/YYYY ─────────────────── */
function formatDOB(input) {
  let v = input.value.replace(/\D/g, '');
  if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
  if (v.length > 5) v = v.slice(0, 5) + '/' + v.slice(5, 9);
  input.value = v;
}

/* ── Value helpers ────────────────────────────────── */
function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function getAppType() {
  return getVal('applicationType') === 'Other'
    ? getVal('applicationTypeOther')
    : getVal('applicationType');
}

function getReason() {
  return getVal('reason') === 'Other'
    ? getVal('reasonOther')
    : getVal('reason');
}

/* ── Field validation display ─────────────────────── */
function setFieldError(id, msg) {
  const el  = document.getElementById(id);
  const msg_el = document.getElementById(id + '-msg');
  if (el)     el.classList.add('error');
  if (msg_el) { msg_el.textContent = msg; }
}

function clearFieldError(id) {
  const el  = document.getElementById(id);
  const msg_el = document.getElementById(id + '-msg');
  if (el)     el.classList.remove('error', 'warning');
  if (msg_el) msg_el.textContent = '';
}

function setFieldWarning(id, msg) {
  const el  = document.getElementById(id);
  const msg_el = document.getElementById(id + '-msg');
  if (el)     { el.classList.remove('error'); el.classList.add('warning'); }
  if (msg_el) msg_el.textContent = msg;
}

/* ── STEP 1: Validate form and go to Review ──────── */
function goToReview() {
  const errors = [];

  // Clear previous errors
  ['applicationType','applicationTypeOther','firstName','lastName',
   'dob','reason','reasonOther','email','phone'].forEach(clearFieldError);
  document.getElementById('form-errors').classList.remove('visible');

  // Application Type
  const appType = getAppType();
  if (!getVal('applicationType')) {
    setFieldError('applicationType', 'Please select an application type.');
    errors.push('Application Type is required.');
  } else if (getVal('applicationType') === 'Other' && !getVal('applicationTypeOther')) {
    setFieldError('applicationTypeOther', 'Please specify the application type.');
    errors.push('Specify the Other application type.');
  }

  // First & Last Name
  if (!getVal('firstName')) {
    setFieldError('firstName', 'First name is required.');
    errors.push('First Name is required.');
  }
  if (!getVal('lastName')) {
    setFieldError('lastName', 'Last name is required.');
    errors.push('Last Name is required.');
  }

  // DOB
  const dobV = validateDOB(getVal('dob'));
  if (!dobV.valid) {
    setFieldError('dob', dobV.message);
    errors.push('Date of Birth: ' + dobV.message);
  } else if (dobV.warning) {
    setFieldWarning('dob', dobV.message);
  }

  // Reason
  if (!getVal('reason')) {
    setFieldError('reason', 'Please select a reason.');
    errors.push('Reason of Admission is required.');
  } else if (getVal('reason') === 'Other' && !getVal('reasonOther')) {
    setFieldError('reasonOther', 'Please specify the reason.');
    errors.push('Specify the Other reason.');
  }

  // Email
  const emailV = validateEmail(getVal('email'));
  if (!emailV.valid) {
    setFieldError('email', emailV.message);
    errors.push('Email: ' + emailV.message);
  } else if (emailV.warning) {
    setFieldWarning('email', emailV.message);
  }

  // Phone
  const phoneV = validatePhone(getVal('phone'));
  if (!phoneV.valid) {
    setFieldError('phone', phoneV.message);
    errors.push('Phone: ' + phoneV.message);
  }

  if (errors.length) {
    const summary = document.getElementById('form-errors');
    const list    = document.getElementById('form-errors-list');
    list.innerHTML = errors.map(e => `<li>${e}</li>`).join('');
    summary.classList.add('visible');
    summary.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  buildReview();
  showStep('step-review');
}

/* ── STEP 2: Build review card ───────────────────── */
const REVIEW_FIELDS = [
  { label: 'Application Type',    value: getAppType },
  { label: 'First Name',          value: () => getVal('firstName') },
  { label: 'Preferred Name',      value: () => getVal('preferredFirstName'), optional: true },
  { label: 'Middle Name',         value: () => getVal('middleName'),         optional: true },
  { label: 'Last Name',           value: () => getVal('lastName') },
  { label: 'Date of Birth',       value: () => getVal('dob') },
  { label: 'Reason',              value: getReason },
  { label: 'Email',               value: () => getVal('email') },
  { label: 'Phone',               value: () => getVal('phone') },
  { label: 'Position',            value: () => getVal('position'), optional: true },
];

function buildReview() {
  const container = document.getElementById('review-content');
  container.innerHTML = '';

  REVIEW_FIELDS.forEach(({ label, value, optional }) => {
    const v = value();
    const row = document.createElement('div');
    row.className = 'review-item';
    row.innerHTML = `
      <span class="review-label">${label}</span>
      <span class="review-value${!v ? ' empty' : ''}">${v || (optional ? '—' : '<em>Missing</em>')}</span>
    `;
    container.appendChild(row);
  });
}

function goBackToForm() {
  showStep('step-form');
}

/* ── STEP 3: Generate QR ─────────────────────────── */
function generateQR() {
  const slot  = generateSlotNumber();
  const hhmm  = slot.substring(8, 12);
  const shortSlot = hhmm.substring(0, 2) + ':' + hhmm.substring(2, 4);

  const data = {
    slot:               slot,
    applicationType:    getAppType(),
    firstName:          getVal('firstName'),
    preferredFirstName: getVal('preferredFirstName'),
    middleName:         getVal('middleName'),
    lastName:           getVal('lastName'),
    dob:                getVal('dob'),
    reason:             getReason(),
    email:              getVal('email').toLowerCase(),
    phone:              getVal('phone'),
    position:           getVal('position'),
  };

  // Render QR code
  const wrap = document.getElementById('qrcode-wrap');
  wrap.innerHTML = '';
  if (qrInstance) { try { qrInstance.clear(); } catch(e) {} }

  qrInstance = new QRCode(wrap, {
    text:         JSON.stringify(data),
    width:        220,
    height:       220,
    colorDark:    '#111827',
    colorLight:   '#ffffff',
    correctLevel: QRCode.CorrectLevel.M,
  });

  // Show slot badge
  document.getElementById('slot-time').textContent = shortSlot;

  qrGenerated = true;
  showStep('step-qr');
}
