const mongoose = require("mongoose");
const User = require("../models/User");
const VolunteerHours = require("../models/VolunteerHours");

const createSampleData = async () => {
  try {
    await mongoose.connect(
      "mongodb+srv://nest4us_user:Zvgi0EmOSKdEY6DD@cluster0.nxavpeg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
    );

    // Create sample volunteer with approved hours
    const sampleVolunteer = new User({
      email: "john.doe@example.com",
      password: "password123",
      role: "volunteer",
      profile: {
        firstName: "John",
        lastName: "Doe",
        schoolOrganization: "Springfield High School",
        dateOfBirth: new Date("2000-05-15"),
        phoneNumber: "555-0123",
        location: {
          state: "California",
          country: "USA"
        },
        causesOfInterest: ["Education", "Environment", "Community Service"]
      },
      totalHours: 75,
      thisYearHours: 45,
      tier: "Change Catalyst",
      badges: ["Kindness Ambassador"],
      referralCode: "JOHN2024"
    });

    await sampleVolunteer.save();

    // Create some sample approved hours
    const sampleHours = [
      {
        volunteerId: sampleVolunteer._id,
        firstName: "John",
        lastName: "Doe",
        schoolOrganization: "Springfield High School",
        activityName: "Food Bank Volunteering",
        serviceDate: new Date("2024-01-15"),
        serviceType: "Community Events",
        hours: 4,
        description: "Helped sort and distribute food packages to families in need",
        status: "approved",
        submittedAt: new Date("2024-01-16"),
        reviewedAt: new Date("2024-01-17")
      },
      {
        volunteerId: sampleVolunteer._id,
        firstName: "John",
        lastName: "Doe",
        schoolOrganization: "Springfield High School",
        activityName: "Environmental Cleanup",
        serviceDate: new Date("2024-02-20"),
        serviceType: "NEST4US Service Projects",
        hours: 6,
        description: "Participated in beach cleanup initiative, removed plastic waste",
        status: "approved",
        submittedAt: new Date("2024-02-21"),
        reviewedAt: new Date("2024-02-22")
      },
      {
        volunteerId: sampleVolunteer._id,
        firstName: "John",
        lastName: "Doe",
        schoolOrganization: "Springfield High School",
        activityName: "Tutoring Session",
        serviceDate: new Date("2024-03-10"),
        serviceType: "NEST Tutors",
        hours: 3,
        description: "Tutored elementary students in mathematics",
        status: "approved",
        submittedAt: new Date("2024-03-11"),
        reviewedAt: new Date("2024-03-12")
      },
      {
        volunteerId: sampleVolunteer._id,
        firstName: "John",
        lastName: "Doe",
        schoolOrganization: "Springfield High School",
        activityName: "Workshop Organization",
        serviceDate: new Date("2024-04-05"),
        serviceType: "Workshops",
        hours: 5,
        description: "Helped organize and facilitate career guidance workshop for teens",
        status: "pending",
        submittedAt: new Date("2024-04-06")
      }
    ];

    await VolunteerHours.insertMany(sampleHours);

    console.log("Sample volunteer data created successfully!");
    console.log("Sample Volunteer Login:");
    console.log("Email: john.doe@example.com");
    console.log("Password: password123");
    console.log("This volunteer has 75 total hours with some approved and one pending submission.");

    process.exit(0);
  } catch (error) {
    console.error("Error creating sample data:", error);
    process.exit(1);
  }
};

createSampleData();
