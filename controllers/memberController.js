const Member = require("../models/Member");
const Subscription = require("../models/Subscription");
const Attendance = require("../models/Attendance");
const MembershipPlan = require("../models/MembershipPlan");
const PoolBooking = require("../models/PoolBooking");
const { DATE_RE, membershipEnd, diffDays } = require("../utils/dateKeys");
const { getSettings } = require("../utils/settings");
const { notify } = require("../utils/notify");

const MOBILE_RE = /^[0-9+\-\s]{10,15}$/;
// Default until Settings loads once; kept in sync by syncExpiringDays().
let EXPIRING_DAYS = 7;
const syncExpiringDays = async () => {
  EXPIRING_DAYS = (await getSettings()).membershipExpiringDays;
};
const POOL_CATEGORIES = ["swimming", "swimming-coaching"];

// Attendance used to be one-per-day (unique index). Visits are now separate
// sessions, so drop the old unique index if it still exists.
Attendance.syncIndexes().catch((e) =>
  console.error("Attendance.syncIndexes:", e.message)
);

// ---- helpers ---------------------------------------------------------------

// State of one subscription on the admin's local date `today`.
// `dates` = Set of the member's attendance dates. A plan with sessionLimit
// (swimming coaching: 15 days) also expires once that many DIFFERENT days
// were attended inside its window - even if the month is not over yet.
const describeSub = (sub, today, dates = new Set()) => {
  let status = "active";
  if (sub.startDate > today) status = "upcoming";
  else if (sub.endDate < today) status = "expired";

  let daysUsed = 0;
  let exhausted = false;
  if (sub.sessionLimit > 0) {
    daysUsed = [...dates].filter((d) => d >= sub.startDate && d <= sub.endDate).length;
    // the 15th day itself stays valid until midnight (repeat visits that day)
    if (status === "active" && daysUsed >= sub.sessionLimit && !dates.has(today)) {
      status = "expired";
      exhausted = true;
    }
  }
  return {
    ...sub,
    status,
    daysUsed,
    exhausted,
    visitsLeft: sub.sessionLimit > 0 ? Math.max(0, sub.sessionLimit - daysUsed) : null,
    daysLeft: status === "expired" ? 0 : diffDays(sub.endDate, today) + 1,
    totalDays: diffDays(sub.endDate, sub.startDate) + 1,
    balance: Math.max(0, sub.price - sub.amountPaid),
  };
};

// Overall picture of one member from all their subscriptions.
const summarize = (member, subs, today, dates = new Set()) => {
  const list = subs
    .map((s) => describeSub(s, today, dates))
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  const active = list.filter((s) => s.status === "active");
  let status = "none";
  if (active.length) {
    const soon =
      Math.min(...active.map((s) => s.daysLeft)) <= EXPIRING_DAYS ||
      active.some((s) => s.visitsLeft !== null && s.visitsLeft <= 2);
    status = soon ? "expiring" : "active";
  } else if (list.some((s) => s.status === "upcoming")) status = "upcoming";
  else if (list.length) status = "expired";

  return {
    ...member,
    status,
    subscriptions: list,
    activePlans: active.map((s) => s.planName),
    endDate: list.length ? list.map((s) => s.endDate).sort().pop() : null,
    daysLeft: active.length ? Math.max(...active.map((s) => s.daysLeft)) : 0,
    balance: list.reduce((sum, s) => sum + s.balance, 0),
  };
};

const validateToday = (value) => (DATE_RE.test(value || "") ? value : null);

// "482913" -> as is, "STK-0001" -> as is, short digits "1" -> "STK-0001"
const normalizeCode = (raw) => {
  const code = String(raw || "").trim().toUpperCase();
  if (/^\d{6}$/.test(code)) return code;
  if (/^\d+$/.test(code)) return `STK-${code.padStart(4, "0")}`;
  return code;
};

const findByCode = (raw) => {
  const code = normalizeCode(raw);
  return code ? Member.findOne({ memberId: code }).lean() : null;
};

// Attendance dates per member - only needed for plans with a day limit.
const loadAttendanceDates = async (memberIds, subs) => {
  const limited = subs.filter((s) => s.sessionLimit > 0);
  if (!limited.length) return {};
  const minStart = limited.map((s) => s.startDate).sort()[0];
  const rows = await Attendance.find({
    member: { $in: memberIds },
    date: { $gte: minStart },
  })
    .select("member date")
    .lean();
  const map = {};
  rows.forEach((r) => {
    (map[r.member] = map[r.member] || new Set()).add(r.date);
  });
  return map;
};

