const express = require("express");
const multer = require("multer");
const path = require("path");
const { auth } = require("../middleware/auth");
const User = require("../models/User");
const VolunteerHours = require("../models/VolunteerHours");
const router = express.Router();
const fs = require("fs");
const loggerFunction = require("../utils/loggerFunction");

// // Configure multer for file uploads
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, "uploads/");
//   },
//   filename: (req, file, cb) => {
//     cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
//   }
// });

// const upload = multer({
//   storage: storage,
//   limits: { fileSize: 5000000 }, // 5MB
//   fileFilter: (req, file, cb) => {
//     const allowedTypes = /jpeg|jpg|png|pdf/;
//     const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
//     const mimetype = allowedTypes.test(file.mimetype);

//     if (mimetype && extname) {
//       return cb(null, true);
//     } else {
//       cb(new Error("Only .png, .jpg, .jpeg and .pdf files are allowed!"));
//     }
//   }
// });

const uploadDir = path.join(__dirname, "../uploads/userProfilePictures");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) cb(null, true);
    else cb(new Error("Only images are allowed!"));
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

// Get profile details
router.get("/profile", auth, async (req, res) => {
  const route = "GET /profile";
  try {
    const userId = req.user._id; // Extracted from token

    const user = await User.findById(userId).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({
      message: "User profile fetched successfully",
      user
    });
  } catch (error) {
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

// Personal Volunteer Dashboard
router.get("/summary", auth, async (req, res) => {
  const route = "GET /volunteer/summary";
  try {
    const VOLUNTEER_HOURLY_RATE = 34.79;

    loggerFunction("info", `${route} - Fetching volunteer summary. volunteerId=${id}`);

    // Lifetime approved hours
    const lifetimeAgg = await VolunteerHours.aggregate([
      { $match: { volunteerId: req.user._id, status: "approved" } },
      {
        $group: {
          _id: null,
          totalHours: { $sum: "$hours" }
        }
      }
    ]);
    const lifetimeHours = lifetimeAgg[0]?.totalHours || 0;

    // Current year approved hours
    const currentYear = new Date().getFullYear();
    const yearAgg = await VolunteerHours.aggregate([
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
    const currentYearHours = yearAgg[0]?.totalHours || 0;

    // Calculate value of service
    const valueOfService = Number((lifetimeHours * VOLUNTEER_HOURLY_RATE).toFixed(2));

    // Determine recognition tier
    let recognitionTier = "None";
    if (lifetimeHours >= 250) recognitionTier = "Legacy Leader";
    else if (lifetimeHours >= 150) recognitionTier = "Service Champion";
    else if (lifetimeHours >= 100) recognitionTier = "Change Catalyst";
    else if (lifetimeHours >= 50) recognitionTier = "Kindness Ambassador";

    // Response payload
    const response = {
      volunteerId: req.user._id,
      name: `${volunteer.profile.firstName} ${volunteer.profile.lastName}`,
      email: volunteer.email,
      lifetimeHours,
      currentYearHours,
      valueOfService,
      recognitionTier
    };

    loggerFunction("info", `${route} - Summary generated successfully.`);
    loggerFunction("debug", `${route} - Response: ${JSON.stringify(response, null, 2)}`);

    res.status(200).json({
      message: "Volunteer summary fetched successfully",
      data: response
    });
  } catch (error) {
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Change Password (Logged-in user)
router.post("/change-password", auth, async (req, res) => {
  const route = "POST /change-password";
  try {
    loggerFunction("info", `${route} - Execution started. userId=${req.user._id}`);

    const { oldPassword, newPassword, confirmPassword } = req.body;
    const userId = req.user.id; // comes from authMiddleware

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "New passwords do not match" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return res.status(401).json({ message: "Old password is incorrect" });
    }

    // Set new password (auto-hash on save)
    user.password = newPassword;
    await user.save();

    loggerFunction("info", `${route} - Password changed successfully for ${user.email}`);
    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
