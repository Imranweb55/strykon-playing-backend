const mongoose = require("mongoose");

// One document (key: "main") holding the fee for every game.
//  - swimming: price PER PERSON (flat, not per hour)
//  - pickleball / basketball / cricket: price PER HOUR (any number of players)
const pricingSchema = new mongoose.Schema(
  {
    key: { type: String, default: "main", unique: true },
    swimmingPerPerson: { type: Number, min: 0, default: 0 },
    pickleballPerHour: { type: Number, min: 0, default: 0 },
    basketballPerHour: { type: Number, min: 0, default: 0 }, // full court
    basketballHalfPerHour: { type: Number, min: 0, default: 0 }, // per half court
    cricketPerHour: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Pricing", pricingSchema);
