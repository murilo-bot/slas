'use strict';

var server = require('server');
var authController = require('*/cartridge/scripts/middleware/authController');
var helpers = require('*/cartridge/scripts/helpers/slasSessionHelpers');

/**
 * SLASSessionHelper-SaveSession : This endpoint is called in slasAuthHelper
 * This controller is used to restore session attributes after a successful call to the OCAPI session bridge
 * which creates a new session and clears existing session.custom and session.privacy attributes.
 * @name SLASSessionHelper-SaveSession
 * @function
 * @memberof SLASSessionHelper
 * @param {middleware} - server.middleware.https
 * @param {middleware} - authController.validateRestoreSessionVarsEnabled
 * @param {middleware} - authController.authController
 * @param {serverfunction} - post
 */
server.post('SaveSession',
    server.middleware.https,
    authController.validateRestoreSessionVarsEnabled,
    authController.authController,
    function (req, res, next) {
        var viewData = res.getViewData();
        var parsedBody = helpers.parseRequestBody(req);
        if (parsedBody && parsedBody.sessionVars && Object.keys(parsedBody.sessionVars).length) {
            helpers.restoreSessionVars(parsedBody.sessionVars);
            viewData.restoredVars = true;
        }

        res.json(viewData);
        return next();
    }
);

module.exports = server.exports();
