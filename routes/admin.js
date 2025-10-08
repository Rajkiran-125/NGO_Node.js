const express = require("express");
const { adminAuth } = require("../middleware/auth");
const VolunteerHours = require("../models/VolunteerHours");
const User = require("../models/User");
const router = express.Router();
const loggerFunction = require("../utils/loggerFunction");

// Get pending hours for approval
router.get("/pending-hours", adminAuth, async (req, res) => {
  const route = "GET /pending-hours";
  try {
    loggerFunction("info", `${route} - API execution started.`);
    const pendingHours = await VolunteerHours.find({ status: "pending" })
      .populate("volunteerId", "profile.firstName profile.lastName email")
      .sort({ submittedAt: -1 });

    // loggerFunction("debug", `${route} - Response : ${pendingHours}`);
    loggerFunction("debug", `${route} - Sample Record: ${JSON.stringify(pendingHours[0] || {}, null, 2)}`);
    res.json(pendingHours);
    loggerFunction("info", `${route} - Response sent successfully.`);
  } catch (error) {
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Approve or reject hours
router.put("/review-hours/:id", adminAuth, async (req, res) => {
  const route = "PUT /review-hours/:id";
  try {
    loggerFunction("info", `${route} - API execution started. Id=${req.params.id}`);
    loggerFunction("debug", `${route} - Id=${req.params.id}, Incoming request body=${JSON.stringify(req.body)}`);
    const { status, rejectionReason } = req.body;
    loggerFunction("debug", `PUT /review-hours, Request : {req.params.id} - {req.body}`);
    if (!["approved", "rejected"].includes(status)) {
      loggerFunction("warn", `${route} - Invalid status provided. Id=${req.params.id} status=${status}`);
      return res.status(400).json({ message: "Invalid status" });
    }

    const hoursEntry = await VolunteerHours.findById(req.params.id);
    if (!hoursEntry) {
      loggerFunction("warn", `${route} - Hours entry not found. Id=${req.params.id}`);
      return res.status(404).json({ message: "Hours entry not found" });
    }
    loggerFunction("debug", `${route} - Hours entry found. Id=${req.params.id} Data=${JSON.stringify(hoursEntry)}}`);
    // Update hours entry
    hoursEntry.status = status;
    hoursEntry.reviewedAt = new Date();
    hoursEntry.reviewedBy = req.user._id;

    if (status === "rejected" && rejectionReason) {
      hoursEntry.rejectionReason = rejectionReason;
      loggerFunction("debug", `${route} - Rejection reason set. Id=${req.params.id}`);
    }

    await hoursEntry.save();
    loggerFunction("info", `${route} - Hours entry updated and saved. Id=${req.params.id} newStatus=${status}`);

    // If approved, update volunteer's total hours and check for tier upgrades
    if (status === "approved") {
      const volunteer = await User.findById(hoursEntry.volunteerId);
      volunteer.totalHours += hoursEntry.hours;

      // Update this year's hours
      const currentYear = new Date().getFullYear();
      const serviceYear = new Date(hoursEntry.serviceDate).getFullYear();
      if (serviceYear === currentYear) {
        volunteer.thisYearHours += hoursEntry.hours;
      }

      // Check tier upgrades
      const previousTier = volunteer.tier;
      let newTier = "None";
      if (volunteer.totalHours >= 250) newTier = "Legacy Leader";
      else if (volunteer.totalHours >= 150) newTier = "Service Champion";
      else if (volunteer.totalHours >= 100) newTier = "Change Catalyst";
      else if (volunteer.totalHours >= 50) newTier = "Kindness Ambassador";

      volunteer.tier = newTier;

      // Add achievement badge if tier upgraded
      let badgeAdded = false;
      if (newTier !== previousTier && newTier !== "None") {
        if (!volunteer.badges.includes(newTier)) {
          volunteer.badges.push(newTier);
          badgeAdded = true;
        }
      }

      await volunteer.save();
      loggerFunction(
        "info",
        `${route} - Volunteer updated. volunteerId=${hoursEntry.volunteerId} totalHoursAfter=${volunteer.totalHours} tierBefore=${previousTier} tierAfter=${newTier} badgeAdded=${badgeAdded}`
      );
    }
    loggerFunction("info", `${route} - Response sent successfully. Id=${req.params.id}`);
    loggerFunction(
      "debug",
      `${route} - Response body sample. Id=${req.params.id} Data=${JSON.stringify(hoursEntry)} status=${
        hoursEntry.status
      }`
    );

    res.json({
      message: `Hours ${status} successfully`,
      entry: hoursEntry
    });
  } catch (error) {
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get all volunteers summary
router.get("/volunteers", adminAuth, async (req, res) => {
  const route = "GET /volunteers";
  try {
    loggerFunction("info", `${route} - API execution started.`);
    const volunteers = await User.find({ role: "volunteer" })
      .select("profile email totalHours thisYearHours tier badges createdAt")
      .sort({ totalHours: -1 });
    // ✅ Log the result
    if (!volunteers.length) {
      loggerFunction("warn", `${route} - No volunteer records found.`);
    } else {
      loggerFunction("info", `${route} - Retrieved ${volunteers.length} volunteer record(s).`);
      loggerFunction("debug", `${route} - Sample volunteer record: ${JSON.stringify(volunteers, null, 2)}`);
    }

    // ✅ Send response
    loggerFunction("info", `${route} - Response sent successfully.`);
    res.json(volunteers);
  } catch (error) {
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get system statistics
router.get("/stats", adminAuth, async (req, res) => {
  const route = "GET /stats";
  try {
    loggerFunction("info", `${route} - API execution started.`);
    const totalVolunteers = await User.countDocuments({ role: "volunteer" });
    loggerFunction("info", `${route} - totalVolunteers=${totalVolunteers}`);
    const totalHours = await User.aggregate([
      { $match: { role: "volunteer" } },
      { $group: { _id: null, total: { $sum: "$totalHours" } } }
    ]);
    loggerFunction("info", `${route} - totalHours=${totalHours}`);

    const pendingSubmissions = await VolunteerHours.countDocuments({
      status: "pending"
    });
    loggerFunction("info", `${route} - pendingSubmissions=${pendingSubmissions}`);

    const tierDistribution = await User.aggregate([
      { $match: { role: "volunteer" } },
      { $group: { _id: "$tier", count: { $sum: 1 } } }
    ]);

    loggerFunction("info", `${route} - Response sent successfully.`);
    res.json({
      totalVolunteers,
      totalHours: totalHours[0]?.total || 0,
      pendingSubmissions,
      tierDistribution
    });
  } catch (error) {
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
