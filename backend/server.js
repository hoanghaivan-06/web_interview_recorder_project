// backend/server.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
require("dotenv").config();

const app = express();

// Basic request logging (simple, no new deps)
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => {
    const dt = Date.now() - t0;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${dt}ms`);
  });
  next();
});

app.use(cors());
app.use(helmet());

// Increase body parser limits for metadata / large JSONs if needed
app.use(express.json({ limit: process.env.JSON_LIMIT || "1mb" }));
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_LIMIT || "1mb" }));

// ROUTES
const sessionRoutes = require("./src/routes/session");
const uploadRoutes = require("./src/routes/upload");

app.use("/api/session", sessionRoutes);
app.use("/api/upload", uploadRoutes);

// Serve uploaded files (read-only) so QA can inspect files easily.
// NOTE: Make sure this is acceptable for your security/privacy model.
const uploadsDir = process.env.UPLOAD_ROOT || path.join(__dirname, "uploads");
app.use("/uploads", express.static(uploadsDir, { index: false, redirect: false }));

// Health
app.get("/health", (req, res) => res.json({ ok: true }));

// Centralized error handler (JSON)
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ ok: false, message: err.message || "Internal server error" });
});

// Start server with graceful shutdown
const PORT = Number(process.env.PORT || 3000);
const server = app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}. Shutting down...`);
  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
  // Force exit after timeout
  setTimeout(() => {
    console.warn("Forcing shutdown.");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

module.exports = app;
