const TurfClosure = require("../models/TurfClosure");
const { SLOT_MINUTES } = require("../config/turfRules");
const { addDays, DATE_RE } = require("../utils/dateKeys");

// Closures effective on `date`: active, started on/before it, and either
// permanent (endDate null) or ends on/after it.
const effectiveOn = (date) => ({
  active: true,
  startDate: { $lte: date },
  $or: [{ endDate: null }, { endDate: { $gte: date } }],
});

const readInput = (body) => {
  const startMin = Number(body.startMin);
  const endMin = Number(body.endMin);
  const reason = String(body.reason || "").trim();
  const startDate = DATE_RE.test(body.startDate || "") ? body.startDate : null;
  const permanent = Boolean(body.permanent);
  const days = Number(body.days);

  if (!reason) return { error: "Enter a reason for the closure" };
  if (
    !Number.isInteger(startMin) ||
    !Number.isInteger(endMin) ||
    startMin < 0 ||
    endMin <= startMin ||
    endMin > 1440 ||
    startMin % SLOT_MINUTES !== 0 ||
    endMin % SLOT_MINUTES !== 0
  )
    return { error: "Select a valid time range" };
  if (!startDate) return { error: "Select a valid start date" };
  if (!permanent && (!Number.isInteger(days) || days < 1 || days > 365))
    return { error: "Enter how many days (1-365), or mark it permanent" };

  const endDate = permanent ? null : addDays(startDate, days - 1);
  return { data: { startMin, endMin, reason, startDate, endDate, active: true } };
};

// GET /api/turf-closures  (everything, for Settings management)
const list = async (req, res) => {
  try {
    const closures = await TurfClosure.find().sort({ createdAt: -1 }).lean();
    res.json({ closures });
  } catch (error) {
    res.status(500).json({ message: "Could not load closures" });
  }
};

// GET /api/turf-closures/active?date=YYYY-MM-DD  (effective right now, for booking pages)
const listActive = async (req, res) => {
  try {
    const { date } = req.query;
    if (!DATE_RE.test(date || ""))
      return res.status(400).json({ message: "Valid date is required" });
    const closures = await TurfClosure.find(effectiveOn(date)).sort({ startMin: 1 }).lean();
    res.json({ closures });
  } catch (error) {
    res.status(500).json({ message: "Could not load closures" });
  }
};

// POST /api/turf-closures
const create = async (req, res) => {
  const { data, error } = readInput(req.body || {});
  if (error) return res.status(400).json({ message: error });
  try {
    const closure = await TurfClosure.create({ ...data, createdBy: req.admin?._id });
    res.status(201).json({ closure });
  } catch (err) {
    res.status(500).json({ message: "Could not create closure" });
  }
};

// PATCH /api/turf-closures/:id/toggle  (open <-> close, keeps the record)
const toggle = async (req, res) => {
  try {
    const closure = await TurfClosure.findById(req.params.id);
    if (!closure) return res.status(404).json({ message: "Closure not found" });
    closure.active = !closure.active;
    await closure.save();
    res.json({ closure });
  } catch (error) {
    res.status(400).json({ message: "Could not update closure" });
  }
};

// DELETE /api/turf-closures/:id
const remove = async (req, res) => {
  try {
    const closure = await TurfClosure.findByIdAndDelete(req.params.id);
    if (!closure) return res.status(404).json({ message: "Closure not found" });
    res.json({ message: "Deleted" });
  } catch (error) {
    res.status(400).json({ message: "Could not delete closure" });
  }
};

module.exports = { list, listActive, create, toggle, remove, effectiveOn };
