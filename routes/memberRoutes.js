const express = require("express");
const {
  listMembers,
  admitMember,
  getMember,
  updateMember,
  addSubscription,
  addPayment,
  checkIn,
  checkOut,
  lookupMember,
} = require("../controllers/memberController");
const {
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
} = require("../controllers/planController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(protect);

// plans (kept above /:id so "plans" is not read as a member id)
router.route("/plans").get(listPlans).post(createPlan);
router.route("/plans/:id").put(updatePlan).delete(deletePlan);

router.post("/check-in", checkIn);
router.post("/check-out", checkOut);
router.get("/lookup", lookupMember);

router.route("/").get(listMembers).post(admitMember);
router.route("/:id").get(getMember).put(updateMember);
router.post("/:id/subscriptions", addSubscription);
router.post("/:id/subscriptions/:subId/payments", addPayment);

module.exports = router;
