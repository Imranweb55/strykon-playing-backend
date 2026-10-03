const mongoose = require("mongoose");

// A recurring daily time block on the shared turf (e.g. 4:00-6:00 PM for
// skating coaching) during which Pickleball, Basketball and Cricket cannot
// be booked. Applies every day from startDate through endDate (inclusive);
// endDate null means "until an admin reopens it".
const turfClosureSchema = new mongoose.Schema(
  {
    startMin: { type: Number, required: true, min: 0, max: 1410 }, // minutes from midnight
    endMin: { type: Number, required: true, min: 30, max: 1440 },
    reason: { type: String, required: true, trim: true, maxlength: 200 },

    startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    endDate: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ }, // null = permanent

    // Admin can "open" (deactivate) the closure early - e.g. skating
    // cancelled for the day - without losing the record. Re-activating
    // brings the same closure back into effect.
    active: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

turfClosureSchema.index({ active: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model("TurfClosure", turfClosureSchema);
