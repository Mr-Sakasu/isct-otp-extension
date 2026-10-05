# Science Tokyo Autofill

[English](../README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

Science Tokyo のログインをOTPまで自動入力します。大学のユーザー名とパスワードの保存は任意です。

## インストールと使い方

1. ZIPをダウンロードして展開します。`chrome://extensions` でデベロッパーモードをオンにし、展開したフォルダを読み込みます。
2. 拡張機能の設定画面で、大学の「シークレットキーを表示する / Show secret key」の文字列を「設定キー」欄に貼り付けます。必要ならユーザー名とパスワードも入れて「保存」します。
3. `https://isct.ex-tic.com/auth/session` を開くと、各画面を自動で入力・送信します。Chromeを再起動してもそのまま使えます。

## 設定キーの取得

大学のOTP設定で「アプリ認証 / App Authentication」の「設定 / Settings」を開きます。

![OTP設定](images/otp-settings-ja.svg)

「シークレットキーを表示する / Show secret key」の文字列をコピーし、「設定キー」欄に貼り付けます。QRコードの読み取りは不要です。

![キーをコピー](images/secret-key-ja.svg)

「保存」を押します。大学の画面でコードを求められたら、設定画面に出る6桁を入力し「設定」を押すと登録完了です。

![設定を保存](images/extension-setup-ja.svg)

登録済みでキーを再表示できず、有効なキーも手元にない場合だけ、「解除 / Remove」してから登録し直します。古いキーは使えなくなります。

<details><summary>旧版からの更新</summary>

拡張機能のフォルダのファイルを置き換え、Chromeで再読み込みします。以前のパスフレーズを一度入力すると設定を引き継げます。以後パスフレーズは不要です。設定キーやパスワードは空欄で保存すると、保存済みの値を使います。

</details>

<details><summary>保存データ</summary>

設定は暗号化して保存しますが、暗号鍵も同じChromeプロファイル内にあります。プロファイル全体を読み取られると復号できます。共用のパソコンでは使わないでください。設定キーは外部へ送信しません。大学へ送るのは、設定したログイン情報とOTPだけです。設定画面の「保存データを削除」ですべて消せます。

</details>

## 開発

`node --test test/core.test.js test/vault.test.js`

`CHROME_BIN=/path/to/chrome-for-testing node test/browser-smoke.mjs`

ブラウザテストは模擬フォームを使います。実際のOTP入力は利用者が確認済みです。ユーザー名・パスワードの実環境での動作は未確認です。
