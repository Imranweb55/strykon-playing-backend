const express = require("express");
const { downloadReportPdf } = require("../controllers/reportController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/pdf", protect, downloadReportPdf);

module.exports = router;
