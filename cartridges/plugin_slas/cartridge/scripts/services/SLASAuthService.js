'use strict';

var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var config = require('*/cartridge/scripts/config/SLASConfig');
var Logger = require('dw/system/Logger');
var StringUtils = require('dw/util/StringUtils');
var HTTPClient = require('dw/net/HTTPClient');

var mockResponseObj = {
    access_token: 'eyJ2ZXIiOiIxLj',
    id_token: 'eyJraWQiOi',
    refresh_token: 'hOWLQR-MNz',
    expires_in: 1800,
    token_type: 'BEARER',
    usid: 'fd8266f4-475a',
    customer_id: 'abI13zz8T2PxiB',
    enc_user_id: 'e7222f75e29f',
    idp_access_token: 'YzQ2ODg5Y2RcWoppZQ'
};
var mockResponse = {
    statusCode: 200,
    statusMessage: 'Success',
    text: JSON.stringify(mockResponseObj)
};

/**
 * Get options object to instantiate 'sfcc-slas-auth' service with overriden implementation for underlying HTTPClient.
 *
 * SLAS authentication PKCE flow consists of 2 main steps:
 * 1. Get an authorization code after authenticating a user against an identity provider (IDP)
 * to get USID and authCode (from the "Location" response header).
 * 2. Use the authCode from step 1 to get access_token and refresh_token and establish session for current user.
 *
 * Step 1 above returns a 303 Temporary Redirect as response to the HTTP call to follow redirect to the "redirect_uri" passed as parameter.
 * For sites with storefront protection turned on, the redirect fails to authenticate storefront protection and hence results in a 401 response at the end of the HTTP call.
 *
 * We consume the change made in ECom v22.8 to not follow redirects by setting `client.setAllowRedirect(false)`.
 * We however, need to intercept the request midflight before the redirect is followed to extract USID and authCode from the "Location" response header.
 *
 * We use the service framework to execute http calls to SLAS as it offers circuit breaking capapbilities. However the way service framework is built,
 * it always expects a OK (< 300 HTTP status code) at the end of execution. So calling the SLAS authorize endpoint and intercepting the request allows us to extract USID and authCode,
 * but still results in error state at the end of execution triggering a lot of error events on SRE systems which is not expected in production.
 * Refer: https://git.soma.salesforce.com/commerce/digital/blob/master/source/bc_api/javasource/com/demandware/api/svc/Service.java#L323-L334
 *
 * This is another problematic part of service framework from my experience: it doesn't handle services that use >400 status codes for business logic
 * (like for instance a payment provider that returns 404 for lack of a customer record, etc; this also triggers the circuit breaker, etc).
 * Refer: https://git.soma.salesforce.com/commerce/digital/blob/master/source/bc_api/javasource/com/demandware/api/svc/http/HTTPService.java#L373-L379
 *
 * To handle this we override the "execute" callback in the service and write our own implementation using low level HTTPClient provdided in dw.net,
 * Here, instead of having 2 separate service instances for Step 1 and Step 2 above, we make both SLAS Http calls inside the same execute function.
 *
 * This allows us to obtain authCode and access_token in the same flow while making sure we return a OK response to the service framework at the end of execution as SLAS returns a 2XX response
 * when retreiving access_token in Step 2. Alternatively, if any of the steps was to actually fail on SLAS service side, service framework would result in an error state which is expected.
 * @returns {{dw.svc.Service}} returns service instance
 */
