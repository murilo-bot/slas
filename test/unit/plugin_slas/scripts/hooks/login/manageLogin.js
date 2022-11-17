'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var refreshTokenCookieRegistered = {
    name: 'cc-nx',
    value: 'WgTSTptECssl-zKmnhO4AkBpJHly-LHFSO0aixbt3Pw'
};
var refreshTokenCookieGuest = {
    name: 'cc-nx-g',
    value: 'jCOzj0CfeHl9UHACIFgqk7Na-BMOULN5x-ImeolsiMk'
};
var resp = {
    addHttpCookie: function (cookie) {
        return cookie;
    }
};
function getCookie(cookieName) {
    if (cookieName === 'cc-nx') {
        return refreshTokenCookieRegistered;
    } else if (cookieName === 'cc-nx-g') {
        return refreshTokenCookieGuest;
    }
    return null;
}

describe('handle registered and guest login via SLAS', function () {
    var manageLogin = proxyquire(
        '../../../../../../cartridges/plugin_slas/cartridge/scripts/hooks/login/manageLogin',
        {
            '*/cartridge/scripts/config/SLASConfig': proxyquire(
                '../../../../../../cartridges/plugin_slas/cartridge/scripts/config/SLASConfig',
                {
                    'dw/system/Site': {
                        getInstanceHostName: function () {
                            return 'instance host name';
                        },
                        getCurrent: function () {
                            return {
                                ID: 'siteID',
                                getCustomPreferenceValue: function () {
                                    return 'custom pref value';
                                }
                            };
                        }
                    }
                }
            ),
            'dw/system/Logger': {
                debug: function (text) {
                    return text;
                },
                error: function (text) {
                    return text;
                }
            },
            'dw/order/BasketMgr': {
                getCurrentBasket: function () {
                    return { productQuantityTotal: 1, currencyCode: 'USD' };
                }
            },
            '*/cartridge/scripts/services/CartMergeService': {
                mergeBasket: function (token) {
                    if (token) {
                        return {
                            ok: true,
                            object: {
                                client: {
                                    statusCode: 200
                                }
                            }
                        };
                    } else {
                        return {
                            ok: false
                        };
                    }
                }
            },
            '*/cartridge/scripts/helpers/slasAuthHelper': {
                getCookie: function (cookieName) {
                    return getCookie(cookieName);
                },
                getSLASUserAccessToken: function () {
                    return {
                        access_token:
                            'eyJ2ZXIiOiIxLjAiLCJraWQiOiJhNmNhYmFkOC1iYzQ1LTQ5YzYtYTRh',
                        refresh_token:
                            'jCOzj0CfeHl9UHACIFgqk7Na-BMOULN5x-ImeolsiMk',
                        ok: true
                    };
                },
                createCookie: function (name) {
                    if (name === 'cc-nx') {
                        return refreshTokenCookieRegistered;
                    } else if (name === 'cc-nx-g') {
                        return refreshTokenCookieGuest;
                    }
                    return null;
                },
                removeCookie: function (cookieName) {
                    var newCookie = {
                        name: cookieName,
                        value: '',
                        path: '/',
                        age: 0
                    };
                    resp.addHttpCookie(newCookie);
                    return true;
                },
                mergeBasket: function (accessToken) {
                    if (accessToken) {
                        return true;
                    }
                    return false;
                },
                setUserSession: function (accessToken) {
                    if (!accessToken) {
                        return false;
                    }
                    return true;
                }
            }
        }
    );
    it('should return true if the registered user login  via SLAS is successful', function () {
        var input = {};
        input.user = 'tester@example.com';
        input.password = 'password';
        input.refresh_token = getCookie('cc-nx');
        input.req = {};
        input.resp = resp;
        assert.equal(true, manageLogin.handleRegistered(input));
    });
    it('should return false if username and password are not sent for SLAS login', function () {
        var input = {};
        input.refresh_token = getCookie('cc-nx');
        input.req = {};
        input.resp = resp;
        assert.equal(false, manageLogin.handleRegistered(input));
    });
    it('should return false if Response object is not passed in Registered Login for dropping cookies', function () {
        var input = {};
        input.refresh_token = getCookie('cc-nx');
        assert.equal(false, manageLogin.handleRegistered(input));
    });
    it('should return true if the guest user login  via SLAS is successful', function () {
        assert.equal(true, manageLogin.handleGuest(resp, {}));
    });
    it('should return false if Response object is not passed in Guest Login for dropping cookies', function () {
        assert.equal(false, manageLogin.handleGuest());
    });
});
