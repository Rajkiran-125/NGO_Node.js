const express = require("express");
const { adminAuth } = require("../middleware/auth");
const VolunteerHours = require("../models/VolunteerHours");
const User = require("../models/User");
const router = express.Router();
const loggerFunction = require("../utils/loggerFunction");

// Define tiers
const TIERS = [
  { name: "Kindness Ambassador", min: 0, max: 99, range: "50-99" },
  { name: "Change Catalyst", min: 100, max: 149, range: "100-149" },
  { name: "Service Champion", min: 150, max: 249, range: "150-249" },
  { name: "Legacy Leader", min: 250, max: null, range: "250+" }
];

// Get pending hours for approval
router.get("/pending-hours", adminAuth, async (req, res) => {
  const route = "GET /pending-hours";
  try {
    loggerFunction("info", `${route} - API execution started.`);
    const pendingHours = await VolunteerHours.find({ status: "pending" })
      // .populate("volunteerId", "profile.firstName profile.lastName email")
      .populate("volunteerId", "profile.fullName email")
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

// Download Dashboard data
router.post("/volunteer-report", adminAuth, async (req, res) => {
  const route = "POST /volunteer-report";
  try {
    const { type, serviceType, fromDate, toDate, volunteerId } = req.body;

    // base match filter
    const match = {
      status: "approved"
    };

    // ✅ Date range filter
    if (fromDate && toDate) {
      match.serviceDate = {
        $gte: new Date(fromDate),
        $lte: new Date(toDate)
      };
    } else if (fromDate) {
      // single-day support
      const from = new Date(fromDate);
      const to = new Date(fromDate);
      to.setHours(23, 59, 59, 999);
      match.serviceDate = { $gte: from, $lte: to };
    }

    // ✅ Filter by serviceType only if provided (non-empty string)
    if (serviceType && serviceType.trim() !== "") {
      match.serviceType = serviceType;
    }

    // ✅ CASE 1: Report for serviceType summary
    if (type === "serviceType") {
      const VOLUNTEER_HOURLY_RATE = 34.79;
      const summary = await VolunteerHours.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$serviceType",
            totalVolunteers: { $addToSet: "$volunteerId" },
            totalHours: { $sum: "$hours" }
          }
        },
        {
          $project: {
            _id: 0,
            serviceType: "$_id",
            totalVolunteers: { $size: "$totalVolunteers" },
            totalHours: 1,
            totalValue: { $multiply: ["$totalHours", VOLUNTEER_HOURLY_RATE] }
          }
        },
        { $sort: { serviceType: 1 } }
      ]);

      return res.status(200).json({
        message: "Service type report fetched successfully",
        data: summary
      });
    }

    // ✅ CASE 2: Report for specific volunteer
    if (type === "volunteer") {
      const volunteerRecords = await VolunteerHours.find(match)
        // .populate("volunteerId", "firstName lastName")
        .populate("volunteerId", "fullName")
        .sort({ serviceDate: -1 })
        .select("activityName serviceType serviceDate hours")
        .lean();

      const data = volunteerRecords.map(r => ({
        // volunteerName: `${r.volunteerId.firstName} ${r.volunteerId.lastName}`,
        volunteerName: `${r.volunteerId.fullName}`,
        serviceType: r.serviceType,
        serviceActivity: r.activityName,
        dateOfService: r.serviceDate,
        totalHours: r.hours
      }));

      return res.status(200).json({
        message: "Volunteer report fetched successfully",
        data
      });
    }

    // default fallback
    res.status(400).json({ message: "Invalid report type" });
  } catch (error) {
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Admin Dashboard
router.get("/summary", adminAuth, async (req, res) => {
  const route = "GET /admin/summary";
  try {
    loggerFunction("info", `${route} - Execution started. userId=${req.user._id}`);

    // 1️⃣ Total Volunteers
    const totalVolunteers = await User.countDocuments({ role: "volunteer" });

    // 2️⃣ Total Approved Hours
    const approvedRecords = await VolunteerHours.find({ status: "approved" });
    const totalHours = approvedRecords.reduce((sum, record) => sum + record.hours, 0);

    // 3️⃣ Value of Service ($34.79 per hour)
    const valueOfService = (totalHours * 34.79).toFixed(2);

    // 4️⃣ Pending Submissions
    const pendingSubmissions = await VolunteerHours.countDocuments({ status: "pending" });

    const summary = {
      totalVolunteers,
      totalHours,
      valueOfService: `$${valueOfService}`,
      pendingSubmissions
    };

    loggerFunction("info", `${route} - Summary fetched successfully.`);
    loggerFunction("debug", `${route} - Summary data: ${JSON.stringify(summary, null, 2)}`);

    res.status(200).json({
      message: "Admin summary fetched successfully",
      summary
    });
  } catch (error) {
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * GET /admin/tiers
 * Returns tier name, range, and count of volunteers for each tier
 */
router.get("/tiers", adminAuth, async (req, res) => {
  const route = "GET /admin/tiers";
  try {
    loggerFunction("info", `${route} - API execution started. userId=${req.user._id}`);

    // Aggregate total approved hours per volunteer
    const totals = await VolunteerHours.aggregate([
      { $match: { status: "approved" } },
      {
        $group: {
          _id: "$volunteerId",
          totalHours: { $sum: "$hours" }
        }
      }
    ]);

    // Build counts per tier
    const counts = TIERS.map(t => ({ tier: t.name, range: t.range, count: 0 }));

    // Map totals to tiers
    totals.forEach(tot => {
      const hrs = tot.totalHours || 0;
      for (let i = 0; i < TIERS.length; i++) {
        const tier = TIERS[i];
        if (tier.max === null) {
          if (hrs >= tier.min) {
            counts[i].count += 1;
            break;
          }
        } else {
          if (hrs >= tier.min && hrs <= tier.max) {
            counts[i].count += 1;
            break;
          }
        }
      }
    });

    loggerFunction("info", `${route} - Tier counts computed.`);
    loggerFunction("debug", `${route} - counts=${JSON.stringify(counts, null, 2)}`);

    return res.status(200).json({
      message: "Tier counts fetched successfully",
      data: counts
    });
  } catch (error) {
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * POST /admin/tiers
 * Returns list of users (id, fullName, totalHours) who fall into the given tier.
 * tierName must match one of TIERS.name (case-insensitive).
 */
router.post("/tiers", adminAuth, async (req, res) => {
  const route = "POST /admin/tiers";
  try {
    const tierName = req.body.tierName;
    loggerFunction("info", `${route} - API execution started. userId=${req.user._id} tier=${tierName}`);

    if (!tierName) {
      return res.status(400).json({ message: "tierName is required" });
    }

    // Find matching tier (case-insensitive)
    const tier = TIERS.find(t => t.name.toLowerCase() === tierName.toLowerCase());
    if (!tier) {
      return res.status(400).json({ message: "Invalid tier name" });
    }

    // Aggregation: compute total hours per volunteer, then filter by tier range,
    // and lookup user info for each volunteerId.
    const pipeline = [
      { $match: { status: "approved" } },
      {
        $group: {
          _id: "$volunteerId",
          totalHours: { $sum: "$hours" }
        }
      },
      // Filter by tier range
      {
        $match:
          tier.max === null ? { totalHours: { $gte: tier.min } } : { totalHours: { $gte: tier.min, $lte: tier.max } }
      },
      // Lookup user details
      {
        $lookup: {
          from: "users", // make sure collection name matches (usually 'users')
          localField: "_id",
          foreignField: "_id",
          as: "user"
        }
      },
      { $unwind: "$user" },
      {
        $project: {
          _id: 0,
          userId: "$user._id",
          fullName: { $ifNull: ["$user.profile.fullName", ""] },
          email: "$user.email",
          totalHours: 1
        }
      },
      { $sort: { fullName: 1 } } // alphabetical
    ];

    const rows = await VolunteerHours.aggregate(pipeline);

    loggerFunction("info", `${route} - Found ${rows.length} users for tier=${tier.name}`);
    loggerFunction("debug", `${route} - sample=${JSON.stringify(rows.slice(0, 5), null, 2)}`);

    return res.status(200).json({
      message: `Users in tier ${tier.name} fetched successfully`,
      data: rows
    });
  } catch (error) {
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Admin-only user detail fetch
router.post("/user-details", adminAuth, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const user = await User.findById(userId).lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      userId: user._id,
      fullName: user.profile?.fullName || "",
      lifetimeHours: user.totalHours || 0,
      dateOfBirth: user.profile?.dateOfBirth || null,
      location: {
        state: user.profile?.location?.state || "",
        country: user.profile?.location?.country || ""
      },
      schoolOrganization: "", // ❗ you removed it, returning empty
      phoneNumber: user.profile?.phoneNumber || "",
      email: user.email,
      causes: [], // ❗ keep empty for now as requested
      profilePicture: user.profile?.profilePicture || ""
    });
  } catch (error) {
    console.error("Error fetching user details:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
});

module.exports = router;
