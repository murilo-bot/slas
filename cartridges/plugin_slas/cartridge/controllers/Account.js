/**
 * Extends Account
 *
 * @module  controllers/Account
 */

'use strict';

var server = require('server');
var base = module.superModule;
server.extend(base);
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var Resource = require('dw/web/Resource');
var accountHelpers = require('*/cartridge/scripts/helpers/accountHelpers');
var HookMgr = require('dw/system/HookMgr');

/**
 * Account-Login : The Account-Login endpoint will render the shopper's account page. Once a shopper logs in they will see is a dashboard that displays profile, address, payment and order information.
 * @name Base/Account-Login
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {middleware} - csrfProtection.validateAjaxRequest
 * @param {querystringparameter} - rurl - redirect url. The value of this is a number. This number then gets mapped to an endpoint set up in oAuthRenentryRedirectEndpoints.js
 * @param {httpparameter} - loginEmail - The email associated with the shopper's account.
 * @param {httpparameter} - loginPassword - The shopper's password
 * @param {httpparameter} - loginRememberMe - Whether or not the customer has decided to utilize the remember me feature.
 * @param {httpparameter} - csrf_token - a CSRF token
 * @param {category} - sensitive
 * @param {returns} - json
 * @param {serverfunction} - post
 *
 */

server.replace(
    'Login',
    server.middleware.https,
    csrfProtection.validateAjaxRequest,
    function (req, res, next) {
        var CustomerMgr = require('dw/customer/CustomerMgr');
        var input = {};
        input.user = req.form.loginEmail;
        input.password = req.form.loginPassword;
        input.rememberMe = !!req.form.loginRememberMe;
        input.req = req;
        input.resp = res.base;
        // Execute registered user login via slas
        var loginSuccess = HookMgr.callHook(
            'app.plugin.slas.login',
            'handleRegistered',
            input
        );
        if (loginSuccess) {
            res.setViewData({ authenticatedCustomer: CustomerMgr.getCustomerByLogin(input.user) });
            res.json({
                success: true,
                redirectUrl: accountHelpers.getLoginRedirectURL(
                    req.querystring.rurl,
                    req.session.privacyCache,
                    false
                )
            });
        } else {
            res.json({
                error: [Resource.msg('error.message.login.form', 'login', null)]
            });
        }
        return next();
    }
);

/**
 * Account-SubmitRegistration : The Account-SubmitRegistration endpoint is the endpoint that gets hit when a shopper submits their registration for a new account
 * @name Base/Account-SubmitRegistration
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {middleware} - csrfProtection.validateAjaxRequest
 * @param {querystringparameter} - rurl - redirect url. The value of this is a number. This number then gets mapped to an endpoint set up in oAuthRenentryRedirectEndpoints.js
 * @param {httpparameter} - dwfrm_profile_customer_firstname - Input field for the shoppers's first name
 * @param {httpparameter} - dwfrm_profile_customer_lastname - Input field for the shopper's last name
 * @param {httpparameter} - dwfrm_profile_customer_phone - Input field for the shopper's phone number
 * @param {httpparameter} - dwfrm_profile_customer_email - Input field for the shopper's email address
 * @param {httpparameter} - dwfrm_profile_customer_emailconfirm - Input field for the shopper's email address
 * @param {httpparameter} - dwfrm_profile_login_password - Input field for the shopper's password
 * @param {httpparameter} - dwfrm_profile_login_passwordconfirm: - Input field for the shopper's password to confirm
 * @param {httpparameter} - dwfrm_profile_customer_addtoemaillist - Checkbox for whether or not a shopper wants to be added to the mailing list
 * @param {httpparameter} - csrf_token - hidden input field CSRF token
 * @param {category} - sensitive
 * @param {returns} - json
 * @param {serverfunction} - post
 */
