const express = require("express");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const loggerFunction = require("../utils/loggerFunction");
// const crypto = require("crypto");
// const nodemailer = require("nodemailer");
const sgMail = require("@sendgrid/mail");
const axios = require("axios");
const { renderEmailTemplate } = require("../utils/renderEmailTemplate");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Generate unique referral code
// const generateReferralCode = () => {
//   return Math.random().toString(36).substring(2, 8).toUpperCase();
// };

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, "../uploads/userProfilePictures");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
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

router.post("/register", upload.single("profilePicture"), async (req, res) => {
  const route = "POST /register";
  try {
    loggerFunction("info", `${route} - API execution started.`);

    const {
      email,
      password,
      firstName,
      lastName,
      // fullName,
      schoolOrganization,
      dateOfBirth,
      phoneNumber,
      state,
      country,
      causesOfInterest
      // referredBy
    } = req.body;

    loggerFunction("debug", `${route} - Incoming data: email=${email}`);

    if (!req.file) {
      return res.status(400).json({ message: "Profile picture is required" });
    }

    const requiredFields = {
      email,
      password,
      // fullName,
      firstName,
      lastName,
      schoolOrganization,
      dateOfBirth,
      phoneNumber,
      state,
      country,
      causesOfInterest
    };

    for (const [key, value] of Object.entries(requiredFields)) {
      if (!value || value === "") {
        return res.status(400).json({ message: `${key} is required` });
      }
    }

    // if (!location.state || !location.country) {
    //   return res.status(400).json({ message: "Location (state and country) is required" });
    // }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      loggerFunction("warn", `${route} - User already exists: ${email}`);
      return res.status(400).json({ message: "User already exists" });
    }

    // const referralCode = generateReferralCode();

    // ✅ Handle uploaded image
    let profilePicturePath = null;
    // if (req.file) {
    profilePicturePath = `/uploads/userProfilePictures/${req.file.filename}`;
    loggerFunction("info", `${route} - Image uploaded at ${profilePicturePath}`);
    // }

    // ✅ Create new user
    const user = new User({
      email,
      password,
      profile: {
        firstName,
        lastName,
        // fullName,
        schoolOrganization,
        dateOfBirth,
        phoneNumber,
        location: {
          state: state,
          country: country
        },
        profilePicture: profilePicturePath,
        // causesOfInterest: causesOfInterest ? JSON.parse(causesOfInterest) : []
        causesOfInterest: causesOfInterest
      }
      // referralCode,
      // referredBy
    });

    // ✅ Handle referral tracking
    // if (referredBy) {
    //   const referrer = await User.findOne({ referralCode: referredBy });
    //   if (referrer) {
    //     referrer.referralCount += 1;
    //     if (referrer.referralCount >= 5 && !referrer.badges.includes("Social Butterfly")) {
    //       referrer.badges.push("Social Butterfly");
    //     }
    //     await referrer.save();
    //   }
    // }

    await user.save();

    const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET || "fallback_secret", {
      expiresIn: "1d"
    });

    loggerFunction("info", `${route} - User registered successfully.`);

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
    loggerFunction("error", `${route} - Error occurred: ${error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

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
      // if (!user || !(await user.comparePassword(password))) {
      //   loggerFunction("warn", `${route} - Invalid login attempt for email=${email}`);
      //   return res.status(401).json({ message: "Invalid credentials" });
      // }
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // ❗ If user created with Google, block normal login
      if (user.googleId && !user.password) {
        return res.status(400).json({
          message: "This account was created using Google. Please sign in with Google."
        });
      }

      // Normal login
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        loggerFunction("warn", `${route} - Invalid password attempt for email=${email}`);
        return res.status(400).json({ message: "Invalid password" });
      }

      // 🔥 Only allow volunteers
      if (user.role !== "volunteer") {
        return res.status(403).json({ message: "Not allowed — Volunteers only" });
      }

      const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET || "fallback_secret", {
        expiresIn: "1d"
      });

      loggerFunction("info", `${route} - Response sent successfully.`);
      loggerFunction("debug", `${route} - Login successful for email=${email}`);
      res.json({
        message: "Volunteer login successful",
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

// Login
router.post(
  "/admin/login",
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
      // if (!user || !(await user.comparePassword(password))) {
      //   loggerFunction("warn", `${route} - Invalid login attempt for email=${email}`);
      //   return res.status(401).json({ message: "Invalid credentials" });
      // }
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // ❗ If user created with Google, block normal login
      if (user.googleId && !user.password) {
        return res.status(400).json({
          message: "This account was created using Google. Please sign in with Google."
        });
      }

      // Normal login
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        loggerFunction("warn", `${route} - Invalid password attempt for email=${email}`);
        return res.status(400).json({ message: "Invalid password" });
      }

      // 🔥 Only allow admins
      if (user.role !== "admin") {
        return res.status(403).json({ message: "Not allowed — Admins only" });
      }

      const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET || "fallback_secret", {
        expiresIn: "1d"
      });

      loggerFunction("info", `${route} - Response sent successfully.`);
      loggerFunction("debug", `${route} - Login successful for email=${email}`);
      res.json({
        message: "Admin login successful",
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

router.post("/forget-password", [body("email").isEmail()], async (req, res) => {
  const route = "POST /forget-password";

  try {
    loggerFunction("info", `${route} - API execution started.`);

    // Validate request body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      loggerFunction("warn", `${route} - User not found for email=${email}`);
      return res.status(404).json({ message: "User not found" });
    }

    // Generate OTP
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetCodeExpiry = Date.now() + 3600000; // 1 hour

    user.resetPasswordCode = resetCode;
    user.resetPasswordExpires = resetCodeExpiry;
    await user.save({ validateBeforeSave: false });
    const firstName = user.profile?.firstName || "";
    const lastName = user.profile?.lastName || "";

    const displayName = firstName || lastName ? `${firstName} ${lastName}`.trim() : "Volunteer";
    const dynamicHTML = `
        <p>You requested to reset your password.</p>
        <p>Your 6-digit reset code is:</p>
        <h2 style="font-size: 28px; letter-spacing: 3px;">${resetCode}</h2>
        <p>This code will expire in <strong>1 hour</strong>.</p>
        <br/>
        <p>If you did not request this reset, ignore this email.</p>
      `;

    const finalHTML = renderEmailTemplate({
      name: displayName,
      body: dynamicHTML
    });

    // Prepare the SendGrid email
    const msg = {
      to: user.email,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject: process.env.SENDGRID_EMAIL_SUBJECT,
      html: finalHTML
    };

    await sgMail.send(msg);

    loggerFunction("info", `${route} - Reset code email sent to ${user.email}`);

    return res.status(200).json({
      message: "Password reset code sent to your email."
    });
  } catch (error) {
    console.error("SendGrid Error:", error.response?.body || error);
    loggerFunction("error", `${route} - Error: ${error.stack || error.message}`);
    return res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
});

router.post("/reset-password", async (req, res) => {
  const route = "POST /reset-password";
  try {
    loggerFunction("info", `${route} - API execution started.`);
    loggerFunction("debug", `${route} - Incoming request body=${JSON.stringify(req.body)}`);

    const { email, code, newPassword, confirmPassword } = req.body;

    if (!email || !code || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required." });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match." });
    }

    const user = await User.findOne({ email });

    if (!user || user.resetPasswordCode !== code || Date.now() > user.resetPasswordExpires) {
      return res.status(400).json({ message: "Invalid or expired reset code." });
    }

    user.password = newPassword;

    // Clear reset fields after successful reset
    user.resetPasswordCode = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    loggerFunction("info", `${route} - Password reset successfully for userId=${user._id}`);
    res.json({ message: "Password has been reset successfully." });
  } catch (error) {
    loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Google OAuth config
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const GOOGLE_FRONTEND_REDIRECT_URI = process.env.GOOGLE_FRONTEND_REDIRECT_URI;

// 1️⃣ Generate Google login URL
router.get("/google", (req, res) => {
  const url = `https://accounts.google.com/o/oauth2/v2/auth
    ?client_id=${GOOGLE_CLIENT_ID}
    &redirect_uri=${REDIRECT_URI}
    &response_type=code
    &scope=openid%20email%20profile
    &prompt=select_account`.replace(/\s+/g, ""); // remove spaces

  res.redirect(url);
});

// 2️⃣ Google callback → exchange code → get user → save → return JWT
router.get("/google/callback", async (req, res) => {
  try {
    const { code } = req.query;

    // EXCHANGE code → tokens
    const tokenResponse = await axios.post("https://oauth2.googleapis.com/token", {
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code"
    });

    const { id_token } = tokenResponse.data;

    // Decode Google user
    const googleUser = JSON.parse(Buffer.from(id_token.split(".")[1], "base64").toString());

    const email = googleUser.email;
    // const name = googleUser.name;
    const firstName = googleUser.given_name || "";
    const lastName = googleUser.family_name || "";
    const picture = googleUser.picture;

    // 3️⃣ Find or create user in database
    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        email,
        password: null, // password not needed for Google login
        profile: {
          // fullName: name,
          firstName,
          lastName,
          avatar: picture
        },
        authProvider: "google"
      });
    }

    // 4️⃣ Generate your application's JWT
    const appToken = jwt.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1d" });

    // 5️⃣ Redirect to frontend with JWT
    res.redirect(`${GOOGLE_FRONTEND_REDIRECT_URI}?token=${appToken}`);
  } catch (error) {
    console.error("Google OAuth Error:", error.response?.data || error);
    res.status(500).send("Authentication failed");
  }
});

module.exports = router;
