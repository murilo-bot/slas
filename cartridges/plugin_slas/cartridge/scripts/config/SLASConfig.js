'use strict';

var Site = require('dw/system/Site');
var currentSite = Site.getCurrent();

module.exports = {
    // The service endpoint for guest login
    CALL_TYPE_OAUTH2_LOGIN_GUEST: 'authorize',

    // The service endpoint for registered user login
    CALL_TYPE_OAUTH2_LOGIN_REGISTERED: 'login',

    // The service endpoint to get access token and refresh token
    CALL_TYPE_OAUTH2_TOKEN: 'token',

    // Guest login request parameter value for 'hint'
    OAUTH2_LOGIN_GUEST_HINT: 'guest',

    // Guest login request parameter value for 'response_type'
    OAUTH2_LOGIN_GUEST_RESPONSE_TYPE: 'code',

    // Request parameter value for grant_type for the call to get access token and refresh token
    GRANT_TYPE_AUTH_CODE_PKCE: 'authorization_code_pkce',

    // Request parameter value for grant_type for the call to get access token from refresh token
    GRANT_TYPE_REFRESH_TOKEN: 'refresh_token',

    // The value for 'channel_id' request parameter for SLAS service calls
    CHANNEL_ID: currentSite.ID,

    // The value for 'redirect_uri' parameter in guest and registered user login calls
    REDIRECT_URI: currentSite.getCustomPreferenceValue('redirectURI_SLAS'),

    // The custom preference to always drop refresh token cookies in browser during registered user login
    SAVE_REFRESH_TOKEN_ALWAYS: currentSite.getCustomPreferenceValue(
        'saveRefreshToken_Always'
    ),

    // session guard cookie name. This is set when a login occurs to stop guest sessions from refreshing while the existing session is active
    SESSION_GUARD_COOKIE_NAME: 'cc-sg',

    // The maximum age of this cookie. This must be less than the minimum age of a session (30 minutes) so that the guard is not active when the session expires.
    SESSION_GUARD_COOKIE_AGE: 30 * 60,

    // refresh token cookie name for registered users
    REFRESH_TOKEN_COOKIE_NAME_REGISTERED: 'cc-nx',

    // refresh token cookie name for guest users
    REFRESH_TOKEN_COOKIE_NAME_GUEST: 'cc-nx-g',

    // The maximum age of cookie . This is set to match the currently 90 day expiration of refresh token cookie
    REFRESH_TOKEN_COOKIE_AGE: 90 * 24 * 60 * 60,

    // SCAPI end point for merging guest user basket during login
    SCAPI_BASKET_MERGE_ENDPOINT: '/baskets/actions/merge',

    // The header name set in Customer CDN settings -> Client IP Header Name. Allows B2C to retrieve the client IP during session bridging.
    CLIENT_IP_HEADER_NAME:
        currentSite.getCustomPreferenceValue('clientIPHeaderName'),

    // controllers to exclude for guest login and token refresh
    CONTROLLERS_TO_EXCLUDE: [
        '__Analytics-Start',
        'ConsentTracking-Check',
        'ConsentTracking-GetContent',
        'ConsentTracking-SetConsent',
        'ConsentTracking-SetSession',
        'SLASSessionHelper-SaveSession',
        'TestHelper-TestGeoLocationSlasExclude'
    ],

    // The request URI used to fetch OCAPI Session in bridge service - SLAS
    OCAPI_SESSION_BRIDGE_URI_SLAS: currentSite.getCustomPreferenceValue(
        'ocapiSessionBridgeURI_SLAS'
    ),

    // list of configured service IDs
    SERVICE_IDS: {
        INTERNAL_CONTROLLER: 'controller.internal'
    },

    // site preference used to enable restoration of session attributes after session bridge
    RESTORE_SESSION_ATTRIBUTES: currentSite.getCustomPreferenceValue('restoreSessionAttributes_SLAS') || false
};
