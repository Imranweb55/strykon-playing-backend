const Pricing = require("../models/Pricing");

// Returns the single pricing document (created with zero rates on first use).
const getPricing = async () =>
  Pricing.findOneAndUpdate(
    { key: "main" },
    { $setOnInsert: { key: "main" } },
    { new: true, upsert: true }
  );

// Manual offer applied on a booking.
//  type "percent": value is 0-100, type "amount": value is rupees.
// The discount can never be more than the subtotal.
const calcDiscount = (subtotal, type, value) => {
  const v = Number(value);
  if (!["percent", "amount"].includes(type) || !Number.isFinite(v) || v <= 0)
    return { discountType: "none", discountValue: 0, discountAmount: 0 };
  const raw = type === "percent" ? (subtotal * Math.min(v, 100)) / 100 : v;
  return {
    discountType: type,
    discountValue: type === "percent" ? Math.min(v, 100) : v,
    discountAmount: Math.min(Math.round(raw), subtotal),
  };
};

module.exports = { getPricing, calcDiscount };
