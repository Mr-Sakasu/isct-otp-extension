# Science Tokyo OTP Autofill

[English](#english) · [日本語](#日本語) · [简体中文](#简体中文)

## English

This is a Chrome Manifest V3 extension for your own login at `https://isct.ex-tic.com/auth/session/second_factor`. Once configured, it selects your OTP method, fills the code, and submits the matching form. It supports a TOTP setup key or OTP email delivered to Gmail. You enter your username and password yourself.

## Install and use

1. Download this repository. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the repository directory.
2. Open the extension's **Details → Extension options**. Choose **Authenticator app** or **OTP email in Gmail** and save.
3. For app authentication, paste your own Base32 setup key or `otpauth://totp` link in options and save. The key must be the same one registered with Science Tokyo. A six digit code shown in an app is not the setup key. If you no longer have the setup key, the account's authentication method must be set up again through the official portal.
4. For Gmail authentication, complete the Google OAuth setup below, then click **Connect Gmail** in options. Sign in to the Gmail account registered to receive the OTP. The extension clicks **Send One-Time Password**, checks for a new email from `noreply@ex-tic.com`, then enters and submits its code.
5. Reload the extension after installing an update, then open the site's second-factor page. With a saved authenticator key, **OTP (App) Authentication** is selected automatically and a fresh code is submitted. The Gmail setting selects **OTP (Email) Authentication** instead. Existing manual input or an already selected different method is left for you to complete.

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

- The provided second-factor HTML was used to reconstruct a fixture with synthetic tokens. Browser tests verify method selection and submission of the correct form using the actual form and input IDs. Server acceptance and a live authenticated login remain unverified. If the site changes its markup, update `content_script.js`.
- This repository contains no personal Gmail address, Gmail password, email content, or authenticator key. Google handles Gmail sign-in. Each user must grant Gmail read-only access for the Gmail method.
- The authenticator key is stored in Chrome's local extension storage, which [Chrome says is not encrypted](https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy). It is not synced or sent to a server. Anyone with access to this browser profile or a compromised device could obtain it. Automatic second-factor entry weakens the account protection on this device.
- Gmail codes are accepted only when their From header matches the documented sender, their subject and OTP label match, they arrived around the send action, and they have not already been used by this extension in the current browser session.
- This extension has not been tested against a live authenticated Science Tokyo login. Test it with your own account before sharing it.

Run local checks with `node --test test/core.test.js` and `node --check` on the JavaScript files. The browser smoke test is described below.

Sources: [Science Tokyo login guide](https://www.helpdesk.cii.isct.ac.jp/st/helpdesk/science-tokyo/login-en.html), [Chrome OAuth guide](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth), [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

## 日本語

このChrome拡張機能は、**自分のアカウント**の `https://isct.ex-tic.com/auth/session/second_factor` で、設定した認証方式を選択し、ワンタイムパスワードを入力して送信します。認証アプリ（TOTP）とGmailに届くメール認証に対応します。ユーザー名・パスワードは利用者が入力します。

### インストールと使い方

1. このリポジトリをダウンロードします。Chromeの `chrome://extensions` で**デベロッパーモード**を有効にし、**パッケージ化されていない拡張機能を読み込む**からリポジトリのフォルダを選びます。
2. 拡張機能の**詳細 → 拡張機能のオプション**を開きます。**Authenticator app**（認証アプリ）か **OTP email in Gmail**（Gmailメール認証）を選び、**Save settings**を押します。
3. **認証アプリ:** 公式ポータルでアプリ認証を設定する際のBase32設定キー、または `otpauth://totp` リンクをオプション画面に貼り付けて保存します。アプリに表示される6桁の番号は設定キーではありません。設定キーが残っていない場合は、公式ポータルでアプリ認証を再設定してください。
4. **Gmailメール認証:** このリポジトリのOAuthクライアントIDは仮値です。先に下記の設定を行い、オプション画面で**Connect Gmail**を押します。OTPを受け取るGmailアカウントでGoogleの読み取り権限を許可します。
5. 更新版を入れたら拡張機能を再読み込みし、サイトの二段階認証画面を開きます。設定キーが保存済みなら「OTP (App) Authentication」を自動選択し、新しいTOTPコードを入力して送信します。メール方式では「OTP (Email) Authentication」を選択して送信ボタンを押し、`noreply@ex-tic.com` から届いた新しいメールのコードを入力して「次へ」を押します。既に手入力している場合や別の認証方式を選択済みの場合は、自動送信を行いません。

**設定キー**は、認証アプリの登録時に表示されるQRコードに含まれる、毎回変わらない秘密の文字列です。「手動入力用キー」が表示される場合は同じものです。Googleのパスワードや、アプリに表示される6桁のコードではありません。拡張機能はこのキーからコードを生成し、スマートフォンのGoogle Authenticatorからコードを読み取ることはできません。設定キーはGitHubやチャットに貼らないでください。

### Gmail OAuth設定

1. Google CloudプロジェクトでGmail APIを有効にし、OAuth同意画面に `https://www.googleapis.com/auth/gmail.readonly` スコープを設定します。
2. 一度拡張機能を読み込み、`chrome://extensions` に表示される拡張機能IDを控えます。
3. OAuthクライアントを **Chrome Extension** 種別で作成し、拡張機能IDをアイテムIDとして入力します。同意画面がテストモードなら、受信に使うGmailアカウントをテストユーザーに追加します。
4. `manifest.json` の `REPLACE_WITH_YOUR_CHROME_EXTENSION_CLIENT_ID.apps.googleusercontent.com` を発行されたクライアントIDに置き換え、拡張機能を再読み込みします。
5. オプション画面で**Connect Gmail**を押します。公開配布する場合、OAuthクライアントには公開版の拡張機能IDを使ってください。

`gmail.readonly` はGoogleの制限付きスコープです。Gmail機能を一般公開する場合、GoogleによるOAuth審査が必要になる可能性があります。拡張機能は特定の送信元と件名だけを処理しますが、Googleの許可画面ではメールボックス全体の読み取り権限が表示されます。

### 個人情報と制限

- Gmailアドレス、Gmailパスワード、メール本文、認証アプリの設定キーはこのリポジトリに含めません。GoogleへのログインはGoogleの画面で行います。設定キーはChromeの**拡張機能のローカルストレージ**に保存され、拡張機能による同期や外部送信はしません。ただし、[Chromeのローカルストレージは暗号化されない](https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy)ため、この端末やブラウザのプロファイルにアクセスできる人には漏れる可能性があります。
- 自動入力すると、この端末上では二段階認証の効果が弱まります。自分のアカウントと信頼できる端末で使ってください。
- 提供された認証画面HTMLのフォーム構造を、ダミーのトークンを使って再現しました。実際のフォームID・入力欄IDを使い、認証方式の選択と正しいフォームの送信をブラウザで検証しています。大学サーバーでの認証成功は未検証です。サイトのHTMLが変わると `content_script.js` の修正が必要になる場合があります。

## 简体中文

此Chrome扩展会在 `https://isct.ex-tic.com/auth/session/second_factor` 为**您自己的账户**选择已配置的验证方式、填写并提交一次性密码。支持身份验证器的设置密钥（TOTP），以及发送到Gmail的邮件验证码。用户名和密码仍由您自行输入。

### 安装与使用

1. 下载此仓库，在Chrome中打开 `chrome://extensions`，开启**开发者模式**，点击**加载已解压的扩展程序**，选择仓库文件夹。
2. 打开扩展的**详情 → 扩展程序选项**。选择 **Authenticator app**（身份验证器）或 **OTP email in Gmail**（Gmail邮件验证码），然后点击 **Save settings**。
3. **身份验证器：** 在官方网站设置应用验证时，复制Base32设置密钥或 `otpauth://totp` 链接，粘贴到选项页并保存。应用当前显示的六位数字不是设置密钥。若密钥已丢失，请通过官方网站重新设置应用验证。
4. **Gmail邮件：** 当前仓库的OAuth客户端ID只是占位符。须先完成下方的Gmail OAuth设置，再在选项页点击 **Connect Gmail**，使用接收验证码的Gmail账户同意只读权限。
5. 安装更新后重新加载扩展，再打开网站的二次验证页面。保存设置密钥后，扩展会自动选择 **OTP (App) Authentication** 并生成、提交新的TOTP验证码。邮件方式下，扩展会选择 **OTP (Email) Authentication**、点击发送按钮、等待 `noreply@ex-tic.com` 的新邮件，然后填写验证码并点击“下一步”。若已有手动输入或您已选择其他验证方式，扩展不会自动提交。

**设置密钥**是注册身份验证器时显示的二维码中包含的固定秘密字符串。如果网站显示“手动输入密钥”，它就是同一个秘密。它不是Google密码，也不是应用当前显示的六位验证码。扩展使用此密钥生成验证码，无法直接读取您手机上的Google Authenticator。请勿将设置密钥发布到GitHub或聊天中。

### Gmail OAuth设置

1. 在Google Cloud项目中启用Gmail API，并在OAuth同意页面配置 `https://www.googleapis.com/auth/gmail.readonly` 权限范围。
2. 先加载一次扩展，从 `chrome://extensions` 复制扩展ID。
3. 创建类型为 **Chrome Extension** 的OAuth客户端，将扩展ID填入项目ID。如果同意页面处于测试模式，请将接收邮件的Gmail账户加入测试用户。
4. 将 `manifest.json` 中的 `REPLACE_WITH_YOUR_CHROME_EXTENSION_CLIENT_ID.apps.googleusercontent.com` 替换为新客户端ID，然后重新加载扩展。
5. 在选项页点击 **Connect Gmail**。公开发布时，OAuth客户端必须使用发布版本的扩展ID。

`gmail.readonly` 属于Google的受限权限范围。公开提供Gmail功能可能需要通过Google的OAuth审核。虽然扩展只处理指定发件人和主题的邮件，但授权页面请求的是整个邮箱的只读访问权限。

### 隐私与限制

- 此仓库不包含Gmail地址、Gmail密码、邮件内容或身份验证器密钥。Google登录在Google页面完成。设置密钥保存在Chrome的**扩展本地存储**中，不会由此扩展同步或上传；但[Chrome的本地扩展存储未加密](https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy)，能够访问该设备或浏览器配置文件的人仍可能获取它。
- 自动填写会削弱此设备上的第二重验证。请仅用于自己的账户和可信设备。
- 已根据提供的验证页面HTML，用虚拟令牌重建表单，并在浏览器中使用真实表单及输入框ID验证方式选择与正确表单的提交。尚未验证大学服务器是否接受登录。网站HTML变更时，可能需要修改 `content_script.js`。

## Browser test / ブラウザテスト / 浏览器测试

Use Chromium or Chrome for Testing to run the browser smoke test. Official Chrome builds no longer support command-line extension loading. The test uses a mock form and mock email at the second-factor URL; it does **not** contact a real account or Gmail inbox. / Chromium または Chrome for Testing で実行してください。模擬フォームと模擬メールを使い、実際のアカウントやGmailにはアクセスしません。/ 请使用Chromium或Chrome for Testing。测试只使用模拟表单和模拟邮件，不访问真实账户或Gmail邮箱。

The fixture reproduces the supplied hidden TOTP/email forms and method selector with synthetic tokens. It verifies automatic selection, correct form submission exactly once, no action without configuration, preservation of manual input, and no override of another selected method. / 提供されたHTMLの非表示フォームと認証方式選択画面を再現し、自動選択・一度だけの正しい送信・未設定時の停止・手入力の保持・別方式を選択済みの場合の停止を確認します。/ 测试重现提供的隐藏表单与方式选择器，验证自动选择、正确表单仅提交一次、未配置时不操作、保留手动输入及不覆盖其他已选方式。

```sh
CHROME_BIN=/path/to/chrome-for-testing node test/browser-smoke.mjs
```

Source for the Chrome testing requirement: [Chromium Extensions announcement](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY/m/S0ET5wPjCAAJ).
