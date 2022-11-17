'use strict';
/* global request */

var MessageDigest = require('dw/crypto/MessageDigest');
var Encoding = require('dw/crypto/Encoding');
var Bytes = require('dw/util/Bytes');
var slasAuthService = require('*/cartridge/scripts/services/SLASAuthService');
var sessionBridge = require('*/cartridge/scripts/services/SessionBridgeService');
var config = require('*/cartridge/scripts/config/SLASConfig');
var Cookie = require('dw/web/Cookie');
var SecureRandom = require('dw/crypto/SecureRandom');
var Logger = require('dw/system/Logger');
var sessionHelpers = require('*/cartridge/scripts/helpers/slasSessionHelpers');
var controllerService = require('*/cartridge/scripts/services/ControllerService');

/**
 *  Encode to URL-safe base64
 * @param {{string}}str - to encode
 * @returns {string} - returns encoded string
 */
function encodeURLSafeBase64(str) {
    return Encoding.toBase64(str)
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

/**
 * Get PKCE code challenge
 * @param  {{string}} codeVerifier - PKCE code verifier
 * @returns {{string}} - base64 URLencoded
 */
function getCodeChallenge(codeVerifier) {
    var messageDigest = new MessageDigest(MessageDigest.DIGEST_SHA_256);
    return encodeURLSafeBase64(
        messageDigest.digestBytes(new Bytes(codeVerifier))
    );
}

/**
 * save cookies to HTTP response
 * @param {{Array}} cookieStrings - array of set-Cookie header strings
 * @param {{dw.system.Response}} resp - response object
 * @returns {{Object}} plain javascript object with cookie names and values
 */
function addCookiesToResponse(cookieStrings, resp) {
    var cookieObject = {};
    cookieStrings.toArray().forEach(function (cookieString) {
        var cookieParts = cookieString.split(';');
        var nameValue = cookieParts.shift().split('=');
        var name = nameValue.shift();
        var value = nameValue.join('=');
        value = decodeURIComponent(value);
        var newCookie = new Cookie(name, value);
        cookieObject[name] = value;
        cookieParts.forEach(function (part) {
            var sides = part.split('=');
            var key = sides.shift().trim().toLowerCase();
            value = sides.join('=');
            if (key === 'path') {
                newCookie.setPath(value);
            } else if (key === 'max-age') {
                newCookie.setMaxAge(parseInt(value, 10));
            } else if (key === 'secure') {
                newCookie.setSecure(true);
            } else if (key === 'httponly') {
                newCookie.setHttpOnly(true);
            } else if (key === 'version') {
                newCookie.setVersion(value);
            }
        });
        resp.addHttpCookie(newCookie);
    });
    return cookieObject;
}

/**
 * Creates the cookie
 * @param {{string}}name - cookie to be created
 * @param {{string}}value - refresh_token to be set as value
 * @param {{string}}age - age of the cookie
 * @returns {{dw.web.Cookie}} - new persistent cookie
 */
function createCookie(name, value, age) {
    var newCookie = new Cookie(name, value);
    newCookie.setHttpOnly(false); // set as required for PWA hybrid solution
    newCookie.setSecure(true);
    newCookie.setMaxAge(age);
    newCookie.setPath('/');
    return newCookie;
}

/**
 * Retrieves cookie
 * @param {{string}}name - cookie to retrieve
 * @returns {{dw.web.Cookie}} retrieved refresh_token cookie
 */
function getCookie(name) {
    var refreshTokenCookie;
    var cookies = request.getHttpCookies();
    var cookieCount = cookies.getCookieCount();
    for (var i = 0; i < cookieCount; i++) {
        if (name === cookies[i].getName()) {
            refreshTokenCookie = cookies[i];
            break;
        }
    }
    return refreshTokenCookie;
}

/**
 * Removes cookie
 * @param {{string}}name - cookie to be removed
 * @param {{dw.system.Response}} resp - response object
 */
function removeCookie(name, resp) {
    var cookies = request.getHttpCookies();
    var cookieCount = cookies.getCookieCount();
    for (var i = 0; i < cookieCount; i++) {
        if (name === cookies[i].getName()) {
            var cookie = cookies[i];
            cookie.value = '';
            cookie.setMaxAge(0);
            cookie.setPath('/');
            resp.addHttpCookie(cookie);
            break;
        }
    }
}

/**
 * Get access token using SLAS
 * @param {string}grantType - grant type , i.e either 'authorization_code_pkce' or 'refresh_token'
 * @param {Object}input - input with user credential information or data to make guest login call
 * @returns {{Object}} containing response
 */
function getSLASUserAccessToken(grantType, input) {
    var tokenData = {};
    var serviceRequestParams = {};

    if (grantType === config.GRANT_TYPE_AUTH_CODE_PKCE) {
        var random = new SecureRandom();
        serviceRequestParams.codeVerifier = encodeURLSafeBase64(
            random.nextBytes(96)
        );
        serviceRequestParams.codeChallenge = getCodeChallenge(
            serviceRequestParams.codeVerifier
        );
        serviceRequestParams.callType = input.callType;
        serviceRequestParams.grantType = grantType;

        // Get the auth code with PKCE code challenge
        if (input.callType === config.CALL_TYPE_OAUTH2_LOGIN_GUEST) {
            serviceRequestParams.responseType =
                config.OAUTH2_LOGIN_GUEST_RESPONSE_TYPE;
            serviceRequestParams.hint = config.OAUTH2_LOGIN_GUEST_HINT;
        } else if (
            input.callType === config.CALL_TYPE_OAUTH2_LOGIN_REGISTERED
        ) {
            serviceRequestParams.username = input.user;
            serviceRequestParams.password = input.password;
            if (input.shopperId) {
                serviceRequestParams.usid = input.shopperId;
            }
        }
    } else if (grantType === config.GRANT_TYPE_REFRESH_TOKEN) {
        // get the access token and refresh tokens with saved refresh token
        serviceRequestParams.grantType = config.GRANT_TYPE_REFRESH_TOKEN;
        serviceRequestParams.refreshToken = input.refresh_token;
    }
    tokenData = slasAuthService.getTokenData(serviceRequestParams);
    return tokenData;
}

/**
 * Establish session with session bridge using the access token
 * @param {{string}}accessToken - access_token to be used to establish session
 * @param {{dw.system.Response}} resp - response object
 * @param {{dw.system.Request}} req - request object
 * @returns {{Object}} - response from session bridge API call
 */
function setUserSession(accessToken, resp, req) {
    var responseObj = {};
    var ip;
    if (req && req.httpRemoteAddress) {
        ip = req.httpRemoteAddress;
    }

    var result = sessionBridge.getSession(accessToken, ip);
    if (result && result.responseHeaders) {
        var cookies = result.responseHeaders.get('set-cookie')
            ? result.responseHeaders.get('set-cookie')
            : result.responseHeaders.get('Set-Cookie');

        if (cookies) {
            responseObj.cookies = cookies;
            // drop the cookies in browser
            var cookieObject = addCookiesToResponse(cookies, resp);
            responseObj.ok = true;

            // call internal controller with new dwsid and save session variables to new session
            if (config.RESTORE_SESSION_ATTRIBUTES && cookieObject.dwsid) {
                var headerAuth = sessionHelpers.getEncodedServiceCredentials(
                    config.SERVICE_IDS.INTERNAL_CONTROLLER
                );
                if (headerAuth) {
                    controllerService.getService().call({
                        controller: 'SLASSessionHelper-SaveSession',
                        requestMethod: 'POST',
                        headers: { 'x-sf-custom-auth': headerAuth },
                        body: JSON.stringify({
                            sessionVars: sessionHelpers.getSessionVars()
                        }),
                        dwsid: cookieObject.dwsid
                    });
                } else {
                    Logger.error(
                        'service credentials were not set for "controller.internal.cred", session attributes will not be restored!'
                    );
                }
            }
        } else {
            responseObj.ok = false;
        }
    } else {
        responseObj.ok = false;
    }
    return responseObj;
}

/**
 * Logs out the customer using SLAS
 * @param {{string}}refreshToken - use refresh token to log out
 * @returns {{Object}} response from logout API call
 */
function logoutCustomer(refreshToken) {
    var response = {};
    var input = {};
    input.refresh_token = refreshToken;
    var accessTokenData = getSLASUserAccessToken(
        config.GRANT_TYPE_REFRESH_TOKEN,
        input
    );
    if (accessTokenData && accessTokenData.ok) {
        var serviceRequest = {};
        serviceRequest.accessToken = accessTokenData.access_token;
        serviceRequest.refreshToken = accessTokenData.refresh_token;
        response = slasAuthService.logoutCustomer(serviceRequest);
    } else {
        response.msg = accessTokenData.message;
    }
    return response;
}

/**
 * Retrieves guest user's shopped id
 * @returns {{String}} usid after authorizing the user
 */
function getGuestUserShopperId() {
    var authRequest = {};
    var random = new SecureRandom();
    var codeVerifier = encodeURLSafeBase64(random.nextBytes(96));
    authRequest.codeChallenge = getCodeChallenge(codeVerifier);
    authRequest.responseType = config.OAUTH2_LOGIN_GUEST_RESPONSE_TYPE;
    authRequest.hint = config.OAUTH2_LOGIN_GUEST_HINT;
    var usid = slasAuthService.authorizeCustomer(authRequest).usid;
    return usid;
}

/**
 *  Check if the request URI is valid to be considered for guest login or registered user's token refresh
 *  @param {{string}}requestURI - the request URI
 *  @returns {{boolean}} indicating if the request URI is valid for guest login
 */
function isValidRequestURI(requestURI) {
    var isValidURI = true;
    var excludedURIs = config.CONTROLLERS_TO_EXCLUDE;
    for (var i = 0; i < excludedURIs.length; i++) {
        if (requestURI.indexOf(excludedURIs[i]) !== -1) {
            isValidURI = false;
            break;
        }
    }
    return isValidURI;
}

module.exports = {
    getSLASUserAccessToken: getSLASUserAccessToken,
    logoutCustomer: logoutCustomer,
    setUserSession: setUserSession,
    getCookie: getCookie,
    getRefreshTokenCookie: getCookie,
    removeCookie: removeCookie,
    removeRefreshTokenCookie: removeCookie,
    createCookie: createCookie,
    createRefreshTokenCookie: createCookie,
    getGuestUserShopperId: getGuestUserShopperId,
    isValidRequestURI: isValidRequestURI
};
