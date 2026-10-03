const mongoose = require("mongoose");

// Shown in the admin topbar bell. `link` is a dashboard path the bell can
// navigate to when clicked (optional).
const notificationSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, enum: ["cancellation", "payment_due"] },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    link: { type: String, default: "" },
    read: { type: Boolean, default: false },
    emailSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ read: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
