// backend/server.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json());

// ROUTES
const sessionRoutes = require("./src/routes/session");
const uploadRoutes = require("./src/routes/upload");

app.use("/api/session", sessionRoutes);
app.use("/api/upload", uploadRoutes);

// Test route
app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Backend running on port " + PORT);
});