const loadSummary = async (member, date) => {
  await syncExpiringDays();
  const subs = await Subscription.find({ member: member._id }).lean();
  const dates = await loadAttendanceDates([member._id], subs);
  return summarize(member, subs, date, dates[member._id]);
};

const isImage = (value, max) =>
  typeof value === "string" &&
  /^data:image\/(jpeg|png|webp);base64,/.test(value) &&
  value.length <= max;

// photo + thumb from a request body -> { photo, thumb } | { error }
const readPhoto = (body) => {
  if (!body.photo && !body.thumb) return { photo: "", thumb: "" };
  if (!isImage(body.photo, 400000) || !isImage(body.thumb, 40000))
    return { error: "Photo is invalid or too large. Capture it again." };
  return { photo: body.photo, thumb: body.thumb };
};

// payment from a request body -> { payment } | { error }
const readPayment = (body, price) => {
  const amount = Number(body?.amount || 0);
  if (!Number.isFinite(amount) || amount < 0)
    return { error: "Enter a valid paid amount" };
  if (amount > price) return { error: "Paid amount is more than the plan price" };
  if (amount === 0) return { payment: null };
  if (!["cash", "online"].includes(body.mode))
    return { error: "Select cash or online for the payment" };
  return { payment: { amount, mode: body.mode, note: String(body.note || "").trim() } };
};

// Copy plan details into a new subscription.
// Raises an in-app "payment not done" notification when a subscription is
// created/renewed and the member still owes money on it. No email - the
// cancellation email is the only email requirement.
const notifyIfBalanceDue = (member, subscription) => {
  const balance = subscription.price - subscription.amountPaid;
  if (balance <= 0) return;
  notify({
    type: "payment_due",
    title: "Payment pending",
    message: `${member.name} (${member.memberId}) - ₹${balance} pending on ${subscription.planName}.`,
    link: `/dashboard/members/${member._id}`,
  });
};

const buildSubscription = async (memberId, body) => {
  const plan = await MembershipPlan.findById(body.planId).catch(() => null);
  if (!plan || !plan.active) return { error: "Select a plan" };
  if (!DATE_RE.test(body.startDate || "")) return { error: "Select the start date" };
  const { payment, error } = readPayment(body.payment, plan.offerPrice);
  if (error) return { error };
  // limited (coaching) plans need a fixed time slot
  const batchTime = String(body.batchTime || "").trim().slice(0, 40);
  if (plan.sessionLimit > 0 && !batchTime)
    return { error: "Select the coaching time slot" };
  return {
    data: {
      member: memberId,
      plan: plan._id,
      category: plan.category,
      planName: plan.name,
      months: plan.months,
      originalPrice: plan.originalPrice,
      price: plan.offerPrice,
      sessionLimit: plan.sessionLimit || 0,
      batchTime: plan.sessionLimit > 0 ? batchTime : "",
      startDate: body.startDate,
      endDate: membershipEnd(body.startDate, plan.months),
      payments: payment ? [payment] : [],
      amountPaid: payment ? payment.amount : 0,
    },
  };
};

// Starts a visit unless the member is already inside today.
// Returns { attendance, already }.
const startSession = async (member, plansText, date, source) => {
  const open = await Attendance.findOne({ member: member._id, date, checkOutAt: null });
  if (open) return { attendance: open, already: true };
  const attendance = await Attendance.create({
    member: member._id,
    date,
    plans: plansText,
    source,
  });
  return { attendance, already: false };
};

// Ends a visit and keeps the linked swimming pool card in step.
const endSession = async (attendance) => {
  if (attendance.checkOutAt) return attendance;
  const now = new Date();
  attendance.checkOutAt = now;
  await attendance.save();
  await PoolBooking.updateOne(
    { attendance: attendance._id },
    { $set: { checkOutAt: now, endsAt: now } }
  );
  return attendance;
};

// ---- handlers --------------------------------------------------------------

