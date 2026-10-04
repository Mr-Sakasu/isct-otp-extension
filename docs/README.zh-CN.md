# Science Tokyo OTP Autofill

[English](../README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

此Chrome扩展会在 `https://isct.ex-tic.com/auth/session/second_factor` 为**您自己的账户**选择已配置的验证方式、填写并提交一次性密码。支持身份验证器的设置密钥（TOTP），以及发送到Gmail的邮件验证码。保存大学用户名和密码后，解锁期间可从 `https://isct.ex-tic.com/auth/session` 依次自动填写并提交用户名、密码和OTP。

### 安装与使用

1. 下载此仓库，在Chrome中打开 `chrome://extensions`，开启**开发者模式**，点击**加载已解压的扩展程序**，选择仓库文件夹。
2. 打开扩展的**详情 → 扩展程序选项**。选择 **Setup key (TOTP)**（设置密钥）或 **OTP email in Gmail**（Gmail邮件验证码）。
3. **设置密钥：** 在大学设置页面点击 **Show secret key**，将Base32密钥粘贴到扩展的 **Setup key**。设置并确认至少6个字符的独有长口令，然后点击 **Save settings**。无需扫描二维码或注册Google Authenticator。如果大学要求首次验证代码，请点击扩展的 **Show current code** 并将代码输入大学页面完成注册。密钥必须与大学当前有效的注册一致。也支持已有的 `otpauth://totp` 链接。
4. **Gmail邮件：** 当前仓库的OAuth客户端ID只是占位符。须先完成下方的Gmail OAuth设置，再在选项页点击 **Connect Gmail**，使用接收验证码的Gmail账户同意只读权限。
5. 安装更新后重新加载扩展。TOTP方式请在 **Passphrase to unlock or view the saved key** 输入加密口令，点击 **Unlock for 30 minutes**，然后打开或重新加载`https://isct.ex-tic.com/auth/session`。扩展会选择 **OTP (App) Authentication** 并生成、提交新代码。邮件方式会选择 **OTP (Email) Authentication**、发送邮件并提交新邮件的代码。若已有手动输入或已选择其他方式，扩展不会自动提交。

## 多因素认证（OTP）应用认证设置（推荐）

[图解设置指南](../help.zh-CN.html) · [大学官方指南](https://www.helpdesk.cii.isct.ac.jp/st/helpdesk/science-tokyo/login_guide.html)

### 1. 打开OTP应用认证设置

在大学认证门户打开“多因素认证（OTP）”，点击“应用认证 / App Authentication”的“设置”。

![打开OTP应用认证设置](images/otp-settings-zh-CN.svg)

### 2. 显示、复制并粘贴密钥

点击“显示密钥 / Show secret key”。复制显示的字符串，粘贴到扩展的“设置密钥”栏，无需扫描二维码。

![显示、复制并粘贴密钥](images/secret-key-zh-CN.svg)

### 3. 加密保存登录信息

输入大学用户名、大学密码，以及至少6个字符的加密口令和确认栏，点击“保存设置”。这些数据一起加密。向已有密钥添加登录信息时请先解锁，保持设置密钥栏为空，填写并确认当前或新的加密口令后保存。

![加密保存登录信息](images/extension-setup-zh-CN.svg)

### 4. 完成大学首次注册

如果大学首次注册尚未完成，请点击扩展的“显示当前验证码”，将六位代码输入大学的“令牌”栏并点击“设置”。以后解锁扩展，再打开或重新加载 https://isct.ex-tic.com/auth/session，即可依次自动填写和提交用户名、密码和OTP。

### 已使用应用认证的情况

**若已使用应用认证且无法再次显示密钥，必须在OTP设置 → App Authentication（应用认证）→ Remove（解除）中先删除旧注册，再重新设置以签发新密钥。将新显示的密钥粘贴到扩展，并再次完成大学首次注册。旧密钥将失效。若仍持有当前有效密钥，可直接使用，无需删除或重新签发。**

此图仅为界面示意，示例文字不是实际密钥。

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
- 大学用户名、大学密码和设置密钥使用Web Crypto **AES-256-GCM** 加密，每次保存使用随机16字节盐和12字节nonce，通过 **PBKDF2-SHA256、600,000次迭代** 从口令导出加密密钥。`chrome.storage.local` 仅持久保存密文及公开参数，不保存口令或加密密钥。不会同步或上传；用户名和大学密码仅提交至大学的HTTPS登录表单，OTP提交至二次验证表单。设置密钥和加密口令不会提交。TOTP生成、解锁和本地查看不需要网络请求。Gmail方式使用Google OAuth和Gmail API。
- [Chrome存储本身不自动加密](https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy)，本扩展在保存前加密。解锁期间，明文登录信息和TOTP配置仅保存在[内存中的 `chrome.storage.session`](https://developer.chrome.com/docs/extensions/reference/api/storage#property-session)。两个存储区域都限制为扩展的可信上下文；首次登录页面可请求用户名和大学密码，二次验证页面只能请求OTP。
- 对被盗锁定存储的保护取决于口令强度。无法防止解锁或使用期间的恶意软件、扩展篡改、浏览器控制或键盘记录器。登录页面被攻击者控制时，登录信息和OTP也可能被窃取。尚未进行独立安全审计。
- 清除浏览缓存不会删除密文。**删除已保存数据** 或卸载可删除当前存储项，但不能安全擦除旧版本明文的磁盘残片或备份副本。若担心此类副本，请迁移后在大学注册新密钥。
- 自动填写会削弱此设备上的第二重验证。请仅用于自己的账户和可信设备。
- 已根据提供的验证页面HTML，用虚拟令牌重建表单，并在浏览器中使用真实表单及输入框ID验证方式选择与正确表单的提交。用户已确认OTP可用。新增用户名和密码流程使用根据公开页面重建的模拟表单验证，尚未验证大学服务器是否接受此流程。网站HTML变更时，可能需要修改 `login_script.js` 或 `content_script.js`。

## 验证

6个字符仅为最低要求。使用更长且独有的口令可增强抗猜测能力。

在仓库根目录运行 `node --test test/core.test.js test/vault.test.js`。使用Chrome for Testing或Chromium及虚构登录信息验证用户名 → 密码 → OTP、加密、解锁、自动锁定和语言切换。

```sh
CHROME_BIN=/path/to/chrome-for-testing node test/browser-smoke.mjs
```
