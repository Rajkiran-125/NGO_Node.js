const express = require("express");
const { adminAuth } = require("../middleware/auth");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const loggerFunction = require("../utils/loggerFunction");

const router = express.Router();

// ============================================================
// 👤 POST /admin/create-admin
// Create a new admin (Admin Only)
// ============================================================
router.post(
  "/create-admin",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("firstName").notEmpty().withMessage("firstName is required"),
    body("lastName").notEmpty().withMessage("lastName is required"),
  ],
  async (req, res) => {
    const route = "POST /admin/create-admin";

    try {
      //   loggerFunction(
      //     "info",
      //     `${route} - API started by userId=${req.user._id}`
      //   );

      // 🔒 Extra safety: only admins can create admins
      //   if (req.user.role !== "admin") {
      //     loggerFunction(
      //       "warn",
      //       `${route} - Forbidden: Non-admin tried to create admin`
      //     );
      //     return res
      //       .status(403)
      //       .json({ message: "Only admins can create new admins" });
      //   }

      // ------------------ Validation ------------------
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        loggerFunction("warn", `${route} - Validation failed`);
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, firstName, lastName, phoneNumber } = req.body;

      // ------------------ Check Existing User ------------------
      const existingUser = await User.findOne({ email });

      if (existingUser) {
        loggerFunction("warn", `${route} - User already exists: ${email}`);
        return res.status(400).json({
          message: "User with this email already exists",
        });
      }

      // ------------------ Create Admin ------------------
      const admin = new User({
        email,
        password, // will be hashed by your pre("save") hook
        role: "admin",
        provider: "local",
        profile: {
          firstName,
          lastName,
          phoneNumber: phoneNumber || "",
          schoolOrganization: "NEST4US",
        },
      });

      await admin.save();

      //   loggerFunction(
      //     "info",
      //     `${route} - Admin created successfully. newAdminId=${admin._id}`
      //   );

      // ------------------ Response ------------------
      res.status(201).json({
        message: "Admin user created successfully",
        admin: {
          id: admin._id,
          email: admin.email,
          role: admin.role,
          firstName: admin.profile.firstName,
          lastName: admin.profile.lastName,
          createdAt: admin.createdAt,
        },
      });
    } catch (error) {
      loggerFunction(
        "error",
        `${route} - Error occurred: ${error.stack || error.message}`
      );
      res.status(500).json({
        message: "Server error",
        error: error.message,
      });
    }
  }
);

module.exports = router;
