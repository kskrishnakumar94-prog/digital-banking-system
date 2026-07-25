const { query } = require('../config/db');
const logger = require('../utils/logger');

// If a request crashes/hangs before ever responding (server restart mid-
// request, uncaught exception, etc.), its idempotency row would otherwise
// stay "in flight" (status_code NULL) forever, permanently blocking every
// future retry with that key. Past this age, treat it as abandoned and
// let a fresh attempt through instead.
const STALE_IN_FLIGHT_MS = Number(process.env.IDEMPOTENCY_STALE_MS || 60_000);

/**
 * Protects a mutating endpoint (e.g. POST /transfers) against duplicate
 * execution when a client retries a request - which happens routinely in
 * the real world on flaky mobile networks, when a response is lost after
 * the server already committed the change.
 *
 * Contract: the client sends an `Idempotency-Key` header (any client-
 * generated unique string, e.g. a UUID) with the request. Retrying the
 * exact same request with the same key replays the original response
 * instead of re-executing the operation - so a duplicated "transfer $500"
 * request can never result in two transfers.
 *
 * Lifecycle (mirrors the pattern used by Stripe's API):
 *   1. No Idempotency-Key header -> pass through unprotected (the header
 *      is opt-in, not mandatory, so existing API consumers don't break).
 *   2. Key present, never seen before -> insert a placeholder row
 *      (status_code = NULL means "in flight"), then let the request
 *      proceed. The insert's UNIQUE constraint is the concurrency guard:
 *      if two identical requests race each other, only one wins the
 *      insert; the loser is treated as a duplicate immediately, before
 *      either one has even started processing.
 *   3. Key present and already completed (status_code IS NOT NULL) ->
 *      replay the stored response verbatim; the underlying operation
 *      (e.g. the transfer) never runs a second time.
 *   4. Key present but still in flight (a concurrent duplicate request
 *      arrived while the first is still processing) -> respond 409 so
 *      the client knows to wait and check the result, rather than both
 *      requests racing to mutate state.
 */
function requireIdempotencyKey({ optional = true } = {}) {
  return async (req, res, next) => {
    const key = req.headers['idempotency-key'];

    if (!key) {
      if (optional) return next();
      return res.status(400).json({ success: false, message: 'Idempotency-Key header is required for this request.' });
    }
    if (typeof key !== 'string' || key.length > 200) {
      return res.status(400).json({ success: false, message: 'Idempotency-Key must be a string up to 200 characters.' });
    }

    const endpoint = req.baseUrl + req.path;

    try {
      const insertResult = await query(
        `INSERT INTO idempotency_keys (user_id, idempotency_key, endpoint)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, idempotency_key, endpoint) DO NOTHING
         RETURNING id`,
        [req.user.id, key, endpoint]
      );

      const wonTheRace = insertResult.rows.length > 0;

      if (!wonTheRace) {
        // Someone already used this key on this endpoint - look up what happened.
        const { rows } = await query(
          `SELECT id, status_code, response_body, created_at FROM idempotency_keys
           WHERE user_id = $1 AND idempotency_key = $2 AND endpoint = $3`,
          [req.user.id, key, endpoint]
        );
        const existing = rows[0];
        const ageMs = existing ? Date.now() - new Date(existing.created_at).getTime() : Infinity;

        if (!existing) {
          return next(); // shouldn't happen, but never block a request over a race we can't explain
        }
        if (existing.status_code === null && ageMs < STALE_IN_FLIGHT_MS) {
          return res.status(409).json({
            success: false,
            message: 'A request with this Idempotency-Key is still being processed. Please wait and check the result before retrying.',
          });
        }
        if (existing.status_code === null && ageMs >= STALE_IN_FLIGHT_MS) {
          // The original request appears to have crashed/hung without ever
          // responding - reclaim the row and let this attempt run for real.
          await query('DELETE FROM idempotency_keys WHERE id = $1', [existing.id]);
          await query(
            `INSERT INTO idempotency_keys (user_id, idempotency_key, endpoint) VALUES ($1, $2, $3)
             ON CONFLICT (user_id, idempotency_key, endpoint) DO NOTHING`,
            [req.user.id, key, endpoint]
          );
        } else {
          // Completed - replay the original response instead of re-executing.
          return res.status(existing.status_code).json(existing.response_body);
        }
      }

      // We won the race - proceed, but capture whatever response the
      // route handler sends so it can be replayed on a future retry.
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        query(
          `UPDATE idempotency_keys SET status_code = $1, response_body = $2
           WHERE user_id = $3 AND idempotency_key = $4 AND endpoint = $5`,
          [res.statusCode, body, req.user.id, key, endpoint]
        ).catch((err) => logger.error(`Failed to persist idempotency record: ${err.message}`));
        return originalJson(body);
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireIdempotencyKey };
