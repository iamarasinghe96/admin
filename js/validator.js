/* =====================================================
   Validation Utilities
   ===================================================== */

/**
 * Levenshtein distance between two strings (case-insensitive).
 */
function levenshtein(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

/**
 * Convert a string to Title Case, handling hyphens and apostrophes.
 * "o'brien-smith" → "O'Brien-Smith"
 */
function toTitleCase(str) {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/(?:^|[\s\-'])(\w)/g, c => c.toUpperCase());
}

/* ── Known email domains for typo detection ─────────── */
const KNOWN_DOMAINS = [
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.com.au', 'yahoo.co.uk',
  'hotmail.com', 'hotmail.com.au', 'hotmail.co.uk',
  'outlook.com', 'outlook.com.au',
  'live.com', 'live.com.au',
  'icloud.com', 'me.com', 'mac.com',
  'msn.com', 'aol.com',
  'protonmail.com', 'proton.me',
  'mail.com',
  'bigpond.com', 'bigpond.net.au',
  'optusnet.com.au',
  'tpg.com.au',
  'internode.on.net',
  'aapt.net.au',
  'dodo.com.au',
];

/**
 * Validate an email address.
 * Returns { valid: bool, warning: bool, message: string }
 */
function validateEmail(email) {
  if (!email) return { valid: false, message: 'Email is required.' };

  const trimmed = email.trim();
  const basicRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!basicRegex.test(trimmed))
    return { valid: false, message: 'Invalid email format.' };

  const parts = trimmed.split('@');
  const domain = parts[1].toLowerCase();

  // Exact known domain → valid
  if (KNOWN_DOMAINS.includes(domain))
    return { valid: true, message: '' };

  // Check for common typo (within edit-distance 2 of a known domain)
  let closest = null, closestDist = Infinity;
  for (const d of KNOWN_DOMAINS) {
    const dist = levenshtein(domain, d);
    if (dist < closestDist) { closestDist = dist; closest = d; }
  }

  if (closestDist <= 2)
    return {
      valid: false,
      message: `Did you mean @${closest}?`
    };

  // Unknown domain — allow but warn
  return { valid: true, warning: true, message: `Unrecognised domain "@${domain}" — please double-check.` };
}

/**
 * Validate a phone number.
 * Accepts Australian (10 digits) or international (+XX...) formats.
 * Returns { valid: bool, message: string }
 */
function validatePhone(phone) {
  if (!phone) return { valid: false, message: 'Phone number is required.' };

  // Strip formatting characters
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');

  if (cleaned.startsWith('+')) {
    if (/^\+\d{7,15}$/.test(cleaned)) return { valid: true, message: '' };
    return { valid: false, message: 'International number must be 7–15 digits after +.' };
  }

  if (/^\d{10}$/.test(cleaned)) return { valid: true, message: '' };

  if (/^\d+$/.test(cleaned))
    return { valid: false, message: `Expected 10 digits, got ${cleaned.length}.` };

  return { valid: false, message: 'Phone number contains invalid characters.' };
}

/**
 * Validate a date of birth string in DD/MM/YYYY format.
 * Returns { valid: bool, warning: bool, message: string }
 */
function validateDOB(dob) {
  if (!dob) return { valid: false, message: 'Date of birth is required.' };

  const parts = dob.split('/');
  if (parts.length !== 3) return { valid: false, message: 'Use DD/MM/YYYY format.' };

  const [dd, mm, yyyy] = parts.map(Number);
  if (isNaN(dd) || isNaN(mm) || isNaN(yyyy))
    return { valid: false, message: 'Date must contain numbers only.' };

  if (mm < 1 || mm > 12) return { valid: false, message: 'Month must be 01–12.' };
  if (dd < 1 || dd > 31) return { valid: false, message: 'Day must be 01–31.' };

  // Validate the actual date
  const date = new Date(yyyy, mm - 1, dd);
  if (date.getFullYear() !== yyyy || date.getMonth() !== mm - 1 || date.getDate() !== dd)
    return { valid: false, message: 'This date does not exist.' };

  const today = new Date();
  if (date > today)
    return { valid: false, message: 'Date of birth cannot be in the future.' };

  const age = today.getFullYear() - yyyy -
    (today < new Date(today.getFullYear(), mm - 1, dd) ? 1 : 0);

  if (age > 120) return { valid: false, message: 'Unrealistic age — please check.' };
  if (age < 5)   return { valid: false, message: 'Age appears too young — please check.' };

  if (yyyy < 1950)
    return { valid: true, warning: true, message: `Unusual birth year (${yyyy}) — please verify.` };

  return { valid: true, message: '' };
}

/**
 * Convert a 4-digit HHMM string (e.g. "1052") to spoken words.
 * Returns e.g. "Token number ten fifty two"
 */
function timeToWords(hhmm) {
  const clean = hhmm.replace(':', '').padStart(4, '0');
  const h = parseInt(clean.substring(0, 2), 10);
  const m = parseInt(clean.substring(2, 4), 10);

  const ones = [
    'zero','one','two','three','four','five','six','seven','eight','nine',
    'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen',
    'seventeen','eighteen','nineteen'
  ];
  const tens = ['','','twenty','thirty','forty','fifty'];

  let hourWord;
  if (h < 20) {
    hourWord = ones[h];
  } else {
    const t = Math.floor(h / 10);
    const o = h % 10;
    hourWord = tens[t] + (o ? ' ' + ones[o] : '');
  }

  let minWord;
  if (m === 0) {
    minWord = 'hundred';
  } else if (m < 20) {
    minWord = ones[m];
  } else {
    const t = Math.floor(m / 10);
    const o = m % 10;
    minWord = tens[t] + (o ? ' ' + ones[o] : '');
  }

  return `Token number ${hourWord} ${minWord}`;
}

/**
 * Parse the slot number embedded in QR code data.
 * Format: YYYYMMDDHHMMSS  e.g. "20260314105241"
 * Returns { date: "2026-03-14", time: "10:52", raw: "20260314105241" }
 */
function parseSlotNumber(slot) {
  if (!slot || slot.length < 12) return null;
  const year  = slot.substring(0, 4);
  const month = slot.substring(4, 6);
  const day   = slot.substring(6, 8);
  const hh    = slot.substring(8, 10);
  const mm    = slot.substring(10, 12);
  return {
    date: `${year}-${month}-${day}`,
    time: `${hh}:${mm}`,
    hhmm: `${hh}${mm}`,
    raw:  slot
  };
}

/**
 * Add `minutes` to a "HH:MM" string, wrapping at midnight.
 */
function addMinutes(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

/**
 * Generate the next `count` 1-minute queue slots from `timeStr`.
 */
function generateQueueSlots(timeStr, count = 10) {
  return Array.from({ length: count }, (_, i) => addMinutes(timeStr, i + 1));
}

/**
 * Generate a slot number string from the current date/time.
 * Returns e.g. "20260314105241"
 */
function generateSlotNumber() {
  const now  = new Date();
  const pad  = n => String(n).padStart(2, '0');
  return (
    String(now.getFullYear()) +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}
