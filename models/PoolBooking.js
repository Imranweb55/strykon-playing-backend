const mongoose = require("mongoose");

// Minutes between booking and the moment the paid hours actually start
// (fresh-up / changing time).
const FRESH_UP_MINUTES = 5;

const poolBookingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    age: { type: Number, required: true, min: 1, max: 120 },
    entrySource: {
      type: String,
      required: true,
      enum: ["district", "turftown", "onspot"],
    },
    persons: { type: Number, required: true, min: 1, max: 100 },
    mobile: { type: String, required: true, trim: true },
    hours: { type: Number, required: true, min: 0, max: 12 }, // 0 for membership visits

    // Swimming related product: nothing / rented / bought / customer's own
    productType: {
      type: String,
      enum: ["none", "rent", "buy", "own"],
      default: "none",
    },
    productName: { type: String, trim: true, default: "" },
    productAmount: { type: Number, min: 0, default: 0 },
    productQty: { type: Number, min: 1, default: 1 },

    // "free" = familiar person allowed without paying
    paymentMode: {
      type: String,
      required: true,
      enum: ["cash", "online", "free", "membership"],
    },
    amount: { type: Number, required: true, min: 0 }, // pool fee entered by admin
    // manual offer applied on the booking
    discountType: { type: String, enum: ["none", "percent", "amount"], default: "none" },
    discountValue: { type: Number, min: 0, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, required: true, min: 0 }, // fee + product - offer (0 if free)

    // paid in advance through District / Turf Town app (already deducted from what is collected)
    advancePaid: { type: Number, min: 0, default: 0 },

    // Membership visit: member is checked in by ID, checked out manually
    member: { type: mongoose.Schema.Types.ObjectId, ref: "Member" },
    memberCode: { type: String, default: "" },
    memberPlan: { type: String, default: "" },
    memberThumb: { type: String, default: "" },
    attendance: { type: mongoose.Schema.Types.ObjectId, ref: "Attendance" },
    checkOutAt: { type: Date, default: null },

    startsAt: { type: Date, required: true }, // createdAt + fresh-up minutes
    endsAt: { type: Date, required: true }, // startsAt + hours

    status: {
      type: String,
      enum: ["active", "cancelled"],
      default: "active",
    },
    cancelledAt: { type: Date },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

poolBookingSchema.index({ createdAt: -1 });

module.exports = mongoose.model("PoolBooking", poolBookingSchema);
module.exports.FRESH_UP_MINUTES = FRESH_UP_MINUTES;
