const express = require("express");
const {
  createBooking,
  listBookings,
  cancelBooking,
  membershipCheckIn,
  finishBooking,
} = require("../controllers/poolBookingController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.route("/").get(listBookings).post(createBooking);
router.post("/membership-checkin", membershipCheckIn);
router.patch("/:id/cancel", cancelBooking);
router.patch("/:id/finish", finishBooking);

module.exports = router;
