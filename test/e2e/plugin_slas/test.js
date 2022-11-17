// All tests in this file run against a live sandbox instance. Do NOT modify execution order for individual tests unless you know what you're doing.

var fetch = require('node-fetch');
var assert = require('chai').assert;
var JSDOM = require('jsdom').JSDOM;

var config = {
    // BASE_URL looks like https://zzrf-003.dx.commercecloud.salesforce.com/on/demandware.store/Sites-RefArch-Site/en_US
    SFCC_BASE_URL: process.env.SFCC_BASE_URL,
    SFCC_SHOPPER_EMAIL: process.env.SFCC_SHOPPER_EMAIL,
    SFCC_SHOPPER_PASSWORD: process.env.SFCC_SHOPPER_PASSWORD
};

var actions = {
    LOGIN: config.SFCC_BASE_URL + '/Account-Login',
    REGISTER: config.SFCC_BASE_URL + '/Account-SubmitRegistration',
    LOGIN_PAGE: config.SFCC_BASE_URL + '/Login-Show',
    LOGOUT_PAGE: config.SFCC_BASE_URL + '/Login-Logout',
    GEOLOCATION: config.SFCC_BASE_URL + '/TestHelper-TestGeoLocation',
    GEOLOCATION_NO_SLAS:
        config.SFCC_BASE_URL + '/TestHelper-TestGeoLocationSlasExclude',
    SET_SESSION_ATTRS: config.SFCC_BASE_URL + '/TestHelper-SetSessionVars',
    GET_SESSION_ATTRS: config.SFCC_BASE_URL + '/TestHelper-GetSessionVars',
    ADD_TO_CART: config.SFCC_BASE_URL + '/Cart-AddProduct',
    DELETE_BASKET: config.SFCC_BASE_URL + '/BasketTestHelper-DeleteBasket',
    GET_USER_BASKET:
        config.SFCC_BASE_URL + '/BasketTestHelper-CurrentOrNewBasket',
    GET_REGISTERED_JWT:
        config.SFCC_BASE_URL + '/TestHelper-GetRegisteredUserJWT',
    REMOVE_CUSTOMER:
        config.SFCC_BASE_URL + '/CustomerTestHelper-DeleteCustomer'
};

function parseCookies(response) {
    var raw = response.headers.raw()['set-cookie'];
    return raw.map(function (entry) {
        var parts = entry.split(';');
        var cookiePart = parts[0];
        return cookiePart;
    });
}

function cookiesAsObject(response) {
    return Object.fromEntries(
        parseCookies(response)
            .filter(Boolean)
            .map(function (v) {
                return v.replace('""', '').split('=');
            })
    );
}

