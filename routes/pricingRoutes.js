const express = require("express");
const {
  getAll,
  updateRates,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/pricingController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.get("/", getAll);
router.put("/rates", updateRates);
router.post("/products", createProduct);
router.put("/products/:id", updateProduct);
router.delete("/products/:id", deleteProduct);

module.exports = router;
