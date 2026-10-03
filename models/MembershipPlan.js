const mongoose = require("mongoose");

// A plan customers can subscribe to (swimming membership, coaching programs).
const membershipPlanSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      enum: ["swimming", "basketball", "skating", "swimming-coaching"],
    },
    name: { type: String, required: true, trim: true },
    months: { type: Number, required: true, min: 1, max: 60 },
    originalPrice: { type: Number, required: true, min: 0 },
    offerPrice: { type: Number, required: true, min: 0 },
    // > 0: the plan allows only this many ATTENDANCE DAYS inside its date window
    // (swimming coaching: 15 days within the month)
    sessionLimit: { type: Number, min: 0, default: 0 },
    note: { type: String, trim: true, default: "" },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MembershipPlan", membershipPlanSchema);
