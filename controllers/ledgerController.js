const PoolBooking = require("../models/PoolBooking");
const TurfBooking = require("../models/TurfBooking");
const { SPORT_NAMES } = require("../config/turfRules");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const SOURCES = ["district", "turftown"];

// tz = browser Date#getTimezoneOffset(); dates are the admin's local days
const dayStart = (key, tz) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + tz * 60000);
};

// GET /api/ledger?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=<offset>
// Advance amounts received through the District / Turf Town apps, counted on
// the day the booking was made. Cancelled bookings are listed but not totalled.
const getLedger = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!DATE_RE.test(from || "") || !DATE_RE.test(to || "") || from > to)
      return res.status(400).json({ message: "Select a valid date range" });
    const tz = Math.max(-840, Math.min(840, Number(req.query.tz) || 0));
    const range = {
      $gte: dayStart(from, tz),
      $lt: new Date(dayStart(to, tz).getTime() + DAY_MS),
    };
    const filter = {
      advancePaid: { $gt: 0 },
      entrySource: { $in: SOURCES },
      createdAt: range,
    };

    const [pool, turf] = await Promise.all([
      PoolBooking.find(filter).lean(),
      TurfBooking.find(filter).lean(),
    ]);

    const entries = [
      ...pool.map((b) => ({
        id: String(b._id),
        at: b.createdAt,
        source: b.entrySource,
        game: "swimming",
        gameName: "Swimming Pool",
        name: b.name,
        mobile: b.mobile,
        total: b.totalAmount,
        advance: b.advancePaid,
        status: b.status,
      })),
      ...turf.map((b) => ({
        id: String(b._id),
        at: b.createdAt,
        source: b.entrySource,
        game: b.sport,
        gameName: `${SPORT_NAMES[b.sport] || b.sport} - ${b.optionLabel}`,
        name: b.name,
        mobile: b.mobile,
        total: b.totalAmount,
        advance: b.advancePaid,
        status: b.status,
      })),
    ]
      .map((e) => ({ ...e, balance: Math.max(0, e.total - e.advance) }))
      .sort((a, b) => new Date(b.at) - new Date(a.at));

    const totals = {
      district: { count: 0, advance: 0 },
      turftown: { count: 0, advance: 0 },
      cancelledAdvance: 0,
    };
    const byGame = {};
    entries.forEach((e) => {
      if (e.status === "cancelled") {
        totals.cancelledAdvance += e.advance;
        return;
      }
      totals[e.source].count += 1;
      totals[e.source].advance += e.advance;
      byGame[e.game] = (byGame[e.game] || 0) + e.advance;
    });

    res.json({
      entries,
      totals: {
        ...totals,
        advance: totals.district.advance + totals.turftown.advance,
        count: totals.district.count + totals.turftown.count,
      },
      byGame,
    });
  } catch (error) {
    console.error("getLedger:", error.message);
    res.status(500).json({ message: "Could not load the ledger" });
  }
};

module.exports = { getLedger };
