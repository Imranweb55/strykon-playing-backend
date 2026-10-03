const mongoose = require("mongoose");

// One document = one booking of a game (pickleball / basketball / cricket)
// on the shared turf for a date and a time range.
const turfBookingSchema = new mongoose.Schema(
  {
    sport: {
      type: String,
      required: true,
      enum: ["pickleball", "basketball", "cricket"],
    },
    optionId: { type: String, required: true }, // e.g. "pickle-2", "half-1"
    optionLabel: { type: String, required: true }, // e.g. "2 Courts"
    weight: { type: Number, required: true }, // turf units used (see turfRules)

    name: { type: String, required: true, trim: true },
    entrySource: {
      type: String,
      required: true,
      enum: ["district", "turftown", "onspot"],
    },
    mobile: { type: String, required: true, trim: true },

    // price: hours x per-hour rate of the game, minus the manual offer
    ratePerHour: { type: Number, min: 0, default: 0 },
    amount: { type: Number, min: 0, default: 0 },
    discountType: { type: String, enum: ["none", "percent", "amount"], default: "none" },
    discountValue: { type: Number, min: 0, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, min: 0, default: 0 },
    // paid in advance through District / Turf Town app
    advancePaid: { type: Number, min: 0, default: 0 },

    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // play date (admin's local date)
    startMin: { type: Number, required: true }, // minutes from midnight
    endMin: { type: Number, required: true },
    hours: { type: Number, required: true },

    status: { type: String, enum: ["active", "cancelled"], default: "active" },
    cancelledAt: { type: Date },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

turfBookingSchema.index({ date: 1, status: 1 });

module.exports = mongoose.model("TurfBooking", turfBookingSchema);
