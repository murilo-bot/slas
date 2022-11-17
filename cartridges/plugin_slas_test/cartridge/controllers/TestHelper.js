'use strict';

var server = require('server');
var config = require('*/cartridge/scripts/config/SLASConfig');

/* Script Modules */
var instanceRestriction = require('*/cartridge/scripts/middleware/instanceRestriction');
var sessionHelpers = require('*/cartridge/scripts/helpers/slasSessionHelpers');
var SLASAuthHelper = require('*/cartridge/scripts/helpers/slasAuthHelper');

server.get('TestGeoLocation',
    server.middleware.https,
    instanceRestriction.redirectProduction,
    function (req, res, next) {
        res.json({ geolocation: req.geolocation });
        next();
    }
);

server.get('TestGeoLocationSlasExclude',
    server.middleware.https,
    instanceRestriction.redirectProduction,
    function (req, res, next) {
        res.json({ geolocation: req.geolocation });
        next();
    }
);

server.get('SetSessionVars',
    server.middleware.https,
    instanceRestriction.redirectProduction,
    function (req, res, next) {
        var customCounter = (req.session.raw.custom.customCounter || 0) + 1;
        var privateCounter = (req.session.privacyCache.get('privateCounter') || 0) + 1;

        /* eslint-disable no-param-reassign */
        req.session.raw.custom.customCounter = customCounter;
        req.session.raw.custom.custom1 = 'custom1';
        req.session.raw.custom.custom2 = 'a second custom attr';
        /* eslint-enable no-param-reassign */

        req.session.privacyCache.set('privateCounter', privateCounter);
        req.session.privacyCache.set('privacy1', 'privacy1');

        res.json({ sessionAttributes: sessionHelpers.getSessionVars() });
        next();
    }
);

server.get('GetSessionVars',
    server.middleware.https,
    instanceRestriction.redirectProduction,
    function (req, res, next) {
        res.json({ sessionAttributes: sessionHelpers.getSessionVars() });
        next();
    }
);

server.get('GetRegisteredUserJWT', server.middleware.https, function (req, res, next) {
    var registeredUserRefreshToken = req.querystring.refresh_token;

    if (!registeredUserRefreshToken) {
        res.json({
            error: true,
            errorMessage: 'refresh_token is required.'
        });
    } else {
        var registeredToken = SLASAuthHelper.getSLASUserAccessToken(
            config.GRANT_TYPE_REFRESH_TOKEN,
            { refresh_token: registeredUserRefreshToken, callType: config.CALL_TYPE_OAUTH2_LOGIN_REGISTERED }
        );

        res.json(registeredToken);
    }
    next();
});

module.exports = server.exports();