// GET /api/members?today=YYYY-MM-DD&category=skating
// `category` is optional - when given, only members with at least one
// subscription (any status) in that category are returned. Used by the
// Skating tab to show just its own members instead of everyone.
const listMembers = async (req, res) => {
  try {
    const today = validateToday(req.query.today);
    if (!today) return res.status(400).json({ message: "Valid date is required" });
    const category = String(req.query.category || "").trim();
    await syncExpiringDays();

    const [members, subs, todays] = await Promise.all([
      Member.find().select("-photo").sort({ createdAt: -1 }).lean(),
      Subscription.find().lean(),
      Attendance.find({ date: today }).sort({ checkInAt: -1 }).populate("member", "name memberId").lean(),
    ]);
    const byMember = {};
    subs.forEach((s) => (byMember[s.member] = [...(byMember[s.member] || []), s]));
    const dateMap = await loadAttendanceDates(members.map((m) => m._id), subs);
    let out = members.map((m) =>
      summarize(m, byMember[m._id] || [], today, dateMap[m._id])
    );
    if (category) {
      out = out.filter((m) => m.subscriptions.some((s) => s.category === category));
    }
    const memberIds = new Set(out.map((m) => String(m._id)));

    res.json({
      members: out.map(({ subscriptions, ...m }) => ({
        ...m,
        subscriptionCount: subscriptions.length,
      })),
      stats: {
        total: out.length,
        active: out.filter((m) => m.status === "active" || m.status === "expiring").length,
        expiring: out.filter((m) => m.status === "expiring").length,
        expired: out.filter((m) => m.status === "expired").length,
        balanceDue: out.reduce((s, m) => s + m.balance, 0),
      },
      todayCheckIns: todays
        .filter((a) => a.member && (!category || memberIds.has(String(a.member._id))))
        .map((a) => ({
          id: String(a._id),
          memberId: a.member.memberId,
          name: a.member.name,
          at: a.checkInAt,
          outAt: a.checkOutAt,
        })),
    });
  } catch (error) {
    console.error("listMembers:", error.message);
    res.status(500).json({ message: "Could not load members" });
  }
};

// POST /api/members  (admission: member + photo + first subscription)
const admitMember = async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const mobile = String(body.mobile || "").trim();
    const age = Number(body.age);
    if (!name) return res.status(400).json({ message: "Name is required" });
    if (!Number.isFinite(age) || age < 1 || age > 120)
      return res.status(400).json({ message: "Enter a valid age" });
    if (!MOBILE_RE.test(mobile))
      return res.status(400).json({ message: "Enter a valid mobile number" });
    const photo = readPhoto(body);
    if (photo.error) return res.status(400).json({ message: photo.error });

    const draftId = new Member()._id;
    const { data, error } = await buildSubscription(draftId, body);
    if (error) return res.status(400).json({ message: error });

    const member = await Member.create({
      _id: draftId,
      memberId: await Member.nextMemberId(),
      name,
      age,
      mobile,
      notes: String(body.notes || "").trim(),
      photo: photo.photo,
      thumb: photo.thumb,
      createdBy: req.admin?._id,
    });
    const subscription = await Subscription.create(data);
    notifyIfBalanceDue(member, subscription);
    res.status(201).json({ member });
  } catch (error) {
    console.error("admitMember:", error.message);
    res.status(500).json({ message: "Could not admit member" });
  }
};

// GET /api/members/:id?today=YYYY-MM-DD
const getMember = async (req, res) => {
  try {
    const today = validateToday(req.query.today);
    if (!today) return res.status(400).json({ message: "Valid date is required" });
    const member = await Member.findById(req.params.id).lean();
    if (!member) return res.status(404).json({ message: "Member not found" });

    const [summary, sessions] = await Promise.all([
      loadSummary(member, today),
      Attendance.find({ member: member._id }).sort({ date: -1, checkInAt: -1 }).limit(600).lean(),
    ]);
    res.json({
      member: summary,
      attendance: sessions.map((a) => ({
        id: String(a._id),
        date: a.date,
        at: a.checkInAt,
        outAt: a.checkOutAt,
        plans: a.plans,
        source: a.source,
      })),
    });
  } catch (error) {
    res.status(400).json({ message: "Could not load member" });
  }
};

// GET /api/members/lookup?code=482913&today=YYYY-MM-DD
// Read-only: used by the swimming pool "Membership" entry to show the
// member's photo and plan before confirming the check-in.
const lookupMember = async (req, res) => {
  try {
    const today = validateToday(req.query.today);
    if (!today) return res.status(400).json({ message: "Valid date is required" });
    const member = await findByCode(req.query.code);
    if (!member) return res.status(404).json({ message: "Member ID not found" });

    const summary = await loadSummary(member, today);
    const poolPlans = summary.subscriptions.filter(
      (s) => s.status === "active" && POOL_CATEGORIES.includes(s.category)
    );
    const open = await Attendance.findOne({ member: member._id, date: today, checkOutAt: null }).lean();
    res.json({
      member: summary,
      poolAllowed: poolPlans.length > 0,
      poolPlans: poolPlans.map((s) => ({ planName: s.planName, endDate: s.endDate, daysLeft: s.daysLeft })),
      insideSince: open ? open.checkInAt : null,
    });
  } catch (error) {
    res.status(500).json({ message: "Could not find member" });
  }
};

