'use strict';

/**
 * @namespace BasketTestHelper
 */

var server = require('server');
var BasketMgr = require('dw/order/BasketMgr');
var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var config = require('*/cartridge/scripts/config/SLASConfig');

server.get(
    'CurrentOrNewBasket',
    server.middleware.https,
    function (req, res, next) {
        var createBasketIfNull = req.querystring.createBasket;
        var currentBasket;
        try {
            if (createBasketIfNull) {
                currentBasket = BasketMgr.getCurrentOrNewBasket();
            } else {
                currentBasket = BasketMgr.getCurrentBasket();
            }
        } catch (e) {
            res.json({ error: true, errorMessage: 'Failed to get basket' });
        }
        res.json(
            currentBasket
                ? {
                    basketID: currentBasket.UUID,
                    customerID: currentBasket.customer.ID,
                    productQuantityTotal: currentBasket.productQuantityTotal
                }
                : {
                    error: true,
                    errorMessage: 'Basket not found.'
                }
        );
        next();
    }
);

server.get('DeleteBasket', server.middleware.https, function (req, res, next) {
    var jwt = req.querystring.jwt;
    var basket = BasketMgr.getCurrentBasket();

    if (!jwt || !basket) {
        res.json({
            error: true,
            errorMessage:
                'Customer JWT and active basket required to delete basket.'
        });
        return next();
    }

    var basketService = LocalServiceRegistry.createService(
        'sfcc-slas-scapi-baskets',
        {
            createRequest: function (service, params) {
                return params;
            },
            parseResponse: function (response) {
                return response;
            },
            filterLogMessage: function (msg) {
                return msg;
            }
        }
    );

    basketService.setURL(basketService.getURL() + '/baskets/' + basket.UUID);
    basketService.setRequestMethod('DELETE');
    basketService.addHeader('Content-Type', 'application/json');
    basketService.addHeader('Authorization', 'Bearer ' + jwt);
    basketService.addParam('siteId', config.CHANNEL_ID);

    var responseObject = {};
    try {
        responseObject = basketService.call();
        if (!responseObject.ok) {
            res.json({
                error: true,
                errorMessage:
                    responseObject.error + ' - ' + responseObject.errorMessage
            });
        } else {
            res.json({
                result: responseObject.object.client.statusCode
            });
        }
    } catch (e) {
        res.json({
            error: true,
            errorMessage: 'Failed to delete basket.'
        });
    }
    return next();
});

module.exports = server.exports();
