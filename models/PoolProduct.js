const mongoose = require("mongoose");

// Swimming pool related item that can be rented or bought during a booking.
const poolProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ["rent", "buy"] },
    price: { type: Number, required: true, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PoolProduct", poolProductSchema);