describe('onSession login tests', function () {
    before(function () {
        var missingEnvVars = Object.keys(config).reduce(function (arr, key) {
            if (!config[key]) {
                arr.push(key);
            }
            return arr;
        }, []);

        if (missingEnvVars.length) {
            throw new Error(
                'Missing environment variables: ' + missingEnvVars.join(',')
            );
        }
    });

    it('guest logins retain same session on subsequent requests', async function () {
        // initial guest login
        var guestLoginResponse = await fetch(config.SFCC_BASE_URL, {
            redirect: 'manual'
        }); // need to avoid following the redirect
        assert.strictEqual(
            guestLoginResponse.status,
            302,
            'Response should be a 302 redirect'
        );
        assert.strictEqual(
            guestLoginResponse.url,
            config.SFCC_BASE_URL,
            'Response redirect should be to the same page'
        );

        var guestLoginCookies = cookiesAsObject(guestLoginResponse);
        assert.exists(
            guestLoginCookies['cc-sg'],
            'Response should set cc-sg cookie'
        );
        assert.exists(
            guestLoginCookies['cc-nx-g'],
            'Response should set cc-nx-g cookie'
        );

        // subsequent request
        var secondResponse = await fetch(config.SFCC_BASE_URL, {
            headers: { cookie: parseCookies(guestLoginResponse).join(';') }
        });
        assert.isTrue(
            secondResponse.ok,
            'Subsequent response should not be a redirect'
        );

        var secondResponseCookies = cookiesAsObject(secondResponse);
        assert.notExists(
            secondResponseCookies['cc-sg'],
            'Subsequent response should not set cc-sg cookie'
        );
    }).timeout(5000);

    it('Guest refresh token login works', async function () {
        // initial guest login
        var guestLoginResponse = await fetch(config.SFCC_BASE_URL, {
            redirect: 'manual'
        });

        // only set cc-nx-g cookie so we trigger a refresh of guest user login
        var initialLoginCookies = cookiesAsObject(guestLoginResponse);
        var secondGuestLogin = await fetch(config.SFCC_BASE_URL, {
            headers: {
                cookie: 'cc-nx-g=' + initialLoginCookies['cc-nx-g']
            },
            redirect: 'manual'
        });

        var secondLoginCookies = cookiesAsObject(secondGuestLogin);
        assert.exists(
            secondLoginCookies['cc-nx-g'],
            'Response should set a new cc-nx-g cookie'
        );
        assert.notStrictEqual(
            initialLoginCookies['cc-nx-g'],
            secondLoginCookies['cc-nx-g'],
            'The new cc-nx-g cookie should not be the same as the previous'
        );
    }).timeout(5000);

    it('Can submit login form to log in as registered user', async function () {
        // initial guest login
        var guestLoginResponse = await fetch(config.SFCC_BASE_URL, {
            redirect: 'manual'
        });
        var guestCookies = parseCookies(guestLoginResponse).join(';');

        // fetch a csrf token from the login form
        var response = await fetch(actions.LOGIN_PAGE, {
            headers: { cookie: guestCookies }
        }).then(function (res) {
            return res.text();
        });
        var csrfToken = new JSDOM(response).window.document.querySelector(
            'input[name="csrf_token"]'
        ).value;

        var form = new URLSearchParams({
            loginEmail: config.SFCC_SHOPPER_EMAIL,
            loginPassword: config.SFCC_SHOPPER_PASSWORD,
            csrf_token: csrfToken
        });

        var registeredLoginResponse = await fetch(actions.LOGIN, {
            method: 'POST',
            body: form,
            redirect: 'manual',
            headers: {
                cookie: guestCookies
            }
        });

        var registeredCookies = cookiesAsObject(registeredLoginResponse);
        assert.isEmpty(
            registeredCookies['cc-nx-g'],
            'Response should delete cc-nx-g cookie'
        );
        assert.exists(
            registeredCookies['cc-nx'],
            'Response should set cc-nx cookie'
        );

        // Since we're already logged in, we exhange cc-nx for registered user JWT to call deleteBasket for currently logged in user to perform basket based tests.
        var registeredJWTResponse = await fetch(
            actions.GET_REGISTERED_JWT +
                '?refresh_token=' +
                registeredCookies['cc-nx'],
            {
                headers: {
                    cookie: parseCookies(registeredLoginResponse).join(';')
                }
            }
        );
        var customerData = await registeredJWTResponse.json();
        var registeredUserJWT = await customerData.access_token;

        var deleteBasketRes = await fetch(
            actions.DELETE_BASKET + '?jwt=' + registeredUserJWT,
            {
                headers: {
                    cookie: parseCookies(registeredLoginResponse).join(';')
                }
            }
        );
        var deleteBasketSuccess = await deleteBasketRes;

        assert.notExists(
            deleteBasketSuccess.error,
            deleteBasketSuccess.errorMessage
        );
    }).timeout(5000);

    // This test assumes registered user has an empty basket.
    it('guest user logs in without adding items to basket returns empty basket works', async function () {
        // initial guest login
        var guestLoginResponse = await fetch(config.SFCC_BASE_URL, {
            redirect: 'manual'
        });
        var guestCookies = parseCookies(guestLoginResponse).join(';');

        // Verify guest basket does not exist
        var getCurrentBasketRes = await fetch(actions.GET_USER_BASKET, {
            headers: {
                cookie: guestCookies
            }
        });
        var guestBasket = await await getCurrentBasketRes.json();

        assert.notExists(guestBasket.basketID);

        // Login guest user and get registered user JWT

        // fetch a csrf token from the login form
        var response = await fetch(actions.LOGIN_PAGE, {
            headers: { cookie: guestCookies }
        }).then(function (res) {
            return res.text();
        });
        var csrfToken = new JSDOM(response).window.document.querySelector(
            'input[name="csrf_token"]'
        ).value;

        var form = new URLSearchParams({
            loginEmail: config.SFCC_SHOPPER_EMAIL,
            loginPassword: config.SFCC_SHOPPER_PASSWORD,
            csrf_token: csrfToken
        });

        var registeredLoginResponse = await fetch(actions.LOGIN, {
            method: 'POST',
            body: form,
            redirect: 'manual',
            headers: {
                cookie: guestCookies
            }
        });

        var registeredCookies = cookiesAsObject(registeredLoginResponse);
        assert.isEmpty(
            registeredCookies['cc-nx-g'],
            'Response should delete cc-nx-g cookie'
        );
        assert.exists(
            registeredCookies['cc-nx'],
            'Response should set cc-nx cookie'
        );

        // Get registered user basket
        var getCurrentRegisteredBasketRes = await fetch(actions.GET_USER_BASKET, {
            headers: {
                cookie: parseCookies(registeredLoginResponse).join(';')
            }
        });
        var registeredUserBasket =
            await await getCurrentRegisteredBasketRes.json();

        assert.notExists(registeredUserBasket.basketID);
    }).timeout(5000);

    // This test assumes registered user has an empty basket.
    it('guest user basket persists on existing account login works', async function () {
        // initial guest login
        var guestLoginResponse = await fetch(config.SFCC_BASE_URL, {
            redirect: 'manual'
        });
        var guestCookies = parseCookies(guestLoginResponse).join(';');

        // Add item to guest cart
        var formData = new URLSearchParams({
            pid: '701642923497M',
            quantity: 2,
            options: []
        });

        var addToBasketRes = await fetch(actions.ADD_TO_CART, {
            method: 'POST',
            body: formData,
            headers: {
                cookie: guestCookies
            }
        });

        assert.strictEqual(
            addToBasketRes.status,
            200,
            'Failed to add item to guest basket'
        );

        // Verify item exists in guest basket
        var getCurrentBasketRes = await fetch(actions.GET_USER_BASKET, {
            headers: {
                cookie: guestCookies
            }
        });
        var guestBasket = await await getCurrentBasketRes.json();

        assert.exists(guestBasket.basketID);
        assert.strictEqual(
            guestBasket.productQuantityTotal,
            2,
            'Item quantity in basket does not match'
        );

        // Login guest user and get registered user JWT

        // fetch a csrf token from the login form
        var response = await fetch(actions.LOGIN_PAGE, {
            headers: { cookie: guestCookies }
        }).then(function (res) {
            return res.text();
        });
        var csrfToken = new JSDOM(response).window.document.querySelector(
            'input[name="csrf_token"]'
        ).value;

        var form = new URLSearchParams({
            loginEmail: config.SFCC_SHOPPER_EMAIL,
            loginPassword: config.SFCC_SHOPPER_PASSWORD,
            csrf_token: csrfToken
        });

        var registeredLoginResponse = await fetch(actions.LOGIN, {
            method: 'POST',
            body: form,
            redirect: 'manual',
            headers: {
                cookie: guestCookies
            }
        });

        var registeredCookies = cookiesAsObject(registeredLoginResponse);
        assert.isEmpty(
            registeredCookies['cc-nx-g'],
            'Response should delete cc-nx-g cookie'
        );
        assert.exists(
            registeredCookies['cc-nx'],
            'Response should set cc-nx cookie'
        );

        // Get registered user basket
        var getCurrentRegisteredBasketRes = await fetch(actions.GET_USER_BASKET, {
            headers: {
                cookie: parseCookies(registeredLoginResponse).join(';')
            }
        });
        var registeredUserBasket =
            await await getCurrentRegisteredBasketRes.json();

        assert.exists(registeredUserBasket.basketID);
        assert.strictEqual(
            registeredUserBasket.productQuantityTotal,
            2,
            'Item quantity in basket does not match after login'
        );

        // Since we're already logged in, we exhange cc-nx for registered user JWT to reset baskets at the end of the test.
        var registeredJWTResponse = await fetch(
            actions.GET_REGISTERED_JWT +
                '?refresh_token=' +
                registeredCookies['cc-nx'],
            {
                headers: {
                    cookie: parseCookies(registeredLoginResponse).join(';')
                }
            }
        );
        var customerData = await registeredJWTResponse.json();
        var registeredUserJWT = await customerData.access_token;

        var deleteBasketRes = await fetch(
            actions.DELETE_BASKET + '?jwt=' + registeredUserJWT,
            {
                headers: {
                    cookie: parseCookies(registeredLoginResponse).join(';')
                }
            }
        );
        var deleteBasketSuccess = await deleteBasketRes;

        assert.notExists(
            deleteBasketSuccess.error,
            deleteBasketSuccess.errorMessage
        );
    }).timeout(5000);

    it('guest user basket persists on logging into newly registered account works', async function () {
        // initial guest login
        var guestLoginResponse = await fetch(config.SFCC_BASE_URL, {
            redirect: 'manual'
        });
        var guestCookies = parseCookies(guestLoginResponse).join(';');

        // Add item to guest cart
        var formData = new URLSearchParams({
            pid: '701642923497M',
            quantity: 2,
            options: []
        });

        var addToBasketRes = await fetch(actions.ADD_TO_CART, {
            method: 'POST',
            body: formData,
            headers: {
                cookie: guestCookies
            }
        });

        assert.strictEqual(
            addToBasketRes.status,
            200,
            'Failed to add item to guest basket'
        );

        // Verify item exists in guest basket
        var getCurrentBasketRes = await fetch(actions.GET_USER_BASKET, {
            headers: {
                cookie: guestCookies
            }
        });
        var guestBasket = await await getCurrentBasketRes.json();

        assert.exists(guestBasket.basketID);
        assert.strictEqual(
            guestBasket.productQuantityTotal,
            2,
            'Item quantity in basket does not match'
        );

        // Create new user account
        // fetch a csrf token from the login form
        var response = await fetch(actions.LOGIN_PAGE, {
            headers: { cookie: guestCookies }
        }).then(function (res) {
            return res.text();
        });
        var csrfToken = new JSDOM(response).window.document.querySelector(
            'input[name="csrf_token"]'
        ).value;

        var createAccountFormData = new URLSearchParams({
            dwfrm_profile_customer_firstname: 'Demo First',
            dwfrm_profile_customer_lastname: 'Demo Last',
            dwfrm_profile_customer_phone: '8572076928',
            dwfrm_profile_customer_email: 'new' + config.SFCC_SHOPPER_EMAIL,
            dwfrm_profile_customer_emailconfirm:
                'new' + config.SFCC_SHOPPER_EMAIL,
            dwfrm_profile_login_password: config.SFCC_SHOPPER_PASSWORD,
            dwfrm_profile_login_passwordconfirm: config.SFCC_SHOPPER_PASSWORD,
            csrf_token: csrfToken
        });

        var createAccountRes = await fetch(actions.REGISTER, {
            method: 'POST',
            body: createAccountFormData,
            redirect: 'manual',
            headers: {
                cookie: guestCookies
            }
        });
        var createAccountSuccess = await createAccountRes.json();

        assert.notExists(
            createAccountSuccess.fields,
            'Create account form data invalid.'
        );
        assert.strictEqual(
            createAccountRes.status,
            200,
            'Failed to create new account'
        );

        var form = new URLSearchParams({
            loginEmail: 'new' + config.SFCC_SHOPPER_EMAIL,
            loginPassword: config.SFCC_SHOPPER_PASSWORD,
            csrf_token: csrfToken
        });

        var registeredLoginResponse = await fetch(actions.LOGIN, {
            method: 'POST',
            body: form,
            redirect: 'manual',
            headers: {
                cookie: guestCookies
            }
        });

        var registeredCookies = cookiesAsObject(registeredLoginResponse);
        assert.isEmpty(
            registeredCookies['cc-nx-g'],
            'Response should delete cc-nx-g cookie'
        );
        assert.exists(
            registeredCookies['cc-nx'],
            'Response should set cc-nx cookie'
        );

        // Get registered user basket
        var getCurrentRegisteredBasketRes = await fetch(actions.GET_USER_BASKET, {
            headers: {
                cookie: parseCookies(registeredLoginResponse).join(';')
            }
        });
        var registeredUserBasket =
            await await getCurrentRegisteredBasketRes.json();

        assert.exists(registeredUserBasket.basketID);
        assert.strictEqual(
            registeredUserBasket.productQuantityTotal,
            2,
            'Item quantity in basket does not match after login'
        );

        // Remove customer account after tests have executed.
        var removeCustomerRes = await fetch(actions.REMOVE_CUSTOMER, {
            headers: {
                cookie: parseCookies(registeredLoginResponse).join(';')
            }
        });
        var removeCustomerSuccess = await removeCustomerRes.json();

        assert(removeCustomerRes.status, 200, 'Failed to remove customer');
        assert.notExists(
            removeCustomerSuccess.error,
            removeCustomerSuccess.errorMessage
        );
    }).timeout(5000);

    it('Registered refresh token triggers registered login', async function () {
        // initial guest login
        var guestLoginResponse = await fetch(config.SFCC_BASE_URL, {
            redirect: 'manual'
        });
        var guestCookies = parseCookies(guestLoginResponse).join(';');

        // fetch a csrf token from the login form
        var response = await fetch(actions.LOGIN_PAGE, {
            headers: { cookie: guestCookies }
        }).then(function (res) {
            return res.text();
        });
        var csrfToken = new JSDOM(response).window.document.querySelector(
            'input[name="csrf_token"]'
        ).value;

        var form = new URLSearchParams({
            loginEmail: config.SFCC_SHOPPER_EMAIL,
            loginPassword: config.SFCC_SHOPPER_PASSWORD,
            csrf_token: csrfToken
        });

        var registeredLoginResponse = await fetch(actions.LOGIN, {
            method: 'POST',
            body: form,
            redirect: 'manual',
            headers: {
                cookie: guestCookies
            }
        });

        // only set cc-nx cookie so we trigger a refresh of registered user login
        var registeredCookies = cookiesAsObject(registeredLoginResponse);
        var registeredRefreshResponse = await fetch(config.SFCC_BASE_URL, {
            headers: {
                cookie: 'cc-nx=' + registeredCookies['cc-nx']
            },
            redirect: 'manual'
        });

        var registeredRefreshCookies = cookiesAsObject(
            registeredRefreshResponse
        );

        assert.exists(
            registeredRefreshCookies['cc-nx'],
            'Response should set a new cc-nx cookie'
        );
        assert.notStrictEqual(
            registeredCookies['cc-nx'],
            registeredRefreshCookies['cc-nx'],
            'The new cc-nx cookie should not be the same as the previous'
        );
    }).timeout(5000);

    it('Registered user logout works', async function () {
        // initial guest login
        var guestLoginResponse = await fetch(config.SFCC_BASE_URL, {
            redirect: 'manual'
        });
        var guestCookies = parseCookies(guestLoginResponse).join(';');

        // fetch a csrf token from the login form
        var response = await fetch(actions.LOGIN_PAGE, {
            headers: { cookie: guestCookies }
        }).then(function (res) {
            return res.text();
        });
        var csrfToken = new JSDOM(response).window.document.querySelector(
            'input[name="csrf_token"]'
        ).value;

        var form = new URLSearchParams({
            loginEmail: config.SFCC_SHOPPER_EMAIL,
            loginPassword: config.SFCC_SHOPPER_PASSWORD,
            csrf_token: csrfToken
        });

        var registeredLoginResponse = await fetch(actions.LOGIN, {
            method: 'POST',
            body: form,
            redirect: 'manual',
            headers: {
                cookie: guestCookies
            }
        });

        var registeredCookies = cookiesAsObject(registeredLoginResponse);
        assert.isEmpty(
            registeredCookies['cc-nx-g'],
            'Response should delete cc-nx-g cookie'
        );
        assert.exists(
            registeredCookies['cc-nx'],
            'Response should set cc-nx cookie'
        );

        // log registered customer out
        var logoutResponse = await fetch(actions.LOGOUT_PAGE, {
            redirect: 'manual'
        });

        var logoutResponseCookies = parseCookies(logoutResponse);

        // Follow logout redirect to homepage
        var locationURL = new URL(
            logoutResponse.headers.get('location'),
            logoutResponse.url
        );

        var logoutRedirectResponse = await fetch(locationURL, {
            headers: { cookie: logoutResponseCookies }
        });
        assert.strictEqual(
            logoutRedirectResponse.status,
            200,
            'Logout response should be a 200 OK'
        );

        var logoutRedirectResponseCookies = cookiesAsObject(
            logoutRedirectResponse
        );

        assert.notExists(
            logoutRedirectResponseCookies['cc-nx-g'],
            'Response should delete cc-nx-g cookie'
        );
        assert.notExists(
            logoutRedirectResponseCookies['cc-nx'],
            'Response should delete cc-nx cookie'
        );
    }).timeout(5000);

    it('Geolocation remains consistent after session bridge', async function () {
        // initial guest login
        var guestLoginResponse = await fetch(config.SFCC_BASE_URL, {
            redirect: 'manual'
        });

        var guestLoginCookies = cookiesAsObject(guestLoginResponse);

        // Get Geolocation data when the request does not go through SLAS
        var geolocationNoSLAS = await fetch(actions.GEOLOCATION_NO_SLAS, {
            headers: { cookie: parseCookies(guestLoginResponse).join(';') }
        }).then(function (res) {
            return res.json();
        });
        assert.exists(
            guestLoginCookies['cc-sg'],
            'Response should set cc-sg cookie'
        );
        assert.exists(
            guestLoginCookies['cc-nx-g'],
            'Response should set cc-nx-g cookie'
        );

        // Get Geolocation data when the request goes through SLAS
        var geolocationResponse = await fetch(actions.GEOLOCATION, {
            headers: { cookie: parseCookies(guestLoginResponse).join(';') }
        }).then(function (res) {
            return res.json();
        });

        assert.strictEqual(
            geolocationResponse.geolocation.countryCode,
            geolocationNoSLAS.geolocation.countryCode,
            'Country code should match'
        );
        assert.strictEqual(
            geolocationResponse.geolocation.latitude,
            geolocationNoSLAS.geolocation.latitude,
            'Latitude data should match'
        );
        assert.strictEqual(
            geolocationResponse.geolocation.longitude,
            geolocationNoSLAS.geolocation.longitude,
            'Longitude data should match'
        );
    }).timeout(5000);

    it('Custom session attributes are restored after session bridge', async function () {
        // initial guest login
        var guestLoginResponse = await fetch(config.SFCC_BASE_URL, {
            redirect: 'manual'
        });
        var guestCookies = parseCookies(guestLoginResponse).join(';');

        // set custom session attributes on guest session
        var guestSessionResponse = await fetch(actions.SET_SESSION_ATTRS, {
            headers: { cookie: guestCookies }
        }).then(function (res) {
            return res.json();
        });

        // fetch a csrf token from the login form
        var response = await fetch(actions.LOGIN_PAGE, {
            headers: { cookie: guestCookies }
        }).then(function (res) {
            return res.text();
        });
        var csrfToken = new JSDOM(response).window.document.querySelector(
            'input[name="csrf_token"]'
        ).value;

        var form = new URLSearchParams({
            loginEmail: config.SFCC_SHOPPER_EMAIL,
            loginPassword: config.SFCC_SHOPPER_PASSWORD,
            csrf_token: csrfToken
        });

        // login registered customer
        var registeredLoginResponse = await fetch(actions.LOGIN, {
            method: 'POST',
            body: form,
            redirect: 'manual',
            headers: {
                cookie: guestCookies
            }
        });
        var registeredCookies = parseCookies(registeredLoginResponse).join(';');

        // get custom session attributes on registered user session
        var registeredSessionResponse = await fetch(actions.GET_SESSION_ATTRS, {
            headers: { cookie: registeredCookies }
        }).then(function (res) {
            return res.json();
        });

        assert.strictEqual(
            guestSessionResponse.sessionAttributes.custom.customCounter,
            registeredSessionResponse.sessionAttributes.custom.customCounter,
            'customCounter custom session attribute should match'
        );
        assert.strictEqual(
            guestSessionResponse.sessionAttributes.custom.custom1,
            registeredSessionResponse.sessionAttributes.custom.custom1,
            'custom1 custom session attribute should match'
        );
        assert.strictEqual(
            guestSessionResponse.sessionAttributes.custom.custom2,
            registeredSessionResponse.sessionAttributes.custom.custom2,
            'custom2 custom session attribute should match'
        );
        assert.strictEqual(
            guestSessionResponse.sessionAttributes.privacy.privacy1,
            registeredSessionResponse.sessionAttributes.privacy.privacy1,
            'privacy1 private session attribute should match'
        );
        assert.strictEqual(
            guestSessionResponse.sessionAttributes.privacy.privateCounter,
            registeredSessionResponse.sessionAttributes.privacy.privateCounter,
            'privateCounter private session attribute should match'
        );
    }).timeout(5000);

    it('Custom session attributes are not restored after logout', async function () {
        // initial guest login
        var guestLoginResponse = await fetch(config.SFCC_BASE_URL, {
            redirect: 'manual'
        });
        var guestCookies = parseCookies(guestLoginResponse).join(';');

        // set custom session attributes on guest session
        var guestSessionResponse = await fetch(actions.SET_SESSION_ATTRS, {
            headers: { cookie: guestCookies }
        }).then(function (res) {
            return res.json();
        });

        // fetch a csrf token from the login form
        var response = await fetch(actions.LOGIN_PAGE, {
            headers: { cookie: guestCookies }
        }).then(function (res) {
            return res.text();
        });
        var csrfToken = new JSDOM(response).window.document.querySelector(
            'input[name="csrf_token"]'
        ).value;

        var form = new URLSearchParams({
            loginEmail: config.SFCC_SHOPPER_EMAIL,
            loginPassword: config.SFCC_SHOPPER_PASSWORD,
            csrf_token: csrfToken
        });

        // login registered customer
        var registeredLoginResponse = await fetch(actions.LOGIN, {
            method: 'POST',
            body: form,
            redirect: 'manual',
            headers: {
                cookie: guestCookies
            }
        });
        var registeredCookies = parseCookies(registeredLoginResponse).join(';');

        // get custom session attributes on registered user session
        var registeredSessionResponse = await fetch(actions.GET_SESSION_ATTRS, {
            headers: { cookie: registeredCookies }
        }).then(function (res) {
            return res.json();
        });

        assert.strictEqual(
            guestSessionResponse.sessionAttributes.custom.customCounter,
            registeredSessionResponse.sessionAttributes.custom.customCounter,
            'customCounter custom session attribute should match'
        );
        assert.strictEqual(
            guestSessionResponse.sessionAttributes.privacy.privateCounter,
            registeredSessionResponse.sessionAttributes.privacy.privateCounter,
            'privateCounter private session attribute should match'
        );

        // log registered customer out
        var logoutResponse = await fetch(actions.LOGOUT_PAGE, {
            redirect: 'manual'
        });
        var logoutCookies = parseCookies(logoutResponse).join(';');
        // get custom session attributes on logout/guest user session
        var logoutSessionResponse = await fetch(actions.GET_SESSION_ATTRS, {
            headers: { cookie: logoutCookies }
        }).then(function (res) {
            return res.json();
        });

        assert.notExists(
            logoutSessionResponse.sessionAttributes.custom.customCounter,
            'customCounter custom session attribute should not exist'
        );
        assert.notExists(
            logoutSessionResponse.sessionAttributes.privacy.privateCounter,
            'privateCounter private session attribute should not exist'
        );
    }).timeout(7000);
});
