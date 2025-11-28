// backend/server.js (CommonJS - chắc chạy với package.json type: commonjs)
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json());

// test route nhanh
app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Backend running on port " + PORT);
});