function getAuthServiceOptions() {
    return {
        initServiceClient: function () {
            var client = new HTTPClient();
            client.setAllowRedirect(false);
            return client;
        },
        createRequest: function (service, params) {
            return params;
        },
        execute: function (service, params) {
            var baseURL = service.getURL();
            var client = service.client; // HTTPClient instance returned in the initServiceClient callback
            var credential = service.getConfiguration().getCredential();
            var serviceRequest = params;
            client.setRequestHeader(
                'Content-Type',
                'application/x-www-form-urlencoded'
            );

            var authorization = {};

            // Execute Step 1: Get authCode only if grantType = 'authorization_code_pkce' skip to getToken for grantType = 'refresh_token'
            if (serviceRequest.grantType === config.GRANT_TYPE_AUTH_CODE_PKCE) {
                // Get USID and authCode for GUEST customers
                if (
                    serviceRequest.callType ===
                    config.CALL_TYPE_OAUTH2_LOGIN_GUEST
                ) {
                    var authorizeURL =
                        baseURL + '/' + config.CALL_TYPE_OAUTH2_LOGIN_GUEST;
                    var authorizeURLParams = {
                        client_id: credential.user,
                        redirect_uri: config.REDIRECT_URI,
                        channel_id: config.CHANNEL_ID,
                        code_challenge: serviceRequest.codeChallenge,
                        response_type: serviceRequest.responseType,
                        hint: serviceRequest.hint
                    };
                    authorizeURL +=
                        '?' +
                        Object.keys(authorizeURLParams)
                            .map(function (key) {
                                var value = authorizeURLParams[key];
                                return key + '=' + encodeURIComponent(value);
                            })
                            .join('&');
                    service.setAuthentication('NONE');
                    client.open('GET', authorizeURL);
                } else if (
                    serviceRequest.callType ===
                    config.CALL_TYPE_OAUTH2_LOGIN_REGISTERED
                ) {
                    // Get USID and authCode for Registered customers
                    var authenticateURL =
                        baseURL +
                        '/' +
                        config.CALL_TYPE_OAUTH2_LOGIN_REGISTERED +
                        '?';
                    var authenticateURLParams = {
                        client_id: credential.user,
                        redirect_uri: config.REDIRECT_URI,
                        code_challenge: serviceRequest.codeChallenge,
                        channel_id: config.CHANNEL_ID
                    };

                    if (serviceRequest.usid) {
                        authenticateURLParams.usid = serviceRequest.usid;
                    }

                    authenticateURL += Object.keys(authenticateURLParams)
                        .map(function (key) {
                            var value = authenticateURLParams[key];
                            return key + '=' + encodeURIComponent(value);
                        })
                        .join('&');
                    client.open('POST', authenticateURL);

                    // Make sure to call decodeURIComponent to make sure username and password are restored to original strings after being encoded when passed as params to execute()
                    var authHeaderValue =
                        'Basic ' +
                        StringUtils.encodeBase64(
                            decodeURIComponent(serviceRequest.username) +
                                ':' +
                                decodeURIComponent(serviceRequest.password)
                        );
                    client.setRequestHeader('Authorization', authHeaderValue);
                }

                client.send();

                // If a 3XX redirect response was seen, intercept request to extract USID and authCode from "Location" header.
                if (client.statusCode > 300 && client.statusCode <= 304) {
                    var location = client.responseHeaders.get('Location')[0];
                    var queryParams = location.split('?')[1];
                    var queryPairs = queryParams.split('&');

                    queryPairs.forEach(function (pair) {
                        var parts = pair.split('=');
                        var key = parts[0];
                        var value = parts.length > 1 ? parts[1] : null;
                        authorization[key] = value;
                    });

                    if (
                        authorization.error ||
                        !authorization.usid ||
                        !authorization.code
                    ) {
                        throw new Error(
                            authorization.error_description ||
                                'Failed to retreive authorization code'
                        );
                    }
                } else if (client.statusCode >= 400) {
                    throw new Error(client.errorText);
                }
            }

            // Request access_token and refresh_token for customers using authCode retrieved above.
            var tokenURL = baseURL + '/' + config.CALL_TYPE_OAUTH2_TOKEN;
            var tokenURLParams = {
                grant_type: serviceRequest.grantType
            };
            if (serviceRequest.grantType === config.GRANT_TYPE_AUTH_CODE_PKCE) {
                tokenURLParams.code = authorization.code;
                tokenURLParams.redirect_uri = config.REDIRECT_URI;
                tokenURLParams.code_verifier = serviceRequest.codeVerifier;
                tokenURLParams.channel_id = config.CHANNEL_ID;
                tokenURLParams.usid = authorization.usid;
            } else if (
                serviceRequest.grantType === config.GRANT_TYPE_REFRESH_TOKEN
            ) {
                // Set refresh_token params to restore client session using refresh token
                tokenURLParams.refresh_token = serviceRequest.refreshToken;
                tokenURLParams.redirect_uri = config.REDIRECT_URI;
                tokenURLParams.channel_id = config.CHANNEL_ID;
            }

            client.setRequestHeader(
                'Authorization',
                'Basic ' +
                    StringUtils.encodeBase64(
                        credential.user + ':' + credential.password
                    )
            );

            tokenURL +=
                '?' +
                Object.keys(tokenURLParams)
                    .map(function (key) {
                        var value = tokenURLParams[key];
                        return key + '=' + encodeURIComponent(value);
                    })
                    .join('&');
            client.open('POST', tokenURL);
            client.setRequestHeader(
                'Content-Type',
                'application/x-www-form-urlencoded'
            );
            client.send();
        },
        executeOverride: true,
        parseResponse: function (response) {
            return response;
        },
        filterLogMessage: function (msg) {
            return msg;
        },
        mockCall: function () {
            return mockResponse;
        }
    };
}

