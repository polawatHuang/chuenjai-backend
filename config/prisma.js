const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

// Graceful shutdown hooks for PM2 / SIGTERM
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = prisma;
