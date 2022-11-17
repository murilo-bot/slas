'use strict';

var config = require('*/cartridge/scripts/config/SLASConfig');
var Logger = require('dw/system/Logger');
var SLASAuthHelper = require('*/cartridge/scripts/helpers/slasAuthHelper');
var BasketMgr = require('dw/order/BasketMgr');
var cartMergeService = require('*/cartridge/scripts/services/CartMergeService');

/**
 * SLAS login using PKCE flow
 * @param {{Object}}resp - response object
 * @param {{Object}}req - request object
 * @returns {{boolean}} - returns result of login
 */
function loginGuest(resp, req) {
    // if refresh token cookie is not found for guest user, build a new one and drop in the browser. And , establish the guest session.
    var input = {};
    input.callType = config.CALL_TYPE_OAUTH2_LOGIN_GUEST;
    var tokenData = SLASAuthHelper.getSLASUserAccessToken(
        config.GRANT_TYPE_AUTH_CODE_PKCE,
        input
    );
    if (tokenData && tokenData.refresh_token && tokenData.access_token) {
        // refresh the refresh_token cookie
        resp.addHttpCookie(
            SLASAuthHelper.createCookie(
                config.SESSION_GUARD_COOKIE_NAME,
                1,
                config.SESSION_GUARD_COOKIE_AGE
            )
        );
        resp.addHttpCookie(
            SLASAuthHelper.createCookie(
                config.REFRESH_TOKEN_COOKIE_NAME_GUEST,
                tokenData.refresh_token,
                config.REFRESH_TOKEN_COOKIE_AGE
            )
        );
        // establish user session using the access token
        var result = SLASAuthHelper.setUserSession(
            tokenData.access_token,
            resp,
            req
        );
        if (!result.ok) {
            Logger.error(
                'Exception: Could not establish session using session bridge, check the service response'
            );
            return false;
        }
    } else {
        Logger.error(
            'Exception: Could not do guest login, check the service response'
        );
        return false;
    }
    return true;
}

/**
 * Handles guest login using SLAS
 * @param {{Object}}resp - response object
 * @param {{Object}}req - request object
 * @returns {{boolean}} - returns result of login
 */
exports.handleGuest = function handleGuest(resp, req) {
    if (!resp) {
        Logger.error('Cannot establish session bridge without Response object');
        return false;
    }
    // retrieve guest user's refresh_token cookie
    var refreshTokenCookie = SLASAuthHelper.getCookie(
        config.REFRESH_TOKEN_COOKIE_NAME_GUEST
    );
    if (refreshTokenCookie) {
        var input = {};
        input.refresh_token = refreshTokenCookie.value;
        var tokenData = SLASAuthHelper.getSLASUserAccessToken(
            config.GRANT_TYPE_REFRESH_TOKEN,
            input
        );
        if (tokenData && tokenData.access_token && tokenData.refresh_token) {
            // refresh the refresh_token cookie
            resp.addHttpCookie(
                SLASAuthHelper.createCookie(
                    config.SESSION_GUARD_COOKIE_NAME,
                    1,
                    config.SESSION_GUARD_COOKIE_AGE
                )
            );
            resp.addHttpCookie(
                SLASAuthHelper.createCookie(
                    config.REFRESH_TOKEN_COOKIE_NAME_GUEST,
                    tokenData.refresh_token,
                    config.REFRESH_TOKEN_COOKIE_AGE
                )
            );
            // establish user session using the access token
            var result = SLASAuthHelper.setUserSession(
                tokenData.access_token,
                resp,
                req
            );
            if (!result.ok) {
                Logger.error(
                    'Exception: Could not establish session using session bridge, check the service response'
                );
            }
        } else {
            Logger.info(
                'Exception: Could not retrieve access token from refresh token , check the service response'
            );
            return loginGuest(resp, req);
        }
    } else {
        return loginGuest(resp, req);
    }
    return true;
};

/**
 * Handles registered user login via SLAS
 * @param {{Object}}userInput - input object
 * @returns {{boolean}} - indicating if registered user login was successful
 */
exports.handleRegistered = function handleRegistered(userInput) {
    var shopperId;
    if (!userInput.user || !userInput.password) {
        Logger.error('credentials are needed for login');
        return false;
    }
    if (!userInput.resp) {
        Logger.error('Cannot establish session bridge without Response object');
        return false;
    }
    var input = userInput;
    // obtain shopper id of guest user from Guest login
    var refreshTokenCookie = SLASAuthHelper.getCookie(
        config.REFRESH_TOKEN_COOKIE_NAME_GUEST
    );
    if (refreshTokenCookie) {
        input.refresh_token = refreshTokenCookie.value;
        var guestToken = SLASAuthHelper.getSLASUserAccessToken(
            config.GRANT_TYPE_REFRESH_TOKEN,
            input
        );
        input.resp.addHttpCookie(
            SLASAuthHelper.createCookie(
                config.REFRESH_TOKEN_COOKIE_NAME_GUEST,
                guestToken.refresh_token,
                config.REFRESH_TOKEN_COOKIE_AGE
            )
        );
        shopperId = guestToken.usid;
    }
    if (shopperId) {
        input.shopperId = shopperId;
    }
    input.callType = config.CALL_TYPE_OAUTH2_LOGIN_REGISTERED;
    //	Authenticate customer and get the access token
    var registeredToken = SLASAuthHelper.getSLASUserAccessToken(
        config.GRANT_TYPE_AUTH_CODE_PKCE,
        input
    );
    if (
        registeredToken &&
        registeredToken.access_token &&
        registeredToken.refresh_token
    ) {
        if (config.SAVE_REFRESH_TOKEN_ALWAYS || input.rememberMe) {
            input.resp.addHttpCookie(
                SLASAuthHelper.createCookie(
                    config.REFRESH_TOKEN_COOKIE_NAME_REGISTERED,
                    registeredToken.refresh_token,
                    config.REFRESH_TOKEN_COOKIE_AGE
                )
            );
            // remove guest user refresh token cookie as it is no longer needed
            SLASAuthHelper.removeCookie(
                config.REFRESH_TOKEN_COOKIE_NAME_GUEST,
                input.resp
            );
        }
        input.resp.addHttpCookie(
            SLASAuthHelper.createCookie(
                config.SESSION_GUARD_COOKIE_NAME,
                1,
                config.SESSION_GUARD_COOKIE_AGE
            )
        );

        // Merges the guest basket for an authenticated user if the guest basket is not null.
        if (BasketMgr.getCurrentBasket()) {
            cartMergeService.mergeBasket(registeredToken.access_token);
        }

        // establish registered user session with the access token
        SLASAuthHelper.setUserSession(
            registeredToken.access_token,
            input.resp,
            input.req
        );
        return true;
    }
    Logger.info(
        'SLAS login failed for registered user , please check the service response'
    );
    return false;
};
