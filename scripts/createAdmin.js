const mongoose = require("mongoose");
const User = require("../models/User");

const createAdmin = async () => {
  try {
    await mongoose.connect("mongodb+srv://nest4us_user:Zvgi0EmOSKdEY6DD@cluster0.nxavpeg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0");

    const adminExists = await User.findOne({ role: "admin" });
    if (adminExists) {
      console.log("Admin already exists");
      process.exit(0);
    }

    const admin = new User({
      email: "admin@nest4us.org",
      password: "admin123",
      role: "admin",
      profile: {
        firstName: "Admin",
        lastName: "User",
        schoolOrganization: "NEST4US",
        dateOfBirth: new Date("1990-01-01"),
        phoneNumber: "555-0123",
      },
    });

    await admin.save();
    console.log("Admin user created successfully");
    console.log("Email: admin@nest4us.org");
    console.log("Password: admin123");
    process.exit(0);
  } catch (error) {
    console.error("Error creating admin:", error);
    process.exit(1);
  }
};

createAdmin();
