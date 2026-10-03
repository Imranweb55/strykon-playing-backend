const express = require("express");
const { getAll, updateAll } = require("../controllers/settingsController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.get("/", getAll);
router.put("/", updateAll);

module.exports = router;