server.replace(
    'SubmitRegistration',
    server.middleware.https,
    csrfProtection.validateAjaxRequest,
    function (req, res, next) {
        var CustomerMgr = require('dw/customer/CustomerMgr');
        var formErrors = require('*/cartridge/scripts/formErrors');
        var registrationForm = server.forms.getForm('profile');

        // form validation
        if (
            registrationForm.customer.email.value.toLowerCase() !==
            registrationForm.customer.emailconfirm.value.toLowerCase()
        ) {
            registrationForm.customer.email.valid = false;
            registrationForm.customer.emailconfirm.valid = false;
            registrationForm.customer.emailconfirm.error = Resource.msg(
                'error.message.mismatch.email',
                'forms',
                null
            );
            registrationForm.valid = false;
        }

        if (
            registrationForm.login.password.value !==
            registrationForm.login.passwordconfirm.value
        ) {
            registrationForm.login.password.valid = false;
            registrationForm.login.passwordconfirm.valid = false;
            registrationForm.login.passwordconfirm.error = Resource.msg(
                'error.message.mismatch.password',
                'forms',
                null
            );
            registrationForm.valid = false;
        }

        if (
            !CustomerMgr.isAcceptablePassword(
                registrationForm.login.password.value
            )
        ) {
            registrationForm.login.password.valid = false;
            registrationForm.login.passwordconfirm.valid = false;
            registrationForm.login.passwordconfirm.error = Resource.msg(
                'error.message.password.constraints.not.matched',
                'forms',
                null
            );
            registrationForm.valid = false;
        }

        // setting variables for the BeforeComplete function
        var registrationFormObj = {
            firstName: registrationForm.customer.firstname.value,
            lastName: registrationForm.customer.lastname.value,
            phone: registrationForm.customer.phone.value,
            email: registrationForm.customer.email.value,
            emailConfirm: registrationForm.customer.emailconfirm.value,
            password: registrationForm.login.password.value,
            passwordConfirm: registrationForm.login.passwordconfirm.value,
            validForm: registrationForm.valid,
            form: registrationForm
        };

        if (registrationForm.valid) {
            res.setViewData(registrationFormObj);

            // eslint-disable-next-line no-shadow
            this.on('route:BeforeComplete', function (req, res) {
                var Transaction = require('dw/system/Transaction');
                var serverError;
                // getting variables for the BeforeComplete function
                var registrationForm = res.getViewData(); // eslint-disable-line

                if (registrationForm.validForm) {
                    var login = registrationForm.email;
                    var password = registrationForm.password;
                    // attempt to create a new user and log that user in.
                    try {
                        var error = {};
                        Transaction.wrap(function () {
                            var newCustomer = CustomerMgr.createCustomer(
                                login,
                                password
                            );
                            // assign values to the profile
                            var newCustomerProfile = newCustomer.getProfile();
                            newCustomerProfile.firstName =
                                registrationForm.firstName;
                            newCustomerProfile.lastName =
                                registrationForm.lastName;
                            newCustomerProfile.phoneHome =
                                registrationForm.phone;
                            newCustomerProfile.email = registrationForm.email;
                        });
                        var input = {};
                        input.user = login;
                        input.password = password;
                        input.req = req;
                        input.resp = res.base;
                        // Execute registered user login via slas
                        var loginSuccess = HookMgr.callHook(
                            'app.plugin.slas.login',
                            'handleRegistered',
                            input
                        );
                        if (!loginSuccess) {
                            error = { authError: true };
                            throw error;
                        }
                    } catch (e) {
                        if (e.authError) {
                            serverError = true;
                        } else {
                            registrationForm.validForm = false;
                            registrationForm.form.customer.email.valid = false;
                            registrationForm.form.customer.emailconfirm.valid = false;
                            registrationForm.form.customer.email.error =
                                Resource.msg(
                                    'error.message.username.invalid',
                                    'forms',
                                    null
                                );
                        }
                    }
                }

                delete registrationForm.password;
                delete registrationForm.passwordConfirm;
                formErrors.removeFormValues(registrationForm.form);

                if (serverError) {
                    res.setStatusCode(500);
                    res.json({
                        success: false,
                        errorMessage: Resource.msg(
                            'error.message.unable.to.create.account',
                            'login',
                            null
                        )
                    });

                    return;
                }
                if (registrationForm.validForm) {
                    var authenticatedCustomer = CustomerMgr.getCustomerByLogin(
                        registrationForm.email
                    );
                    if (
                        authenticatedCustomer &&
                        authenticatedCustomer.getProfile()
                    ) {
                        // send a registration email
                        accountHelpers.sendCreateAccountEmail(
                            authenticatedCustomer.getProfile()
                        );
                    }
                    res.setViewData({
                        authenticatedCustomer: authenticatedCustomer
                    });
                    res.json({
                        success: true,
                        redirectUrl: accountHelpers.getLoginRedirectURL(
                            req.querystring.rurl,
                            req.session.privacyCache,
                            true
                        )
                    });

                    req.session.privacyCache.set('args', null);
                } else {
                    res.json({
                        fields: formErrors.getFormErrors(registrationForm)
                    });
                }
            });
        } else {
            res.json({
                fields: formErrors.getFormErrors(registrationForm)
            });
        }

        return next();
    }
);

module.exports = server.exports();
