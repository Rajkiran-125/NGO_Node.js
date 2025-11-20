const express = require("express");
const multer = require("multer");
const path = require("path");
const { body, validationResult } = require("express-validator");
const { auth } = require("../middleware/auth");
const VolunteerHours = require("../models/VolunteerHours");
const User = require("../models/User");
const router = express.Router();
const loggerFunction = require("../utils/loggerFunction");

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
    // body("firstName").notEmpty(),
    // body("lastName").notEmpty(),
    body("fullName").notEmpty(),
    // body("schoolOrganization").notEmpty(),
    body("activityName").notEmpty(),
    body("serviceDate").isISO8601(),
    body("serviceType").isIn([
      "NEST4US Service Projects",
      "NEST4US Community Events",
      "NEST4US Food Rescues",
      "NEST4US Tutors",
      "NEST4US Notes of Kindness",
      "NEST4US Workshops",
      "NEST4US Donations",
      "Others"
    ]),
    body("hours").isFloat({ min: 0.1 }),
    body("description").notEmpty()
  ],
  async (req, res) => {
    const route = "POST /submit";
    try {
      loggerFunction("info", `${route} - API execution started. userId=${req.user._id}`);
      loggerFunction("debug", `${route} - userId=${req.user._id}, Incoming request body: ${JSON.stringify(req.body)}`);
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        loggerFunction(
          "warn",
          `${route} - Validation failed. userId=${req.user._id} errors=${JSON.stringify(errors.array())}`
        );
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        fullName,
        // firstName,
        // lastName,
        // schoolOrganization,
        activityName,
        serviceDate,
        serviceType,
        hours,
        description,
        isHistorical
      } = req.body;

      const volunteerHours = new VolunteerHours({
        volunteerId: req.user._id,
        // firstName,
        // lastName,
        fullName,
        // schoolOrganization,
        activityName,
        serviceDate: new Date(serviceDate),
        serviceType,
        hours: parseFloat(hours),
        description,
        proofOfService: req.file ? req.file.filename : null,
        isHistorical: isHistorical === "true"
      });

      await volunteerHours.save();

      loggerFunction("info", `${route} - Response sent successfully.`);
      loggerFunction(
        "debug",
        `${route} - Volunteer hours submitted successfully. submissionId=${volunteerHours._id} userId=${req.user._id}`
      );
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
      loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Get volunteer hours history
router.get("/history", auth, async (req, res) => {
  const route = "GET /history";
  try {
    loggerFunction("info", `${route} - API execution started. userId=${req.user._id}`);
    loggerFunction("debug", `${route} - userId=${req.user._id}, Incoming Query: ${JSON.stringify(req.query)}`);
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

    loggerFunction("info", `${route} - Response sent successfully.`);
    loggerFunction(
      "debug",
      `${route} - Response sent successfully. userId=${req.user._id}, Data=${JSON.stringify(hours)}`
    );
    res.json(hours);
  } catch (error) {
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update volunteer hours (before approval)
router.put("/:id", auth, upload.single("proofOfService"), async (req, res) => {
  const route = "PUT /:id";
  try {
    loggerFunction("info", `${route} - API execution started. userId=${req.user._id}`);
    loggerFunction(
      "debug",
      `${route} - userId= ${req.user?._id}, Params: ${JSON.stringify(
        req.params
      )}, Incoming request body=${JSON.stringify(req.body)}`
    );
    const hoursEntry = await VolunteerHours.findOne({
      _id: req.params.id,
      volunteerId: req.user._id,
      status: "pending"
    });

    if (!hoursEntry) {
      loggerFunction("warn", `${route} - Hours entry not found or already processed for ID ${req.params.id}`);
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

    loggerFunction("info", `${route} - Response sent successfully.`);
    loggerFunction(
      "debug",
      `${route} - Hours entry updated successfully. userId=${req.user._id}, Data=${JSON.stringify(updatedEntry)}`
    );
    res.json({
      message: "Hours entry updated successfully",
      entry: updatedEntry
    });
  } catch (error) {
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Export volunteer hours
router.get("/export", auth, async (req, res) => {
  const route = "GET /export";
  try {
    loggerFunction("info", `${route} - API execution started. userId=${req.user._id}`);
    loggerFunction("debug", `${route} - userId= ${req.user?._id}, Incoming Query: ${JSON.stringify(req.query)}`);
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
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// GET single record for edit (pre-fill)
router.get("/:id", auth, async (req, res) => {
  const route = "GET /:id";
  try {
    loggerFunction("info", `${route} - API execution started. Id=${req.params.id}`);
    loggerFunction("debug", `${route} - Incoming request. Id=${req.params.id}, userId=${req.user._id}`);
    const { id } = req.params;

    // basic ObjectId guard (optional)
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      loggerFunction("warn", `${route} - Invalid id provided. Id=${id}`);
      return res.status(400).json({ message: "Invalid id" });
    }

    const entry = await VolunteerHours.findById(id)
      .populate("volunteerId", "email fullName") // adjust as needed
      .populate("reviewedBy", "fullName")
      .lean();

    if (!entry) {
      loggerFunction("warn", `${route} - Volunteer hours not found. Id=${id}`);
      return res.status(404).json({ message: "Volunteer hours not found" });
    }

    // Only owner or admin can fetch for edit
    const isOwner =
      entry.volunteerId && entry.volunteerId._id
        ? entry.volunteerId._id.toString() === req.user._id.toString()
        : entry.volunteerId?.toString() === req.user._id.toString();

    const isAdmin = req.user.role === "admin" || req.user.isAdmin === true;

    if (!isOwner && !isAdmin) {
      loggerFunction(
        "warn",
        `${route} - Forbidden access attempt. Id=${id} userId=${req.user._id} isOwner=${isOwner} isAdmin=${isAdmin}`
      );
      return res.status(403).json({ message: "Forbidden" });
    }

    loggerFunction("info", `${route} - Response sent successfully.`);
    loggerFunction("debug", `${route} - Response body. Id=${id} Data=${JSON.stringify(entry)}`);
    return res.json({ data: entry });
  } catch (error) {
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// PATCH partial update (owner edits pending OR admin updates status)
// Accepts JSON or multipart/form-data with optional proofOfService file
router.patch(
  "/:id",
  auth,
  upload.single("proofOfService"),
  [
    // optional validators (only validate if present)
    body("serviceDate").optional().isISO8601().withMessage("Invalid date"),
    body("serviceType")
      .optional()
      .isIn([
        "Service Projects",
        "Community Events",
        "Food Rescues",
        "NEST Tutors",
        "Notes of Kindness",
        "Workshops",
        "Donations",
        "Other"
      ])
      .withMessage("Invalid serviceType"),
    body("hours").optional().isFloat({ min: 0.1 }).withMessage("Hours must be a number"),
    body("status").optional().isIn(["pending", "approved", "rejected"]).withMessage("Invalid status"),
    // body("firstName").optional().notEmpty(),
    // body("lastName").optional().notEmpty(),
    body("fullName").optional().notEmpty(),
    body("activityName").optional().notEmpty(),
    // body("schoolOrganization").optional().notEmpty(),
    body("description").optional().notEmpty()
  ],
  async (req, res) => {
    const route = "PATCH /:id";
    try {
      loggerFunction("info", `${route} - API execution started. Id=${req.params.id}`);
      loggerFunction(
        "debug",
        `${route} - Incoming request. Id=${req.params.id}, userId=${req.user._id}, body=${JSON.stringify({
          ...req.body,
          proofOfService: req.file ? "(file uploaded)" : undefined
        })}`
      );
      const { id } = req.params;

      if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
        loggerFunction("warn", `${route} - Invalid id provided. Id=${id}`);
        return res.status(400).json({ message: "Invalid id" });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        loggerFunction("warn", `${route} - Validation failed. Id=${id} errors=${JSON.stringify(errors.array())}`);
        return res.status(400).json({ errors: errors.array() });
      }

      const entry = await VolunteerHours.findById(id);
      if (!entry) {
        loggerFunction("warn", `${route} - Hours entry not found. Id=${id}`);
        return res.status(404).json({ message: "Hours entry not found" });
      }
      loggerFunction("debug", `${route} - Hours entry found. Id=${id} Data=${JSON.stringify(entry)}`);

      const isOwner = entry.volunteerId && entry.volunteerId.toString() === req.user._id.toString();
      const isAdmin = req.user.role === "admin" || req.user.isAdmin === true;

      // Owners can only edit their own entries when status is "pending"
      if (!isAdmin) {
        if (!isOwner) {
          loggerFunction(
            "warn",
            `${route} - Forbidden update attempt. Id=${id} requester=${req.user._id} reason=not_owner`
          );
          return res.status(403).json({ message: "Forbidden" });
        }
        if (entry.status !== "pending") {
          loggerFunction(
            "warn",
            `${route} - Owner attempted to update non-pending entry. Id=${id} requester=${req.user._id} currentStatus=${entry.status}`
          );
          return res.status(400).json({ message: "Only pending entries can be updated by owner" });
        }
      }

      // Build updates only from allowed fields
      const allowed = [
        // "firstName",
        // "lastName",
        "fullName",
        // "schoolOrganization",
        "activityName",
        "serviceDate",
        "serviceType",
        "hours",
        "description",
        "isHistorical",
        "rejectionReason"
        // status handled below
      ];

      const updates = {};
      for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(req.body, key)) {
          // convert types where appropriate
          if (key === "serviceDate") updates.serviceDate = new Date(req.body.serviceDate);
          else if (key === "hours") updates.hours = parseFloat(req.body.hours);
          else if (key === "isHistorical")
            updates.isHistorical = req.body.isHistorical === "true" || req.body.isHistorical === true;
          else updates[key] = req.body[key];
        }
      }

      // Handle uploaded file
      if (req.file) {
        loggerFunction("debug", `${route} - File uploaded. Id=${id} filename=${req.file.filename}`);
        updates.proofOfService = req.file.filename;
      }

      // Handle status changes:
      // - Owner cannot change status (unless you want to allow), admin can
      if (req.body.status !== undefined) {
        const requestedStatus = req.body.status;
        const validStatus = ["pending", "approved", "rejected"];
        if (!validStatus.includes(requestedStatus)) {
          loggerFunction("warn", `${route} - Invalid status provided. Id=${id} status=${requestedStatus}`);
          return res.status(400).json({ message: "Invalid status" });
        }

        if (!isAdmin) {
          loggerFunction(
            "warn",
            `${route} - Non-admin attempted to change status. Id=${id} requester=${req.user._id} status=${requestedStatus}`
          );
          // If you want owners to be able to set status back to pending, adjust here.
          return res.status(403).json({ message: "Only admins can change status" });
        }

        updates.status = requestedStatus;
        if (requestedStatus === "approved" || requestedStatus === "rejected") {
          updates.reviewedAt = new Date();
          updates.reviewedBy = req.user._id;
          loggerFunction(
            "debug",
            `${route} - Status change will set reviewedAt/reviewedBy. Id=${id} newStatus=${requestedStatus} reviewer=${req.user._id}`
          );
        } else {
          // pending
          updates.reviewedAt = null;
          updates.reviewedBy = null;
          loggerFunction("debug", `${route} - Status set to pending -> clearing review metadata. Id=${id}`);
        }
      }

      // Apply update
      const updated = await VolunteerHours.findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true
      });

      loggerFunction("debug", `${route} - Hours entry updated successfully. Id=${id} Data=${JSON.stringify(updated)}`);
      loggerFunction("info", `${route} - Response sent successfully.`);
      return res.json({
        message: "Hours entry updated successfully",
        entry: updated
      });
    } catch (error) {
      // Multer fileFilter error handling (file type)
      if (error instanceof multer.MulterError || error.message?.includes("Only .png")) {
        loggerFunction("warn", `${route} - Multer/file error. Id=${req.params.id} error=${error.message}`);
        return res.status(400).json({ message: error.message });
      }
      loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

module.exports = router;
