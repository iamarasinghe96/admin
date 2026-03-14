/* =====================================================
   Registration — Validation Utilities
   (shared with admin scanner)
   ===================================================== */

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

const KNOWN_DOMAINS = [
  'gmail.com','googlemail.com',
  'yahoo.com','yahoo.com.au','yahoo.co.uk',
  'hotmail.com','hotmail.com.au','hotmail.co.uk',
  'outlook.com','outlook.com.au',
  'live.com','live.com.au',
  'icloud.com','me.com','mac.com',
  'msn.com','aol.com',
  'protonmail.com','proton.me',
  'bigpond.com','bigpond.net.au',
  'optusnet.com.au','tpg.com.au',
  'internode.on.net','dodo.com.au',
];

function validateEmail(email) {
  if (!email) return { valid: false, message: 'Email is required.' };
  const trimmed = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed))
    return { valid: false, message: 'Invalid email format.' };
  const domain = trimmed.split('@')[1].toLowerCase();
  if (KNOWN_DOMAINS.includes(domain)) return { valid: true, message: '' };
  let closest = null, closestDist = Infinity;
  for (const d of KNOWN_DOMAINS) {
    const dist = levenshtein(domain, d);
    if (dist < closestDist) { closestDist = dist; closest = d; }
  }
  if (closestDist <= 2)
    return { valid: false, message: `Did you mean @${closest}?` };
  return { valid: true, warning: true, message: `Unrecognised domain "@${domain}" — double-check.` };
}

function validatePhone(phone) {
  if (!phone) return { valid: false, message: 'Phone number is required.' };
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
  if (cleaned.startsWith('+')) {
    if (/^\+\d{7,15}$/.test(cleaned)) return { valid: true, message: '' };
    return { valid: false, message: 'International: 7–15 digits after +.' };
  }
  if (/^\d{10}$/.test(cleaned)) return { valid: true, message: '' };
  if (/^\d+$/.test(cleaned))
    return { valid: false, message: `Expected 10 digits, got ${cleaned.length}.` };
  return { valid: false, message: 'Phone contains invalid characters.' };
}

function validateDOB(dob) {
  if (!dob) return { valid: false, message: 'Date of birth is required.' };
  const parts = dob.split('/');
  if (parts.length !== 3) return { valid: false, message: 'Use DD/MM/YYYY format.' };
  const [dd, mm, yyyy] = parts.map(Number);
  if (isNaN(dd) || isNaN(mm) || isNaN(yyyy))
    return { valid: false, message: 'Numbers only.' };
  if (mm < 1 || mm > 12) return { valid: false, message: 'Month must be 01–12.' };
  if (dd < 1 || dd > 31) return { valid: false, message: 'Day must be 01–31.' };
  const date = new Date(yyyy, mm - 1, dd);
  if (date.getFullYear() !== yyyy || date.getMonth() !== mm-1 || date.getDate() !== dd)
    return { valid: false, message: 'This date does not exist.' };
  if (date > new Date()) return { valid: false, message: 'Cannot be in the future.' };
  const age = new Date().getFullYear() - yyyy;
  if (age > 120) return { valid: false, message: 'Unrealistic age — please check.' };
  if (yyyy < 1950)
    return { valid: true, warning: true, message: `Unusual birth year (${yyyy}) — verify.` };
  return { valid: true, message: '' };
}

function generateSlotNumber() {
  const now = new Date();
  const p = n => String(n).padStart(2, '0');
  return (
    String(now.getFullYear()) +
    p(now.getMonth() + 1) + p(now.getDate()) +
    p(now.getHours())     + p(now.getMinutes()) + p(now.getSeconds())
  );
}
