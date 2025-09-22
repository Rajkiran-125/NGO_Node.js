const express = require("express");
const { adminAuth } = require("../middleware/auth");
const VolunteerHours = require("../models/VolunteerHours");
const User = require("../models/User");
const router = express.Router();

// Get pending hours for approval
router.get("/pending-hours", adminAuth, async (req, res) => {
  try {
    const pendingHours = await VolunteerHours.find({ status: "pending" })
      .populate("volunteerId", "profile.firstName profile.lastName email")
      .sort({ submittedAt: -1 });

    res.json(pendingHours);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Approve or reject hours
router.put("/review-hours/:id", adminAuth, async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const hoursEntry = await VolunteerHours.findById(req.params.id);
    if (!hoursEntry) {
      return res.status(404).json({ message: "Hours entry not found" });
    }

    // Update hours entry
    hoursEntry.status = status;
    hoursEntry.reviewedAt = new Date();
    hoursEntry.reviewedBy = req.user._id;

    if (status === "rejected" && rejectionReason) {
      hoursEntry.rejectionReason = rejectionReason;
    }

    await hoursEntry.save();

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
      if (newTier !== previousTier && newTier !== "None") {
        if (!volunteer.badges.includes(newTier)) {
          volunteer.badges.push(newTier);
        }
      }

      await volunteer.save();
    }

    res.json({
      message: `Hours ${status} successfully`,
      entry: hoursEntry,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get all volunteers summary
router.get("/volunteers", adminAuth, async (req, res) => {
  try {
    const volunteers = await User.find({ role: "volunteer" })
      .select("profile email totalHours thisYearHours tier badges createdAt")
      .sort({ totalHours: -1 });

    res.json(volunteers);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get system statistics
router.get("/stats", adminAuth, async (req, res) => {
  try {
    const totalVolunteers = await User.countDocuments({ role: "volunteer" });
    const totalHours = await User.aggregate([
      { $match: { role: "volunteer" } },
      { $group: { _id: null, total: { $sum: "$totalHours" } } },
    ]);

    const pendingSubmissions = await VolunteerHours.countDocuments({
      status: "pending",
    });

    const tierDistribution = await User.aggregate([
      { $match: { role: "volunteer" } },
      { $group: { _id: "$tier", count: { $sum: 1 } } },
    ]);

    res.json({
      totalVolunteers,
      totalHours: totalHours[0]?.total || 0,
      pendingSubmissions,
      tierDistribution,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
