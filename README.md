# Science Tokyo OTP Autofill

[English](#english) · [日本語](#日本語) · [简体中文](#简体中文)

## English

This is a Chrome Manifest V3 extension for your own login at `https://isct.ex-tic.com/auth/session/second_factor`. It fills and submits the OTP after you choose the matching authentication method on the site. It supports a TOTP setup key or OTP email delivered to Gmail. It does not handle the username and password steps.

## Install and use

1. Download this repository. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the repository directory.
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

- The form is behind sign-in, so its live DOM could not be inspected without an account. The content script only runs on the second-factor path and looks for an OTP field and **Next** button. If the site changes its markup, update `content_script.js`.
- This repository contains no personal Gmail address, Gmail password, email content, or authenticator key. Google handles Gmail sign-in. Each user must grant Gmail read-only access for the Gmail method.
- The authenticator key is stored in Chrome's local extension storage, not synced and not sent to a server. Anyone with access to this browser profile or a compromised device could obtain it. Automatic second-factor entry weakens the account protection on this device.
- Gmail codes are accepted only when their From header matches the documented sender, their subject and OTP label match, they arrived around the send action, and they have not already been used by this extension in the current browser session.
- This extension has not been tested against a live authenticated Science Tokyo login. Test it with your own account before sharing it.

Run local checks with `node --test test/core.test.js` and `node --check` on the JavaScript files.

Sources: [Science Tokyo login guide](https://www.helpdesk.cii.isct.ac.jp/st/helpdesk/science-tokyo/login-en.html), [Chrome OAuth guide](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth), [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

## 日本語

このChrome拡張機能は、**自分のアカウント**の `https://isct.ex-tic.com/auth/session/second_factor` でワンタイムパスワードを入力して送信します。認証アプリ（TOTP）とGmailに届くメール認証に対応します。ユーザー名・パスワードの入力と、サイトでの認証方式の選択は利用者が行います。

### インストールと使い方

1. このリポジトリをダウンロードします。Chromeの `chrome://extensions` で**デベロッパーモード**を有効にし、**パッケージ化されていない拡張機能を読み込む**からリポジトリのフォルダを選びます。
2. 拡張機能の**詳細 → 拡張機能のオプション**を開きます。**Authenticator app**（認証アプリ）か **OTP email in Gmail**（Gmailメール認証）を選び、**Save settings**を押します。
3. **認証アプリ:** 公式ポータルでアプリ認証を設定する際のBase32設定キー、または `otpauth://totp` リンクをオプション画面に貼り付けて保存します。アプリに表示される6桁の番号は設定キーではありません。設定キーが残っていない場合は、公式ポータルでアプリ認証を再設定してください。
4. **Gmailメール認証:** このリポジトリのOAuthクライアントIDは仮値です。先に下記の設定を行い、オプション画面で**Connect Gmail**を押します。OTPを受け取るGmailアカウントでGoogleの読み取り権限を許可します。
5. サイト側でも同じ認証方式を選びます。メール方式では拡張機能が送信ボタンを押し、`noreply@ex-tic.com` から届いた新しいメールのコードを入力して「次へ」を押します。アプリ方式では新しいTOTPコードを生成して送信します。

### Gmail OAuth設定

1. Google CloudプロジェクトでGmail APIを有効にし、OAuth同意画面に `https://www.googleapis.com/auth/gmail.readonly` スコープを設定します。
2. 一度拡張機能を読み込み、`chrome://extensions` に表示される拡張機能IDを控えます。
3. OAuthクライアントを **Chrome Extension** 種別で作成し、拡張機能IDをアイテムIDとして入力します。同意画面がテストモードなら、受信に使うGmailアカウントをテストユーザーに追加します。
4. `manifest.json` の `REPLACE_WITH_YOUR_CHROME_EXTENSION_CLIENT_ID.apps.googleusercontent.com` を発行されたクライアントIDに置き換え、拡張機能を再読み込みします。
5. オプション画面で**Connect Gmail**を押します。公開配布する場合、OAuthクライアントには公開版の拡張機能IDを使ってください。

`gmail.readonly` はGoogleの制限付きスコープです。Gmail機能を一般公開する場合、GoogleによるOAuth審査が必要になる可能性があります。拡張機能は特定の送信元と件名だけを処理しますが、Googleの許可画面ではメールボックス全体の読み取り権限が表示されます。

### 個人情報と制限

- Gmailアドレス、Gmailパスワード、メール本文、認証アプリの設定キーはこのリポジトリに含めません。GoogleへのログインはGoogleの画面で行います。設定キーはChromeの**拡張機能のローカルストレージ**に保存され、拡張機能による同期や外部送信はしません。ただし、この端末やブラウザのプロファイルにアクセスできる人には漏れる可能性があります。
- 自動入力すると、この端末上では二段階認証の効果が弱まります。自分のアカウントと信頼できる端末で使ってください。
- 認証画面はログイン後にしか表示できないため、実際の認証済み画面では未検証です。サイトのHTMLが変わると `content_script.js` の修正が必要になる場合があります。

## 简体中文

此Chrome扩展会在 `https://isct.ex-tic.com/auth/session/second_factor` 为**您自己的账户**填写并提交一次性密码。支持身份验证器的设置密钥（TOTP），以及发送到Gmail的邮件验证码。用户名、密码和网站上的验证方式仍需由您自行选择。

### 安装与使用

1. 下载此仓库，在Chrome中打开 `chrome://extensions`，开启**开发者模式**，点击**加载已解压的扩展程序**，选择仓库文件夹。
2. 打开扩展的**详情 → 扩展程序选项**。选择 **Authenticator app**（身份验证器）或 **OTP email in Gmail**（Gmail邮件验证码），然后点击 **Save settings**。
3. **身份验证器：** 在官方网站设置应用验证时，复制Base32设置密钥或 `otpauth://totp` 链接，粘贴到选项页并保存。应用当前显示的六位数字不是设置密钥。若密钥已丢失，请通过官方网站重新设置应用验证。
4. **Gmail邮件：** 当前仓库的OAuth客户端ID只是占位符。须先完成下方的Gmail OAuth设置，再在选项页点击 **Connect Gmail**，使用接收验证码的Gmail账户同意只读权限。
5. 在网站上选择与扩展设置相同的验证方式。邮件方式下，扩展会点击发送按钮，等待 `noreply@ex-tic.com` 的新邮件，填写验证码并点击“下一步”；应用方式下，扩展会生成并提交新的TOTP验证码。

### Gmail OAuth设置

1. 在Google Cloud项目中启用Gmail API，并在OAuth同意页面配置 `https://www.googleapis.com/auth/gmail.readonly` 权限范围。
2. 先加载一次扩展，从 `chrome://extensions` 复制扩展ID。
3. 创建类型为 **Chrome Extension** 的OAuth客户端，将扩展ID填入项目ID。如果同意页面处于测试模式，请将接收邮件的Gmail账户加入测试用户。
4. 将 `manifest.json` 中的 `REPLACE_WITH_YOUR_CHROME_EXTENSION_CLIENT_ID.apps.googleusercontent.com` 替换为新客户端ID，然后重新加载扩展。
5. 在选项页点击 **Connect Gmail**。公开发布时，OAuth客户端必须使用发布版本的扩展ID。

`gmail.readonly` 属于Google的受限权限范围。公开提供Gmail功能可能需要通过Google的OAuth审核。虽然扩展只处理指定发件人和主题的邮件，但授权页面请求的是整个邮箱的只读访问权限。

### 隐私与限制

- 此仓库不包含Gmail地址、Gmail密码、邮件内容或身份验证器密钥。Google登录在Google页面完成。设置密钥保存在Chrome的**扩展本地存储**中，不会由此扩展同步或上传；能够访问该设备或浏览器配置文件的人仍可能获取它。
- 自动填写会削弱此设备上的第二重验证。请仅用于自己的账户和可信设备。
- 验证表单需要登录后才能查看，因此尚未在真实登录状态下测试。网站HTML变更时，可能需要修改 `content_script.js`。
