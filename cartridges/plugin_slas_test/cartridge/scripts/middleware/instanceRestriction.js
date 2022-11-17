'use strict';

/**
 * Middleware to redirect to home page on production instances
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next call in the middleware chain
 * @returns {void}
 */
function redirectProduction(req, res, next) {
    var System = require('dw/system/System');
    var URLUtils = require('dw/web/URLUtils');

    if (System.instanceType === System.PRODUCTION_SYSTEM) {
        res.redirect(URLUtils.url('Home-Show'));
    }
    next();
}

module.exports = {
    redirectProduction: redirectProduction
};
