'use strict';

/**
 * @namespace CustomerTestHelper
 */

var server = require('server');
var CustomerMgr = require('dw/customer/CustomerMgr');
var Transaction = require('dw/system/Transaction');

server.get(
    'DeleteCustomer',
    server.middleware.https,
    function (req, res, next) {
        /* global customer:readonly */

        if (!customer.authenticated) {
            res.json({
                error: true,
                errorMessage:
                    'Customer must be authenticated to delete customer.'
            });
            return next();
        }

        try {
            // All object modifications in ScriptAPI require a transaction.
            Transaction.wrap(function () {
                CustomerMgr.removeCustomer(customer);
            });
            res.json({
                success: true
            });
        } catch (e) {
            res.json({
                error: true,
                errorMessage: 'Failed to delete customer'
            });
        }
        return next();
    }
);

module.exports = server.exports();
