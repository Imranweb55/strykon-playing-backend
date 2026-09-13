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

module.exports = { loginAdmin, getMe };
