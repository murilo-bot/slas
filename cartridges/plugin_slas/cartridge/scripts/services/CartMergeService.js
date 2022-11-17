'use strict';

var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var Logger = require('dw/system/Logger');
var config = require('*/cartridge/scripts/config/SLASConfig');

/**
 * initialize service with the default implementation of underlying client.
 * @param {{string}} serviceName name of service to be initialized.
 * @param {{Object}} serviceOptions - configuration callback and options required to create service instance.
 * @returns {{dw.svc.Service}} returns service instance
 */
function initializeService(serviceName, serviceOptions) {
    return LocalServiceRegistry.createService(serviceName, serviceOptions);
}

/**
 * Service call to merge guest basket with registered user's basket on successful login.
 * @param {{string}} token - access_token for registered user
 * @return {Object} response object
 */
function mergeBasket(token) {
    var service = initializeService('sfcc-slas-scapi-baskets', {
        parseResponse: function (response) {
            return response;
        },
        filterLogMessage: function (msg) {
            return msg;
        },
        mockCall: function () {
            return {
                statusCode: 200,
                statusMessage: 'Success'
            };
        }
    });
    service.setURL(service.getURL() + config.SCAPI_BASKET_MERGE_ENDPOINT);
    service.setRequestMethod('POST');
    service.addHeader('Content-Type', 'application/json');
    service.addHeader('Authorization', 'Bearer ' + token);
    service.addParam('siteId', config.CHANNEL_ID);
    service.addParam('createDestinationBasket', true);
    service.addParam('productItemMergeMode', 'sum_quantities');

    var responseObject = {};
    try {
        responseObject = service.call();
    } catch (e) {
        Logger.error('Exception: ' + e);
    }

    var mergeBasketResponse = {};
    mergeBasketResponse.ok = responseObject.ok;
    if (mergeBasketResponse.ok) {
        mergeBasketResponse.result = responseObject.object.client;
    } else {
        mergeBasketResponse.error = responseObject.error;
        mergeBasketResponse.errorMessage = responseObject.errorMessage;
    }
    return mergeBasketResponse;
}

module.exports = {
    mergeBasket: mergeBasket
};
