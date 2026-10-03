const express = require("express");
const { list, listActive, create, toggle, remove } = require("../controllers/turfClosureController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(protect);

router.get("/active", listActive); // before "/" so it isn't swallowed
router.route("/").get(list).post(create);
router.patch("/:id/toggle", toggle);
router.delete("/:id", remove);

module.exports = router;
