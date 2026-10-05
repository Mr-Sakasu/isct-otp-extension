const ISCTLocale = (() => {
  const language = document.documentElement.lang;
  const messages = {
    "Show current code": ["現在のコードを表示", "显示当前验证码"],
    "Hide code": ["コードを隠す", "隐藏验证码"],
    "No setup key saved.": ["設定キーはまだ保存されていません。", "尚未保存设置密钥。"],
    "Encrypted setup key saved. Locked.": ["設定キーは暗号化して保存されています。現在はロック中です。", "已保存加密密钥，目前已锁定。"],
    "An older unencrypted key remains. Set and confirm a new passphrase, then Save settings to encrypt it. Leave Setup key blank to keep that key.": ["旧バージョンで暗号化せずに保存した設定キーが残っています。このままでは自動入力に使いません。「設定キー」欄を空欄のまま、新しい暗号化用パスフレーズを2回入力して「設定を保存」を押すと、このキーを暗号化して保存し直します。", "仍保留旧版明文密钥。请保持设置密钥栏为空，填写并确认加密口令后保存以迁移。"],
    "Unlock saved data to check the login settings.": ["ロックを解除すると、大学のユーザー名とログインパスワードが保存されているかを確認できます。", "解锁已保存数据后可查看登录信息状态。"],
    "Username and university password saved for automatic login.": ["自動ログイン用に、大学のユーザー名とログインパスワードが保存されています。", "已保存自动登录用的用户名和大学密码。"],
    "Username saved. University password is not saved yet.": ["大学のユーザー名は保存されています。大学のログインパスワードはまだ保存されていません。", "已保存用户名，尚未保存大学密码。"],
    "No university login credentials saved.": ["大学のユーザー名とログインパスワードは保存されていません。ログイン画面では自分で入力してください（OTP は自動入力します）。", "尚未保存大学登录信息。"],
    "The new passphrases do not match.": ["2つの暗号化用パスフレーズ欄の入力が一致しません。同じものを入力してください。", "加密口令与确认栏不一致。"],
    "Saving settings…": ["設定を暗号化して保存しています…", "正在保存设置…"],
    "Settings saved. The setup key is encrypted when present.": ["設定を暗号化して保存しました。これから30分間は、ロックが解除された状態です。", "设置已保存。密钥和登录信息以加密形式保存。"],
    "Unlocking…": ["ロックを解除しています…", "正在解锁…"],
    "Unlocked for 30 minutes. Open or reload the university's login page to start automatic entry.": ["30分間ロックを解除しました。大学のログイン画面を開くか再読み込みすると、自動入力が始まります。", "已解锁30分钟。打开或重新加载大学登录页面即可开始自动填写。"],
    "Locked. Unlocked session key removed.": ["ロックしました。ロック解除のためにメモリ上に置いていたデータも消去しました。", "已锁定并清除会话中的解锁数据。"],
    "Verifying passphrase…": ["暗号化用パスフレーズを確認しています…", "正在验证口令…"],
    "Saved key shown for 30 seconds. Hide it when finished.": ["保存した設定キーを30秒間表示します。確認が終わったら「設定キーを隠す」を押してください。", "已保存密钥显示30秒，查看后请隐藏。"],
    "Saved encrypted data and unlocked session data removed.": ["保存したデータ（暗号化した設定キーとログイン情報）を削除し、ロックしました。", "已删除保存的密文和会话中的解锁数据。"],
    "Extension is unavailable.": ["拡張機能と通信できません。このページを再読み込みしてください。", "扩展不可用，请重新加载。"],
    "Operation failed.": ["操作に失敗しました。もう一度お試しください。", "操作失败。"],
    "Enter your encryption passphrase.": ["暗号化用パスフレーズを入力してください。", "请输入加密口令。"],
    "Use a unique encryption passphrase of at least 6 characters.": ["暗号化用パスフレーズは6文字以上で入力してください。大学のログインパスワードとは別のものにしてください。長いものほど推測されにくくなります。", "请输入至少6个字符的独有加密口令。"],
    "Incorrect passphrase or damaged encrypted key.": ["暗号化用パスフレーズが違うか、保存したデータが壊れています。", "口令错误或加密数据损坏。"],
    "Invalid encrypted key data.": ["暗号化して保存したデータを読み取れません。データの形式が正しくありません。","加密数据无效。"],
    "Invalid saved setup key.": ["保存されている設定キーの形式が正しくありません。", "保存的设置密钥无效。"],
    "Enter a valid university username.": ["大学のユーザー名を正しく入力してください。", "请输入有效的大学用户名。"],
    "Enter a university username and password.": ["大学のユーザー名とログインパスワードを両方入力してください。", "请输入大学用户名和密码。"],
    "Unlock the saved data before changing it.": ["保存した内容を変更する前に、ロックを解除してください。", "修改前请先解锁已保存数据。"],
    "Enter your setup key.": ["設定キーを入力してください。", "请输入设置密钥。"],
    "Enter a setup key and a new encryption passphrase first.": ["設定キーと暗号化用パスフレーズを入力してください。", "请先输入设置密钥和加密口令。"],
    "Save an encrypted setup key first.": ["先に設定キーを入力し、「設定を保存」で保存してください。", "请先加密保存设置密钥。"],
    "Unlock the saved key first.": ["先にロックを解除してください。", "请先解锁已保存数据。"],
    "Enter a valid Base32 TOTP key or a SHA1, 6-digit otpauth://totp link.": ["設定キーの形式が正しくありません。大学の画面に表示されたシークレットキーを、そのまま貼り付けてください。otpauth://totp のリンクは、SHA1・6桁のものだけに対応しています。", "请输入有效的Base32密钥或使用SHA1、六位代码的otpauth://totp链接。"],
    "Only otpauth://totp setup links are supported.": ["リンクを貼り付ける場合は、otpauth://totp で始まるものだけに対応しています。", "仅支持otpauth://totp设置链接。"]
  };
  // Japanese-only translations; other languages keep the original message.
  const japaneseOnly = {
    "Unknown request.": "拡張機能が受け付けない操作です。このページを再読み込みしてください。",
    "OTP lookup failed.": "処理中にエラーが発生しました。もう一度お試しください。",
    "Invalid Base32 character.": "設定キーに使えない文字が含まれています。",
    "Failed to construct 'URL': Invalid URL": "otpauth:// のリンクの形式が正しくありません。",
    "Could not establish connection. Receiving end does not exist.": "拡張機能と通信できません。このページを再読み込みしてください。"
  };
  const index = language === "ja" ? 0 : language === "zh-CN" ? 1 : -1;
  function text(message) {
    if (index < 0) return message;
    if (messages[message]) return messages[message][index];
    if (index === 0 && japaneseOnly[message]) return japaneseOnly[message];
    const until = message.match(/^Encrypted key unlocked until (.+)\.$/);
    if (until) return index === 0 ? `ロックは解除されています。${until[1]} に自動でロックします。` : `已解锁至${until[1]}。`;
    const seconds = message.match(/^Refreshes in (\d+) seconds\.$/);
    if (seconds) return index === 0 ? `あと${seconds[1]}秒で次のコードに変わります。` : `${seconds[1]}秒后刷新。`;
    return message;
  }
  return { text };
})();
