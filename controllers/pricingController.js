const Pricing = require("../models/Pricing");
const PoolProduct = require("../models/PoolProduct");
const { getPricing } = require("../utils/pricing");

const RATE_FIELDS = [
  "swimmingPerPerson",
  "pickleballPerHour",
  "basketballPerHour",
  "basketballHalfPerHour",
  "cricketPerHour",
];

const validPrice = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1000000;
};

// GET /api/pricing -> { rates, products }
const getAll = async (req, res) => {
  try {
    const [rates, products] = await Promise.all([
      getPricing(),
      PoolProduct.find().sort({ type: 1, name: 1 }),
    ]);
    res.json({ rates, products });
  } catch (error) {
    res.status(500).json({ message: "Could not load pricing" });
  }
};

// PUT /api/pricing/rates
const updateRates = async (req, res) => {
  try {
    const update = {};
    for (const field of RATE_FIELDS) {
      if (req.body[field] === undefined) continue;
      if (!validPrice(req.body[field]))
        return res.status(400).json({ message: "Enter valid prices" });
      update[field] = Number(req.body[field]);
    }
    await getPricing();
    const rates = await Pricing.findOneAndUpdate(
      { key: "main" },
      { $set: update },
      { new: true }
    );
    res.json({ rates });
  } catch (error) {
    res.status(500).json({ message: "Could not save prices" });
  }
};

const readProduct = (body) => {
  const name = String(body.name || "").trim();
  if (!name) return { error: "Enter the product name" };
  if (!["rent", "buy"].includes(body.type))
    return { error: "Select Rent or Buy" };
  if (!validPrice(body.price)) return { error: "Enter a valid price" };
  return {
    data: {
      name,
      type: body.type,
      price: Number(body.price),
      active: body.active !== false,
    },
  };
};

// POST /api/pricing/products
const createProduct = async (req, res) => {
  const { data, error } = readProduct(req.body || {});
  if (error) return res.status(400).json({ message: error });
  try {
    const product = await PoolProduct.create(data);
    res.status(201).json({ product });
  } catch (err) {
    res.status(500).json({ message: "Could not add product" });
  }
};

// PUT /api/pricing/products/:id
const updateProduct = async (req, res) => {
  const { data, error } = readProduct(req.body || {});
  if (error) return res.status(400).json({ message: error });
  try {
    const product = await PoolProduct.findByIdAndUpdate(req.params.id, data, {
      new: true,
    });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json({ product });
  } catch (err) {
    res.status(400).json({ message: "Could not update product" });
  }
};

// DELETE /api/pricing/products/:id  (old bookings keep their saved name/price)
const deleteProduct = async (req, res) => {
  try {
    const product = await PoolProduct.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(400).json({ message: "Could not delete product" });
  }
};

module.exports = {
  getAll,
  updateRates,
  createProduct,
  updateProduct,
  deleteProduct,
};
