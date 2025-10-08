const express = require("express");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const router = express.Router();
const loggerFunction = require("../utils/loggerFunction");

// Generate unique referral code
const generateReferralCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// Register
router.post(
  "/register",
  // [
  //   body("email").isEmail(),
  //   body("password").isLength({ min: 6 }),
  //   body("firstName").notEmpty(),
  //   body("lastName").notEmpty(),
  //   body("schoolOrganization").notEmpty(),
  //   body("dateOfBirth").isISO8601(),
  //   body("phoneNumber").notEmpty(),
  // ],
  async (req, res) => {
    const route = "POST /register";
    try {
      loggerFunction("info", `${route} - API execution started.`);
      loggerFunction("debug", `${route} - Incoming request body=${JSON.stringify(req.body)}`);
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        loggerFunction("warn", `${route} - Validation failed: ${JSON.stringify(errors.array())}`);
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        email,
        password,
        firstName,
        lastName,
        schoolOrganization,
        dateOfBirth,
        phoneNumber,
        location,
        causesOfInterest,
        referredBy
      } = req.body;

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        loggerFunction("warn", `${route} - User already exists. email=${email}`);
        return res.status(400).json({ message: "User already exists" });
      }

      const referralCode = generateReferralCode();

      const user = new User({
        email,
        password,
        profile: {
          firstName,
          lastName,
          schoolOrganization,
          dateOfBirth,
          phoneNumber,
          location,
          causesOfInterest: causesOfInterest || []
        },
        referralCode,
        referredBy
      });

      // Handle referral
      if (referredBy) {
        const referrer = await User.findOne({ referralCode: referredBy });
        if (referrer) {
          referrer.referralCount += 1;
          if (referrer.referralCount >= 5 && !referrer.badges.includes("Social Butterfly")) {
            referrer.badges.push("Social Butterfly");
          }
          await referrer.save();
        }
      }

      await user.save();

      const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET || "fallback_secret", {
        expiresIn: "7d"
      });
      loggerFunction("debug", `${route} - User registered successfully. email=${user.email}`);
      loggerFunction("info", `${route} - Response sent successfully.`);
      res.status(201).json({
        message: "User registered successfully",
        token,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          profile: user.profile
        }
      });
    } catch (error) {
      loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Login
router.post(
  "/login",
  // [body("email").isEmail(), body("password").notEmpty()],
  async (req, res) => {
    const route = "POST /login";
    try {
      loggerFunction("info", `${route} - API execution started.`);
      loggerFunction("debug", `${route} - Incoming request body=${JSON.stringify(req.body)}`);
      // console.log("Inside Auth Login");
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        loggerFunction("warn", `${route} - Validation failed: ${JSON.stringify(errors.array())}`);
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      const user = await User.findOne({ email });
      if (!user || !(await user.comparePassword(password))) {
        loggerFunction("warn", `${route} - Invalid login attempt for email=${email}`);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET || "fallback_secret", {
        expiresIn: "7d"
      });

      loggerFunction("info", `${route} - Response sent successfully.`);
      loggerFunction("debug", `${route} - Login successful for email=${email}`);
      res.json({
        message: "Login successful",
        token,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          profile: user.profile,
          totalHours: user.totalHours,
          thisYearHours: user.thisYearHours,
          tier: user.tier,
          badges: user.badges
        }
      });
    } catch (error) {
      loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

module.exports = router;
