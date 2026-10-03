const Settings = require("../models/Settings");

// Returns the single settings document (created with defaults on first use).
// Cached briefly in memory since it is read on almost every booking/report
// request and rarely changes.
let cache = null;
let cacheAt = 0;
const CACHE_MS = 5000;

const getSettings = async () => {
  if (cache && Date.now() - cacheAt < CACHE_MS) return cache;
  cache = await Settings.findOneAndUpdate(
    { key: "main" },
    { $setOnInsert: { key: "main" } },
    { new: true, upsert: true }
  );
  cacheAt = Date.now();
  return cache;
};

const clearSettingsCache = () => {
  cache = null;
};

module.exports = { getSettings, clearSettingsCache };
