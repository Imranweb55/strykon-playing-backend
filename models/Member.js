const crypto = require("crypto");
const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema(
  {
    memberId: { type: String, unique: true }, // 6-digit ID, e.g. 482913
    name: { type: String, required: true, trim: true },
    age: { type: Number, required: true, min: 1, max: 120 },
    mobile: { type: String, required: true, trim: true },
    notes: { type: String, trim: true, default: "" },
    // Photo captured at admission (small JPEG data URLs). `thumb` is used in
    // lists and cards, `photo` on the profile / verification screen.
    photo: { type: String, default: "" },
    thumb: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

// Random unique 6-digit ID (100000 - 999999). Old STK-0001 style IDs keep working.
memberSchema.statics.nextMemberId = async function () {
  for (let i = 0; i < 25; i++) {
    const id = String(crypto.randomInt(100000, 1000000));
    if (!(await this.exists({ memberId: id }))) return id;
  }
  throw new Error("Could not generate a member ID");
};

module.exports = mongoose.model("Member", memberSchema);
