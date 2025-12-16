const express = require("express");
const { adminAuth } = require("../middleware/auth");
const VolunteerHours = require("../models/VolunteerHours");
const User = require("../models/User");
const router = express.Router();
const loggerFunction = require("../utils/loggerFunction");
const tierMessages = require("../config/tierMessages.json");
const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Define tiers
const TIERS = [
  { name: "Kindness Ambassador", min: 50, max: 99, range: "50-99" },
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

// Update ONLY hours for a pending volunteer entry
router.put("/edit-hours/:id", adminAuth, async (req, res) => {
  const route = "PUT /edit-hours/:id";

  try {
    loggerFunction("info", `${route} - API execution started. id=${req.params.id}`);
    loggerFunction("debug", `${route} - Incoming body: ${JSON.stringify(req.body)}`);

    const { hours } = req.body;

    // Validate hours present
    if (!hours) {
      loggerFunction("warn", `${route} - Missing hours field`);
      return res.status(400).json({ message: "Hours field is required" });
    }

    // Validate numeric
    const parsedHours = parseFloat(hours);
    if (isNaN(parsedHours) || parsedHours <= 0) {
      loggerFunction("warn", `${route} - Invalid hours value: ${hours}`);
      return res.status(400).json({ message: "Hours must be a positive number" });
    }

    const entry = await VolunteerHours.findById(req.params.id);

    if (!entry) {
      loggerFunction("warn", `${route} - Entry not found`);
      return res.status(404).json({ message: "Hours entry not found" });
    }

    // Only pending entries allowed
    if (entry.status !== "pending") {
      loggerFunction("warn", `${route} - Cannot update. Status=${entry.status}`);
      return res.status(400).json({
        message: "Only pending entries can be edited"
      });
    }

    // Update only the hours field
    entry.hours = parsedHours;
    await entry.save();

    loggerFunction("info", `${route} - Hours updated successfully. id=${req.params.id} hours=${parsedHours}`);

    res.json({
      message: "Hours updated successfully",
      entry
    });
  } catch (error) {
    loggerFunction("error", `${route} - Error: ${error.stack || error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Approve or reject hours
// router.put("/review-hours/:id", adminAuth, async (req, res) => {
//   const route = "PUT /review-hours/:id";
//   try {
//     loggerFunction("info", `${route} - API execution started. Id=${req.params.id}`);
//     loggerFunction("debug", `${route} - Id=${req.params.id}, Incoming request body=${JSON.stringify(req.body)}`);
//     const { status, rejectionReason } = req.body;
//     loggerFunction("debug", `PUT /review-hours, Request : {req.params.id} - {req.body}`);
//     if (!["approved", "rejected"].includes(status)) {
//       loggerFunction("warn", `${route} - Invalid status provided. Id=${req.params.id} status=${status}`);
//       return res.status(400).json({ message: "Invalid status" });
//     }

//     const hoursEntry = await VolunteerHours.findById(req.params.id);
//     if (!hoursEntry) {
//       loggerFunction("warn", `${route} - Hours entry not found. Id=${req.params.id}`);
//       return res.status(404).json({ message: "Hours entry not found" });
//     }
//     loggerFunction("debug", `${route} - Hours entry found. Id=${req.params.id} Data=${JSON.stringify(hoursEntry)}}`);
//     // Update hours entry
//     hoursEntry.status = status;
//     hoursEntry.reviewedAt = new Date();
//     hoursEntry.reviewedBy = req.user._id;

//     if (status === "rejected" && rejectionReason) {
//       hoursEntry.rejectionReason = rejectionReason;
//       loggerFunction("debug", `${route} - Rejection reason set. Id=${req.params.id}`);
//     }

//     await hoursEntry.save();
//     loggerFunction("info", `${route} - Hours entry updated and saved. Id=${req.params.id} newStatus=${status}`);

//     // If approved, update volunteer's total hours and check for tier upgrades
//     if (status === "approved") {
//       const volunteer = await User.findById(hoursEntry.volunteerId);
//       volunteer.totalHours += hoursEntry.hours;

//       // Update this year's hours
//       const currentYear = new Date().getFullYear();
//       const serviceYear = new Date(hoursEntry.serviceDate).getFullYear();
//       if (serviceYear === currentYear) {
//         volunteer.thisYearHours += hoursEntry.hours;
//       }

//       // Check tier upgrades
//       const previousTier = volunteer.tier;
//       let newTier = "None";
//       if (volunteer.totalHours >= 250) newTier = "Legacy Leader";
//       else if (volunteer.totalHours >= 150) newTier = "Service Champion";
//       else if (volunteer.totalHours >= 100) newTier = "Change Catalyst";
//       else if (volunteer.totalHours >= 50) newTier = "Kindness Ambassador";

//       volunteer.tier = newTier;

//       // Add achievement badge if tier upgraded
//       let badgeAdded = false;
//       if (newTier !== previousTier && newTier !== "None") {
//         if (!volunteer.badges.includes(newTier)) {
//           volunteer.badges.push(newTier);
//           badgeAdded = true;
//         }
//       }

//       await volunteer.save();
//       loggerFunction(
//         "info",
//         `${route} - Volunteer updated. volunteerId=${hoursEntry.volunteerId} totalHoursAfter=${volunteer.totalHours} tierBefore=${previousTier} tierAfter=${newTier} badgeAdded=${badgeAdded}`
//       );
//     }
//     loggerFunction("info", `${route} - Response sent successfully. Id=${req.params.id}`);
//     loggerFunction(
//       "debug",
//       `${route} - Response body sample. Id=${req.params.id} Data=${JSON.stringify(hoursEntry)} status=${
//         hoursEntry.status
//       }`
//     );

//     res.json({
//       message: `Hours ${status} successfully`,
//       entry: hoursEntry
//     });
//   } catch (error) {
//     loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// });

router.put("/review-hours/:id", adminAuth, async (req, res) => {
  const route = "PUT /review-hours/:id";
  try {
    loggerFunction("info", `${route} - API execution started. Id=${req.params.id}`);
    loggerFunction("debug", `${route} - Id=${req.params.id}, Incoming request body=${JSON.stringify(req.body)}`);

    const { status, rejectionReason } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      loggerFunction("warn", `${route} - Invalid status provided. Id=${req.params.id} status=${status}`);
      return res.status(400).json({ message: "Invalid status" });
    }

    const hoursEntry = await VolunteerHours.findById(req.params.id);
    if (!hoursEntry) {
      loggerFunction("warn", `${route} - Hours entry not found. Id=${req.params.id}`);
      return res.status(404).json({ message: "Hours entry not found" });
    }
    loggerFunction("debug", `${route} - Hours entry found. Id=${req.params.id} Data=${JSON.stringify(hoursEntry)}`);

    // Update hours entry fields
    hoursEntry.status = status;
    hoursEntry.reviewedAt = new Date();
    hoursEntry.reviewedBy = req.user._id;

    if (status === "rejected") {
      hoursEntry.rejectionReason = rejectionReason || "";
      loggerFunction("debug", `${route} - Rejection reason set. Id=${req.params.id}`);
    } else {
      // Clear rejection reason if approving
      hoursEntry.rejectionReason = undefined;
    }

    await hoursEntry.save();
    loggerFunction("info", `${route} - Hours entry updated and saved. Id=${req.params.id} newStatus=${status}`);

    // Prepare to send email to volunteer
    const volunteer = await User.findById(hoursEntry.volunteerId);
    if (!volunteer) {
      loggerFunction("warn", `${route} - Volunteer user not found for entry. volunteerId=${hoursEntry.volunteerId}`);
    }

    // If approved, update volunteer's total hours and check for tier upgrades
    let newTier = null;
    let previousTier = null;
    let badgeAdded = false;
    if (status === "approved" && volunteer) {
      previousTier = volunteer.tier;

      // Ensure numeric updates (avoid double-add if entry was already approved before)
      // We assume entry was pending before this review; if you allow re-approvals you must guard here.
      volunteer.totalHours = (volunteer.totalHours || 0) + (hoursEntry.hours || 0);

      // Update this year's hours
      const currentYear = new Date().getFullYear();
      const serviceYear = new Date(hoursEntry.serviceDate).getFullYear();
      if (serviceYear === currentYear) {
        volunteer.thisYearHours = (volunteer.thisYearHours || 0) + (hoursEntry.hours || 0);
      }

      // Determine tier based on totalHours
      if (volunteer.totalHours >= 250) newTier = "Legacy Leader";
      else if (volunteer.totalHours >= 150) newTier = "Service Champion";
      else if (volunteer.totalHours >= 100) newTier = "Change Catalyst";
      else if (volunteer.totalHours >= 50) newTier = "Kindness Ambassador";
      else newTier = "None";

      // If tier changed (upgraded) record achievement and add badge
      if (newTier !== previousTier) {
        volunteer.tier = newTier;
        // store last achieved tier and timestamp
        volunteer.lastAchievedTier = newTier;
        volunteer.lastTierUpdatedAt = new Date();

        // Add badge if not present and tier is not 'None'
        if (newTier && newTier !== "None" && !volunteer.badges.includes(newTier)) {
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

    // --------------- Prepare email(s) ---------------
    if (volunteer && volunteer.email) {
      // helper for formatting
      const formatDate = d => (d ? new Date(d).toLocaleDateString() : "");
      const firstName = volunteer.profile?.firstName || "";
      const lastName = volunteer.profile?.lastName || "";

      const displayName = firstName || lastName ? `${firstName} ${lastName}`.trim() : "Volunteer";

      const entryInfoHtml = `
    <p><strong>Activity:</strong> ${hoursEntry.activityName}</p>
    <p><strong>Date of service:</strong> ${formatDate(hoursEntry.serviceDate)}</p>
    <p><strong>Hours:</strong> ${hoursEntry.hours}</p>
    <p><strong>Submission ID:</strong> ${hoursEntry._id}</p>
    <hr />
  `;

      // ----------------------------------------------------
      // 1️⃣ SEND APPROVAL EMAIL
      // ----------------------------------------------------
      if (status === "approved") {
        const approvalHtml = `
      <p>Hi ${displayName},</p>
      <p>Your volunteer hours submission has been <strong>approved</strong>.</p>
      ${entryInfoHtml}
      <p>Thank you for contributing your time and effort!</p>
      <p>NEST4US Team</p>
    `;

        const msg1 = {
          to: volunteer.email,
          from: process.env.SENDGRID_FROM_EMAIL || "no-reply@yourdomain.com",
          subject: "Your Volunteer Hours Have Been Approved",
          html: approvalHtml
        };

        try {
          loggerFunction("debug", `${route} - Sending approval email to ${volunteer.email}`);
          await sgMail.send(msg1);
          loggerFunction("info", `${route} - Approval email sent`);
        } catch (err) {
          loggerFunction("error", `${route} - Approval email failed: ${err.message}`);
        }
      }

      // ----------------------------------------------------
      // 2️⃣ SEND REJECTION EMAIL
      // ----------------------------------------------------
      if (status === "rejected") {
        const rejectionHtml = `
      <p>Hi ${displayName},</p>
      <p>Your volunteer hours submission has been <strong>rejected</strong>.</p>
      ${entryInfoHtml}
      <p><strong>Reason:</strong> ${rejectionReason || "No reason provided"}</p>
      <p>You may correct & re-submit your entry.</p>
      <p>NEST4US Team</p>
    `;

        const msg2 = {
          to: volunteer.email,
          from: process.env.SENDGRID_FROM_EMAIL || "no-reply@yourdomain.com",
          subject: "Your Volunteer Hours Submission Was Rejected",
          html: rejectionHtml
        };

        try {
          loggerFunction("debug", `${route} - Sending rejection email`);
          await sgMail.send(msg2);
          loggerFunction("info", `${route} - Rejection email sent`);
        } catch (err) {
          loggerFunction("error", `${route} - Rejection email failed: ${err.message}`);
        }
      }

      // ----------------------------------------------------
      // 3️⃣ SEND TIER UPGRADE EMAIL (only if tier changed)
      // ----------------------------------------------------
      if (status === "approved" && newTier && newTier !== previousTier && newTier !== "None") {
        const tierInfo = tierMessages[newTier];

        if (!tierInfo) {
          loggerFunction("warn", `${route} - No tier message found for tier: ${newTier}`);
        } else {
          const tierHtml = `
      <p>Hi ${displayName},</p>
      <p><strong>🎉 Congratulations!</strong></p>
      <p>${tierInfo.message}</p>
      <br/>
      <p>NEST4US Team</p>
    `;

          const msg3 = {
            to: volunteer.email,
            from: process.env.SENDGRID_FROM_EMAIL || "no-reply@yourdomain.com",
            subject: tierInfo.subject,
            html: tierHtml
          };

          try {
            loggerFunction("debug", `${route} - Sending tier upgrade email for tier=${newTier}`);
            await sgMail.send(msg3);
            loggerFunction("info", `${route} - Tier upgrade email sent`);
          } catch (err) {
            loggerFunction("error", `${route} - Tier email failed: ${err.message}`);
          }
        }
      }
    } else {
      loggerFunction(
        "warn",
        `${route} - Volunteer email missing, skipping notification. volunteerId=${hoursEntry.volunteerId}`
      );
    }

    // Final response
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

// router.put("/review-hours/:id", adminAuth, async (req, res) => {
//   const route = "PUT /review-hours/:id";
//   try {
//     loggerFunction("info", `${route} - API execution started. Id=${req.params.id}`);
//     loggerFunction("debug", `${route} - Id=${req.params.id}, Incoming request body=${JSON.stringify(req.body)}`);

//     const { status, rejectionReason } = req.body;

//     if (!["approved", "rejected"].includes(status)) {
//       loggerFunction("warn", `${route} - Invalid status provided. Id=${req.params.id} status=${status}`);
//       return res.status(400).json({ message: "Invalid status" });
//     }

//     const hoursEntry = await VolunteerHours.findById(req.params.id);
//     if (!hoursEntry) {
//       loggerFunction("warn", `${route} - Hours entry not found. Id=${req.params.id}`);
//       return res.status(404).json({ message: "Hours entry not found" });
//     }
//     loggerFunction("debug", `${route} - Hours entry found. Id=${req.params.id} Data=${JSON.stringify(hoursEntry)}`);

//     // Update hours entry fields
//     hoursEntry.status = status;
//     hoursEntry.reviewedAt = new Date();
//     hoursEntry.reviewedBy = req.user._id;

//     if (status === "rejected") {
//       hoursEntry.rejectionReason = rejectionReason || "";
//       loggerFunction("debug", `${route} - Rejection reason set. Id=${req.params.id}`);
//     } else {
//       // Clear rejection reason if approving
//       hoursEntry.rejectionReason = undefined;
//     }

//     await hoursEntry.save();
//     loggerFunction("info", `${route} - Hours entry updated and saved. Id=${req.params.id} newStatus=${status}`);

//     // Prepare to send email to volunteer
//     const volunteer = await User.findById(hoursEntry.volunteerId);
//     if (!volunteer) {
//       loggerFunction("warn", `${route} - Volunteer user not found for entry. volunteerId=${hoursEntry.volunteerId}`);
//     }

//     // Helper function to determine tier based on hours
//     const getTierForHours = hours => {
//       if (hours >= 250) return "Legacy Leader";
//       if (hours >= 150) return "Service Champion";
//       if (hours >= 100) return "Change Catalyst";
//       if (hours >= 50) return "Kindness Ambassador";
//       return "None";
//     };

//     // If approved, update volunteer's total hours and check for tier upgrades
//     let newTier = null;
//     let previousTier = null;
//     const tiersUnlocked = []; // Track all tiers unlocked in this approval

//     if (status === "approved" && volunteer) {
//       const previousTotalHours = volunteer.totalHours || 0;
//       previousTier = getTierForHours(previousTotalHours);

//       // Update total hours
//       volunteer.totalHours = previousTotalHours + (hoursEntry.hours || 0);

//       // Update this year's hours
//       const currentYear = new Date().getFullYear();
//       const serviceYear = new Date(hoursEntry.serviceDate).getFullYear();
//       if (serviceYear === currentYear) {
//         volunteer.thisYearHours = (volunteer.thisYearHours || 0) + (hoursEntry.hours || 0);
//       }

//       // Determine new tier
//       newTier = getTierForHours(volunteer.totalHours);

//       // Define tier thresholds in ascending order
//       const tierThresholds = [
//         { name: "Kindness Ambassador", hours: 50 },
//         { name: "Change Catalyst", hours: 100 },
//         { name: "Service Champion", hours: 150 },
//         { name: "Legacy Leader", hours: 250 }
//       ];

//       // Find all tiers that were crossed
//       for (const tier of tierThresholds) {
//         // If previous hours were below this tier and new hours are at or above it
//         if (previousTotalHours < tier.hours && volunteer.totalHours >= tier.hours) {
//           tiersUnlocked.push(tier.name);

//           // Add badge if not already present
//           if (!volunteer.badges.includes(tier.name)) {
//             volunteer.badges.push(tier.name);
//           }
//         }
//       }

//       // Update tier to the highest achieved
//       if (newTier !== previousTier) {
//         volunteer.tier = newTier;
//         volunteer.lastAchievedTier = newTier;
//         volunteer.lastTierUpdatedAt = new Date();
//       }

//       await volunteer.save();
//       loggerFunction(
//         "info",
//         `${route} - Volunteer updated. volunteerId=${
//           hoursEntry.volunteerId
//         } totalHoursBefore=${previousTotalHours} totalHoursAfter=${
//           volunteer.totalHours
//         } tierBefore=${previousTier} tierAfter=${newTier} tiersUnlocked=${JSON.stringify(tiersUnlocked)}`
//       );
//     }

//     // --------------- Prepare email(s) ---------------
//     if (volunteer && volunteer.email) {
//       // helper for formatting
//       const formatDate = d => (d ? new Date(d).toLocaleDateString() : "");

//       const entryInfoHtml = `
//     <p><strong>Activity:</strong> ${hoursEntry.activityName}</p>
//     <p><strong>Date of service:</strong> ${formatDate(hoursEntry.serviceDate)}</p>
//     <p><strong>Hours:</strong> ${hoursEntry.hours}</p>
//     <p><strong>Submission ID:</strong> ${hoursEntry._id}</p>
//     <hr />
//   `;

//       // ----------------------------------------------------
//       // 1️⃣ SEND APPROVAL EMAIL
//       // ----------------------------------------------------
//       if (status === "approved") {
//         const approvalHtml = `
//       <p>Hi ${volunteer.profile?.fullName || "Volunteer"},</p>
//       <p>Your volunteer hours submission has been <strong>approved</strong>.</p>
//       ${entryInfoHtml}
//       <p>Thank you for contributing your time and effort!</p>
//       <p>NEST4US Team</p>
//     `;

//         const msg1 = {
//           to: volunteer.email,
//           from: process.env.SENDGRID_FROM_EMAIL || "no-reply@yourdomain.com",
//           subject: "Your Volunteer Hours Have Been Approved",
//           html: approvalHtml
//         };

//         try {
//           loggerFunction("debug", `${route} - Sending approval email to ${volunteer.email}`);
//           await sgMail.send(msg1);
//           loggerFunction("info", `${route} - Approval email sent`);
//         } catch (err) {
//           loggerFunction("error", `${route} - Approval email failed: ${err.message}`);
//         }
//       }

//       // ----------------------------------------------------
//       // 2️⃣ SEND REJECTION EMAIL
//       // ----------------------------------------------------
//       if (status === "rejected") {
//         const rejectionHtml = `
//       <p>Hi ${volunteer.profile?.fullName || "Volunteer"},</p>
//       <p>Your volunteer hours submission has been <strong>rejected</strong>.</p>
//       ${entryInfoHtml}
//       <p><strong>Reason:</strong> ${rejectionReason || "No reason provided"}</p>
//       <p>You may correct & re-submit your entry.</p>
//       <p>NEST4US Team</p>
//     `;

//         const msg2 = {
//           to: volunteer.email,
//           from: process.env.SENDGRID_FROM_EMAIL || "no-reply@yourdomain.com",
//           subject: "Your Volunteer Hours Submission Was Rejected",
//           html: rejectionHtml
//         };

//         try {
//           loggerFunction("debug", `${route} - Sending rejection email`);
//           await sgMail.send(msg2);
//           loggerFunction("info", `${route} - Rejection email sent`);
//         } catch (err) {
//           loggerFunction("error", `${route} - Rejection email failed: ${err.message}`);
//         }
//       }

//       // ----------------------------------------------------
//       // 3️⃣ SEND TIER UPGRADE EMAIL(S) - One for each tier unlocked
//       // ----------------------------------------------------
//       if (status === "approved" && tiersUnlocked.length > 0) {
//         // Send emails in order (from lowest to highest tier)
//         for (const tierName of tiersUnlocked) {
//           const tierInfo = tierMessages[tierName];

//           if (!tierInfo) {
//             loggerFunction("warn", `${route} - No tier message found for tier: ${tierName}`);
//             continue;
//           }

//           const tierHtml = `
//       <p>Hi ${volunteer.profile?.fullName || "Volunteer"},</p>
//       <p><strong>🎉 Congratulations!</strong></p>
//       <p>${tierInfo.message}</p>
//       <br/>
//       <p>NEST4US Team</p>
//     `;

//           const msg3 = {
//             to: volunteer.email,
//             from: process.env.SENDGRID_FROM_EMAIL || "no-reply@yourdomain.com",
//             subject: tierInfo.subject,
//             html: tierHtml
//           };

//           try {
//             loggerFunction("debug", `${route} - Sending tier upgrade email for tier=${tierName}`);
//             await sgMail.send(msg3);
//             loggerFunction("info", `${route} - Tier upgrade email sent for ${tierName}`);

//             // Small delay between emails to ensure they arrive in order
//             await new Promise(resolve => setTimeout(resolve, 1000));
//           } catch (err) {
//             loggerFunction("error", `${route} - Tier email failed for ${tierName}: ${err.message}`);
//           }
//         }
//       }
//     } else {
//       loggerFunction(
//         "warn",
//         `${route} - Volunteer email missing, skipping notification. volunteerId=${hoursEntry.volunteerId}`
//       );
//     }

//     // Final response
//     loggerFunction("info", `${route} - Response sent successfully. Id=${req.params.id}`);
//     loggerFunction(
//       "debug",
//       `${route} - Response body sample. Id=${req.params.id} Data=${JSON.stringify(hoursEntry)} status=${
//         hoursEntry.status
//       }`
//     );

//     res.json({
//       message: `Hours ${status} successfully`,
//       entry: hoursEntry,
//       tiersUnlocked: tiersUnlocked // Include info about unlocked tiers
//     });
//   } catch (error) {
//     loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// });

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
        .populate("volunteerId", "firstName lastName")
        // .populate("volunteerId", "fullName")
        .sort({ serviceDate: -1 })
        .select("activityName serviceType serviceDate hours")
        .lean();

      const data = volunteerRecords.map(r => ({
        volunteerName: `${r.volunteerId.firstName} ${r.volunteerId.lastName}`,
        // volunteerName: `${r.volunteerId.fullName}`,
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
// router.get("/tiers", adminAuth, async (req, res) => {
//   const route = "GET /admin/tiers";
//   try {
//     loggerFunction("info", `${route} - API execution started. userId=${req.user._id}`);

//     // Aggregate total approved hours per volunteer
//     const totals = await VolunteerHours.aggregate([
//       { $match: { status: "approved" } },
//       {
//         $group: {
//           _id: "$volunteerId",
//           totalHours: { $sum: "$hours" }
//         }
//       }
//     ]);

//     // Build counts per tier
//     const counts = TIERS.map(t => ({ tier: t.name, range: t.range, count: 0 }));

//     // Map totals to tiers
//     totals.forEach(tot => {
//       const hrs = tot.totalHours || 0;
//       for (let i = 0; i < TIERS.length; i++) {
//         const tier = TIERS[i];
//         if (tier.max === null) {
//           if (hrs >= tier.min) {
//             counts[i].count += 1;
//             break;
//           }
//         } else {
//           if (hrs >= tier.min && hrs <= tier.max) {
//             counts[i].count += 1;
//             break;
//           }
//         }
//       }
//     });

//     loggerFunction("info", `${route} - Tier counts computed.`);
//     loggerFunction("debug", `${route} - counts=${JSON.stringify(counts, null, 2)}`);

//     return res.status(200).json({
//       message: "Tier counts fetched successfully",
//       data: counts
//     });
//   } catch (error) {
//     loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
//     return res.status(500).json({ message: "Server error", error: error.message });
//   }
// });

/**
 * GET /admin/tiers
 * Returns tier name, range, and count of volunteers for each tier
 */
router.get("/tiers", adminAuth, async (req, res) => {
  const route = "GET /admin/tiers";
  try {
    loggerFunction("info", `${route} - API execution started. adminId=${req.user._id}`);

    // Count users per tier directly from User collection
    const tierCounts = await Promise.all(
      TIERS.map(async t => {
        const count = await User.countDocuments({ tier: t.name });
        return {
          tier: t.name,
          range: t.range,
          count
        };
      })
    );

    loggerFunction("info", `${route} - Tier counts computed successfully.`);
    loggerFunction("debug", `${route} - counts=${JSON.stringify(tierCounts, null, 2)}`);

    return res.status(200).json({
      message: "Tier counts fetched successfully",
      data: tierCounts
    });
  } catch (error) {
    loggerFunction("error", `${route} - Error: ${error.stack || error.message}`);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * POST /admin/tiers
 * Returns list of users (id, fullName, totalHours) who fall into the given tier.
 * tierName must match one of TIERS.name (case-insensitive).
 */
// router.post("/tiers", adminAuth, async (req, res) => {
//   const route = "POST /admin/tiers";
//   try {
//     const tierName = req.body.tierName;
//     loggerFunction("info", `${route} - API execution started. userId=${req.user._id} tier=${tierName}`);

//     if (!tierName) {
//       return res.status(400).json({ message: "tierName is required" });
//     }

//     // Find matching tier (case-insensitive)
//     const tier = TIERS.find(t => t.name.toLowerCase() === tierName.toLowerCase());
//     if (!tier) {
//       return res.status(400).json({ message: "Invalid tier name" });
//     }

//     // Aggregation: compute total hours per volunteer, then filter by tier range,
//     // and lookup user info for each volunteerId.
//     const pipeline = [
//       { $match: { status: "approved" } },
//       {
//         $group: {
//           _id: "$volunteerId",
//           totalHours: { $sum: "$hours" }
//         }
//       },
//       // Filter by tier range
//       {
//         $match:
//           tier.max === null ? { totalHours: { $gte: tier.min } } : { totalHours: { $gte: tier.min, $lte: tier.max } }
//       },
//       // Lookup user details
//       {
//         $lookup: {
//           from: "users", // make sure collection name matches (usually 'users')
//           localField: "_id",
//           foreignField: "_id",
//           as: "user"
//         }
//       },
//       { $unwind: "$user" },
//       {
//         $project: {
//           _id: 0,
//           userId: "$user._id",
//           fullName: { $ifNull: ["$user.profile.fullName", ""] },
//           email: "$user.email",
//           totalHours: 1
//         }
//       },
//       { $sort: { fullName: 1 } } // alphabetical
//     ];

//     const rows = await VolunteerHours.aggregate(pipeline);

//     loggerFunction("info", `${route} - Found ${rows.length} users for tier=${tier.name}`);
//     loggerFunction("debug", `${route} - sample=${JSON.stringify(rows.slice(0, 5), null, 2)}`);

//     return res.status(200).json({
//       message: `Users in tier ${tier.name} fetched successfully`,
//       data: rows
//     });
//   } catch (error) {
//     loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
//     return res.status(500).json({ message: "Server error", error: error.message });
//   }
// });

/**
 * POST /admin/tiers
 * Fetch users who belong to a specific tier (from the saved tier field).
 */
router.post("/tiers", async (req, res) => {
  const route = "POST /admin/tiers";
  try {
    const tierName = req.body.tierName;
    // loggerFunction("info", `${route} - API execution started. userId=${req.user._id} tier=${tierName}`);

    if (!tierName) {
      return res.status(400).json({ message: "tierName is required" });
    }

    const tier = TIERS.find(t => t.name.toLowerCase() === tierName.toLowerCase());
    if (!tier) {
      return res.status(400).json({ message: "Invalid tier name" });
    }

    // ✅ Pagination params
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // 1️⃣ Count users for pagination
    const totalUsers = await User.countDocuments({ tier: tier.name });

    if (totalUsers === 0) {
      return res.status(200).json({
        message: "No users in this tier",
        page,
        totalUsers: 0,
        totalPages: 0,
        data: []
      });
    }

    // 2️⃣ Fetch paginated users
    const users = await User.find(
      { tier: tier.name },
      {
        _id: 1,
        email: 1,
        "profile.firstName": 1,
        "profile.lastName": 1
      }
    )
      .skip(skip)
      .limit(limit)
      .lean();

    const userIds = users.map(u => u._id);

    // 2️⃣ Compute approved hours for these users
    const approvedHours = await VolunteerHours.aggregate([
      { $match: { status: "approved", volunteerId: { $in: userIds } } },
      {
        $group: {
          _id: "$volunteerId",
          totalApprovedHours: { $sum: "$hours" }
        }
      }
    ]);

    // Convert to map for quick lookup
    const hoursMap = {};
    approvedHours.forEach(h => {
      hoursMap[h._id.toString()] = h.totalApprovedHours;
    });

    // 3️⃣ Combine user + approved hours
    const result = users
      .map(u => ({
        userId: u._id,
        email: u.email,
        // fullName: u.profile.fullName || "",
        firstName: u.profile.firstName || "",
        lastName: u.profile.lastName || "",
        totalApprovedHours: hoursMap[u._id.toString()] || 0
      }))
      // 4️⃣ Sort by approved hours DESC
      .sort((a, b) => b.totalApprovedHours - a.totalApprovedHours);

    return res.status(200).json({
      message: `Users in tier '${tier.name}' fetched successfully`,
      page,
      limit,
      totalUsers,
      totalPages: Math.ceil(totalUsers / limit),
      data: result
    });
  } catch (error) {
    loggerFunction("error", `${route} - Error: ${error.stack || error.message}`);
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
      // fullName: user.profile?.fullName || "",
      firstName: user.profile?.firstName || "",
      lastName: user.profile?.lastName || "",
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

// ============================================================
// 📊 API 1: Volunteer Age Distribution (Bar Chart Data)
// ============================================================
router.get("/analytics/age-distribution", adminAuth, async (req, res) => {
  const route = "GET /analytics/age-distribution";
  try {
    loggerFunction("info", `${route} - API execution started`);

    // Fetch all volunteers with dateOfBirth
    const volunteers = await User.find({
      role: "volunteer",
      "profile.dateOfBirth": { $exists: true, $ne: null }
    }).select("profile.dateOfBirth");

    loggerFunction("debug", `${route} - Found ${volunteers.length} volunteers with dateOfBirth`);

    // Initialize age group counters
    const ageGroups = {
      "9-13": 0,
      "14-18": 0,
      "19-25": 0,
      "26-50": 0,
      "51+": 0
    };

    const currentDate = new Date();

    // Calculate age and categorize
    volunteers.forEach(volunteer => {
      const birthDate = new Date(volunteer.profile.dateOfBirth);
      let age = currentDate.getFullYear() - birthDate.getFullYear();

      // Adjust age if birthday hasn't occurred yet this year
      const monthDiff = currentDate.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && currentDate.getDate() < birthDate.getDate())) {
        age--;
      }

      // Categorize by age group
      if (age >= 9 && age <= 13) {
        ageGroups["9-13"]++;
      } else if (age >= 14 && age <= 18) {
        ageGroups["14-18"]++;
      } else if (age >= 19 && age <= 25) {
        ageGroups["19-25"]++;
      } else if (age >= 26 && age <= 50) {
        ageGroups["26-50"]++;
      } else if (age >= 51) {
        ageGroups["51+"]++;
      }
    });

    loggerFunction("info", `${route} - Age distribution calculated successfully`);
    loggerFunction("debug", `${route} - Distribution: ${JSON.stringify(ageGroups)}`);

    // Format response for bar chart
    const response = {
      labels: ["9-13", "14-18", "19-25", "26-50", "51+"],
      data: [ageGroups["9-13"], ageGroups["14-18"], ageGroups["19-25"], ageGroups["26-50"], ageGroups["51+"]],
      totalVolunteers: volunteers.length
    };

    loggerFunction("info", `${route} - Response sent successfully`);
    res.json(response);
  } catch (error) {
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ============================================================
// 📊 API: Hours by Service Category (Pie Chart Data)
// ============================================================
router.get("/analytics/hours-by-category", adminAuth, async (req, res) => {
  const route = "GET /analytics/hours-by-category";
  try {
    loggerFunction("info", `${route} - API execution started`);

    // Fetch all approved volunteer hours
    const approvedHours = await VolunteerHours.find({ status: "approved" }).select("serviceType hours");

    loggerFunction("debug", `${route} - Found ${approvedHours.length} approved hour entries`);

    // Define the label mapping (normalize service types)
    const labelMapping = {
      "NEST4US Service Projects": "Service Projects",
      "NEST4US Community Events": "Community Events",
      "NEST4US Food Rescues": "Food Rescues",
      "NEST Tutors": "NEST Tutors",
      "NEST4US Notes of Kindness": "Notes of Kindness",
      "NEST4US Workshops": "Workshops",
      "NEST4US Donations": "Donations",
      Others: "Other"
    };

    // Define the desired order
    const categoryOrder = [
      "Service Projects",
      "Community Events",
      "Food Rescues",
      "NEST Tutors",
      "Notes of Kindness",
      "Workshops",
      "Donations",
      "Other"
    ];

    // Initialize category data
    const categoryStats = {};
    categoryOrder.forEach(cat => {
      categoryStats[cat] = { hours: 0, count: 0 };
    });

    let totalHours = 0;

    // Aggregate hours by normalized category
    approvedHours.forEach(entry => {
      const normalizedCategory = labelMapping[entry.serviceType] || "Other";

      if (categoryStats[normalizedCategory]) {
        categoryStats[normalizedCategory].hours += entry.hours || 0;
        categoryStats[normalizedCategory].count += 1;
        totalHours += entry.hours || 0;
      }
    });

    loggerFunction("debug", `${route} - Normalized category stats: ${JSON.stringify(categoryStats)}`);
    loggerFunction("info", `${route} - Total hours across all categories: ${totalHours}`);

    // Build response arrays in the specified order
    const labels = [];
    const data = [];
    const counts = [];
    const categories = [];

    categoryOrder.forEach(category => {
      const stats = categoryStats[category];
      // Include ALL categories, even with 0 hours
      labels.push(category);
      data.push(stats.hours);
      counts.push(stats.count);
      categories.push({
        name: category,
        hours: stats.hours,
        count: stats.count,
        percentage: totalHours > 0 ? ((stats.hours / totalHours) * 100).toFixed(1) : "0.0"
      });
    });

    loggerFunction("info", `${route} - Category data processed successfully`);

    const response = {
      labels: labels,
      data: data,
      counts: counts,
      totalHours: totalHours,
      categories: categories
    };

    loggerFunction("info", `${route} - Response sent successfully`);
    loggerFunction("debug", `${route} - Final response: ${JSON.stringify(response)}`);

    res.json(response);
  } catch (error) {
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ============================================================
// 📊 API: Combined Analytics Dashboard
// ============================================================
router.get("/analytics/dashboard", adminAuth, async (req, res) => {
  const route = "GET /analytics/dashboard";
  try {
    loggerFunction("info", `${route} - API execution started`);

    // ========== AGE DISTRIBUTION ==========
    const volunteers = await User.find({
      role: "volunteer",
      "profile.dateOfBirth": { $exists: true, $ne: null }
    }).select("profile.dateOfBirth");

    loggerFunction("debug", `${route} - Found ${volunteers.length} volunteers with dateOfBirth`);

    const ageGroups = {
      "9-13": 0,
      "14-18": 0,
      "19-25": 0,
      "26-50": 0,
      "51+": 0
    };

    const currentDate = new Date();
    volunteers.forEach(volunteer => {
      const birthDate = new Date(volunteer.profile.dateOfBirth);
      let age = currentDate.getFullYear() - birthDate.getFullYear();
      const monthDiff = currentDate.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && currentDate.getDate() < birthDate.getDate())) {
        age--;
      }

      if (age >= 9 && age <= 13) ageGroups["9-13"]++;
      else if (age >= 14 && age <= 18) ageGroups["14-18"]++;
      else if (age >= 19 && age <= 25) ageGroups["19-25"]++;
      else if (age >= 26 && age <= 50) ageGroups["26-50"]++;
      else if (age >= 51) ageGroups["51+"]++;
    });

    loggerFunction("info", `${route} - Age distribution calculated successfully`);

    // ========== SERVICE CATEGORIES ==========
    const approvedHours = await VolunteerHours.find({ status: "approved" }).select("serviceType hours");

    loggerFunction("debug", `${route} - Found ${approvedHours.length} approved hour entries`);

    const labelMapping = {
      "NEST4US Service Projects": "Service Projects",
      "NEST4US Community Events": "Community Events",
      "NEST4US Food Rescues": "Food Rescues",
      "NEST Tutors": "NEST Tutors",
      "NEST4US Notes of Kindness": "Notes of Kindness",
      "NEST4US Workshops": "Workshops",
      "NEST4US Donations": "Donations",
      Others: "Other"
    };

    const categoryOrder = [
      "Service Projects",
      "Community Events",
      "Food Rescues",
      "NEST Tutors",
      "Notes of Kindness",
      "Workshops",
      "Donations",
      "Other"
    ];

    const categoryStats = {};
    categoryOrder.forEach(cat => {
      categoryStats[cat] = { hours: 0, count: 0 };
    });

    let totalHours = 0;

    approvedHours.forEach(entry => {
      const normalizedCategory = labelMapping[entry.serviceType] || "Other";
      if (categoryStats[normalizedCategory]) {
        categoryStats[normalizedCategory].hours += entry.hours || 0;
        categoryStats[normalizedCategory].count += 1;
        totalHours += entry.hours || 0;
      }
    });

    loggerFunction("debug", `${route} - Normalized category stats: ${JSON.stringify(categoryStats)}`);
    loggerFunction("info", `${route} - Total service hours: ${totalHours}`);

    const categoryLabels = [];
    const categoryData = [];
    const categoryCounts = [];
    const categories = [];

    categoryOrder.forEach(category => {
      const stats = categoryStats[category];
      // Include ALL categories, even with 0 hours
      categoryLabels.push(category);
      categoryData.push(stats.hours);
      categoryCounts.push(stats.count);
      categories.push({
        name: category,
        hours: stats.hours,
        count: stats.count,
        percentage: totalHours > 0 ? ((stats.hours / totalHours) * 100).toFixed(1) : "0.0"
      });
    });

    loggerFunction("info", `${route} - Dashboard data compiled successfully`);

    const response = {
      ageDistribution: {
        labels: ["9-13", "14-18", "19-25", "26-50", "51+"],
        data: [ageGroups["9-13"], ageGroups["14-18"], ageGroups["19-25"], ageGroups["26-50"], ageGroups["51+"]],
        totalVolunteers: volunteers.length
      },
      serviceCategories: {
        labels: categoryLabels,
        data: categoryData,
        counts: categoryCounts,
        totalHours: totalHours,
        categories: categories
      }
    };

    loggerFunction("info", `${route} - Response sent successfully`);
    loggerFunction("debug", `${route} - Final response: ${JSON.stringify(response)}`);

    res.json(response);
  } catch (error) {
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
module.exports = router;
