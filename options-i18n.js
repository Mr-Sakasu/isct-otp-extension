const ISCTLocale = (() => {
  const language = document.documentElement.lang;
  const messages = {
    "Show saved key": ["保存したキーを表示", "显示已保存的密钥"],
    "Hide saved key": ["キーを隠す", "隐藏密钥"],
    "Saved. Automatic entry is ready.": ["保存済みです。自動入力できます。", "已保存，可以自动填写。"],
    "Enter your setup key and save.": ["設定キーを入力して保存してください。", "请输入设置密钥并保存。"],
    "Saving…": ["保存中…", "正在保存…"],
    "Saved. Open the university login page.": ["保存しました。大学のログイン画面を開いてください。", "已保存。请打开大学登录页面。"],
    "Importing…": ["引き継ぎ中…", "正在导入…"],
    "Imported. Automatic entry is ready.": ["引き継ぎました。自動入力できます。", "已导入，可以自动填写。"],
    "Saved data removed.": ["保存データを削除しました。", "已删除保存的数据。"],
    "Extension is unavailable.": ["拡張機能に接続できません。ページを再読み込みしてください。", "无法连接扩展程序。请重新加载页面。"],
    "Operation failed.": ["失敗しました。もう一度お試しください。", "操作失败，请重试。"],
    "Enter your setup key.": ["設定キーを入力してください。", "请输入设置密钥。"],
    "No previous settings to import.": ["引き継ぐ旧版の設定はありません。", "没有可导入的旧版设置。"],
    "Incorrect passphrase or damaged encrypted key.": ["以前のパスフレーズが違うか、旧データが壊れています。", "旧版口令错误，或旧数据已损坏。"],
    "Invalid encrypted key data.": ["保存データが壊れています。設定キーを入力し直してください。", "保存的数据已损坏。请重新输入设置密钥。"],
    "Invalid saved setup key.": ["保存した設定キーが無効です。入力し直してください。", "已保存的设置密钥无效。请重新输入。"],
    "Enter a valid university username.": ["大学のユーザー名を正しく入力してください。", "请输入正确的大学用户名。"],
    "Enter a university username and password.": ["大学のユーザー名とパスワードを両方入力してください。", "请同时输入大学用户名和密码。"],
    "Enter your encryption passphrase.": ["以前のパスフレーズを入力してください。", "请输入旧版口令。"],
    "Saved settings could not be read. Enter your setup key again.": ["保存した設定を読み込めません。設定キーを入力し直してください。", "无法读取已保存的设置。请重新输入设置密钥。"],
    "Enter a valid Base32 TOTP key or a SHA1, 6-digit otpauth://totp link.": ["設定キーの形式が違います。Show secret key の文字列を貼り直してください。", "设置密钥格式不正确。请重新粘贴 Show secret key 显示的字符串。"],
    "Only otpauth://totp setup links are supported.": ["このリンクは使えません。Show secret key の文字列を貼り付けてください。", "不支持此链接。请粘贴 Show secret key 显示的字符串。"],
    "Failed to construct 'URL': Invalid URL": ["設定キーの形式が違います。Show secret key の文字列を貼り直してください。", "设置密钥格式不正确。请重新粘贴 Show secret key 显示的字符串。"],
    "Could not establish connection. Receiving end does not exist.": ["拡張機能に接続できません。ページを再読み込みしてください。", "无法连接扩展程序。请重新加载页面。"],
    "Unknown request.": ["処理できませんでした。ページを再読み込みしてください。", "无法处理请求。请重新加载页面。"]
  };
  const index = language === "ja" ? 0 : language === "zh-CN" ? 1 : -1;
  function text(message) {
    if (index < 0) return message;
    if (messages[message]) return messages[message][index];
    const seconds = message.match(/^Refreshes in (\d+) seconds\.$/);
    if (seconds) return index === 0 ? `あと${seconds[1]}秒で更新` : `${seconds[1]}秒后更新`;
    return message;
  }
  return { text };
})();
