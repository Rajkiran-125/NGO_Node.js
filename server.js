// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const volunteerRoutes = require("./routes/volunteers");
const hoursRoutes = require("./routes/hours");
const adminRoutes = require("./routes/admin");
const dbbackupRoutes = require("./routes/dbbackup.js");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// MongoDB Connection
mongoose.connect(
  process.env.MONGODB_URI || "mongodb://localhost:27017/nest4us_volunteers"
);

// app.get("/", (req, res) => {
//   res.json(
//     '<h1 style = "text-align: center;background: dodgerblue;"><marquee behavior="scroll" direction="left">oppopopopo<sup>®</sup> - v1.0.0.01</marquee></h1>'
//   );
// });

app.get("/liveness", (req, res) => {
  res.json({ message: "Running..." });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/volunteers", volunteerRoutes);
app.use("/api/hours", hoursRoutes);
app.use("/api/admin", adminRoutes);
app.use("/dbbackup", dbbackupRoutes);

// Serve frontend
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// MongoDB Connection - connect before starting the HTTP server
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/nest4us_volunteers";

mongoose.connection.on("connected", () => {
  console.log("MongoDB connected");
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

function startServer() {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

mongoose
  .connect(MONGODB_URI)
  .then(() => startServer())
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });

// Global error handlers to help debugging container restarts
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});
