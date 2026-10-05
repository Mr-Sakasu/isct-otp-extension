const test = require("node:test");
const assert = require("node:assert/strict");
const { parseTotpSecret, generateTotp } = require("../core.js");

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
