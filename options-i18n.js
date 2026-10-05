const ISCTLocale = (() => {
  const language = document.documentElement.lang;
  const messages = {
    "Show current code": ["現在のコードを表示", "显示当前验证码"],
    "Hide code": ["コードを隠す", "隐藏验证码"],
    "No setup key saved.": ["設定キーは未保存です。", "尚未保存设置密钥。"],
    "Encrypted setup key saved. Locked.": ["暗号化した設定キーを保存済みです。現在はロック中です。", "已保存加密密钥，目前已锁定。"],
    "An older unencrypted key remains. Set and confirm a new passphrase, then Save settings to encrypt it. Leave Setup key blank to keep that key.": ["旧版の平文キーが残っています。設定キー欄は空のまま、暗号化用パスフレーズと確認欄を入力して保存すると暗号化へ移行できます。", "仍保留旧版明文密钥。请保持设置密钥栏为空，填写并确认加密口令后保存以迁移。"],
    "Unlock saved data to check the login settings.": ["保存したデータを解除すると、ログイン情報の保存状態を確認できます。", "解锁已保存数据后可查看登录信息状态。"],
    "Username and university password saved for automatic login.": ["自動ログイン用のユーザー名と大学のパスワードを保存済みです。", "已保存自动登录用的用户名和大学密码。"],
    "Username saved. University password is not saved yet.": ["ユーザー名を保存済みです。大学のパスワードは未保存です。", "已保存用户名，尚未保存大学密码。"],
    "No university login credentials saved.": ["大学のログイン情報は未保存です。", "尚未保存大学登录信息。"],
    "The new passphrases do not match.": ["暗号化用パスフレーズと確認欄が一致しません。", "加密口令与确认栏不一致。"],
    "Saving settings…": ["設定を保存しています…", "正在保存设置…"],
    "Settings saved. The setup key is encrypted when present.": ["設定を保存しました。設定キーとログイン情報は暗号化して保存されます。", "设置已保存。密钥和登录信息以加密形式保存。"],
    "Unlocking…": ["解除しています…", "正在解锁…"],
    "Unlocked for 30 minutes. Open or reload the university's login page to start automatic entry.": ["30分間解除しました。大学のログイン画面を開くか再読み込みすると、自動入力が始まります。", "已解锁30分钟。打开或重新加载大学登录页面即可开始自动填写。"],
    "Locked. Unlocked session key removed.": ["ロックしました。解除中のデータをセッションから削除しました。", "已锁定并清除会话中的解锁数据。"],
    "Verifying passphrase…": ["パスフレーズを確認しています…", "正在验证口令…"],
    "Saved key shown for 30 seconds. Hide it when finished.": ["保存したキーを30秒間表示します。確認後は隠してください。", "已保存密钥显示30秒，查看后请隐藏。"],
    "Saved encrypted data and unlocked session data removed.": ["保存した暗号データと解除中のセッションデータを削除しました。", "已删除保存的密文和会话中的解锁数据。"],
    "Extension is unavailable.": ["拡張機能を利用できません。再読み込みしてください。", "扩展不可用，请重新加载。"],
    "Operation failed.": ["操作に失敗しました。", "操作失败。"],
    "Enter your encryption passphrase.": ["暗号化用パスフレーズを入力してください。", "请输入加密口令。"],
    "Use a unique encryption passphrase of at least 6 characters.": ["6文字以上の固有の暗号化用パスフレーズを入力してください。", "请输入至少6个字符的独有加密口令。"],
    "Incorrect passphrase or damaged encrypted key.": ["パスフレーズが違うか、暗号データが破損しています。", "口令错误或加密数据损坏。"],
    "Invalid encrypted key data.": ["暗号データが無効です。", "加密数据无效。"],
    "Invalid saved setup key.": ["保存した設定キーが無効です。", "保存的设置密钥无效。"],
    "Enter a valid university username.": ["有効な大学のユーザー名を入力してください。", "请输入有效的大学用户名。"],
    "Enter a university username and password.": ["大学のユーザー名とパスワードを入力してください。", "请输入大学用户名和密码。"],
    "Unlock the saved data before changing it.": ["変更する前に保存したデータを解除してください。", "修改前请先解锁已保存数据。"],
    "Enter your setup key.": ["設定キーを入力してください。", "请输入设置密钥。"],
    "Enter a setup key and a new encryption passphrase first.": ["設定キーと暗号化用パスフレーズを入力してください。", "请先输入设置密钥和加密口令。"],
    "Save an encrypted setup key first.": ["先に設定キーを暗号化して保存してください。", "请先加密保存设置密钥。"],
    "Unlock the saved key first.": ["先に保存したデータを解除してください。", "请先解锁已保存数据。"],
    "Enter a valid Base32 TOTP key or a SHA1, 6-digit otpauth://totp link.": ["有効なBase32設定キー、またはSHA1・6桁のotpauth://totpリンクを入力してください。", "请输入有效的Base32密钥或使用SHA1、六位代码的otpauth://totp链接。"],
    "Only otpauth://totp setup links are supported.": ["otpauth://totp形式の設定リンクに対応しています。", "仅支持otpauth://totp设置链接。"]
  };
  const index = language === "ja" ? 0 : language === "zh-CN" ? 1 : -1;
  function text(message) {
    if (index < 0) return message;
    if (messages[message]) return messages[message][index];
    const until = message.match(/^Encrypted key unlocked until (.+)\.$/);
    if (until) return index === 0 ? `${until[1]}まで解除中です。` : `已解锁至${until[1]}。`;
    const seconds = message.match(/^Refreshes in (\d+) seconds\.$/);
    if (seconds) return index === 0 ? `${seconds[1]}秒後に更新します。` : `${seconds[1]}秒后刷新。`;
    return message;
  }
  return { text };
})();
