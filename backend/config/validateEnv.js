const logger = require('../utils/logger');

// The server cannot run correctly without these - better to refuse to
// start with a clear message than to crash unpredictably later (e.g. a
// missing DB_PASSWORD surfacing as a cryptic connection error only once
// the first request comes in).
const REQUIRED_VARS = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];

// Values from .env.example - if these are still in place, the app will
// "work" but with predictable, publicly-known secrets. Warn loudly rather
// than silently starting up insecure.
const PLACEHOLDER_VALUES = [
  'change_this_to_a_long_random_secret',
  'change_this_to_another_long_random_secret',
  'your_db_password',
];

/**
 * Validates process.env before the app starts listening. Call this once,
 * at the very top of server.js, before anything else touches the database
 * or issues a token.
 */
function validateEnv() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    // Deliberately use console.error here (not the winston logger) since
    // this can fire before logging is fully set up, and we want it to be
    // impossible to miss in a terminal.
    // eslint-disable-next-line no-console
    console.error('\n❌ Cannot start: missing required environment variable(s):');
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error('\n   Copy backend/.env.example to backend/.env and fill these in, then try again.\n');
    process.exit(1);
  }

  const stillPlaceholder = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DB_PASSWORD'].filter((key) =>
    PLACEHOLDER_VALUES.includes(process.env[key])
  );
  if (stillPlaceholder.length > 0) {
    logger.warn(
      `SECURITY WARNING: the following env vars are still set to their .env.example placeholder values: ${stillPlaceholder.join(', ')}. Generate real secrets before deploying anywhere beyond local development.`
    );
  }

  if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
    logger.warn('CORS_ORIGIN is not set in production - defaulting to http://localhost:3000, which is almost certainly wrong for a real deployment.');
  }
}

module.exports = validateEnv;
