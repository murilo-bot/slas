# plugin_slas

The plugin_slas cartridge extends authentication for guest users and registered shoppers using the [Shopper Login and API Access Service](https://developer.salesforce.com/docs/commerce/commerce-api/references?meta=shopper-login-and-api-access:Summary) (SLAS). 

You get the following benefits:

1. Compatibility with phased or hybrid deployments, where part of the application is built headlessly with the B2C Commerce API while other parts use SFRA controllers.
2. Longer login durations (up to 90 days) and basket persistence, thanks to refresh tokens.

## Compatibility

This cartridge works with a compatibility mode of 18.10 and newer.

## Important Considerations

The plugin_slas cartridge makes multiple calls to various APIs, which can impact storefront performance. Before adding the cartridge to a production storefront, compare the performance of your storefront with and without the cartridge to decide if it’s right for you.

The cartridge also introduces a redirect under the following conditions:
- When a shopper doesn’t have a session cookie yet
- When a shopper’s session cookie has expired
- When a search engine is indexing your site

Currently, the cartridge only replaces direct login to the B2C Commerce system where the credentials are stored within Salesforce.

When used with the [wishlists plugin](https://github.com/SalesforceCommerceCloud/plugin_wishlists), guest wishlists are not transferred on login to the registered user.

Before using the cartridge, review the [issues page](https://github.com/SalesforceCommerceCloud/plugin_slas/issues) in this repository.

## Cookies

When the plugin_slas cartridge is successfully installed and configured, it sets the following cookies:

-   `cc-nx-g`: Stores a SLAS refresh token for guest users
-   `cc-nx`: Stores a SLAS refresh token for registered users.
-   `cc-sg`: Stores a boolean used to stop guest logins when an existing session is already logged in.

## Tests

The plugin_slas cartridge comes with unit tests and end-to-end tests.

To run the unit tests, run `npm run test` at the project root.

To run the end-to-end tests, set the following environment variables then run `npm run test:e2e`.

-   `SFCC_BASE_URL`: The base URL of the store you are running the test against. For example: `https://zzrf-001.sandbox.us01.dx.commercecloud.salesforce.com/on/demandware.store/Sites-RefArch-Site/en_US`
-   `SFCC_SHOPPER_EMAIL`: The username of a test shopper
-   `SFCC_SHOPPER_PASSWORD`: The password of a test shopper

To get information on test coverage, run `npm run cover`. Coverage information is output to the `coverage` folder under root directory.

## Contributing

Before committing code to this project, always run the following commands:

- `npm run lint`
- `npm test`

## Get Started with plugin_slas

### Update Cartridge Path

The plugin_slas cartridge requires the `app_storefront_base` cartridge from SFRA.

To update your cartridge path:

1. Log in to Business Manager.
2. Go to **Administration** > **Sites** > **Manage Sites**.
3. Select the site that you want to use SLAS. Example site identifier: `RefArch`.
4. Click the **Settings** tab.
5. In the **Cartridges** field, add the new cartridge path: `plugin_slas`. It must be added _before_ the path for `app_storefront_base`. Example path: `plugin_slas:app_storefront_base`

### Create a SLAS API Client

Use the SLAS Admin UI to [create a public API client](https://developer.salesforce.com/docs/commerce/commerce-api/guide/authorization-for-shopper-apis.html#create-a-slas-client).

When creating the client, the `redirectUri` array in your request must include a URL like this:

```sh
https://$HOST/on/demandware.store/Sites-$SITE-Site/default/SLASCallback-RetrieveCode
```

Where `$HOST` is the actual hostname of your storefront and `$SITE` is your site ID.

> The value of `redirectUri` must match the site preference for **Redirect URI - SLAS Login**, which is set later in Business Manager!

### Install and Upload the Cartridge

1. Clone this repository. The name of the top-level directory is `plugin_slas`.
2. From the `plugin_slas` directory, run `npm install` to install package dependencies.
3. Create a `dw.json` file in `plugin_slas` directory. Replace the `$` strings with actual values or set the corresponding environment variables.
   
    ```json
    {
        "hostname": "$HOST.demandware.net",
        "username": "$USERNAME",
        "password": "$PASSWORD",
        "code-version": "$VERSION"
    }
    ```
4. From the `plugin_slas` directory, `npm run uploadCartridge`.

> For more information on uploading the cartridge, see the following topic on the B2C Commerce Infocenter: [Upload Code for SFRA](https://documentation.b2c.commercecloud.salesforce.com/DOC2/topic/com.demandware.dochelp/content/b2c_commerce/topics/sfra/b2c_uploading_code.html).

### Configure Cartridge in Business Manager

To configure the cartridge, log in to Business Manager as an Administrator and perform the following tasks:

#### Import services.xml

1. Go to **Administration** > **Operations** > **Import & Export**.
2. Under **Import & Export Files**, click **Upload**.
3. Click **Choose File**.
4. Go to `plugin_slas/meta/`.
5. Select `services.xml`.
6. Click **Upload**.
7. After the file has completed uploading, click **Back**.
8. Under **Services**, click **Import**.
9. Select `services.xml` and click **Next**.
10. After the file has finished validating, click **Next**.
11. Select **MERGE** and click **Import**.

#### Update Service Credentials

> These values can also be provided by editing the configuration in `./meta/services.xml` before [importing the file](#import-servicesxml).

To configure the service credentials, you need to know the following configuration values:

-   The _short code_ for your B2C Commerce instance. (Example: `kv7kzm78`)
-   The _organization ID_ for your B2C Commerce instance. (Example: `f_ecom_zzte_053`)
-   The _client ID_ used for setting up the public client for SLAS. (Example: `da422690-7800-41d1-8ee4-3ce983961078`)
-   The _storefront password_ used to protect your site. Lookup location: **Administration** > **Sites** > **Manage Sites** > _Select Site Name_ > **Site Status** > **Password**

For more information about the short code and organization ID, see [Commerce API Configuration Values](https://developer.salesforce.com/docs/commerce/commerce-api/guide/commerce-api-configuration-values.html).

To update your configuration:

1. Go to **Administration** > **Operations** > **Services**.
2. Select the **Credentials** tab.
3. Click `sfcc-slas-auth-cred` to edit the credential.
4. Set `URL` to `https://$SHORTCODE.api.commercecloud.salesforce.com/shopper/auth/v1/organizations/$ORG/oauth2`, replacing `$SHORTCODE` and `$ORG` with your short code and organization ID, respectively. Set `User` to your SLAS client ID.
5. Click **Apply** to apply the changes, then click **<< Back to List**.
6. Click `sfcc-slas-scapi-cred-baskets` to edit the credential.
7. Set `URL` to `https://$SHORTCODE.api.commercecloud.salesforce.com/checkout/shopper-baskets/v1/organizations/ORG`, replacing `$SHORTCODE` and `$ORG` with your short code and organization ID, respectively. The `User` field can be left blank.
8. Click **Apply** to apply the changes.
9. Click `controller.internal.cred` to edit the credential.
10. Set `User` to `storefront`
11. Set `Password` to your storefront password.
    > :warning: The `"controller.internal.cred"` `User` and `Password` credentials (Steps 9 and 10) are **required** even if storefront password protection is not enabled on your site. :warning:
    >
    > The `SLASSessionHelper-SaveSession` controller must be password protected to prevent bad actors from arbitrarily setting session custom / privacy attributes.
    >
    > If password protection is enabled on your site, these values are:
    > `User` = `storefront` > `Password` = the value set at **Administration** > **Sites** > **Manage Sites** > _Select Site Name_ > **Site Status** > **Password**
    >
    > If password protection is _not_ enabled, the `User` and `Password` values can be anything you choose as long as they are not blank values.

#### Import system-objecttype-extensions.xml

1. Go to **Administration** > **Site Development** > **Import & Export**.
2. Under **Import & Export Files**, click **Upload**.
3. Click **Choose File**.
4. Go to `plugin_slas/meta/`.
5. Select `system-objecttype-extensions.xml`.
6. Click **Upload**.
7. After the file has completed uploading, click **Back**.
8. Under **Meta Data**, click **Import**.
9. Select `system-objecttype-extensions.xml` and click **Next**.
10. After the file has finished validating, click **Import**.

#### Update Custom Preferences

> These values can also be provided by editing the configuration in `./meta/system-objecttype-extensions.xml` before [importing the file](#import-system-objecttype-extensionsxml).

To configure the custom preferences, you need to know the following configuration values:

-   The _redirect URI_ you configured when you set up a public client for SLAS. (See [Required SLAS Administration Tasks](#required-slas-administration-tasks))
-   The _hostname_ of your B2C Commerce instance. (Example: `zzte-053.sandbox.us01.dx.commercecloud.salesforce.com`)
-   The _site ID_ for the site you are configuring. (Example: `RefArch`)
-   The _OCAPI version_ you are using. (Example: `v22_10`)

To update your configuration:

1. Go to **Merchant Tools** > **Site Preferences** > **Custom Preferences** > **SLAS Plugin**.
2. Set **Redirect URI - SLAS Login** to the redirect URI you previously configured.
3. Set **Always Save Refresh Token** as needed. If the refresh token cookie for a registered user needs to be saved always, set the value to **Yes**. If the refresh token cookie needs to be saved only when user has selected **Remember Me**, set the value to **No**.
4. Set **SFCC OCAPI Session Bridge URI** to `https://$HOST/s/$SITE/dw/shop/$VERSION/sessions`, replacing `$HOST`, `$SITE`, and `$VERSION` with the hostname, site ID, and OCAPI version, respectively.

#### Enable IP/Geolocation Tracking

To enable client IP-based services, such as geo-location, you must set a custom Client IP Header Name. Otherwise, B2C Commerce uses the network connection source address (your CDN).

1. Go to **Merchant Tools** > **SEO** > **Customer CDN Settings**.
2. In the Dynamic Content section, enter `x-client-ip` in the Client IP Header Name and click Save.

>The default Client IP Header Name that is set in the plug-in is `x-client-ip`. If you have already set a different value in the Client IP Header Name field in Business Manager, update the `Client IP Header Name` property in Custom Preferences to match what is already set.

#### Update Open Commerce API Settings

1. Go to **Administration** > **Site Development** > **Open Commerce API Settings**.
2. Add an Open Commerce API (OCAPI) Shop API setting for the SLAS client you created earlier. Don’t forget to replace `$CLIENT` with an actual value or set the corresponding environment variable.
    
   ```json
    {
        "_v": "22.10",
        "clients": [
            {
                "client_id": "$CLIENT",
                "resources": [
                    {
                        "resource_id": "/sessions",
                        "methods": ["post"],
                        "read_attributes": "(**)",
                        "write_attributes": "(**)"
                    }
                ]
            }
        ]
    }
    ```

#### Update Firewall Rules

The plugin_slas cartridge makes OCAPI calls that come from your B2C Commerce instance and route through your CDN on the way back to the instance.

If you are using a web application firewall (WAF) with your eCDN or with a custom CDN (also known as a “stacked CDN”), you must explicitly allow requests from your instance so that they are not blocked.

Add the outgoing IP addresses of your main POD and backup POD (also known as a “disaster recovery POD”) to your WAF allowlist.

You can find the outgoing IP address of your POD using a DNS lookup. Replace `222` in the following command with the ID of your POD.

```sh
dig +short A outgoing.pod222.demandware.net
```

>Whenever a realm is moved or split, you must update these rules!

🎉 Congratulations! You’ve successfully installed and configured the plugin_slas cartridge!