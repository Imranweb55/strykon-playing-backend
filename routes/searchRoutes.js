const express = require("express");
const { searchBookings } = require("../controllers/searchController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, searchBookings);

module.exports = router;
