const { Pool } = require('pg');
require('dotenv').config();

// Managed Postgres providers (Neon, Render Postgres, Supabase, etc.) require
// SSL and typically use a certificate that isn't in Node's default trust
// store for this kind of setup, so we relax certificate verification here.
// Set DB_SSL=true in your deployment's environment variables to enable this;
// leave it unset for local Postgres, which usually doesn't use SSL at all.
const useSSL = process.env.DB_SSL === 'true';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  // 10s rather than the previous 2s - some managed DB hosts (and even some
  // local setups) take longer than 2s to complete the connection handshake,
  // which caused real, confusing timeout errors during local development.
  connectionTimeoutMillis: 10000,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

// Helper to run a query
const query = (text, params) => pool.query(text, params);

// Helper to run a transaction. `callback` receives a client and MUST use
// it (not the pool) for every statement so everything happens on the
// same connection/transaction. Guarantees atomicity: all-or-nothing.
const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool, query, withTransaction };