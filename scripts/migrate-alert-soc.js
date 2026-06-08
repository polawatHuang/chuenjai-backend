require('dotenv').config();
const db = require('../config/db');

async function migrate() {
  const conn = await db.getConnection();
  try {
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'alerts'
       AND COLUMN_NAME IN ('resolution_notes','escalation_level')`
    );
    const existing = cols.map(c => c.COLUMN_NAME);

    if (!existing.includes('resolution_notes')) {
      await conn.query('ALTER TABLE alerts ADD COLUMN resolution_notes TEXT NULL');
      console.log('✅ Added resolution_notes');
    } else {
      console.log('⏭  resolution_notes already exists');
    }

    if (!existing.includes('escalation_level')) {
      await conn.query('ALTER TABLE alerts ADD COLUMN escalation_level INT NOT NULL DEFAULT 0');
      console.log('✅ Added escalation_level');
    } else {
      console.log('⏭  escalation_level already exists');
    }

    console.log('Migration complete.');
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrate().catch(e => { console.error(e); process.exit(1); });
