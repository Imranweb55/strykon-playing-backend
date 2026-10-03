const express = require("express");
const { getLedger } = require("../controllers/skatingController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/ledger", protect, getLedger);

module.exports = router;
