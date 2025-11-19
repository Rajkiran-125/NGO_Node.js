const mongoose = require("mongoose");

const volunteerHoursSchema = new mongoose.Schema({
  volunteerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  // firstName: { type: String, required: true },
  // lastName: { type: String, required: true },
  fullName: { type: String, required: true },
  schoolOrganization: { type: String, required: true },
  activityName: { type: String, required: true },
  serviceDate: { type: Date, required: true },
  serviceType: {
    type: String,
    enum: [
      "Service Projects",
      "Community Events",
      "Food Rescues",
      "NEST Tutors",
      "Notes of Kindness",
      "Workshops",
      "Donations",
      "Other"
    ],
    required: true
  },
  hours: { type: Number, required: true },
  description: { type: String, required: true },
  proofOfService: String,
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },
  rejectionReason: String,
  isHistorical: { type: Boolean, default: false },
  submittedAt: { type: Date, default: Date.now },
  reviewedAt: Date,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
});

module.exports = mongoose.model("VolunteerHours", volunteerHoursSchema);
