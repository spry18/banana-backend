'use strict';
/**
 * Billing module async wrapper — eliminates try/catch boilerplate in controllers.
 * Usage: const asyncHandler = require('../shared/billing.asyncHandler');
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
