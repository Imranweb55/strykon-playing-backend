const TurfBooking = require("../models/TurfBooking");
const TurfClosure = require("../models/TurfClosure");
const { getPricing, calcDiscount } = require("../utils/pricing");
const { notify } = require("../utils/notify");
const { effectiveOn } = require("./turfClosureController");
const {
  SLOT_MINUTES,
  OPEN_MIN,
  CLOSE_MIN,
  OPTIONS,
  SPORT_NAMES,
  getOption,
  findConflict,
  formatMinutes,
} = require("../config/turfRules");

const ENTRY_SOURCES = ["district", "turftown", "onspot"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Bookings are checked-then-saved; run creates one at a time so two admins
// can never take the same slot at the same moment.
let queue = Promise.resolve();
const runExclusive = (task) => {
  const next = queue.then(task, task);
  queue = next.catch(() => {});
  return next;
};

// GET /api/turf-bookings?date=YYYY-MM-DD  (all three games for that date)
const listBookings = async (req, res) => {
  try {
    const { date } = req.query;
    if (!DATE_RE.test(date || ""))
      return res.status(400).json({ message: "Valid date is required" });

    const bookings = await TurfBooking.find({ date }).sort({ startMin: 1 });
    res.json({ bookings, serverTime: new Date().toISOString() });
  } catch (error) {
    console.error("listTurfBookings:", error.message);
    res.status(500).json({ message: "Could not load bookings" });
  }
};

// GET /api/turf-bookings/month?month=YYYY-MM -> { counts: { "YYYY-MM-DD": n } }
const monthSummary = async (req, res) => {
  try {
    const { month } = req.query;
    if (!/^\d{4}-\d{2}$/.test(month || ""))
      return res.status(400).json({ message: "Valid month is required" });
    const rows = await TurfBooking.aggregate([
      { $match: { status: "active", date: { $regex: `^${month}-` } } },
      { $group: { _id: "$date", count: { $sum: 1 } } },
    ]);
    const counts = {};
    rows.forEach((r) => (counts[r._id] = r.count));
    res.json({ counts });
  } catch (error) {
    res.status(500).json({ message: "Could not load calendar" });
  }
};

// POST /api/turf-bookings
const createBooking = (req, res) =>
  runExclusive(async () => {
    try {
      const body = req.body || {};
      const { sport, optionId, entrySource, date } = body;
      const name = String(body.name || "").trim();
      const mobile = String(body.mobile || "").trim();
      const startMin = Number(body.startMin);
      const hours = Number(body.hours);

      if (!OPTIONS[sport])
        return res.status(400).json({ message: "Select a valid game" });
      const option = getOption(sport, optionId);
      if (!option)
        return res.status(400).json({ message: "Select a court option" });
      if (!name) return res.status(400).json({ message: "Name is required" });
      if (!ENTRY_SOURCES.includes(entrySource))
        return res.status(400).json({ message: "Select an entry source" });
      if (!/^[0-9+\-\s]{10,15}$/.test(mobile))
        return res.status(400).json({ message: "Enter a valid mobile number" });
      if (!DATE_RE.test(date || ""))
        return res.status(400).json({ message: "Select a valid date" });
      if (
        !Number.isFinite(hours) ||
        hours < 0.5 ||
        hours > 12 ||
        (hours * 60) % SLOT_MINUTES !== 0
      )
        return res
          .status(400)
          .json({ message: "Hours must be in steps of 30 minutes" });
      if (
        !Number.isInteger(startMin) ||
        (startMin - OPEN_MIN) % SLOT_MINUTES !== 0
      )
        return res.status(400).json({ message: "Select a valid start time" });

      const endMin = startMin + hours * 60;
      if (startMin < OPEN_MIN || endMin > CLOSE_MIN)
        return res
          .status(400)
          .json({ message: "Selected time is outside opening hours" });

      const existing = await TurfBooking.find({ date, status: "active" });
      const conflict = findConflict(existing, option.weight, startMin, endMin);
      if (conflict) return res.status(409).json({ message: conflict });

      // Admin-closed time ranges (e.g. daily skating coaching) block every
      // game, regardless of turf capacity.
      const closures = await TurfClosure.find(effectiveOn(date)).lean();
      const blocked = closures.find((c) => c.startMin < endMin && startMin < c.endMin);
      if (blocked)
        return res.status(409).json({
          message: `${formatMinutes(blocked.startMin)} - ${formatMinutes(blocked.endMin)} is closed: ${blocked.reason}. Please choose another time.`,
        });

      // one price per hour for the game, whatever the number of players
      const pricing = await getPricing();
      let ratePerHour = pricing[`${sport}PerHour`] || 0;
      // basketball half courts have their own price (2 half courts = 2 x half)
      if (sport === "basketball" && optionId !== "full")
        ratePerHour =
          (pricing.basketballHalfPerHour || 0) * (optionId === "half-2" ? 2 : 1);
      const amount = Math.round(ratePerHour * hours);
      const discount = calcDiscount(amount, body.discountType, body.discountValue);

      // advance already paid in the District / Turf Town app (deducted at the desk)
      const netTotal = amount - discount.discountAmount;
      const advancePaid = ["district", "turftown"].includes(entrySource)
        ? Math.min(Math.max(0, Number(body.advancePaid) || 0), netTotal)
        : 0;

      const booking = await TurfBooking.create({
        sport,
        optionId,
        optionLabel: option.label,
        weight: option.weight,
        name,
        entrySource,
        mobile,
        date,
        startMin,
        endMin,
        hours,
        ratePerHour,
        amount,
        ...discount,
        totalAmount: amount - discount.discountAmount,
        advancePaid,
        createdBy: req.admin?._id,
      });

      res.status(201).json({ booking, serverTime: new Date().toISOString() });
    } catch (error) {
      console.error("createTurfBooking:", error.message);
      res.status(500).json({ message: "Could not create booking" });
    }
  });

// PATCH /api/turf-bookings/:id/cancel  (frees the slots for every game)
const cancelBooking = async (req, res) => {
  try {
    const booking = await TurfBooking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    if (booking.status !== "cancelled") {
      booking.status = "cancelled";
      booking.cancelledAt = new Date();
      await booking.save();

      const title = `${SPORT_NAMES[booking.sport] || booking.sport} booking cancelled`;
      const message = `${booking.name} (${booking.mobile}) - ${booking.optionLabel}, ₹${booking.totalAmount} booking was cancelled by admin.`;
      notify({
        type: "cancellation",
        title,
        message,
        link: `/dashboard/${booking.sport}`,
        email: {
          subject: `[STRYKON] ${title}`,
          text: `${message}\n\nBooked on: ${booking.createdAt.toLocaleString("en-IN")}\nCancelled on: ${booking.cancelledAt.toLocaleString("en-IN")}`,
        },
      });
    }
    res.json({ booking });
  } catch (error) {
    res.status(400).json({ message: "Could not cancel booking" });
  }
};

module.exports = { monthSummary, listBookings, createBooking, cancelBooking };
