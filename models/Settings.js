const mongoose = require("mongoose");

// Single document (key: "main") holding academy branding + operational
// preferences that used to be fixed constants in the code.
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "main", unique: true },

    // Academy Details - shown on Reports PDFs (falls back to the defaults
    // below when never saved).
    academyName: { type: String, trim: true, default: "STRYKON SPORTS ACADEMY" },
    logo: { type: String, default: "" }, // data URL, small PNG/JPEG
    contactPhone: { type: String, trim: true, default: "" },
    contactEmail: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },

    // Booking Preferences
    poolFreshUpMinutes: { type: Number, min: 0, max: 60, default: 5 },
    membershipExpiringDays: { type: Number, min: 1, max: 30, default: 7 },

    // Notifications - where cancellation emails are sent
    notifyEmail: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Settings", settingsSchema);
