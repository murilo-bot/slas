'use strict';

var Logger = require('dw/system/Logger');
var config = require('*/cartridge/scripts/config/SLASConfig');
var helpers = require('*/cartridge/scripts/helpers/slasSessionHelpers');

var viewData = {
    restoreVarsEnabled: config.RESTORE_SESSION_ATTRIBUTES,
    restoredVars: false,
    authSuccess: false
};

/**
 * Middleware validating custom auth credentials
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next call in the middleware chain
 * @returns {void}
 */
function authController(req, res, next) {
    var svcAuth = helpers.getEncodedServiceCredentials(config.SERVICE_IDS.INTERNAL_CONTROLLER);
    var headerAuth = req.httpHeaders.get('x-sf-custom-auth');

    if ((!headerAuth || !svcAuth) || (headerAuth !== svcAuth)) {
        var statusCode = 401;
        // if credentials have not been set, error with status code 501
        if (!svcAuth || !headerAuth) {
            statusCode = 501;
        }
        Logger.error('Error validating service credentials! Please verify "controller.internal.cred" credentials; status code: ' + statusCode);
        res.setStatusCode(statusCode);
        res.json(viewData);
        this.emit('route:Complete', req, res);
    } else {
        viewData.authSuccess = true;
        res.setViewData(viewData);
        next();
    }
}

/**
 * Middleware validating restoration of custom session variables is enabled
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next call in the middleware chain
 * @returns {void}
 */
function validateRestoreSessionVarsEnabled(req, res, next) {
    // if site preference is not enabled, exit early
    if (!config.RESTORE_SESSION_ATTRIBUTES) {
        res.json(viewData);
        this.emit('route:Complete', req, res);
    } else {
        next();
    }
}

module.exports = {
    authController: authController,
    validateRestoreSessionVarsEnabled: validateRestoreSessionVarsEnabled
};
