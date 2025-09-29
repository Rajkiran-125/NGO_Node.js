const express = require("express");
const multer = require("multer");
const path = require("path");
const { body, validationResult } = require("express-validator");
const { auth } = require("../middleware/auth");
const VolunteerHours = require("../models/VolunteerHours");
const User = require("../models/User");
const router = express.Router();

// Configure multer for proof of service uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/proof/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10000000 }, // 10MB
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

// Submit volunteer hours
router.post(
  "/submit",
  auth,
  upload.single("proofOfService"),
  [
    body("firstName").notEmpty(),
    body("lastName").notEmpty(),
    body("schoolOrganization").notEmpty(),
    body("activityName").notEmpty(),
    body("serviceDate").isISO8601(),
    body("serviceType").isIn([
      "Service Projects",
      "Community Events",
      "Food Rescues",
      "NEST Tutors",
      "Notes of Kindness",
      "Workshops",
      "Donations",
      "Other"
    ]),
    body("hours").isFloat({ min: 0.1 }),
    body("description").notEmpty()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        firstName,
        lastName,
        schoolOrganization,
        activityName,
        serviceDate,
        serviceType,
        hours,
        description,
        isHistorical
      } = req.body;

      const volunteerHours = new VolunteerHours({
        volunteerId: req.user._id,
        firstName,
        lastName,
        schoolOrganization,
        activityName,
        serviceDate: new Date(serviceDate),
        serviceType,
        hours: parseFloat(hours),
        description,
        proofOfService: req.file ? req.file.filename : null,
        isHistorical: isHistorical === "true"
      });

      await volunteerHours.save();

      res.status(201).json({
        message: "Volunteer hours submitted successfully",
        submission: {
          id: volunteerHours._id,
          activityName: volunteerHours.activityName,
          hours: volunteerHours.hours,
          status: volunteerHours.status,
          submittedAt: volunteerHours.submittedAt
        }
      });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Get volunteer hours history
router.get("/history", auth, async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;

    let query = { volunteerId: req.user._id };

    if (startDate && endDate) {
      query.serviceDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (status) {
      query.status = status;
    }

    const hours = await VolunteerHours.find(query).sort({ submittedAt: -1 });

    res.json(hours);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update volunteer hours (before approval)
router.put("/:id", auth, upload.single("proofOfService"), async (req, res) => {
  try {
    const hoursEntry = await VolunteerHours.findOne({
      _id: req.params.id,
      volunteerId: req.user._id,
      status: "pending"
    });

    if (!hoursEntry) {
      return res.status(404).json({ message: "Hours entry not found or already processed" });
    }

    const updates = req.body;
    if (req.file) {
      updates.proofOfService = req.file.filename;
    }

    const updatedEntry = await VolunteerHours.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    });

    res.json({
      message: "Hours entry updated successfully",
      entry: updatedEntry
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Export volunteer hours
router.get("/export", auth, async (req, res) => {
  try {
    const { startDate, endDate, format } = req.query;

    let query = {
      volunteerId: req.user._id,
      status: "approved"
    };

    if (startDate && endDate) {
      query.serviceDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const hours = await VolunteerHours.find(query).sort({ serviceDate: -1 });

    if (format === "json") {
      res.json(hours);
    } else {
      // Return CSV format
      const csvHeaders = "Activity Name,Service Date,Hours,Service Type,Description,Status\n";
      const csvData = hours
        .map(
          entry =>
            `"${entry.activityName}","${entry.serviceDate.toISOString().split("T")[0]}","${entry.hours}","${
              entry.serviceType
            }","${entry.description}","${entry.status}"`
        )
        .join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=volunteer_hours.csv");
      res.send(csvHeaders + csvData);
    }
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// GET single record for edit (pre-fill)
router.get("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    // basic ObjectId guard (optional)
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const entry = await VolunteerHours.findById(id)
      .populate("volunteerId", "email firstName lastName") // adjust as needed
      .populate("reviewedBy", "firstName lastName")
      .lean();

    if (!entry) {
      return res.status(404).json({ message: "Volunteer hours not found" });
    }

    // Only owner or admin can fetch for edit
    const isOwner =
      entry.volunteerId && entry.volunteerId._id
        ? entry.volunteerId._id.toString() === req.user._id.toString()
        : entry.volunteerId?.toString() === req.user._id.toString();

    const isAdmin = req.user.role === "admin" || req.user.isAdmin === true;

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return res.json({ data: entry });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
