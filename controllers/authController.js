const Admin = require("../models/Admin");
const generateToken = require("../utils/generateToken");

// @route  POST /api/auth/login
// @access Public
const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });

    if (!admin) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await admin.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = generateToken(admin._id);

    return res.status(200).json({
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({ message: "Server error, please try again" });
  }
};

// @route  GET /api/auth/me
// @access Private (used on refresh to check if the saved token is still valid)
const getMe = async (req, res) => {
  return res.status(200).json({ admin: req.admin });
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// @route  PUT /api/auth/profile
// @access Private - change name/email, confirmed with the current password
const updateProfile = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const currentPassword = String(req.body?.currentPassword || "");

    if (!name) return res.status(400).json({ message: "Name is required" });
    if (!EMAIL_RE.test(email))
      return res.status(400).json({ message: "Enter a valid email address" });
    if (!currentPassword)
      return res.status(400).json({ message: "Enter your current password to confirm" });

    const admin = await Admin.findById(req.admin._id);
    const isMatch = await admin.matchPassword(currentPassword);
    if (!isMatch)
      return res.status(401).json({ message: "Current password is incorrect" });

    if (email !== admin.email) {
      const taken = await Admin.findOne({ email, _id: { $ne: admin._id } });
      if (taken) return res.status(409).json({ message: "This email is already in use" });
    }

    admin.name = name;
    admin.email = email;
    await admin.save();

    res.json({ admin: { id: admin._id, name: admin.name, email: admin.email } });
  } catch (error) {
    console.error("updateProfile:", error.message);
    res.status(500).json({ message: "Could not update profile" });
  }
};

// @route  PUT /api/auth/password
// @access Private
const changePassword = async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: "Enter your current and new password" });
    if (newPassword.length < 6)
      return res.status(400).json({ message: "New password must be at least 6 characters" });

    const admin = await Admin.findById(req.admin._id);
    const isMatch = await admin.matchPassword(currentPassword);
    if (!isMatch)
      return res.status(401).json({ message: "Current password is incorrect" });

    admin.password = newPassword; // re-hashed by the pre-save hook
    await admin.save();
    res.json({ message: "Password updated" });
  } catch (error) {
    console.error("changePassword:", error.message);
    res.status(500).json({ message: "Could not change password" });
  }
};

module.exports = { loginAdmin, getMe, updateProfile, changePassword };
