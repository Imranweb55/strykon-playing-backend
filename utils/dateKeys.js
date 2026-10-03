// Calendar-date helpers on "YYYY-MM-DD" strings (no timezone maths involved).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const parse = (key) => key.split("-").map(Number);
const toKey = (ms) => new Date(ms).toISOString().slice(0, 10);

const addDays = (key, n) => {
  const [y, m, d] = parse(key);
  return toKey(Date.UTC(y, m - 1, d + n));
};

// Membership of N months starting on `key` lasts through the day before the
// same date N months later (1 Jan + 1 month -> ends 31 Jan).
const membershipEnd = (key, months) => {
  const [y, m, d] = parse(key);
  const first = Date.UTC(y, m - 1 + months, 1);
  const dim = new Date(
    Date.UTC(new Date(first).getUTCFullYear(), new Date(first).getUTCMonth() + 1, 0)
  ).getUTCDate();
  const target = new Date(first);
  const sameDay = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, dim));
  return toKey(sameDay - 24 * 60 * 60 * 1000);
};

// whole days from b to a (a - b)
const diffDays = (a, b) => {
  const [ay, am, ad] = parse(a);
  const [by, bm, bd] = parse(b);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000);
};

module.exports = { DATE_RE, addDays, membershipEnd, diffDays };
