const express = require("express");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const loggerFunction = require("../utils/loggerFunction");

// Generate unique referral code
const generateReferralCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

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

// Register
// router.post(
//   "/register",
//   // [
//   //   body("email").isEmail(),
//   //   body("password").isLength({ min: 6 }),
//   //   body("firstName").notEmpty(),
//   //   body("lastName").notEmpty(),
//   //   body("schoolOrganization").notEmpty(),
//   //   body("dateOfBirth").isISO8601(),
//   //   body("phoneNumber").notEmpty(),
//   // ],
//   async (req, res) => {
//     const route = "POST /register";
//     try {
//       loggerFunction("info", `${route} - API execution started.`);
//       loggerFunction("debug", `${route} - Incoming request body=${JSON.stringify(req.body)}`);
//       const errors = validationResult(req);
//       if (!errors.isEmpty()) {
//         loggerFunction("warn", `${route} - Validation failed: ${JSON.stringify(errors.array())}`);
//         return res.status(400).json({ errors: errors.array() });
//       }

//       const {
//         email,
//         password,
//         firstName,
//         lastName,
//         schoolOrganization,
//         dateOfBirth,
//         phoneNumber,
//         location,
//         causesOfInterest,
//         referredBy
//       } = req.body;

//       const existingUser = await User.findOne({ email });
//       if (existingUser) {
//         loggerFunction("warn", `${route} - User already exists. email=${email}`);
//         return res.status(400).json({ message: "User already exists" });
//       }

//       const referralCode = generateReferralCode();

//       const user = new User({
//         email,
//         password,
//         profile: {
//           firstName,
//           lastName,
//           schoolOrganization,
//           dateOfBirth,
//           phoneNumber,
//           location,
//           causesOfInterest: causesOfInterest || []
//         },
//         referralCode,
//         referredBy
//       });

//       // Handle referral
//       if (referredBy) {
//         const referrer = await User.findOne({ referralCode: referredBy });
//         if (referrer) {
//           referrer.referralCount += 1;
//           if (referrer.referralCount >= 5 && !referrer.badges.includes("Social Butterfly")) {
//             referrer.badges.push("Social Butterfly");
//           }
//           await referrer.save();
//         }
//       }

//       await user.save();

//       const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET || "fallback_secret", {
//         expiresIn: "7d"
//       });
//       loggerFunction("debug", `${route} - User registered successfully. email=${user.email}`);
//       loggerFunction("info", `${route} - Response sent successfully.`);
//       res.status(201).json({
//         message: "User registered successfully",
//         token,
//         user: {
//           id: user._id,
//           email: user.email,
//           role: user.role,
//           profile: user.profile
//         }
//       });
//     } catch (error) {
//       loggerFunction("error", `${route} - Error occurred: ${error.stack || error.message}`);
//       res.status(500).json({ message: "Server error", error: error.message });
//     }
//   }
// );
router.post("/register", upload.single("profilePicture"), async (req, res) => {
  const route = "POST /register";
  try {
    loggerFunction("info", `${route} - API execution started.`);

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

    loggerFunction("debug", `${route} - Incoming data: email=${email}`);

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      loggerFunction("warn", `${route} - User already exists: ${email}`);
      return res.status(400).json({ message: "User already exists" });
    }

    const referralCode = generateReferralCode();

    // ✅ Handle uploaded image
    let profilePicturePath = null;
    if (req.file) {
      profilePicturePath = `/uploads/userProfilePictures/${req.file.filename}`;
      loggerFunction("info", `${route} - Image uploaded at ${profilePicturePath}`);
    }

    // ✅ Create new user
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
        profilePicture: profilePicturePath,
        causesOfInterest: causesOfInterest ? JSON.parse(causesOfInterest) : []
      },
      referralCode,
      referredBy
    });

    // ✅ Handle referral tracking
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
