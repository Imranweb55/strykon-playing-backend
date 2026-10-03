const express = require("express");
const {
  monthSummary,
  listBookings,
  createBooking,
  cancelBooking,
} = require("../controllers/turfBookingController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.get("/month", monthSummary);
router.route("/").get(listBookings).post(createBooking);
router.patch("/:id/cancel", cancelBooking);

module.exports = router;
