require("dotenv").config();
const bcrypt = require("bcrypt");
const fs     = require("fs");
const path   = require("path");

module.exports = async function globalSetup() {
  const prisma = require("../config/prisma");
  const db     = require("../config/db");

  // ── Create legacy tables if they don't exist ──────────────────────────────
  await db.query(`CREATE TABLE IF NOT EXISTS news (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    content TEXT,
    image_url TEXT,
    source VARCHAR(100),
    source_url TEXT,
    published_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.query(`CREATE TABLE IF NOT EXISTS \`orders\` (
    id INT AUTO_INCREMENT PRIMARY KEY,
    buyer_name VARCHAR(255) NOT NULL,
    buyer_phone VARCHAR(50) NOT NULL,
    buyer_address TEXT,
    item_name VARCHAR(255) NOT NULL,
    item_url TEXT,
    item_point INT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.query(`CREATE TABLE IF NOT EXISTS items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    point INT NOT NULL,
    img_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.query(`CREATE TABLE IF NOT EXISTS lucky_spin_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_name VARCHAR(255),
    winner_name VARCHAR(255),
    winner_phone VARCHAR(50),
    winner_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.query(`CREATE TABLE IF NOT EXISTS phone_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    phone_number VARCHAR(50) NOT NULL,
    report_type VARCHAR(100) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // ── Seed enterprise test data ─────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("Test@1234", 10);

  const org = await prisma.organization.create({
    data: {
      organizationName: "__TEST_ORG__",
      isActive:         true,
      subscriptionPlan: "ENTERPRISE",
      subscriptionEnd:  new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  const user = await prisma.user.create({
    data: {
      organizationId: org.id,
      username:       "test_superadmin",
      passwordHash,
      fullName:       "Test SuperAdmin",
      role:           "SUPER_ADMIN",
      isActive:       true,
    },
  });

  // Write context for test files to read
  const ctx = {
    orgId:    org.id.toString(),
    userId:   user.id.toString(),
    username: "test_superadmin",
    password: "Test@1234",
  };

  fs.writeFileSync(
    path.join(__dirname, ".test-context.json"),
    JSON.stringify(ctx, null, 2)
  );

  await prisma.$disconnect();
  await db.end();

  console.log("[Setup] Test DB seeded ✓");
};
