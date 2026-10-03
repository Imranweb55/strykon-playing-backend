const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 1 },
    mode: { type: String, required: true, enum: ["cash", "online"] },
    note: { type: String, trim: true, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

// One purchase of a plan by a member. Plan details are copied here so later
// price changes or plan deletion never alter old subscriptions.
const subscriptionSchema = new mongoose.Schema(
  {
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: "MembershipPlan" },
    category: { type: String, required: true },
    planName: { type: String, required: true },
    months: { type: Number, required: true },
    originalPrice: { type: Number, default: 0 },
    price: { type: Number, required: true, min: 0 }, // what the member must pay
    sessionLimit: { type: Number, min: 0, default: 0 }, // attendance days allowed (0 = unlimited)
    batchTime: { type: String, trim: true, default: "" }, // coaching time slot, e.g. "6:00 AM - 7:00 AM"

    startDate: { type: String, required: true }, // YYYY-MM-DD
    endDate: { type: String, required: true }, // last valid day (inclusive)

    payments: [paymentSchema],
    amountPaid: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);
