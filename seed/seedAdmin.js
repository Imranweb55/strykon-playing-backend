// One-time script to create the single admin user in MongoDB.
// Run it with:  node seed/seedAdmin.js
// It reads ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD from .env
// If an admin already exists with that email, it will NOT create a duplicate.

require("dotenv").config();
const connectDB = require("../config/db");
const Admin = require("../models/Admin");

const seedAdmin = async () => {
  await connectDB();

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "Admin";

  const existing = await Admin.findOne({ email });

  if (existing) {
    console.log(
      `Admin with email "${email}" already exists. Skipping creation.`,
    );
    process.exit(0);
  }

  const admin = await Admin.create({ name, email, password });

  console.log("Admin user created successfully:");
  console.log(`  Email: ${admin.email}`);
  console.log(
    `  Password: ${password} (this is the plain password, stored hashed in DB)`,
  );

  process.exit(0);
};

seedAdmin().catch((error) => {
  console.error("Seeding failed:", error.message);
  process.exit(1);
});
