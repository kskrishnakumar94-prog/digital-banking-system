/**
 * Seeds the database with demo users so you can test login, dashboard,
 * and transfers immediately without registering manually.
 *
 * Run with: npm run seed
 *
 * Demo accounts created (password for all: Password123):
 *   alice@example.com  - regular customer
 *   bob@example.com    - regular customer
 *   admin@example.com  - admin role (can view /api/fraud/admin/alerts)
 */
const bcrypt = require('bcryptjs');
const { pool, query } = require('./db');
const AccountModel = require('../models/accountModel');

const DEMO_PASSWORD = 'Password123';

const demoUsers = [
  { fullName: 'Alice Johnson', email: 'alice@example.com', phone: '+911234567890', role: 'customer', openingBalance: 150000 },
  { fullName: 'Bob Smith', email: 'bob@example.com', phone: '+911234567891', role: 'customer', openingBalance: 75000 },
  { fullName: 'Admin User', email: 'admin@example.com', phone: '+911234567892', role: 'admin', openingBalance: 0 },
];

async function seed() {
  try {
    console.log('Seeding database with demo data...');
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

    for (const demo of demoUsers) {
      const existing = await query('SELECT id FROM users WHERE email = $1', [demo.email]);
      if (existing.rows.length > 0) {
        console.log(`- Skipping ${demo.email} (already exists)`);
        continue;
      }

      const { rows } = await query(
        `INSERT INTO users (full_name, email, phone, password_hash, role)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [demo.fullName, demo.email, demo.phone, passwordHash, demo.role]
      );
      const userId = rows[0].id;

      const account = await AccountModel.createForUser(userId, 'savings');

      if (demo.openingBalance > 0) {
        await query('UPDATE accounts SET balance = $1 WHERE id = $2', [demo.openingBalance, account.id]);
      }

      console.log(`- Created ${demo.email} | account ${account.account_number} | balance ${demo.openingBalance}`);
    }

    console.log('\n✅ Seed complete. Log in with any demo email above and password: Password123');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seed();
