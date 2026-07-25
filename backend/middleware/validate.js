const { validationResult } = require('express-validator');

/**
 * Runs after express-validator chains; short-circuits with 422 if any failed.
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ success: false, errors: errors.array() });
  }
  next();
}

module.exports = validate;
