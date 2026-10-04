const test = require("node:test");
const assert = require("node:assert/strict");
const { encryptVault, decryptVault } = require("../vault.js");
const { parseTotpSecret } = require("../core.js");
const config = parseTotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
const passphrase = "test-only passphrase with several words";

test("encrypted record round-trips and contains neither secret nor passphrase", async () => {
  const vault = await encryptVault(config, passphrase);
  assert.deepEqual(await decryptVault(vault, passphrase), config);
  const record = JSON.stringify(vault);
  assert.ok(!record.includes(config.secret));
  assert.ok(!record.includes(passphrase));
  const second = await encryptVault(config, passphrase);
  assert.notDeepEqual(second.salt, vault.salt);
  assert.notDeepEqual(second.iv, vault.iv);
  assert.notDeepEqual(second.ciphertext, vault.ciphertext);
});

test("wrong passphrase and modified ciphertext, nonce, or salt cannot decrypt", async () => {
  const vault = await encryptVault(config, passphrase);
  await assert.rejects(decryptVault(vault, "incorrect test passphrase"), /Incorrect passphrase/);
  for (const field of ["ciphertext", "iv", "salt"]) {
    const modified = structuredClone(vault);
    modified[field][0] ^= 1;
    await assert.rejects(decryptVault(modified, passphrase), /Incorrect passphrase/);
  }
});

test("invalid records and short passphrases are rejected", async () => {
  await assert.rejects(encryptVault(config, "short"), /at least 12/);
  const vault = await encryptVault(config, passphrase);
  await assert.rejects(decryptVault({ ...vault, iterations: 1 }, passphrase), /Invalid encrypted/);
  await assert.rejects(decryptVault({ ...vault, salt: [999] }, passphrase), /Invalid encrypted/);
  await assert.rejects(decryptVault({ ...vault, iv: vault.iv.slice(1) }, passphrase), /Invalid encrypted/);
});
