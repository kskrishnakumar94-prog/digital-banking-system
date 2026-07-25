const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    console.log('Running migrations...');
    await pool.query(sql);
    console.log('✅ Migrations applied successfully.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
