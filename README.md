# Science Tokyo OTP Autofill

[English](README.md) · [日本語](docs/README.ja.md) · [简体中文](docs/README.zh-CN.md)

This is a Chrome Manifest V3 extension for your own login at `https://isct.ex-tic.com/auth/session/second_factor`. Once configured, it selects your OTP method, fills the code, and submits the matching form. It supports a TOTP setup key or OTP email delivered to Gmail. You can also save your university username and password for automatic entry at `https://isct.ex-tic.com/auth/session`; the extension waits for the password step, submits it, and then completes OTP authentication while unlocked.

## Install and use

1. Download this repository. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the repository directory.
2. Open the extension's **Details → Extension options**. Choose **Setup key (TOTP)** or **OTP email in Gmail** and save.
3. For TOTP, copy the Base32 key displayed by **Show secret key** on the university setup page into **Setup key**. Set and confirm a long, unique encryption passphrase of at least 6 characters, then click **Save settings**. No QR scan or Google Authenticator registration is required. If the university asks for an initial verification code, click **Show current code** and enter that code on the university setup page to complete enrollment. The saved key must match the university's active registration. Existing `otpauth://totp` links are also supported.
4. For automatic username/password entry, fill **University username** and **University password** before saving. If the setup key is already saved, unlock it first, leave **Setup key** blank, enter your existing or a new encryption passphrase twice, and save.
5. For Gmail authentication, complete the Google OAuth setup below, then click **Connect Gmail** in options. Sign in to the Gmail account registered to receive the OTP. The extension clicks **Send One-Time Password**, checks for a new email from `noreply@ex-tic.com`, then enters and submits its code.
6. Reload the extension after installing an update. For TOTP, enter your encryption passphrase in **Passphrase to unlock or view the saved key**, click **Unlock for 30 minutes**, then open or reload `https://isct.ex-tic.com/auth/session` for the full login flow, or the second-factor page for OTP only. **OTP (App) Authentication** is selected automatically and a fresh code is submitted. The Gmail setting selects **OTP (Email) Authentication** instead. Existing manual input or an already selected different method is left for you to complete.

## OTP app authentication setup (recommended)

