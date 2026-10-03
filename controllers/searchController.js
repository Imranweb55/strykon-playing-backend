const PoolBooking = require("../models/PoolBooking");
const TurfBooking = require("../models/TurfBooking");
const { SPORT_NAMES, formatMinutes } = require("../config/turfRules");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIMIT = 8; // per source (pool / turf)

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// tz = the admin browser's Date#getTimezoneOffset() (minutes, UTC - local)
const localKey = (date, tz) =>
  new Date(new Date(date).getTime() - tz * 60000).toISOString().slice(0, 10);
const localMinutes = (date, tz) => {
  const mins = Math.floor(new Date(date).getTime() / 60000) - tz;
  return ((mins % 1440) + 1440) % 1440;
};

// GET /api/search?q=<text>&date=YYYY-MM-DD&nowMin=<0-1439>&tz=<offset>
// Finds people with a LIVE or UPCOMING booking (swimming pool, pickleball,
// basketball, cricket) by name or mobile. Finished and cancelled bookings
// are never returned.
const searchBookings = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json({ results: [] });
    if (q.length > 60) return res.status(400).json({ message: "Search text is too long" });

    const { date } = req.query;
    if (!DATE_RE.test(date || ""))
      return res.status(400).json({ message: "Valid date is required" });
    const tz = Math.max(-840, Math.min(840, Number(req.query.tz) || 0));
    const nowMin = Math.min(1439, Math.max(0, Number.parseInt(req.query.nowMin, 10) || 0));

    const rx = new RegExp(escapeRegex(q), "i");
    const who = [{ name: rx }, { mobile: rx }];
    const nowDate = new Date();

    const [pool, turf] = await Promise.all([
      PoolBooking.find({ status: "active", endsAt: { $gt: nowDate }, $or: who })
        .sort({ startsAt: 1 })
        .limit(LIMIT)
        .lean(),
      TurfBooking.find({
        status: "active",
        $and: [
          { $or: who },
          { $or: [{ date: { $gt: date } }, { date, endMin: { $gt: nowMin } }] },
        ],
      })
        .sort({ date: 1, startMin: 1 })
        .limit(LIMIT)
        .lean(),
    ]);

    const results = [
      ...pool.map((b) => {
        const isMember = b.paymentMode === "membership";
        const started = new Date(b.startsAt) <= nowDate;
        return {
          id: String(b._id),
          game: "swimming",
          gameName: "Swimming Pool",
          detail: isMember ? "Membership visit" : `${b.persons} person${b.persons === 1 ? "" : "s"}`,
          name: b.name,
          mobile: b.mobile,
          // the pool page lists bookings by the day they were made
          date: localKey(b.createdAt, tz),
          time: isMember
            ? `In since ${formatMinutes(localMinutes(b.startsAt, tz))}`
            : `${formatMinutes(localMinutes(b.startsAt, tz))} - ${formatMinutes(localMinutes(b.endsAt, tz))}`,
          phase: started ? "live" : "upcoming",
        };
      }),
      ...turf.map((b) => ({
        id: String(b._id),
        game: b.sport,
        gameName: SPORT_NAMES[b.sport] || b.sport,
        detail: b.optionLabel,
        name: b.name,
        mobile: b.mobile,
        date: b.date,
        time: `${formatMinutes(b.startMin)} - ${formatMinutes(b.endMin)}`,
        phase: b.date === date && b.startMin <= nowMin ? "live" : "upcoming",
      })),
    ].sort((a, b) =>
      a.phase === b.phase ? (a.date + a.time < b.date + b.time ? -1 : 1) : a.phase === "live" ? -1 : 1
    );

    res.json({ results });
  } catch (error) {
    console.error("searchBookings:", error.message);
    res.status(500).json({ message: "Could not search" });
  }
};

module.exports = { searchBookings };
