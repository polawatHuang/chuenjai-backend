require("dotenv").config();
const fs   = require("fs");
const path = require("path");

module.exports = async function globalTeardown() {
  const ctxFile = path.join(__dirname, ".test-context.json");
  if (!fs.existsSync(ctxFile)) return;

  const ctx = JSON.parse(fs.readFileSync(ctxFile, "utf-8"));

  const prisma = require("../config/prisma");
  const orgId  = BigInt(ctx.orgId);

  await prisma.alert.deleteMany({ where: { elderly: { organizationId: orgId } } });
  await prisma.medicationLog.deleteMany({ where: { elderly: { organizationId: orgId } } });
  await prisma.medication.deleteMany({ where: { elderly: { organizationId: orgId } } });
  await prisma.disease.deleteMany({ where: { elderly: { organizationId: orgId } } });
  await prisma.riskScore.deleteMany({ where: { elderly: { organizationId: orgId } } });
  await prisma.call.deleteMany({ where: { elderly: { organizationId: orgId } } });
  await prisma.elderly.deleteMany({ where: { organizationId: orgId } });
  await prisma.loginSession.deleteMany({ where: { user: { organizationId: orgId } } });
  await prisma.auditLog.deleteMany({ where: { user: { organizationId: orgId } } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });

  await prisma.$disconnect();
  fs.unlinkSync(ctxFile);

  console.log("[Teardown] Test data cleaned up ✓");
};
