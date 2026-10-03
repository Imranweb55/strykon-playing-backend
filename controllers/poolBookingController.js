const PoolBooking = require("../models/PoolBooking");
const PoolProduct = require("../models/PoolProduct");
const { getPricing, calcDiscount } = require("../utils/pricing");
const { getSettings } = require("../utils/settings");
const { notify } = require("../utils/notify");
const Attendance = require("../models/Attendance");
const {
  findByCode,
  loadSummary,
  startSession,
  endSession,
  POOL_CATEGORIES,
} = require("./memberController");

const ENTRY_SOURCES = ["district", "turftown", "onspot"];
const PRODUCT_TYPES = ["none", "rent", "buy", "own"];
const PAYMENT_MODES = ["cash", "online", "free"];

const toNumber = (value) =>
  value === "" || value === null || value === undefined ? NaN : Number(value);

// POST /api/pool-bookings
const createBooking = async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const mobile = String(body.mobile || "").trim();
    const age = toNumber(body.age);
    const persons = toNumber(body.persons);
    const hours = toNumber(body.hours);
    const productType = body.productType || "none";
    const paymentMode = body.paymentMode;
    const entrySource = body.entrySource;

    if (!name) return res.status(400).json({ message: "Name is required" });
    if (!Number.isFinite(age) || age < 1 || age > 120)
      return res.status(400).json({ message: "Enter a valid age" });
    if (!ENTRY_SOURCES.includes(entrySource))
      return res.status(400).json({ message: "Select an entry source" });
    if (!Number.isInteger(persons) || persons < 1)
      return res.status(400).json({ message: "Enter number of persons" });
    if (!/^[0-9+\-\s]{10,15}$/.test(mobile))
      return res.status(400).json({ message: "Enter a valid mobile number" });
    if (!Number.isFinite(hours) || hours < 0.5 || hours > 12)
      return res
        .status(400)
        .json({ message: "Hours must be between 0.5 and 12" });
    if (!PRODUCT_TYPES.includes(productType))
      return res.status(400).json({ message: "Invalid product option" });
    if (!PAYMENT_MODES.includes(paymentMode))
      return res.status(400).json({ message: "Select a payment option" });

    const isFree = paymentMode === "free";

    // Fee is calculated on the server from the saved price list:
    // swimming = price per person (flat, not per hour).
    const pricing = await getPricing();
    const amount = isFree ? 0 : persons * pricing.swimmingPerPerson;

    let productAmount = 0;
    let productName = "";
    let productQty = 1;
    if (productType === "rent" || productType === "buy") {
      const product = await PoolProduct.findById(body.productId).catch(
        () => null
      );
      if (!product || product.type !== productType)
        return res.status(400).json({ message: "Select a product" });
      productQty = Math.max(1, Math.min(100, Math.floor(toNumber(body.productQty)) || 1));
      productName = product.name;
      productAmount = isFree ? 0 : product.price * productQty;
    } else if (productType === "own") {
      productName = String(body.productName || "").trim();
    }

    // Manual offer, subtracted from fee + product
    const subtotal = amount + productAmount;
    const discount = isFree
      ? calcDiscount(0, "none", 0)
      : calcDiscount(subtotal, body.discountType, body.discountValue);

    // Customers from the District / Turf Town app may already have paid an
    // advance there - it is deducted from what the desk collects.
    const grandTotal = subtotal - discount.discountAmount;
    const advance =
      !isFree && ["district", "turftown"].includes(entrySource)
        ? Math.min(Math.max(0, toNumber(body.advancePaid) || 0), grandTotal)
        : 0;

    const settings = await getSettings();
    const now = Date.now();
    const startsAt = new Date(now + settings.poolFreshUpMinutes * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + hours * 60 * 60 * 1000);

    const booking = await PoolBooking.create({
      name,
      age,
      entrySource,
      persons,
      mobile,
      hours,
      productType,
      productName,
      productAmount,
      productQty,
      paymentMode,
      amount,
      ...discount,
      totalAmount: subtotal - discount.discountAmount,
      advancePaid: advance,
      startsAt,
      endsAt,
      createdBy: req.admin?._id,
    });

    res.status(201).json({ booking, serverTime: new Date().toISOString() });
  } catch (error) {
    console.error("createBooking:", error.message);
    res.status(500).json({ message: "Could not create booking" });
  }
};

