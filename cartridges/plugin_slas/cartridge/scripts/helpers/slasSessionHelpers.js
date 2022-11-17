'use strict';

/* global session */
var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var StringUtils = require('dw/util/StringUtils');

/**
 * get base64 service credentials for specified service ID
 * @param {string} serviceId - service ID
 * @returns {string} base64 encoded service credentials
 */
function getEncodedServiceCredentials(serviceId) {
    var service = LocalServiceRegistry.createService(serviceId, {});
    if (service && service.configuration
        && service.configuration.credential
        && service.configuration.credential.user
        && service.configuration.credential.password) {
        return StringUtils.encodeBase64(service.configuration.credential.user + ':' + service.configuration.credential.password);
    }

    return '';
}

/**
 * collects session custom and privacy variables
 * so that they can be restored after session bridge and redirect establishes new session cookie
 * @returns {Object} plain javascript object
 */
function getSessionVars() {
    var sessionObj = { custom: {}, privacy: {} };
    if (!session) return sessionObj;

    var customAttributes = session.getCustom();
    var privacyAttributes = session.getPrivacy();
    Object.keys(customAttributes).forEach(function (key) { (sessionObj.custom[key] = customAttributes[key]); });
    Object.keys(privacyAttributes).forEach(function (key) { (sessionObj.privacy[key] = privacyAttributes[key]); });
    return sessionObj;
}

/**
 * Parse request body
 * @param {dw.system.Request} req - request object
 * @returns {Object} parsed JSON body
 */
function parseRequestBody(req) {
    var Logger = require('dw/system/Logger');
    var parsedBody = {};
    if (!req || !req.body) return parsedBody;
    try {
        parsedBody = JSON.parse(req.body);
    } catch (ex) {
        Logger.error(ex.toString() + ' in ' + ex.fileName + ':' + ex.lineNumber);
    }
    return parsedBody;
}

/**
 * restore session variables from custom cache
 * @param {Object} sessionVars - session variables to restore
 */
function restoreSessionVars(sessionVars) {
    if (!sessionVars || !Object.keys(sessionVars).length) return;

    // restore custom variables
    if (sessionVars.custom) {
        Object.keys(sessionVars.custom).forEach(function (key) { (session.custom[key] = sessionVars.custom[key]); });
    }

    // restore privacy variables
    if (sessionVars.privacy) {
        Object.keys(sessionVars.privacy).forEach(function (key) { (session.privacy[key] = sessionVars.privacy[key]); });
    }
}

module.exports = {
    getEncodedServiceCredentials: getEncodedServiceCredentials,
    getSessionVars: getSessionVars,
    parseRequestBody: parseRequestBody,
    restoreSessionVars: restoreSessionVars
};
