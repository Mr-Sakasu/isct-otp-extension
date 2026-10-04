/* Local encryption helpers. Uses Web Crypto; no storage or network access. */
(function (root) {
  "use strict";
  const otp = root.ISCTOTP || (typeof require === "function" ? require("./core.js") : null);
  const ITERATIONS = 600000;
  const aad = new TextEncoder().encode("Science Tokyo OTP vault v1");

  function validateConfig(config) {
    if (!config || typeof config.secret !== "string" || config.secret.length > 512 ||
        !Number.isInteger(config.period) || config.digits !== 6) {
      throw new Error("Invalid saved setup key.");
    }
    return otp.parseTotpSecret(`otpauth://totp/key?secret=${encodeURIComponent(config.secret)}&period=${config.period}&digits=${config.digits}`);
  }

  function bytes(value, length) {
    if (!Array.isArray(value) || (length && value.length !== length) ||
        !value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) {
      throw new Error("Invalid encrypted key data.");
    }
    return Uint8Array.from(value);
  }

  async function deriveKey(passphrase, salt) {
    if (typeof passphrase !== "string" || !passphrase || passphrase.length > 1024) {
      throw new Error("Enter your encryption passphrase.");
    }
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
      material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
  }

  async function encryptVault(config, passphrase) {
    if (typeof passphrase !== "string" || [...passphrase].length < 12) {
      throw new Error("Use a unique encryption passphrase of at least 12 characters.");
    }
    const normalized = validateConfig(config);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, key,
      new TextEncoder().encode(JSON.stringify(normalized))
    );
    return { version: 1, algorithm: "AES-256-GCM", kdf: "PBKDF2-SHA256", iterations: ITERATIONS,
      salt: [...salt], iv: [...iv], ciphertext: [...new Uint8Array(ciphertext)] };
  }

  async function decryptVault(vault, passphrase) {
    if (!vault || vault.version !== 1 || vault.algorithm !== "AES-256-GCM" ||
        vault.kdf !== "PBKDF2-SHA256" || vault.iterations !== ITERATIONS ||
        !Array.isArray(vault.ciphertext) || vault.ciphertext.length < 17 || vault.ciphertext.length > 4096) {
      throw new Error("Invalid encrypted key data.");
    }
    const salt = bytes(vault.salt, 16);
    const iv = bytes(vault.iv, 12);
    const ciphertext = bytes(vault.ciphertext);
    const key = await deriveKey(passphrase, salt);
    let plaintext;
    try {
      plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, key, ciphertext);
    } catch {
      throw new Error("Incorrect passphrase or damaged encrypted key.");
    }
    return validateConfig(JSON.parse(new TextDecoder().decode(plaintext)));
  }

  const api = { encryptVault, decryptVault, validateConfig };
  root.ISCTVault = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
