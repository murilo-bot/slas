'use strict';

/* global request, response, session */

/**
 * The onSession hook is called for every new session in a site. For performance reasons the hook function should be kept short.
 *
 */

var Status = require('dw/system/Status');
var SLASAuthHelper = require('*/cartridge/scripts/helpers/slasAuthHelper');
var config = require('*/cartridge/scripts/config/SLASConfig');
var Logger = require('dw/system/Logger');
var HookMgr = require('dw/system/HookMgr');
var Encoding = require('dw/crypto/Encoding');

var URLUtils = require('dw/web/URLUtils');
var URLAction = require('dw/web/URLAction');
var URLParameter = require('dw/web/URLParameter');

/**
 * Puts together the SEO URL from the httpPath and httpQueryString of a request
 *
 * The httpPath will look like /on/demandware.store/Sites-RefArch-Site/en_US/Login-Show
 *
 * @param {string} httpPath - the http path from the request url. This is the relative non SEO-optimized path
 * @param {string} queryString - the query string from the request url
 * @returns {dw.web.URL} url - the SEO optimized url path for the current page
 */
function getSEOUrl(httpPath, queryString) {
    var pathParts = httpPath.substr(1).split('/');

    // If there are 3 or less parts to the httpPath there is probably no specified controller so we direct to the home page
    if (pathParts.length <= 3) {
        return URLUtils.httpsHome();
    }

    // The action (aka the controller start node) is always the final part of the httpPath
    var action = new URLAction(pathParts[pathParts.length - 1]);

    var urlParts = [];
    if (queryString) {
        var qsParts = queryString.split('&');
        urlParts = qsParts.map(function (qsParam) {
            var paramParts = qsParam.split('=');

            if (paramParts[1]) {
                // The query parameter is a key/value pair, e.g. `?foo=bar`

                var key = paramParts.shift();
                // if there are `=` characters in the parameter value, rejoin them
                var value = paramParts.join('=');

                return new URLParameter(key, value);
            }

            // The query parameter is not a key/value pair, e.g. `?queryparam`

            return new URLParameter(undefined, qsParam, false);
        });
    }
    urlParts.unshift(action);
    return Encoding.fromURI(URLUtils.url.apply(URLUtils, urlParts).toString());
}

/**
 * The onSession hook is called for every new session in a site. For performance reasons the hook function should be kept short.
 * This hook is only triggered if a dwsid is either expired or is missing.
 * @returns {dw/system/Status} status - return status
 */
exports.onSession = function () {
    var sessionGuardCookie = SLASAuthHelper.getCookie(
        config.SESSION_GUARD_COOKIE_NAME
    );
    var activeSessionGuard =
        sessionGuardCookie && sessionGuardCookie.maxAge < 30 * 60;

    var isStorefrontSession = session && session.customer;
    var isNotRegisteredUser = !session.customer.profile;
    var isGetRequest = request.httpMethod === 'GET';
    /**
        Only run login if:
            a) the request url is not excluded in SLASConfig.CONTROLLERS_TO_EXCLUDE
            b) there is no active session guard
            c) the request is for a storefront (in other words, not a business manager session)
            d) user is not already logged in
            e) the request is a GET request. Other request types are excluded
    */
    if (
        SLASAuthHelper.isValidRequestURI(request.httpPath) &&
        !activeSessionGuard &&
        isStorefrontSession &&
        isNotRegisteredUser &&
        isGetRequest
    ) {
        var refreshTokenCookie = SLASAuthHelper.getCookie(
            config.REFRESH_TOKEN_COOKIE_NAME_REGISTERED
        );
        var input = {};
        var tokenData;
        if (refreshTokenCookie) {
            input.refresh_token = refreshTokenCookie.value;
            input.callType = config.CALL_TYPE_OAUTH2_LOGIN_REGISTERED;
            // retrieve the access token using refresh token
            tokenData = SLASAuthHelper.getSLASUserAccessToken(
                config.GRANT_TYPE_REFRESH_TOKEN,
                input
            );
            if (
                tokenData &&
                tokenData.refresh_token &&
                tokenData.access_token
            ) {
                // refresh the refresh_token cookie
                var newRefreshCookie = SLASAuthHelper.createCookie(
                    config.REFRESH_TOKEN_COOKIE_NAME_REGISTERED,
                    tokenData.refresh_token,
                    config.REFRESH_TOKEN_COOKIE_AGE
                );
                response.addHttpCookie(newRefreshCookie);
                var newSessionGuardCookie = SLASAuthHelper.createCookie(
                    config.SESSION_GUARD_COOKIE_NAME,
                    1,
                    config.SESSION_GUARD_COOKIE_AGE
                );
                response.addHttpCookie(newSessionGuardCookie);
                // establish user session using the access token
                var result = SLASAuthHelper.setUserSession(
                    tokenData.access_token,
                    response,
                    request
                );
                if (!result.ok) {
                    Logger.error(
                        'Exception: Could not establish session using session bridge, check the service response'
                    );
                }
                // you are getting redirect to a login page, and we want to direct you to the page BEFORE that.
                var newURL = session.clickStream.getLast().url;
                response.redirect(newURL);
            } else {
                Logger.error(
                    'Exception: Could not retrieve access token from refresh token, check the service response for registered user'
                );
            }
        } else {
            // Execute guest login process
            HookMgr.callHook(
                'app.plugin.slas.login',
                'handleGuest',
                response,
                request
            );

            // Guest login triggers a session bridge, which creates a new session (a new dwsid cookie)
            // We redirect to the same page so that it re-renders in the context of the new session
            response.redirect(
                getSEOUrl(request.httpPath, request.httpQueryString)
            );
        }
    }
    return new Status(Status.OK);
};
