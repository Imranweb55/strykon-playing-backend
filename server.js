require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const poolBookingRoutes = require("./routes/poolBookingRoutes");
const turfBookingRoutes = require("./routes/turfBookingRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const pricingRoutes = require("./routes/pricingRoutes");
const memberRoutes = require("./routes/memberRoutes");
const ledgerRoutes = require("./routes/ledgerRoutes");
const reportRoutes = require("./routes/reportRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const turfClosureRoutes = require("./routes/turfClosureRoutes");
const skatingRoutes = require("./routes/skatingRoutes");
const searchRoutes = require("./routes/searchRoutes");

const app = express();

// Connect to MongoDB
connectDB();

// CORS: CLIENT_ORIGIN (comma-separated list allowed) always works. Outside
// production, devices on the same local network (192.168.x.x, 10.x.x.x,
// 172.16-31.x.x) are also allowed so the dashboard can be tested from a
// phone over Wi-Fi.
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const LAN_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

// Middlewares
app.use(
  cors({
    origin: (origin, callback) => {
      // no Origin header = non-browser client (curl, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      if (process.env.NODE_ENV !== "production" && LAN_ORIGIN.test(origin))
        return callback(null, true);
      return callback(null, false);
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  }),
);
app.use(express.json({ limit: "2mb" })); // member photos are sent as small data URLs

// Health check
app.get("/", (req, res) => {
  res.send("Backend is running successfully!");
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/pool-bookings", poolBookingRoutes);
app.use("/api/turf-bookings", turfBookingRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/pricing", pricingRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/ledger", ledgerRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/turf-closures", turfClosureRoutes);
app.use("/api/skating", skatingRoutes);
app.use("/api/search", searchRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
