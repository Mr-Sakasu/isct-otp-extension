/* Local encryption helpers. Uses Web Crypto; no storage or network access. */
(function (root) {
  "use strict";
  const otp = root.ISCTOTP || (typeof require === "function" ? require("./core.js") : null);
  const ITERATIONS = 600000;
  const aad = new TextEncoder().encode("Science Tokyo OTP vault v1");

  function validateConfig(config, allowPartial = false) {
    if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Invalid saved setup key.");
    let normalized = {};
    if (!allowPartial || config.secret !== undefined) {
      if (typeof config.secret !== "string" || config.secret.length > 512 ||
        !Number.isInteger(config.period) || config.digits !== 6) {
        throw new Error("Invalid saved setup key.");
      }
      normalized = otp.parseTotpSecret(`otpauth://totp/key?secret=${encodeURIComponent(config.secret)}&period=${config.period}&digits=${config.digits}`);
    } else if (config.period !== undefined || config.digits !== undefined) {
      throw new Error("Invalid saved setup key.");
    }
    if (config.username !== undefined) {
      if (typeof config.username !== "string" || !config.username.trim() || config.username.length > 256) throw new Error("Enter a valid university username.");
      normalized.username = config.username.trim();
    }
    if (config.password !== undefined) {
      if (typeof config.password !== "string" || !config.password || config.password.length > 1024) throw new Error("Enter a valid university password.");
      if (!allowPartial && !normalized.username) throw new Error("Enter a university username and password.");
      normalized.password = config.password;
    }
    if (!Object.keys(normalized).length) throw new Error("Enter at least one setting.");
    return normalized;
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
    if (typeof passphrase !== "string" || [...passphrase].length < 6) {
      throw new Error("Use a unique encryption passphrase of at least 6 characters.");
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
        !Array.isArray(vault.ciphertext) || vault.ciphertext.length < 17 || vault.ciphertext.length > 16384) {
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

  // Automatic storage uses a random key kept in the same local Chrome profile.
  // This avoids plaintext records; it does not protect a stolen complete profile.
  const automaticAad = new TextEncoder().encode("Science Tokyo OTP automatic settings v2");

  function createDeviceKey() {
    return [...crypto.getRandomValues(new Uint8Array(32))];
  }

  async function deviceCryptoKey(deviceKey) {
    return crypto.subtle.importKey("raw", bytes(deviceKey, 32), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }

  async function encryptAutomatic(config, deviceKey) {
    const normalized = validateConfig(config, true);
    const key = await deviceCryptoKey(deviceKey);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: automaticAad, tagLength: 128 }, key,
      new TextEncoder().encode(JSON.stringify(normalized))
    );
    return { version: 2, algorithm: "AES-256-GCM", iv: [...iv], ciphertext: [...new Uint8Array(ciphertext)] };
  }

  async function decryptAutomatic(record, deviceKey) {
    if (!record || record.version !== 2 || record.algorithm !== "AES-256-GCM" ||
        !Array.isArray(record.ciphertext) || record.ciphertext.length < 17 || record.ciphertext.length > 16384) {
      throw new Error("Invalid encrypted key data.");
    }
    const key = await deviceCryptoKey(deviceKey);
    const iv = bytes(record.iv, 12);
    const ciphertext = bytes(record.ciphertext);
    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: automaticAad, tagLength: 128 }, key, ciphertext
      );
      return validateConfig(JSON.parse(new TextDecoder().decode(plaintext)), true);
    } catch {
      throw new Error("Saved settings could not be read. Enter your setup key again.");
    }
  }

  const api = { encryptVault, decryptVault, validateConfig, createDeviceKey, encryptAutomatic, decryptAutomatic };
  root.ISCTVault = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
