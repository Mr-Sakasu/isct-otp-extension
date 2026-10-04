# Science Tokyo OTP Autofill

This is a Chrome Manifest V3 extension for your own login at `https://isct.ex-tic.com/auth/session/second_factor`. It fills and submits the OTP after you choose the matching authentication method on the site. It supports a TOTP setup key or OTP email delivered to Gmail. It does not handle the username and password steps.

## Install and use

1. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this directory.
2. Open the extension's **Details → Extension options**. Choose **Authenticator app** or **OTP email in Gmail** and save.
3. For app authentication, paste your own Base32 setup key or `otpauth://totp` link in options and save. The key must be the same one registered with Science Tokyo. A six digit code shown in an app is not the setup key. If you no longer have the setup key, the account's authentication method must be set up again through the official portal.
4. For Gmail authentication, complete the Google OAuth setup below, then click **Connect Gmail** in options. Sign in to the Gmail account registered to receive the OTP. The extension clicks **Send One-Time Password**, checks for a new email from `noreply@ex-tic.com`, then enters and submits its code.

The extension reads OTP emails only while the matching verification page is open. It requests read-only Gmail access; Google's permission screen covers the whole mailbox even though the code filters for one sender and subject.

## Google OAuth setup for Gmail

This repository has no Google OAuth client ID. To make Gmail work:

1. In a Google Cloud project, enable the Gmail API and configure the OAuth consent screen with `https://www.googleapis.com/auth/gmail.readonly`.
2. Load the unpacked extension once and copy its ID from `chrome://extensions`.
3. Create an OAuth client of type **Chrome Extension** and enter that extension ID as the item ID. For local testing, add the receiving Gmail account as a test user when the consent screen is in testing mode.
4. Replace `REPLACE_WITH_YOUR_CHROME_EXTENSION_CLIENT_ID.apps.googleusercontent.com` in `manifest.json` with the new client ID, then reload the extension in Chrome.
5. Open options and click **Connect Gmail**.

Keep the extension ID stable. If you distribute it publicly, use the published extension ID when creating the OAuth client. Google classifies `gmail.readonly` as a restricted scope, so public use can require Google's OAuth verification.

## Limits and security

- The form is behind sign-in, so its live DOM could not be inspected without an account. The content script only runs on the exact second-factor path and looks for an OTP field and **Next** button. If the site changes its markup, update `content_script.js`.
- The authenticator key is stored in Chrome's local extension storage, not synced and not sent to a server. Anyone with access to this browser profile or a compromised device could obtain it. Automatic second-factor entry weakens the account protection on this device.
- Gmail codes are accepted only when their From header matches the documented sender, their subject and OTP label match, they arrived around the send action, and they have not already been used by this extension in the current browser session.
- This extension has not been tested against a live authenticated Science Tokyo login. Test it with your own account before sharing it.

Run local checks with `node --test test/core.test.js` and `node --check` on the JavaScript files.

Sources: [Science Tokyo login guide](https://www.helpdesk.cii.isct.ac.jp/st/helpdesk/science-tokyo/login-en.html), [Chrome OAuth guide](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth), [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).