/**
 * Get options object required to intantiate 'sfcc-slas-auth'
 * @returns {{Object}} instance of service with default client implementation
 */
function getDefaultServiceOptions() {
    return {
        parseResponse: function (response) {
            return response;
        },
        filterLogMessage: function (msg) {
            return msg;
        },
        mockCall: function () {
            return mockResponse;
        }
    };
}

/**
 * initialize service with the default implementation of underlying client.
 * @param {{Object}} serviceOptions - configuration callback and options required to create service instance.
 * @returns {{dw.svc.Service}} returns service instance
 */
function initializeService(serviceOptions) {
    return LocalServiceRegistry.createService('sfcc-slas-auth', serviceOptions);
}

/**
 * service call to retrive access token from SLAS based on `callType` and `grantType` for customers.
 * @param {{Object}}serviceRequest - input object containing config and params requiered to authenticate/authorize customers using SLAS.
 * @returns {{object}} JSON object containting access_token and refresh_token for authorized/authenticated customers.
 */
function getTokenData(serviceRequest) {
    var tokenData = {};
    var service = initializeService(getAuthServiceOptions());
    var responseObject;
    try {
        // passing Object to service.call() will convert it from JSON to queryString and will encodeURI components
        responseObject = service.call(serviceRequest);
        if (
            responseObject.object &&
            responseObject.object.client &&
            responseObject.object.client.statusCode === 200 &&
            responseObject.object.client.text
        ) {
            tokenData = JSON.parse(responseObject.object.client.text);
            tokenData.ok = true;
        } else {
            tokenData.ok = false;
            tokenData.message = responseObject.errorMessage;
        }
    } catch (e) {
        Logger.error('Exception : ' + e);
        tokenData.ok = false;
        tokenData.message = e.message;
    }
    return tokenData;
}

/**
 * service call to logout customer
 * @param {{Object}}serviceRequest - input object containing config and params requiered to logout customers.
 * @returns {{Object}} response
 */
function logoutCustomer(serviceRequest) {
    var logoutResponse = {};
    var service = initializeService(getDefaultServiceOptions());
    var credential = service.getConfiguration().getCredential();
    service.setURL(service.getURL() + '/logout');
    service.setRequestMethod('GET');
    service.addHeader('Authorization', 'Bearer ' + serviceRequest.accessToken);
    service.addParam('client_id', credential.user);
    service.addParam('channel_id', config.CHANNEL_ID);
    service.addParam('refresh_token', serviceRequest.refreshToken);
    var responseObject;
    try {
        responseObject = service.call();
        if (
            responseObject.object &&
            responseObject.object.client &&
            responseObject.object.client.text
        ) {
            logoutResponse.ok = responseObject.ok;
            logoutResponse.result = JSON.parse(
                responseObject.object.client.text
            );
        } else {
            logoutResponse.ok = false;
        }
    } catch (e) {
        Logger.error('Exception: ' + e);
        logoutResponse.ok = false;
    }
    return logoutResponse;
}

module.exports = {
    getTokenData: getTokenData,
    logoutCustomer: logoutCustomer
};