// GET /api/pool-bookings?from=<ISO>&to=<ISO>
// The dashboard sends its own local-day range so "today" is correct
// regardless of the server's timezone.
const listBookings = async (req, res) => {
  try {
    const from = new Date(req.query.from);
    const to = new Date(req.query.to);
    const filter = {};
    if (!isNaN(from) && !isNaN(to)) {
      filter.createdAt = { $gte: from, $lt: to };
    }

    const bookings = await PoolBooking.find(filter).sort({ createdAt: -1 });
    res.json({ bookings, serverTime: new Date().toISOString() });
  } catch (error) {
    console.error("listBookings:", error.message);
    res.status(500).json({ message: "Could not load bookings" });
  }
};

// PATCH /api/pool-bookings/:id/cancel
const cancelBooking = async (req, res) => {
  try {
    const booking = await PoolBooking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    if (booking.status !== "cancelled") {
      booking.status = "cancelled";
      booking.cancelledAt = new Date();
      await booking.save();
      // a cancelled membership entry was a wrong check-in: remove that visit too
      if (booking.attendance) await Attendance.findByIdAndDelete(booking.attendance);

      const title = "Swimming pool booking cancelled";
      const message = `${booking.name} (${booking.mobile}) - ₹${booking.totalAmount} booking was cancelled by admin.`;
      notify({
        type: "cancellation",
        title,
        message,
        link: "/dashboard/swimming-pool",
        email: {
          subject: `[STRYKON] ${title}`,
          text: `${message}\n\nBooked on: ${booking.createdAt.toLocaleString("en-IN")}\nCancelled on: ${booking.cancelledAt.toLocaleString("en-IN")}`,
        },
      });
    }
    res.json({ booking });
  } catch (error) {
    // Invalid ObjectId etc.
    res.status(400).json({ message: "Could not cancel booking" });
  }
};

// POST /api/pool-bookings/membership-checkin  { code, date }
// Member enters the pool with a 6-digit ID: adds a card to the swimming list
// (no fixed hours - check-in now, check-out when the admin finishes it).
const membershipCheckIn = async (req, res) => {
  try {
    const date = String(req.body?.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return res.status(400).json({ message: "Valid date is required" });
    const member = await findByCode(req.body?.code);
    if (!member) return res.status(404).json({ message: "Member ID not found" });

    const summary = await loadSummary(member, date);
    const poolPlans = summary.subscriptions.filter(
      (s) => s.status === "active" && POOL_CATEGORIES.includes(s.category)
    );
    if (!poolPlans.length)
      return res.status(403).json({
        message:
          "No active swimming plan for this member. Renew the membership first.",
      });

    const planText = poolPlans.map((s) => s.planName).join(", ");
    const { attendance, already } = await startSession(member, planText, date, "pool");
    if (already)
      return res.status(409).json({
        message: "This member is already inside. Finish the existing card first.",
      });

    const now = new Date();
    const booking = await PoolBooking.create({
      name: member.name,
      age: member.age,
      entrySource: "onspot",
      persons: 1,
      mobile: member.mobile,
      hours: 0,
      paymentMode: "membership",
      amount: 0,
      totalAmount: 0,
      startsAt: now,
      // open-ended until the admin finishes the visit (then set to check-out time)
      endsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      member: member._id,
      memberCode: member.memberId,
      memberPlan: planText,
      memberThumb: member.thumb || "",
      attendance: attendance._id,
      createdBy: req.admin?._id,
    });
    res.status(201).json({ booking, serverTime: now.toISOString() });
  } catch (error) {
    console.error("membershipCheckIn:", error.message);
    res.status(500).json({ message: "Could not check in" });
  }
};

// PATCH /api/pool-bookings/:id/finish  (membership visit: note the check-out time)
const finishBooking = async (req, res) => {
  try {
    const booking = await PoolBooking.findById(req.params.id);
    if (!booking || booking.paymentMode !== "membership")
      return res.status(404).json({ message: "Membership visit not found" });
    if (!booking.checkOutAt) {
      const attendance = await Attendance.findById(booking.attendance);
      if (attendance) await endSession(attendance);
      const fresh = await PoolBooking.findById(booking._id);
      return res.json({ booking: fresh });
    }
    res.json({ booking });
  } catch (error) {
    res.status(400).json({ message: "Could not finish" });
  }
};

module.exports = {
  createBooking,
  listBookings,
  cancelBooking,
  membershipCheckIn,
  finishBooking,
};
