const express = require("express");
const multer = require("multer");
const path = require("path");
const { auth } = require("../middleware/auth");
const User = require("../models/User");
const VolunteerHours = require("../models/VolunteerHours");
const router = express.Router();
const loggerFunction = require("../utils/loggerFunction");

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5000000 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only .png, .jpg, .jpeg and .pdf files are allowed!"));
    }
  }
});

// Get volunteer dashboard data
router.get("/dashboard", auth, async (req, res) => {
  const route = "GET /dashboard";
  try {
    loggerFunction("info", `${route} - API execution started. userId=${req.user._id}`);
    const user = await User.findById(req.user._id);
    const hoursHistory = await VolunteerHours.find({
      volunteerId: req.user._id
    }).sort({ submittedAt: -1 });

    // Calculate tier based on total hours
    let tier = "None";
    if (user.totalHours >= 250) tier = "Legacy Leader";
    else if (user.totalHours >= 150) tier = "Service Champion";
    else if (user.totalHours >= 100) tier = "Change Catalyst";
    else if (user.totalHours >= 50) tier = "Kindness Ambassador";

    // Update user tier if changed
    if (user.tier !== tier) {
      user.tier = tier;
      await user.save();
    }

    const currentYear = new Date().getFullYear();
    const thisYearHours = await VolunteerHours.aggregate([
      {
        $match: {
          volunteerId: req.user._id,
          status: "approved",
          serviceDate: {
            $gte: new Date(currentYear, 0, 1),
            $lt: new Date(currentYear + 1, 0, 1)
          }
        }
      },
      {
        $group: {
          _id: null,
          totalHours: { $sum: "$hours" }
        }
      }
    ]);

    const thisYearTotal = thisYearHours[0]?.totalHours || 0;

    loggerFunction("info", `${route} - Response sent successfully. userId=${req.user._id}`);
    loggerFunction(
      "debug",
      `${route} - Response sample: ${JSON.stringify(
        { totalHours: user.totalHours, thisYearHours: thisYearTotal, tier },
        null,
        2
      )}`
    );

    res.json({
      profile: user.profile,
      totalHours: user.totalHours,
      thisYearHours: thisYearTotal,
      tier,
      badges: user.badges,
      referralCode: user.referralCode,
      hoursHistory: hoursHistory.map(entry => ({
        id: entry._id,
        activityName: entry.activityName,
        serviceDate: entry.serviceDate,
        hours: entry.hours,
        status: entry.status,
        rejectionReason: entry.rejectionReason,
        submittedAt: entry.submittedAt
      }))
    });
  } catch (error) {
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update profile
router.put("/profile", auth, upload.single("profilePicture"), async (req, res) => {
  const route = "PUT /profile";
  try {
    loggerFunction("info", `${route} - API execution started. userId=${req.user._id}`);
    loggerFunction("debug", `${route} - userId=${req.user._id}, Incoming request body: ${JSON.stringify(req.body)}`);
    const updates = req.body;

    if (req.file) {
      updates.profilePicture = req.file.filename;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { profile: { ...req.user.profile, ...updates } } },
      { new: true, runValidators: true }
    );

    loggerFunction("info", `${route} - Response sent successfully. userId=${req.user._id}`);
    loggerFunction(
      "debug",
      `${route} - Profile updated successfully. userId=${req.user._id} Updated profile=${JSON.stringify(
        user.profile,
        null,
        2
      )}`
    );
    res.json({
      message: "Profile updated successfully",
      profile: user.profile
    });
  } catch (error) {
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update notification preferences
router.put("/notifications", auth, async (req, res) => {
  const route = "PUT /notifications";
  try {
    loggerFunction("info", `${route} - API execution started. userId=${req.user._id}`);
    loggerFunction("debug", `${route} - userId=${req.user._id}, Incoming request body: ${JSON.stringify(req.body)}`);
    const { weeklyDigest, monthlyDigest, approvalNotifications, achievementNotifications } = req.body;

    await User.findByIdAndUpdate(req.user._id, {
      notifications: {
        weeklyDigest: weeklyDigest ?? req.user.notifications.weeklyDigest,
        monthlyDigest: monthlyDigest ?? req.user.notifications.monthlyDigest,
        approvalNotifications: approvalNotifications ?? req.user.notifications.approvalNotifications,
        achievementNotifications: achievementNotifications ?? req.user.notifications.achievementNotifications
      }
    });

    loggerFunction("info", `${route} - Response sent successfully. userId=${req.user._id}`);
    loggerFunction(
      "debug",
      `${route} - Notification preferences updated successfully: ${JSON.stringify(req.body, null, 2)}`
    );
    res.json({ message: "Notification preferences updated successfully" });
  } catch (error) {
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Download dashboard data
router.post("/hours/export", auth, async (req, res) => {
  const route = "POST /hours/export";
  try {
    loggerFunction("info", `${route} - API execution started. userId=${req.user._id}`);

    const { fromDate, toDate } = req.body;

    if (!fromDate) {
      loggerFunction("warn", `${route} - Missing fromDate. userId=${req.user._id}`);
      return res.status(400).json({ message: "fromDate is required" });
    }

    // Build date filters
    const from = new Date(fromDate);
    let dateFilter = {};

    if (toDate) {
      // Range mode
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      dateFilter = { $gte: from, $lte: to };
      loggerFunction("debug", `${route} - Date range mode: ${from.toISOString()} to ${to.toISOString()}`);
    } else {
      // Single-day mode
      const startOfDay = new Date(from);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(from);
      endOfDay.setHours(23, 59, 59, 999);
      dateFilter = { $gte: startOfDay, $lte: endOfDay };
      loggerFunction("debug", `${route} - Single-date mode: ${startOfDay.toISOString()}`);
    }

    // Query only approved entries
    const match = {
      volunteerId: req.user._id,
      status: "approved",
      serviceDate: dateFilter
    };

    // Fetch approved volunteer hours
    const approvedHours = await VolunteerHours.find(match)
      .sort({ serviceDate: -1 })
      .select("activityName serviceDate hours status")
      .lean();

    // Calculate total approved hours
    const totalHours = approvedHours.reduce((sum, entry) => sum + (entry.hours || 0), 0);

    // Format response
    const responseData = approvedHours.map(entry => ({
      serviceActivity: entry.activityName,
      serviceDate: entry.serviceDate,
      numberOfHours: entry.hours,
      status: "Approved"
    }));

    loggerFunction("info", `${route} - Retrieved ${approvedHours.length} approved records for userId=${req.user._id}.`);
    loggerFunction(
      "debug",
      `${route} - Response preview: ${JSON.stringify({ totalHours, sample: responseData.slice(0, 2) }, null, 2)}`
    );

    res.json({
      records: responseData,
      totalHours
    });
  } catch (error) {
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
