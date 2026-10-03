const Subscription = require("../models/Subscription");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const dayStart = (key, tz) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + tz * 60000);
};

// GET /api/skating/ledger?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=<offset minutes>
// Every payment collected on skating subscriptions (admission + renewals +
// balance collections) in the range, plus cash/online totals.
const getLedger = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!DATE_RE.test(from || "") || !DATE_RE.test(to || "") || from > to)
      return res.status(400).json({ message: "Select a valid date range" });
    const tz = Math.max(-840, Math.min(840, Number(req.query.tz) || 0));
    const start = dayStart(from, tz);
    const end = new Date(dayStart(to, tz).getTime() + DAY_MS);

    const subs = await Subscription.find({ category: "skating" })
      .populate("member", "name memberId mobile")
      .lean();

    const entries = [];
    subs.forEach((s) => {
      (s.payments || []).forEach((p) => {
        const at = new Date(p.at);
        if (at >= start && at < end) {
          entries.push({
            id: String(p._id),
            at: p.at,
            mode: p.mode,
            amount: p.amount,
            note: p.note,
            memberName: s.member?.name || "Deleted member",
            memberCode: s.member?.memberId || "-",
            planName: s.planName,
          });
        }
      });
    });
    entries.sort((a, b) => new Date(b.at) - new Date(a.at));

    const totals = { cash: 0, online: 0 };
    entries.forEach((e) => {
      totals[e.mode] = (totals[e.mode] || 0) + e.amount;
    });

    res.json({
      entries,
      totals: {
        ...totals,
        total: totals.cash + totals.online,
        count: entries.length,
      },
    });
  } catch (error) {
    console.error("skating getLedger:", error.message);
    res.status(500).json({ message: "Could not load the skating ledger" });
  }
};

module.exports = { getLedger };
