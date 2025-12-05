const express = require("express");
const router = express.Router();


const {
  startSession,
  getSessionStatus,
  endSessionController,
} = require("../controllers/sessionController");


router.post("/start", startSession);


router.get("/:id", getSessionStatus);


router.post("/end", endSessionController);


module.exports = router;