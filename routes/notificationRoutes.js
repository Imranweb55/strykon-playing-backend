const express = require("express");
const { list, markRead, markAllRead } = require("../controllers/notificationController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(protect);

router.get("/", list);
router.patch("/read-all", markAllRead);
router.patch("/:id/read", markRead);

module.exports = router;
