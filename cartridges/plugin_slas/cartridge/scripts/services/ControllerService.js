'use strict';

var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var Logger = require('dw/system/Logger');
var URLUtils = require('dw/web/URLUtils');

var config = require('*/cartridge/scripts/config/SLASConfig');

module.exports.getService = function getService() {
    return LocalServiceRegistry.createService(config.SERVICE_IDS.INTERNAL_CONTROLLER, {
        createRequest: function (service, args) {
            var url = URLUtils.abs(args.controller);
            if (args.params) {
                Object.keys(args.params).forEach(function (key) { url.append(key, args.params[key]); });
            }
            if (args.headers) {
                Object.keys(args.headers).forEach(function (key) { service.addHeader(key, args.headers[key]); });
            }
            service.setURL(url.toString());
            Logger.warn(url.toString());
            service.setRequestMethod(args.requestMethod || 'GET');
            if (args.dwsid) {
                service.addHeader('Cookie', 'dwsid=' + args.dwsid);
            }
            return args.body;
        },
        parseResponse: function (service, result) {
            var returns = result.text;
            try {
                returns = JSON.parse(result.text);
            } catch (e) {
                Logger.error(e.toString() + ' in ' + e.fileName + ':' + e.lineNumber);
            }
            return returns;
        }
    });
};
