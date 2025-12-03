const express = require("express");
const router = express.Router();

const {
  startSession,
  getSessionById,
  endSessionController,
} = require("../controllers/sessionControllers");

router.post("/start", startSession);

router.get("/:id", getSessionById);

router.post("/end", endSessionController);

module.exports = router;
