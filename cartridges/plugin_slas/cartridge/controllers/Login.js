'use strict';

var base = module.superModule;
var server = require('server');
var SLASAuthHelper = require('*/cartridge/scripts/helpers/slasAuthHelper');
var config = require('*/cartridge/scripts/config/SLASConfig');

server.extend(base);

/**
 * Login-Logout : This endpoint is called to log shopper out of the session
 * @name Base/Login-Logout
 * @function
 * @memberof Login
 * @param {category} - sensitive
 * @param {serverfunction} - get
 */

server.prepend('Logout', function (req, res, next) {
    var refreshTokenCookie = SLASAuthHelper.getCookie(
        config.REFRESH_TOKEN_COOKIE_NAME_REGISTERED
    );
    if (refreshTokenCookie) {
        // loguout customer at SLAS
        SLASAuthHelper.logoutCustomer(refreshTokenCookie.value);
        // delete slas refresh token cookie
        SLASAuthHelper.removeCookie(
            config.REFRESH_TOKEN_COOKIE_NAME_REGISTERED,
            res.base
        );
        SLASAuthHelper.removeCookie(
            config.REFRESH_TOKEN_COOKIE_NAME_GUEST,
            res.base
        );
        SLASAuthHelper.removeCookie(config.SESSION_GUARD_COOKIE_NAME, res.base);
    }
    next();
});

module.exports = server.exports();
