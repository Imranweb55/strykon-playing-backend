const PoolBooking = require("../models/PoolBooking");
const TurfBooking = require("../models/TurfBooking");
const { formatMinutes, SPORT_NAMES } = require("../config/turfRules");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const SPORT_IDS = ["swimming", "basketball", "pickleball", "cricket"];

// tz = the admin browser's Date#getTimezoneOffset() (minutes, UTC - local),
// so "today" always means the admin's own calendar day.
const dayStart = (dateKey, tz) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + tz * 60000);
};
const shiftKey = (dateKey, delta) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
};
const localKey = (date, tz) =>
  new Date(new Date(date).getTime() - tz * 60000).toISOString().slice(0, 10);
const localMinutes = (date, tz) => {
  const mins = Math.floor(new Date(date).getTime() / 60000) - tz;
  return ((mins % 1440) + 1440) % 1440;
};

// GET /api/dashboard?date=YYYY-MM-DD&tz=<offset minutes>
const getDashboard = async (req, res) => {
  try {
    const { date } = req.query;
    if (!DATE_RE.test(date || ""))
      return res.status(400).json({ message: "Valid date is required" });
    const tz = Math.max(-840, Math.min(840, Number(req.query.tz) || 0));
    const nowMs = Date.now();
    const nowMin = localMinutes(nowMs, tz);

    const dates = [];
    for (let i = 6; i >= 0; i--) dates.push(shiftKey(date, -i));
    const todayStart = dayStart(date, tz);
    const todayEnd = new Date(todayStart.getTime() + DAY_MS);
    const rangeStart = dayStart(dates[0], tz);

    const [pool7, turf7, poolEvents, turfEvents] = await Promise.all([
      PoolBooking.find({
        status: "active",
        createdAt: { $gte: rangeStart, $lt: todayEnd },
      }).lean(),
      TurfBooking.find({ status: "active", date: { $in: dates } }).lean(),
      PoolBooking.find({
        $or: [
          { createdAt: { $gte: todayStart, $lt: todayEnd } },
          { status: "cancelled", updatedAt: { $gte: todayStart, $lt: todayEnd } },
        ],
      }).lean(),
      TurfBooking.find({
        $or: [
          { createdAt: { $gte: todayStart, $lt: todayEnd } },
          { cancelledAt: { $gte: todayStart, $lt: todayEnd } },
        ],
      }).lean(),
    ]);

    // ---- last 7 days: bookings per game
    const trend = { days: dates, series: {} };
    SPORT_IDS.forEach((id) => (trend.series[id] = dates.map(() => 0)));
    pool7.forEach((b) => {
      const i = dates.indexOf(localKey(b.createdAt, tz));
      if (i >= 0) trend.series.swimming[i] += 1;
    });
    turf7.forEach((b) => {
      const i = dates.indexOf(b.date);
      if (i >= 0) trend.series[b.sport][i] += 1;
    });

    // ---- today
    const poolToday = pool7.filter((b) => localKey(b.createdAt, tz) === date);
    const turfToday = turf7.filter((b) => b.date === date);

    const stats = {};
    SPORT_IDS.forEach((id) => {
      stats[id] = {
        id,
        bookings: 0,
        completed: 0,
        live: 0,
        hours: 0,
        revenue: id === "swimming" ? 0 : null, // turf games have no amount field
      };
    });
    poolToday.forEach((b) => {
      const s = stats.swimming;
      s.bookings += 1;
      s.hours += b.hours;
      s.revenue += b.totalAmount;
      if (new Date(b.endsAt).getTime() <= nowMs) s.completed += 1;
      else if (new Date(b.startsAt).getTime() <= nowMs) s.live += 1;
    });
    turfToday.forEach((b) => {
      const s = stats[b.sport];
      s.bookings += 1;
      s.hours += b.hours;
      if (b.endMin <= nowMin) s.completed += 1;
      else if (b.startMin <= nowMin) s.live += 1;
    });
    const sports = SPORT_IDS.map((id) => {
      const s = stats[id];
      return {
        ...s,
        completionRate: s.bookings
          ? Math.round((s.completed / s.bookings) * 100)
          : 0,
      };
    });

    // ---- today's bookings list (all games, in time order)
    const items = [];
    poolToday.forEach((b) => {
      const start = localMinutes(b.startsAt, tz);
      const end = localMinutes(b.endsAt, tz);
      const startMs = new Date(b.startsAt).getTime();
      const endMs = new Date(b.endsAt).getTime();
      items.push({
        id: String(b._id),
        sport: "swimming",
        name: b.name,
        time: `${formatMinutes(start)} - ${formatMinutes(end)}`,
        hours: b.hours,
        amount: b.totalAmount,
        status:
          endMs <= nowMs ? "completed" : startMs <= nowMs ? "live" : "upcoming",
        sortKey: start,
      });
    });
    turfToday.forEach((b) => {
      items.push({
        id: String(b._id),
        sport: b.sport,
        name: b.name,
        time: `${formatMinutes(b.startMin)} - ${formatMinutes(b.endMin)}`,
        hours: b.hours,
        amount: null,
        status:
          b.endMin <= nowMin
            ? "completed"
            : b.startMin <= nowMin
              ? "live"
              : "upcoming",
        sortKey: b.startMin,
      });
    });
    items.sort((a, b) => a.sortKey - b.sortKey);

    // ---- recent activity (bookings made / cancelled today)
    const events = [];
    const inToday = (d) => d && d >= todayStart && d < todayEnd;
    poolEvents.forEach((b) => {
      if (inToday(b.createdAt))
        events.push({
          id: `${b._id}-c`,
          kind: "created",
          title: "New booking registered",
          subtitle: `${b.name} - Swimming Pool`,
          at: b.createdAt,
        });
      if (b.status === "cancelled" && inToday(b.updatedAt))
        events.push({
          id: `${b._id}-x`,
          kind: "cancelled",
          title: "Booking cancelled",
          subtitle: `${b.name} - Swimming Pool`,
          at: b.updatedAt,
        });
    });
    turfEvents.forEach((b) => {
      const game = SPORT_NAMES[b.sport] || b.sport;
      if (inToday(b.createdAt))
        events.push({
          id: `${b._id}-c`,
          kind: "created",
          title: "New booking registered",
          subtitle: `${b.name} - ${game} ${b.optionLabel}`,
          at: b.createdAt,
        });
      if (b.status === "cancelled" && inToday(b.cancelledAt))
        events.push({
          id: `${b._id}-x`,
          kind: "cancelled",
          title: "Booking cancelled",
          subtitle: `${b.name} - ${game}`,
          at: b.cancelledAt,
        });
    });
    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    const totalBookings = sports.reduce((s, x) => s + x.bookings, 0);
    res.json({
      date,
      sports,
      trend,
      share: {
        total: totalBookings,
        segments: sports.map((s) => ({ id: s.id, value: s.bookings })),
      },
      todaysBookings: items,
      summary: {
        totalBookings,
        completed: sports.reduce((s, x) => s + x.completed, 0),
        poolRevenue: stats.swimming.revenue,
      },
      activity: events.slice(0, 6),
    });
  } catch (error) {
    console.error("getDashboard:", error.message);
    res.status(500).json({ message: "Could not load dashboard" });
  }
};

module.exports = { getDashboard };