[Illustrated setup guide](help.html) · [Official university guide](https://www.helpdesk.cii.isct.ac.jp/st/helpdesk/science-tokyo/login_guide.html)

### 1. Open OTP app settings

In the university portal, open Multi-factor authentication (OTP), then App Authentication and Settings.

![Open OTP app settings](docs/images/otp-settings-en.svg)

### 2. Show, copy, and paste the secret key

Click Show secret key. Copy the displayed string into the extension's Setup key field. No QR scan is required.

![Show, copy, and paste the secret key](docs/images/secret-key-en.svg)

### 3. Save encrypted login data

Enter your university username, university password, and an encryption passphrase of at least 6 characters twice, then Save settings. These data are encrypted together. When adding login credentials to an existing key, unlock first and leave Setup key blank; enter your current or a new encryption passphrase twice to save.

![Save encrypted login data](docs/images/extension-setup-en.svg)

### 4. Complete university enrollment

If the university enrollment is not complete, click Show current code in extension options, enter the six-digit code into the university's Token field, and click Settings. After unlocking, open or reload https://isct.ex-tic.com/auth/session. Username, password, and OTP are entered and submitted in order.

### If app authentication was already used

**If app authentication was already used and you can no longer display its secret key, you must open OTP settings → App Authentication → Remove, delete the old registration once, then configure it again to issue a new key. Copy the newly displayed key into the extension and complete the university enrollment again. The old key stops working. If you still have the current valid key, reuse it without deleting the registration.**

Diagram only. Example text is not a real secret.

The university setup key is registered once; unlocking never requires a newly issued key. The extension locks after 30 minutes, on Chrome restart, or when the extension is reloaded or disabled. **Lock now** clears the unlocked session immediately. To inspect the saved key, enter the passphrase again and click **Show saved key for 30 seconds**; it hides after 30 seconds or when the options tab is hidden. To change the passphrase, unlock first, leave **Setup key** blank, enter and confirm the new passphrase, and save. A forgotten passphrase cannot be recovered: supply the original setup key again or enroll a new key at the university.

When upgrading from version 0.2, an existing unencrypted key is not used for automatic entry. Set and confirm a new passphrase and save, leaving **Setup key** blank to migrate that key. The active plaintext storage entry is deleted after encrypted storage succeeds.

The **setup key** is the persistent secret encoded in the QR code displayed during authenticator enrollment. A manual setup key, if the site shows one, is the same secret. It is not your Google password or the changing six-digit code. The extension generates codes from this secret; it cannot read the Google Authenticator app on your phone. Keep the key private and never paste it into GitHub issues or chat.

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

- The public first-login form and provided second-factor HTML were used to reconstruct a fixture with synthetic tokens. Browser tests verify method selection and submission of the correct form using the actual form and input IDs. Server acceptance and a live authenticated login remain unverified. If the site changes its markup, update `login_script.js` or `content_script.js`.
- This repository contains no personal Gmail address, Gmail password, email content, or authenticator key. Google handles Gmail sign-in. Each user must grant Gmail read-only access for the Gmail method.
- Your optional university username/password and the setup key are encrypted locally with Web Crypto **AES-256-GCM**, a fresh random 16-byte salt and 12-byte nonce per save, and a key derived from your passphrase using **PBKDF2-SHA256, 600,000 iterations**. Only the encrypted record and nonsecret parameters are stored persistently in `chrome.storage.local`. The passphrase and derived encryption key are not stored. The extension does not sync or upload them. The username and university password, if configured, are sent only to the university's HTTPS login form. The generated OTP is sent to its second-factor form. Neither the setup key nor the encryption passphrase is submitted. TOTP generation, unlock, and local key/code display make no network requests; Gmail mode uses Google's OAuth and Gmail API.
- [Chrome extension storage is not encrypted automatically](https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy); this extension encrypts the key before storing it. While unlocked, plaintext login credentials and TOTP configuration is held in `chrome.storage.session`, which [Chrome documents as memory-only](https://developer.chrome.com/docs/extensions/reference/api/storage#property-session). Both storage areas are restricted to trusted extension contexts; the first login page can request the username/password; the second-factor page can request only a code.
- Encryption protects a stolen locked storage record, subject to passphrase strength. It does not protect against malware, a modified extension, browser control, or a keylogger while you unlock/use/view the key. An attacker controlling the legitimate sign-in page may also capture login credentials or OTPs. Keeping the key on the login device weakens protection compared with a separate second factor. No independent security audit has been performed.
- Clearing browsing cache does not delete the encrypted key. Use **Remove saved data** or uninstall the extension to remove active local storage. This does not securely erase older disk fragments or copies in backups, including plaintext from version 0.2. If those copies are a concern, enroll a new university key after migration.
- Gmail codes are accepted only when their From header matches the documented sender, their subject and OTP label match, they arrived around the send action, and they have not already been used by this extension in the current browser session.
- The user confirmed that OTP works in their browser. The new username/password flow is tested using a fixture reconstructed from the public login page; server acceptance of that new flow remains unverified.

Six characters is the minimum accepted passphrase; a longer, unique passphrase provides better protection against guessing.

Run local checks with `node --test test/core.test.js test/vault.test.js` and `node --check` on the JavaScript files. The browser smoke test is described below.

Sources: [Science Tokyo login guide](https://www.helpdesk.cii.isct.ac.jp/st/helpdesk/science-tokyo/login-en.html), [Chrome OAuth guide](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth), [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

Encryption references: [Web Crypto authenticated encryption](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt#supported_algorithms), [OWASP PBKDF2 work factor](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#pbkdf2).

## Browser verification

Run `node --test test/core.test.js test/vault.test.js`. The browser test requires Chromium or Chrome for Testing:

```sh
CHROME_BIN=/path/to/chrome-for-testing node test/browser-smoke.mjs
```

Tests use synthetic accounts and tokens. They verify username → password → OTP transitions, one submission per step, manual-input preservation, stopping after errors, password/account matching, same-origin forms, encryption/migration, lock/unlock, memory-only sessions after restart, key reveal timeout, and all three language pages.
