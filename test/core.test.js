const test = require("node:test");
const assert = require("node:assert/strict");
const { parseTotpSecret, generateTotp, parseOtpEmail } = require("../core.js");

test("TOTP matches the RFC 6238 SHA1 example when truncated to six digits", async () => {
  const config = parseTotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.equal((await generateTotp(config, 59000)).code, "287082");
  assert.equal((await generateTotp(config, 59000)).remainingSeconds, 1);
});

test("TOTP URI imports only the supported method and parameters", () => {
  assert.deepEqual(
    parseTotpSecret("otpauth://totp/ISCT:user?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=ISCT"),
    { secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", period: 30, digits: 6 }
  );
  assert.throws(() => parseTotpSecret("otpauth://hotp/ISCT:user?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"));
});

test("email OTP is accepted only from the documented sender and subject", () => {
  const body = Buffer.from("ログイン用のワンタイムパスワードです。\nワンタイムパスワード：44059").toString("base64url");
  const message = {
    payload: {
      headers: [
        { name: "From", value: "Extic <noreply@ex-tic.com>" },
        { name: "Subject", value: "Extic ログイン用ワンタイムパスワード" }
      ],
      mimeType: "text/plain",
      body: { data: body }
    }
  };
  assert.equal(parseOtpEmail(message), "44059");
  message.payload.headers[0].value = "attacker@example.com";
  assert.equal(parseOtpEmail(message), null);
});
