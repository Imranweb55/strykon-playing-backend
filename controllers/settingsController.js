const Settings = require("../models/Settings");
const { getSettings, clearSettingsCache } = require("../utils/settings");

const isImage = (value, max) =>
  typeof value === "string" &&
  /^data:image\/(jpeg|png|webp);base64,/.test(value) &&
  value.length <= max;

// GET /api/settings
const getAll = async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({ settings });
  } catch (error) {
    res.status(500).json({ message: "Could not load settings" });
  }
};

// PUT /api/settings
const updateAll = async (req, res) => {
  try {
    const body = req.body || {};
    const update = {};

    if (body.academyName !== undefined) {
      const name = String(body.academyName).trim();
      if (!name) return res.status(400).json({ message: "Academy name is required" });
      update.academyName = name.slice(0, 80);
    }
    if (body.contactPhone !== undefined)
      update.contactPhone = String(body.contactPhone).trim().slice(0, 20);
    if (body.contactEmail !== undefined)
      update.contactEmail = String(body.contactEmail).trim().slice(0, 100);
    if (body.address !== undefined) update.address = String(body.address).trim().slice(0, 200);
    if (body.logo) {
      if (!isImage(body.logo, 400000))
        return res.status(400).json({ message: "Logo image is invalid or too large" });
      update.logo = body.logo;
    } else if (body.logo === "") {
      update.logo = "";
    }

    if (body.poolFreshUpMinutes !== undefined) {
      const n = Number(body.poolFreshUpMinutes);
      if (!Number.isFinite(n) || n < 0 || n > 60)
        return res.status(400).json({ message: "Fresh-up time must be 0-60 minutes" });
      update.poolFreshUpMinutes = n;
    }
    if (body.membershipExpiringDays !== undefined) {
      const n = Number(body.membershipExpiringDays);
      if (!Number.isInteger(n) || n < 1 || n > 30)
        return res.status(400).json({ message: "Expiring threshold must be 1-30 days" });
      update.membershipExpiringDays = n;
    }
    if (body.notifyEmail !== undefined) {
      const email = String(body.notifyEmail).trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ message: "Enter a valid notification email" });
      update.notifyEmail = email.slice(0, 100);
    }

    await getSettings();
    const settings = await Settings.findOneAndUpdate(
      { key: "main" },
      { $set: update },
      { new: true }
    );
    clearSettingsCache();
    res.json({ settings });
  } catch (error) {
    console.error("updateSettings:", error.message);
    res.status(500).json({ message: "Could not save settings" });
  }
};

module.exports = { getAll, updateAll };
