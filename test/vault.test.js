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
  await assert.rejects(encryptVault(config, "short"), /at least 6/);
  const vault = await encryptVault(config, passphrase);
  await assert.rejects(decryptVault({ ...vault, iterations: 1 }, passphrase), /Invalid encrypted/);
  await assert.rejects(decryptVault({ ...vault, salt: [999] }, passphrase), /Invalid encrypted/);
  await assert.rejects(decryptVault({ ...vault, iv: vault.iv.slice(1) }, passphrase), /Invalid encrypted/);
});

test("six-character passphrase encrypts username, university password, and OTP key together", async () => {
  const data = { ...config, username: "test-science-tokyo-id", password: "test-only university password " };
  const vault = await encryptVault(data, "abc123");
  assert.deepEqual(await decryptVault(vault, "abc123"), data);
  const stored = JSON.stringify(vault);
  for (const value of [data.username, data.password, data.secret, "abc123"]) assert.ok(!stored.includes(value));
  await assert.rejects(encryptVault({ ...config, password: "password without username" }, "abc123"), /username and password/);
});

test("automatic storage works without a passphrase and detects modified data or a different device key", async () => {
  const { createDeviceKey, encryptAutomatic, decryptAutomatic } = require("../vault.js");
  const deviceKey = createDeviceKey();
  assert.equal(deviceKey.length, 32);
  const data = { ...config, username: "test-science-tokyo-id", password: "test-only university password" };
  const record = await encryptAutomatic(data, deviceKey);
  assert.deepEqual(await decryptAutomatic(record, deviceKey), data);
  for (const value of [data.secret, data.username, data.password]) assert.ok(!JSON.stringify(record).includes(value));
  const second = await encryptAutomatic(data, deviceKey);
  assert.notDeepEqual(record.iv, second.iv);
  await assert.rejects(decryptAutomatic(record, createDeviceKey()), /could not be read/);
  for (const field of ["iv", "ciphertext"]) {
    const modified = structuredClone(record);
    modified[field][0] ^= 1;
    await assert.rejects(decryptAutomatic(modified, deviceKey), /could not be read/);
  }
  await assert.rejects(decryptAutomatic({ ...record, version: 1 }, deviceKey), /Invalid encrypted/);
});

test("automatic storage encrypts each field and every partial combination independently", async () => {
  const { createDeviceKey, encryptAutomatic, decryptAutomatic } = require("../vault.js");
  const deviceKey = createDeviceKey();
  const username = "test-science-tokyo-id";
  const password = "test-only university password ";
  for (const data of [
    { username }, { password }, config, { username, password },
    { ...config, username }, { ...config, password }, { ...config, username, password }
  ]) {
    const record = await encryptAutomatic(data, deviceKey);
    assert.deepEqual(await decryptAutomatic(record, deviceKey), data);
    for (const value of [data.username, data.password, data.secret].filter(Boolean)) {
      assert.ok(!JSON.stringify(record).includes(value));
    }
  }
  await assert.rejects(encryptAutomatic({}, deviceKey), /at least one setting/);
  await assert.rejects(encryptAutomatic({ username: " " }, deviceKey), /valid university username/);
  await assert.rejects(encryptAutomatic({ password: "" }, deviceKey), /valid university password/);
  await assert.rejects(encryptAutomatic({ password: "x".repeat(1025) }, deviceKey), /valid university password/);
  await assert.rejects(encryptAutomatic({ ...config, secret: "invalid-key" }, deviceKey));
  await assert.rejects(encryptAutomatic({ period: 30, username }, deviceKey), /Invalid saved setup key/);
});