// PUT /api/members/:id  (profile, optional new photo)
const updateMember = async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const mobile = String(body.mobile || "").trim();
    const age = Number(body.age);
    if (!name) return res.status(400).json({ message: "Name is required" });
    if (!Number.isFinite(age) || age < 1 || age > 120)
      return res.status(400).json({ message: "Enter a valid age" });
    if (!MOBILE_RE.test(mobile))
      return res.status(400).json({ message: "Enter a valid mobile number" });

    const update = { name, age, mobile, notes: String(body.notes || "").trim() };
    if (body.photo) {
      const photo = readPhoto(body);
      if (photo.error) return res.status(400).json({ message: photo.error });
      update.photo = photo.photo;
      update.thumb = photo.thumb;
    }
    const member = await Member.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!member) return res.status(404).json({ message: "Member not found" });
    res.json({ member });
  } catch (error) {
    res.status(400).json({ message: "Could not update member" });
  }
};

// POST /api/members/:id/subscriptions  (renew / add another plan)
const addSubscription = async (req, res) => {
  try {
    const member = await Member.findById(req.params.id);
    if (!member) return res.status(404).json({ message: "Member not found" });
    const { data, error } = await buildSubscription(member._id, req.body || {});
    if (error) return res.status(400).json({ message: error });
    const subscription = await Subscription.create(data);
    notifyIfBalanceDue(member, subscription);
    res.status(201).json({ subscription });
  } catch (error) {
    res.status(500).json({ message: "Could not save subscription" });
  }
};

// POST /api/members/:id/subscriptions/:subId/payments  (collect balance)
const addPayment = async (req, res) => {
  try {
    const sub = await Subscription.findOne({
      _id: req.params.subId,
      member: req.params.id,
    });
    if (!sub) return res.status(404).json({ message: "Subscription not found" });
    const amount = Number(req.body?.amount);
    const balance = sub.price - sub.amountPaid;
    if (!Number.isFinite(amount) || amount <= 0)
      return res.status(400).json({ message: "Enter the amount received" });
    if (amount > balance)
      return res.status(400).json({ message: `Only ₹${balance} is pending` });
    if (!["cash", "online"].includes(req.body?.mode))
      return res.status(400).json({ message: "Select cash or online" });
    sub.payments.push({
      amount,
      mode: req.body.mode,
      note: String(req.body.note || "").trim(),
    });
    sub.amountPaid += amount;
    await sub.save();
    res.json({ subscription: sub });
  } catch (error) {
    res.status(400).json({ message: "Could not save payment" });
  }
};

// POST /api/members/check-in  { code, date }
// Desk check-in by member ID. A member can come any number of times a day:
// every visit is its own session (check-in time, later check-out time).
const checkIn = async (req, res) => {
  try {
    const date = validateToday(req.body?.date);
    if (!date) return res.status(400).json({ message: "Valid date is required" });
    if (!String(req.body?.code || "").trim())
      return res.status(400).json({ message: "Enter the member ID" });

    const member = await findByCode(req.body.code);
    if (!member) return res.status(404).json({ message: "Member ID not found" });

    const summary = await loadSummary(member, date);
    const active = summary.subscriptions.filter((s) => s.status === "active");
    if (!active.length) {
      return res.json({
        ok: false,
        reason: summary.status === "upcoming" ? "upcoming" : summary.status === "none" ? "none" : "expired",
        member: summary,
      });
    }

    const { attendance, already } = await startSession(
      member,
      active.map((s) => s.planName).join(", "),
      date,
      "desk"
    );
    res.json({
      ok: true,
      alreadyCheckedIn: already,
      sessionId: String(attendance._id),
      at: attendance.checkInAt,
      member: summary,
    });
  } catch (error) {
    console.error("checkIn:", error.message);
    res.status(500).json({ message: "Could not check in" });
  }
};

// POST /api/members/check-out  { sessionId }
const checkOut = async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.body?.sessionId);
    if (!attendance) return res.status(404).json({ message: "Visit not found" });
    await endSession(attendance);
    res.json({ ok: true, outAt: attendance.checkOutAt });
  } catch (error) {
    res.status(400).json({ message: "Could not check out" });
  }
};

module.exports = {
  listMembers,
  admitMember,
  getMember,
  lookupMember,
  updateMember,
  addSubscription,
  addPayment,
  checkIn,
  checkOut,
  // shared with the swimming pool controller
  findByCode,
  loadSummary,
  startSession,
  endSession,
  POOL_CATEGORIES,
};
