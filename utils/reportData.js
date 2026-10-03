const PoolBooking = require("../models/PoolBooking");
const TurfBooking = require("../models/TurfBooking");
const { SPORT_NAMES, formatMinutes } = require("../config/turfRules");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const GAMES = {
  swimming: "Swimming Pool",
  basketball: "Basketball",
  pickleball: "Pickleball",
  cricket: "Cricket",
};

// tz = admin browser's Date#getTimezoneOffset() (minutes, UTC - local), so a
// "day" always means the admin's own calendar day, not the server's.
const dayStart = (dateKey, tz) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + tz * 60000);
};
const shiftKey = (dateKey, delta) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
};
const monthStartKey = (dateKey) => `${dateKey.slice(0, 7)}-01`;
const monthEndKey = (dateKey) => {
  const [y, m] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

// period: "daily" | "weekly" | "monthly". Returns { fromKey, toKey, label }.
const resolveRange = (period, dateKey) => {
  if (!DATE_RE.test(dateKey || "")) throw new Error("Valid date is required");
  if (period === "weekly") {
    const from = shiftKey(dateKey, -6);
    return { fromKey: from, toKey: dateKey, label: `${from} to ${dateKey} (7 days)` };
  }
  if (period === "monthly") {
    const from = monthStartKey(dateKey);
    const to = monthEndKey(dateKey);
    return { fromKey: from, toKey: to, label: `${from} to ${to} (month)` };
  }
  if (period === "daily") return { fromKey: dateKey, toKey: dateKey, label: dateKey };
  throw new Error("Period must be daily, weekly or monthly");
};

// Loads every booking (pool + turf) inside [fromKey, toKey] (admin-local
// days), optionally filtered to one game, and returns one normalised list
// plus the totals the report needs.
const loadReportData = async ({ period, dateKey, game, tz }) => {
  const { fromKey, toKey, label } = resolveRange(period, dateKey);
  const from = dayStart(fromKey, tz);
  const to = new Date(dayStart(toKey, tz).getTime() + DAY_MS);
  const createdAt = { $gte: from, $lt: to };

  const wantsPool = !game || game === "swimming";
  const wantsTurf = !game || game !== "swimming";
  const turfFilter = { createdAt };
  if (game && game !== "swimming") turfFilter.sport = game;

  const [pool, turf] = await Promise.all([
    wantsPool ? PoolBooking.find({ createdAt }).sort({ createdAt: 1 }).lean() : [],
    wantsTurf ? TurfBooking.find(turfFilter).sort({ createdAt: 1 }).lean() : [],
  ]);

  const rows = [
    ...pool.map((b) => ({
      id: String(b._id),
      at: b.createdAt,
      game: "swimming",
      gameName: GAMES.swimming,
      detail:
        b.paymentMode === "membership"
          ? "Membership visit"
          : `${b.persons} person${b.persons === 1 ? "" : "s"}, ${b.hours} hr`,
      name: b.name,
      mobile: b.mobile,
      entrySource: b.entrySource,
      paymentMode: b.paymentMode,
      total: b.totalAmount,
      advance: b.advancePaid || 0,
      status: b.status,
    })),
    ...turf.map((b) => ({
      id: String(b._id),
      at: b.createdAt,
      game: b.sport,
      gameName: `${SPORT_NAMES[b.sport] || b.sport} - ${b.optionLabel}`,
      detail: `${formatMinutes(b.startMin)} - ${formatMinutes(b.endMin)}, ${b.hours} hr`,
      name: b.name,
      mobile: b.mobile,
      entrySource: b.entrySource,
      paymentMode: b.entrySource === "onspot" ? "onspot" : "app",
      total: b.totalAmount,
      advance: b.advancePaid || 0,
      status: b.status,
    })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  const active = rows.filter((r) => r.status !== "cancelled");
  const cancelled = rows.length - active.length;

  const bySource = { onspot: 0, district: 0, turftown: 0 };
  const advanceBySource = { district: 0, turftown: 0 };
  const byPaymentMode = { cash: 0, online: 0, free: 0, membership: 0 };

  active.forEach((r) => {
    bySource[r.entrySource] = (bySource[r.entrySource] || 0) + r.total;
    if (r.entrySource === "district" || r.entrySource === "turftown")
      advanceBySource[r.entrySource] += r.advance;
    if (r.game === "swimming") byPaymentMode[r.paymentMode] += r.total;
  });

  const totalRevenue = active.reduce((s, r) => s + r.total, 0);
  const totalAdvance = advanceBySource.district + advanceBySource.turftown;

  return {
    fromKey,
    toKey,
    label,
    game: game || null,
    gameName: game ? GAMES[game] : "All Games (Overall)",
    rows: active,
    cancelledCount: cancelled,
    totals: {
      bookings: active.length,
      revenue: totalRevenue,
      advance: totalAdvance,
      balance: totalRevenue - totalAdvance,
      onspot: bySource.onspot,
      district: bySource.district,
      turftown: bySource.turftown,
      districtAdvance: advanceBySource.district,
      turftownAdvance: advanceBySource.turftown,
      cash: byPaymentMode.cash,
      online: byPaymentMode.online,
      free: byPaymentMode.free,
      membershipVisits: byPaymentMode.membership,
    },
  };
};

module.exports = { GAMES, loadReportData, resolveRange };
