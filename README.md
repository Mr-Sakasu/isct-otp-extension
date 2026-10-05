# Science Tokyo OTP Autofill

[English](README.md) · [日本語](docs/README.ja.md) · [简体中文](docs/README.zh-CN.md)

This is a Chrome Manifest V3 extension for your own login at `https://isct.ex-tic.com/auth/session/second_factor`. Once configured, it selects OTP app authentication, generates a code locally from your saved TOTP setup key, and submits the matching form. You can also save your university username and password for automatic entry at `https://isct.ex-tic.com/auth/session`; the extension waits for the password step, submits it, and then completes OTP authentication while unlocked.

## Install and use

1. Download this repository. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the repository directory.
2. Open the extension's **Details → Extension options**.
3. Copy the Base32 key displayed by **Show secret key** on the university setup page into **Setup key**. Set and confirm a long, unique encryption passphrase of at least 6 characters, then click **Save settings**. No QR scan or Google Authenticator registration is required. If the university asks for an initial verification code, click **Show current code** and enter that code on the university setup page to complete enrollment. The saved key must match the university's active registration. Existing `otpauth://totp` links are also supported.
4. For automatic username/password entry, fill **University username** and **University password** before saving. If the setup key is already saved, unlock it first, leave **Setup key** blank, enter your existing or a new encryption passphrase twice, and save.
5. Reload the extension after installing an update. Enter your encryption passphrase in **Passphrase to unlock or view the saved key**, click **Unlock for 30 minutes**, then open or reload `https://isct.ex-tic.com/auth/session` for the full login flow, or the second-factor page for OTP only. **OTP (App) Authentication** is selected automatically and a fresh code is submitted. Existing manual input or an already selected different method is left for you to complete.

## OTP app authentication setup

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

The **setup key** is the persistent secret encoded in the QR code displayed during authenticator enrollment. A manual setup key, if the site shows one, is the same secret. It is not your university password or the changing six-digit code. The extension generates codes from this secret; it cannot read the Google Authenticator app on your phone. Keep the key private and never paste it into GitHub issues or chat.

## Limits and security

- The public first-login form and provided second-factor HTML were used to reconstruct a fixture with synthetic tokens. Browser tests verify method selection and submission of the correct form using the actual form and input IDs. Server acceptance and a live authenticated login remain unverified. If the site changes its markup, update `login_script.js` or `content_script.js`.
- This repository contains no personal login credentials or setup keys.
- Your optional university username/password and the setup key are encrypted locally with Web Crypto **AES-256-GCM**, a fresh random 16-byte salt and 12-byte nonce per save, and a key derived from your passphrase using **PBKDF2-SHA256, 600,000 iterations**. Only the encrypted record and nonsecret parameters are stored persistently in `chrome.storage.local`. The passphrase and derived encryption key are not stored. The extension does not sync or upload them. The username and university password, if configured, are sent only to the university's HTTPS login form. The generated OTP is sent to its second-factor form. Neither the setup key nor the encryption passphrase is submitted. TOTP generation, unlock, and local key/code display make no network requests.
- [Chrome extension storage is not encrypted automatically](https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy); this extension encrypts the key before storing it. While unlocked, plaintext login credentials and TOTP configuration is held in `chrome.storage.session`, which [Chrome documents as memory-only](https://developer.chrome.com/docs/extensions/reference/api/storage#property-session). Both storage areas are restricted to trusted extension contexts; the first login page can request the username/password; the second-factor page can request only a code.
- Encryption protects a stolen locked storage record, subject to passphrase strength. It does not protect against malware, a modified extension, browser control, or a keylogger while you unlock/use/view the key. An attacker controlling the legitimate sign-in page may also capture login credentials or OTPs. Keeping the key on the login device weakens protection compared with a separate second factor. No independent security audit has been performed.
- Clearing browsing cache does not delete the encrypted key. Use **Remove saved data** or uninstall the extension to remove active local storage. This does not securely erase older disk fragments or copies in backups, including plaintext from version 0.2. If those copies are a concern, enroll a new university key after migration.
- The user confirmed that OTP works in their browser. The new username/password flow is tested using a fixture reconstructed from the public login page; server acceptance of that new flow remains unverified.

Six characters is the minimum accepted passphrase; a longer, unique passphrase provides better protection against guessing.

Run local checks with `node --test test/core.test.js test/vault.test.js` and `node --check` on the JavaScript files. The browser smoke test is described below.

Source: [Science Tokyo login guide](https://www.helpdesk.cii.isct.ac.jp/st/helpdesk/science-tokyo/login-en.html).

Encryption references: [Web Crypto authenticated encryption](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt#supported_algorithms), [OWASP PBKDF2 work factor](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#pbkdf2).

## Browser verification

Run `node --test test/core.test.js test/vault.test.js`. The browser test requires Chromium or Chrome for Testing:

```sh
CHROME_BIN=/path/to/chrome-for-testing node test/browser-smoke.mjs
```

Tests use synthetic accounts and tokens. They verify username → password → OTP transitions, one submission per step, manual-input preservation, stopping after errors, password/account matching, same-origin forms, encryption/migration, lock/unlock, memory-only sessions after restart, key reveal timeout, and all three language pages.
