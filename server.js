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

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// MongoDB Connection
mongoose.connect(
  process.env.MONGODB_URI || "mongodb://localhost:27017/nest4us_volunteers",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);


// app.get('/', (req, res) => {
//     res.send('<h1 style = "text-align: center;background: dodgerblue;"><marquee behavior="scroll" direction="left">oppopopopo<sup>®</sup> - v1.0.0.01</marquee></h1>');
// });

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/volunteers", volunteerRoutes);
app.use("/api/hours", hoursRoutes);
app.use("/api/admin", adminRoutes);

// Serve frontend
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
