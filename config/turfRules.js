// Turf sharing rules (single turf, three games).
//
// The turf has a capacity of 6 "units" (1 pickleball court = 2 units):
//   Pickleball : 3 courts               -> 2 units each
//   Basketball : 2 half courts / 1 full -> 3 units per half, 6 for full
//   Cricket    : whole turf             -> 6 units
//
// A 30-minute slot can hold any mix of bookings as long as the total units
// stay <= 6. This gives exactly the required behaviour, e.g.
//   1 pickleball court  (2) -> left 4: 2 pickleball courts or 1 half basketball
//   2 pickleball courts (4) -> left 2: 1 pickleball court only
//   1 half basketball   (3) -> left 3: 1 pickleball court or 1 half basketball
//   2 half / full / cricket / 3 pickleball -> nothing left

const CAPACITY = 6;
const SLOT_MINUTES = 30;
const OPEN_MIN = 0; // 12:00 AM - open 24/7
const CLOSE_MIN = 24 * 60; // 12:00 AM (midnight)

const OPTIONS = {
  pickleball: [
    { id: "pickle-1", label: "1 Court", weight: 2 },
    { id: "pickle-2", label: "2 Courts", weight: 4 },
    { id: "pickle-3", label: "3 Courts", weight: 6 },
  ],
  basketball: [
    { id: "half-1", label: "1 Half Court", weight: 3 },
    { id: "half-2", label: "2 Half Courts", weight: 6 },
    { id: "full", label: "Full Court", weight: 6 },
  ],
  cricket: [{ id: "cricket-full", label: "Full Turf", weight: 6 }],
};

const SPORT_NAMES = {
  pickleball: "Pickleball",
  basketball: "Basketball",
  cricket: "Cricket",
};

const getOption = (sport, optionId) =>
  (OPTIONS[sport] || []).find((o) => o.id === optionId);

const formatMinutes = (min) => {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
};

// bookings: active bookings of one date. Returns units used per slot start.
const getUsage = (bookings) => {
  const usage = {};
  bookings.forEach((b) => {
    for (let t = b.startMin; t < b.endMin; t += SLOT_MINUTES) {
      usage[t] = (usage[t] || 0) + b.weight;
    }
  });
  return usage;
};

// Returns null when [startMin, endMin) fits, otherwise a readable conflict.
const findConflict = (bookings, weight, startMin, endMin) => {
  const usage = getUsage(bookings);
  for (let t = startMin; t < endMin; t += SLOT_MINUTES) {
    if ((usage[t] || 0) + weight > CAPACITY) {
      const blockers = bookings
        .filter((b) => b.startMin <= t && t < b.endMin)
        .map(
          (b) => `${SPORT_NAMES[b.sport] || b.sport} - ${b.optionLabel}`
        );
      const unique = [...new Set(blockers)].join(", ");
      return `${formatMinutes(t)} - ${formatMinutes(t + SLOT_MINUTES)} is already booked for ${unique}. Please choose another time.`;
    }
  }
  return null;
};

module.exports = {
  CAPACITY,
  SLOT_MINUTES,
  OPEN_MIN,
  CLOSE_MIN,
  OPTIONS,
  SPORT_NAMES,
  getOption,
  formatMinutes,
  getUsage,
  findConflict,
};
