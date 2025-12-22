function getEmptyProfileFields(user) {
  const emptyFields = [];

  // Email
  if (!user.email) {
    emptyFields.push("email");
  }

  const profile = user.profile || {};

  // Required profile fields
  const REQUIRED_PROFILE_FIELDS = [
    "firstName",
    "lastName",
    "profilePicture",
    "schoolOrganization",
    "dateOfBirth",
    "phoneNumber"
  ];

  for (const field of REQUIRED_PROFILE_FIELDS) {
    if (!profile[field]) {
      emptyFields.push(field);
    }
  }

  // Location
  const location = profile.location || {};
  if (!location.state) emptyFields.push("location.state");
  if (!location.country) emptyFields.push("location.country");

  // Causes of Interest (array)
  if (!Array.isArray(profile.causesOfInterest) || profile.causesOfInterest.length === 0) {
    emptyFields.push("causesOfInterest");
  }

  return emptyFields;
}

module.exports = { getEmptyProfileFields };
