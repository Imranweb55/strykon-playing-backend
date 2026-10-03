const express = require("express");
const { getLedger } = require("../controllers/ledgerController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, getLedger);

module.exports = router;
