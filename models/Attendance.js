const mongoose = require("mongoose");

// One visit (session) of a member: check-in time and, once they leave,
// check-out time. A member can have many sessions in a single day.
const attendanceSchema = new mongoose.Schema(
  {
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
    },
    date: { type: String, required: true }, // YYYY-MM-DD (admin's local date)
    checkInAt: { type: Date, default: Date.now },
    checkOutAt: { type: Date, default: null },
    plans: { type: String, default: "" }, // active plan names at check-in
    source: { type: String, enum: ["desk", "pool"], default: "desk" },
  },
  { timestamps: true }
);

attendanceSchema.index({ member: 1, date: 1 });
attendanceSchema.index({ date: 1 });

module.exports = mongoose.model("Attendance", attendanceSchema);
