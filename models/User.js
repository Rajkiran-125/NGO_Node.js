const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["volunteer", "admin"], default: "volunteer" },
  profile: {
    // firstName: { type: String, required: true },
    // lastName: { type: String, required: true },
    fullName: { type: String, required: true },
    profilePicture: String,
    schoolOrganization: { type: String, required: true },
    dateOfBirth: { type: Date, required: true },
    location: {
      state: String,
      country: String
    },
    phoneNumber: { type: String, required: true },
    causesOfInterest: [String]
  },
  totalHours: { type: Number, default: 0 },
  thisYearHours: { type: Number, default: 0 },
  tier: { type: String, default: "None" },
  badges: [String],
  referralCode: String,
  referredBy: String,
  referralCount: { type: Number, default: 0 },
  notifications: {
    weeklyDigest: { type: Boolean, default: true },
    monthlyDigest: { type: Boolean, default: true },
    approvalNotifications: { type: Boolean, default: true },
    achievementNotifications: { type: Boolean, default: true }
  },
  createdAt: { type: Date, default: Date.now },

  // ✅ For password reset
  resetPasswordCode: String,
  resetPasswordExpires: Date
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

module.exports = mongoose.model("User", userSchema);
