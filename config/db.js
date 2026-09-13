const mongoose = require("mongoose");
const dns = require("dns");

// Force Node's internal DNS resolver to use Google + Cloudflare DNS.
// Fixes "querySrv ECONNREFUSED" seen on some ISPs (notably Jio) where
// Node's c-ares resolver fails even though the OS's own DNS (nslookup) works fine.
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
