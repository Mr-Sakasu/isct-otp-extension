# Science Tokyo OTP Autofill

[English](#english) · [日本語](#日本語) · [简体中文](#简体中文)

## English

This is a Chrome Manifest V3 extension for your own login at `https://isct.ex-tic.com/auth/session/second_factor`. Once configured, it selects your OTP method, fills the code, and submits the matching form. It supports a TOTP setup key or OTP email delivered to Gmail. You enter your username and password yourself.

## Install and use

1. Download this repository. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the repository directory.
2. Open the extension's **Details → Extension options**. Choose **Setup key (TOTP)** or **OTP email in Gmail** and save.
3. For TOTP, copy the Base32 key displayed by **Show secret key** on the university setup page into **Setup key**. Set and confirm a long, unique encryption passphrase of at least 12 characters, then click **Save settings**. No QR scan or Google Authenticator registration is required. If the university asks for an initial verification code, click **Show current code** and enter that code on the university setup page to complete enrollment. The saved key must match the university's active registration. Existing `otpauth://totp` links are also supported.
4. For Gmail authentication, complete the Google OAuth setup below, then click **Connect Gmail** in options. Sign in to the Gmail account registered to receive the OTP. The extension clicks **Send One-Time Password**, checks for a new email from `noreply@ex-tic.com`, then enters and submits its code.
5. Reload the extension after installing an update. For TOTP, enter your encryption passphrase in **Passphrase to unlock or view the saved key**, click **Unlock for 30 minutes**, then open or reload the site's second-factor page. **OTP (App) Authentication** is selected automatically and a fresh code is submitted. The Gmail setting selects **OTP (Email) Authentication** instead. Existing manual input or an already selected different method is left for you to complete.

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

- The provided second-factor HTML was used to reconstruct a fixture with synthetic tokens. Browser tests verify method selection and submission of the correct form using the actual form and input IDs. Server acceptance and a live authenticated login remain unverified. If the site changes its markup, update `content_script.js`.
- This repository contains no personal Gmail address, Gmail password, email content, or authenticator key. Google handles Gmail sign-in. Each user must grant Gmail read-only access for the Gmail method.
- The setup key is encrypted locally with Web Crypto **AES-256-GCM**, a fresh random 16-byte salt and 12-byte nonce per save, and a key derived from your passphrase using **PBKDF2-SHA256, 600,000 iterations**. Only the encrypted record and nonsecret parameters are stored persistently in `chrome.storage.local`. The passphrase and derived encryption key are not stored. The extension does not sync or upload them. Only the generated code is submitted to the university over HTTPS. TOTP generation, unlock, and local key/code display make no network requests; Gmail mode uses Google's OAuth and Gmail API.
- [Chrome extension storage is not encrypted automatically](https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy); this extension encrypts the key before storing it. While unlocked, plaintext TOTP configuration is held in `chrome.storage.session`, which [Chrome documents as memory-only](https://developer.chrome.com/docs/extensions/reference/api/storage#property-session). Both storage areas are restricted to trusted extension contexts; the sign-in content script receives only the code.
- Encryption protects a stolen locked storage record, subject to passphrase strength. It does not protect against malware, a modified extension, browser control, or a keylogger while you unlock/use/view the key. An attacker controlling the legitimate sign-in page may also capture generated OTPs. Keeping the key on the login device weakens protection compared with a separate second factor. No independent security audit has been performed.
- Clearing browsing cache does not delete the encrypted key. Use **Remove saved key** or uninstall the extension to remove active local storage. This does not securely erase older disk fragments or copies in backups, including plaintext from version 0.2. If those copies are a concern, enroll a new university key after migration.
- Gmail codes are accepted only when their From header matches the documented sender, their subject and OTP label match, they arrived around the send action, and they have not already been used by this extension in the current browser session.
- This extension has not been tested against a live authenticated Science Tokyo login. Test it with your own account before sharing it.

Run local checks with `node --test test/core.test.js test/vault.test.js` and `node --check` on the JavaScript files. The browser smoke test is described below.

Sources: [Science Tokyo login guide](https://www.helpdesk.cii.isct.ac.jp/st/helpdesk/science-tokyo/login-en.html), [Chrome OAuth guide](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth), [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

Encryption references: [Web Crypto authenticated encryption](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt#supported_algorithms), [OWASP PBKDF2 work factor](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#pbkdf2).

## 日本語

このChrome拡張機能は、**自分のアカウント**の `https://isct.ex-tic.com/auth/session/second_factor` で、設定した認証方式を選択し、ワンタイムパスワードを入力して送信します。認証アプリ（TOTP）とGmailに届くメール認証に対応します。ユーザー名・パスワードは利用者が入力します。

### インストールと使い方

1. このリポジトリをダウンロードします。Chromeの `chrome://extensions` で**デベロッパーモード**を有効にし、**パッケージ化されていない拡張機能を読み込む**からリポジトリのフォルダを選びます。
2. 拡張機能の**詳細 → 拡張機能のオプション**を開きます。**Setup key (TOTP)**（設定キー）か **OTP email in Gmail**（Gmailメール認証）を選びます。
3. **設定キー:** 大学の設定画面で **Show secret key** を押し、表示されたBase32キーを拡張機能の **Setup key** に貼り付けます。12文字以上の長く固有の暗号化用パスフレーズを設定・確認し、**Save settings** を押します。QRの読み取りやGoogle Authenticatorへの登録は不要です。大学側の初回登録で6桁のコードを求められたら、拡張機能の **Show current code** で表示し、そのコードを大学の設定画面に入力して登録を完了します。大学側で有効なキーと同じものを保存してください。既存の `otpauth://totp` リンクも利用できます。
4. **Gmailメール認証:** このリポジトリのOAuthクライアントIDは仮値です。先に下記の設定を行い、オプション画面で**Connect Gmail**を押します。OTPを受け取るGmailアカウントでGoogleの読み取り権限を許可します。
5. 更新版を入れたら拡張機能を再読み込みします。TOTP方式は **Passphrase to unlock or view the saved key** に暗号化用パスフレーズを入力し、**Unlock for 30 minutes** を押してから大学の二段階認証画面を開くか再読み込みしてください。「OTP (App) Authentication」を自動選択し、新しいコードを入力・送信します。メール方式では「OTP (Email) Authentication」を選び、送信ボタンを押して新しいメールのコードを入力・送信します。手入力中や別方式を選択済みの場合は自動送信しません。

大学の設定キーは最初に一度だけ登録します。解除のたびに新しく発行する必要はありません。30分後・Chrome再起動時・拡張機能の再読み込みや無効化時にロックされます。**Lock now** で即時ロックできます。保存したキーを確認するときはパスフレーズを再入力して **Show saved key for 30 seconds** を押します。30秒後やタブを離れたときに隠します。パスフレーズの変更は、先に解除し、**Setup key** を空欄にして新しいパスフレーズと確認欄を入力・保存します。パスフレーズを忘れた場合は復旧できないため、元の設定キーの再入力か大学側でのキーの再登録が必要です。

バージョン0.2から更新した場合、従来の平文キーでは自動入力しません。**Setup key** を空欄にし、新しいパスフレーズと確認欄を入力して保存すると、既存キーを暗号化へ移行します。暗号化保存に成功してから、従来の平文保存項目を削除します。

**設定キー**は、認証アプリの登録時に表示されるQRコードに含まれる、毎回変わらない秘密の文字列です。「手動入力用キー」が表示される場合は同じものです。Googleのパスワードや、アプリに表示される6桁のコードではありません。拡張機能はこのキーからコードを生成し、スマートフォンのGoogle Authenticatorからコードを読み取ることはできません。設定キーはGitHubやチャットに貼らないでください。

### Gmail OAuth設定

1. Google CloudプロジェクトでGmail APIを有効にし、OAuth同意画面に `https://www.googleapis.com/auth/gmail.readonly` スコープを設定します。
2. 一度拡張機能を読み込み、`chrome://extensions` に表示される拡張機能IDを控えます。
3. OAuthクライアントを **Chrome Extension** 種別で作成し、拡張機能IDをアイテムIDとして入力します。同意画面がテストモードなら、受信に使うGmailアカウントをテストユーザーに追加します。
4. `manifest.json` の `REPLACE_WITH_YOUR_CHROME_EXTENSION_CLIENT_ID.apps.googleusercontent.com` を発行されたクライアントIDに置き換え、拡張機能を再読み込みします。
5. オプション画面で**Connect Gmail**を押します。公開配布する場合、OAuthクライアントには公開版の拡張機能IDを使ってください。

`gmail.readonly` はGoogleの制限付きスコープです。Gmail機能を一般公開する場合、GoogleによるOAuth審査が必要になる可能性があります。拡張機能は特定の送信元と件名だけを処理しますが、Googleの許可画面ではメールボックス全体の読み取り権限が表示されます。

### 個人情報と制限

- Gmailアドレス、Gmailパスワード、メール本文、設定キーはこのリポジトリに含めません。GoogleへのログインはGoogleの画面で行います。
- 設定キーはWeb Cryptoの **AES-256-GCM** で暗号化します。保存ごとにランダムな16バイトのソルトと12バイトのnonceを生成し、パスフレーズから **PBKDF2-SHA256・60万回** で暗号鍵を導出します。`chrome.storage.local` に永続保存するのは暗号データと公開パラメータのみです。パスフレーズと暗号鍵は保存しません。同期・アップロードせず、認証時は生成したコードだけをHTTPSで大学へ送ります。TOTPの生成・解除・キーやコードの確認には通信しません。Gmail方式はGoogleのOAuthとGmail APIを利用します。
- [Chromeのストレージ自体には暗号化がありません](https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy)が、この拡張機能では保存前にキーを暗号化します。解除中は平文のTOTP設定を、[メモリ内だけに保持される `chrome.storage.session`](https://developer.chrome.com/docs/extensions/reference/api/storage#property-session) に置きます。両方の保存領域を拡張機能内の信頼済みコンテキストに制限し、ログイン画面のスクリプトにはコードだけを渡します。
- ロック中の保存データを盗まれた場合の保護は、パスフレーズの強さにも依存します。解除・表示・使用中のマルウェア、拡張機能の改ざん、ブラウザの乗っ取り、キーロガーまでは防げません。大学のログイン画面を攻撃者に制御されるとOTPを盗まれる可能性もあります。独立したセキュリティ監査は未実施です。
- 閲覧キャッシュの削除では暗号データは消えません。**Remove saved key** やアンインストールで現在の保存項目を削除できますが、旧版の平文を含むディスクの古い断片やバックアップのコピーを安全に消去する機能ではありません。それらが心配な場合は移行後に大学側のキーを新しく登録してください。
- 自動入力すると、この端末上では二段階認証の効果が弱まります。自分のアカウントと信頼できる端末で使ってください。
- 提供された認証画面HTMLのフォーム構造を、ダミーのトークンを使って再現しました。実際のフォームID・入力欄IDを使い、認証方式の選択と正しいフォームの送信をブラウザで検証しています。大学サーバーでの認証成功は未検証です。サイトのHTMLが変わると `content_script.js` の修正が必要になる場合があります。

## 简体中文

此Chrome扩展会在 `https://isct.ex-tic.com/auth/session/second_factor` 为**您自己的账户**选择已配置的验证方式、填写并提交一次性密码。支持身份验证器的设置密钥（TOTP），以及发送到Gmail的邮件验证码。用户名和密码仍由您自行输入。

### 安装与使用

1. 下载此仓库，在Chrome中打开 `chrome://extensions`，开启**开发者模式**，点击**加载已解压的扩展程序**，选择仓库文件夹。
2. 打开扩展的**详情 → 扩展程序选项**。选择 **Setup key (TOTP)**（设置密钥）或 **OTP email in Gmail**（Gmail邮件验证码）。
3. **设置密钥：** 在大学设置页面点击 **Show secret key**，将Base32密钥粘贴到扩展的 **Setup key**。设置并确认至少12个字符的独有长口令，然后点击 **Save settings**。无需扫描二维码或注册Google Authenticator。如果大学要求首次验证代码，请点击扩展的 **Show current code** 并将代码输入大学页面完成注册。密钥必须与大学当前有效的注册一致。也支持已有的 `otpauth://totp` 链接。
4. **Gmail邮件：** 当前仓库的OAuth客户端ID只是占位符。须先完成下方的Gmail OAuth设置，再在选项页点击 **Connect Gmail**，使用接收验证码的Gmail账户同意只读权限。
5. 安装更新后重新加载扩展。TOTP方式请在 **Passphrase to unlock or view the saved key** 输入加密口令，点击 **Unlock for 30 minutes**，然后打开或重新加载大学二次验证页面。扩展会选择 **OTP (App) Authentication** 并生成、提交新代码。邮件方式会选择 **OTP (Email) Authentication**、发送邮件并提交新邮件的代码。若已有手动输入或已选择其他方式，扩展不会自动提交。

大学设置密钥只需注册一次；每次解锁无需重新签发。扩展会在30分钟后、Chrome重启时、扩展重新加载或禁用时锁定，也可点击 **Lock now** 立即锁定。查看已保存密钥时，重新输入口令并点击 **Show saved key for 30 seconds**；30秒后或切换标签页时自动隐藏。更换口令时先解锁，保持 **Setup key** 为空，填写并确认新口令后保存。忘记口令无法恢复，需要重新输入原始密钥或在大学重新注册。

从0.2版本升级时，旧明文密钥不会用于自动登录。保持 **Setup key** 为空，填写并确认新口令后保存以迁移。加密保存成功后才删除旧明文存储项。

**设置密钥**是注册身份验证器时显示的二维码中包含的固定秘密字符串。如果网站显示“手动输入密钥”，它就是同一个秘密。它不是Google密码，也不是应用当前显示的六位验证码。扩展使用此密钥生成验证码，无法直接读取您手机上的Google Authenticator。请勿将设置密钥发布到GitHub或聊天中。

### Gmail OAuth设置

1. 在Google Cloud项目中启用Gmail API，并在OAuth同意页面配置 `https://www.googleapis.com/auth/gmail.readonly` 权限范围。
2. 先加载一次扩展，从 `chrome://extensions` 复制扩展ID。
3. 创建类型为 **Chrome Extension** 的OAuth客户端，将扩展ID填入项目ID。如果同意页面处于测试模式，请将接收邮件的Gmail账户加入测试用户。
4. 将 `manifest.json` 中的 `REPLACE_WITH_YOUR_CHROME_EXTENSION_CLIENT_ID.apps.googleusercontent.com` 替换为新客户端ID，然后重新加载扩展。
5. 在选项页点击 **Connect Gmail**。公开发布时，OAuth客户端必须使用发布版本的扩展ID。

`gmail.readonly` 属于Google的受限权限范围。公开提供Gmail功能可能需要通过Google的OAuth审核。虽然扩展只处理指定发件人和主题的邮件，但授权页面请求的是整个邮箱的只读访问权限。

### 隐私与限制

- 此仓库不包含Gmail地址、Gmail密码、邮件内容或设置密钥。Google登录在Google页面完成。
- 密钥使用Web Crypto **AES-256-GCM** 加密，每次保存使用随机16字节盐和12字节nonce，通过 **PBKDF2-SHA256、600,000次迭代** 从口令导出加密密钥。`chrome.storage.local` 仅持久保存密文及公开参数，不保存口令或加密密钥。不会同步或上传；仅通过HTTPS向大学提交生成的代码。TOTP生成、解锁和本地查看不需要网络请求。Gmail方式使用Google OAuth和Gmail API。
- [Chrome存储本身不自动加密](https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy)，本扩展在保存前加密。解锁期间，明文TOTP配置仅保存在[内存中的 `chrome.storage.session`](https://developer.chrome.com/docs/extensions/reference/api/storage#property-session)。两个存储区域都限制为扩展的可信上下文；登录页面内容脚本只能获得验证码。
- 对被盗锁定存储的保护取决于口令强度。无法防止解锁或使用期间的恶意软件、扩展篡改、浏览器控制或键盘记录器。登录页面被攻击者控制时，OTP也可能被窃取。尚未进行独立安全审计。
- 清除浏览缓存不会删除密文。**Remove saved key** 或卸载可删除当前存储项，但不能安全擦除旧版本明文的磁盘残片或备份副本。若担心此类副本，请迁移后在大学注册新密钥。
- 自动填写会削弱此设备上的第二重验证。请仅用于自己的账户和可信设备。
- 已根据提供的验证页面HTML，用虚拟令牌重建表单，并在浏览器中使用真实表单及输入框ID验证方式选择与正确表单的提交。尚未验证大学服务器是否接受登录。网站HTML变更时，可能需要修改 `content_script.js`。

## Browser test / ブラウザテスト / 浏览器测试

Use Chromium or Chrome for Testing to run the browser smoke test. Official Chrome builds no longer support command-line extension loading. The test uses a mock form and mock email at the second-factor URL; it does **not** contact a real account or Gmail inbox. / Chromium または Chrome for Testing で実行してください。模擬フォームと模擬メールを使い、実際のアカウントやGmailにはアクセスしません。/ 请使用Chromium或Chrome for Testing。测试只使用模拟表单和模拟邮件，不访问真实账户或Gmail邮箱。

The fixture reproduces the supplied hidden TOTP/email forms and method selector with synthetic tokens. It verifies automatic selection, correct form submission exactly once, no action without configuration, preservation of manual input, and no override of another selected method. / 提供されたHTMLの非表示フォームと認証方式選択画面を再現し、自動選択・一度だけの正しい送信・未設定時の停止・手入力の保持・別方式を選択済みの場合の停止を確認します。/ 测试重现提供的隐藏表单与方式选择器，验证自动选择、正确表单仅提交一次、未配置时不操作、保留手动输入及不覆盖其他已选方式。

It also verifies migration from plaintext storage, password-protected key display and its 30-second timeout, enrollment code display, lock/unlock and auto-lock, no TOTP fetch requests, content-script storage restrictions, persistence of ciphertext across a real browser restart with no unlocked key retained, and deletion. / 平文からの移行・パスフレーズによるキー表示と30秒後の非表示・初回登録用コード表示・解除と自動ロック・TOTPのfetch通信がないこと・コンテンツスクリプトの保存領域へのアクセス拒否・ブラウザ再起動後の暗号データの保持と解除キーの消去・削除も確認します。/ 还验证明文迁移、口令保护的密钥显示及30秒后隐藏、首次注册代码、解锁与自动锁定、TOTP不调用fetch、内容脚本不能访问存储、真实浏览器重启后仅保留密文，以及删除。

```sh
CHROME_BIN=/path/to/chrome-for-testing node test/browser-smoke.mjs
```

Source for the Chrome testing requirement: [Chromium Extensions announcement](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY/m/S0ET5wPjCAAJ).
