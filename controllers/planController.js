const MembershipPlan = require("../models/MembershipPlan");

const CATEGORIES = ["swimming", "basketball", "skating", "swimming-coaching"];

// Plans from the academy's price poster. Created once, editable afterwards.
const DEFAULT_PLANS = [
  { category: "swimming", name: "1 Month", months: 1, originalPrice: 3500, offerPrice: 3000 },
  { category: "swimming", name: "3 Months", months: 3, originalPrice: 10500, offerPrice: 7000 },
  { category: "swimming", name: "6 Months", months: 6, originalPrice: 21000, offerPrice: 11000 },
  { category: "swimming", name: "12 Months", months: 12, originalPrice: 42000, offerPrice: 20000 },
  {
    category: "basketball",
    name: "Basketball Coaching - Monthly",
    months: 1,
    originalPrice: 2500,
    offerPrice: 2500,
    note: "Fundamentals, ball handling & shooting, game awareness, fitness, match practice",
  },
  {
    category: "skating",
    name: "Skating Coaching - Monthly",
    months: 1,
    originalPrice: 1500,
    offerPrice: 1500,
    note: "Basic to advanced skills, balance, speed & agility, skating techniques",
  },
  {
    category: "swimming-coaching",
    name: "Swimming Coaching - Below 6 Years",
    months: 1,
    originalPrice: 3500,
    offerPrice: 3000,
    note: "Beginner class, 15 days training",
    sessionLimit: 15,
  },
  {
    category: "swimming-coaching",
    name: "Swimming Coaching - Above 6 Years",
    months: 1,
    originalPrice: 4000,
    offerPrice: 3500,
    note: "Beginner class, 15 days training",
    sessionLimit: 15,
  },
].map((p, i) => ({ ...p, order: i }));

const readPlan = (body) => {
  const name = String(body.name || "").trim();
  const months = Number(body.months);
  const originalPrice = Number(body.originalPrice);
  const offerPrice = Number(body.offerPrice);
  if (!CATEGORIES.includes(body.category)) return { error: "Select a category" };
  if (!name) return { error: "Enter the plan name" };
  if (!Number.isInteger(months) || months < 1 || months > 60)
    return { error: "Duration must be 1 to 60 months" };
  if (![originalPrice, offerPrice].every((n) => Number.isFinite(n) && n >= 0))
    return { error: "Enter valid prices" };

  // swimming-coaching keeps its fixed 15-day rule; skating lets the admin
  // set how many of the month's days the plan actually allows (0 = every day)
  let sessionLimit = 0;
  if (body.category === "swimming-coaching") sessionLimit = 15;
  else if (body.category === "skating") {
    const n = Number(body.sessionLimit);
    if (body.sessionLimit !== undefined && body.sessionLimit !== "" && !Number.isFinite(n))
      return { error: "Days per month must be a number" };
    if (Number.isFinite(n) && (n < 0 || n > 31))
      return { error: "Days per month must be 0-31 (0 = every day)" };
    sessionLimit = Number.isFinite(n) ? n : 0;
  }

  return {
    data: {
      category: body.category,
      name,
      months,
      originalPrice,
      offerPrice,
      note: String(body.note || "").trim(),
      sessionLimit,
      active: body.active !== false,
    },
  };
};

// GET /api/membership-plans
const listPlans = async (req, res) => {
  try {
    if ((await MembershipPlan.countDocuments()) === 0)
      await MembershipPlan.insertMany(DEFAULT_PLANS);
    // plans saved before the 15-day rule existed
    await MembershipPlan.updateMany(
      { category: "swimming-coaching", sessionLimit: { $in: [0, null] } },
      { $set: { sessionLimit: 15 } }
    );
    const plans = await MembershipPlan.find().sort({ order: 1, createdAt: 1 });
    res.json({ plans });
  } catch (error) {
    res.status(500).json({ message: "Could not load plans" });
  }
};

// POST /api/membership-plans
const createPlan = async (req, res) => {
  const { data, error } = readPlan(req.body || {});
  if (error) return res.status(400).json({ message: error });
  try {
    const last = await MembershipPlan.findOne().sort({ order: -1 });
    const plan = await MembershipPlan.create({
      ...data,
      order: (last?.order ?? -1) + 1,
    });
    res.status(201).json({ plan });
  } catch (err) {
    res.status(500).json({ message: "Could not add plan" });
  }
};

// PUT /api/membership-plans/:id
const updatePlan = async (req, res) => {
  const { data, error } = readPlan(req.body || {});
  if (error) return res.status(400).json({ message: error });
  try {
    const plan = await MembershipPlan.findByIdAndUpdate(req.params.id, data, {
      new: true,
    });
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    res.json({ plan });
  } catch (err) {
    res.status(400).json({ message: "Could not update plan" });
  }
};

// DELETE /api/membership-plans/:id  (existing subscriptions keep their copy)
const deletePlan = async (req, res) => {
  try {
    const plan = await MembershipPlan.findByIdAndDelete(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(400).json({ message: "Could not delete plan" });
  }
};

module.exports = { listPlans, createPlan, updatePlan, deletePlan };
