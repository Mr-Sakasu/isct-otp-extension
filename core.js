/* Pure TOTP helpers. No credential or network access here. */
(function (root) {
  "use strict";

  function parseTotpSecret(value) {
    let raw = String(value || "").trim();
    let period = 30;
    let digits = 6;
    let algorithm = "SHA1";
    if (raw.toLowerCase().startsWith("otpauth://")) {
      const uri = new URL(raw);
      if (uri.protocol !== "otpauth:" || uri.hostname !== "totp") {
        throw new Error("Only otpauth://totp setup links are supported.");
      }
      raw = uri.searchParams.get("secret") || "";
      period = Number(uri.searchParams.get("period") || 30);
      digits = Number(uri.searchParams.get("digits") || 6);
      algorithm = (uri.searchParams.get("algorithm") || "SHA1").toUpperCase();
    }
    raw = raw.replace(/[\s-]/g, "").toUpperCase().replace(/=+$/, "");
    if (!/^[A-Z2-7]{16,}$/.test(raw) || !Number.isInteger(period) || period < 15 || period > 120 || digits !== 6 || algorithm !== "SHA1") {
      throw new Error("Enter a valid Base32 TOTP key or a SHA1, 6-digit otpauth://totp link.");
    }
    return { secret: raw, period, digits };
  }

  function decodeBase32(value) {
    let bits = 0;
    let accumulator = 0;
    const bytes = [];
    for (const character of value) {
      const index = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(character);
      if (index < 0) throw new Error("Invalid Base32 character.");
      accumulator = (accumulator << 5) | index;
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((accumulator >>> bits) & 255);
      }
    }
    return Uint8Array.from(bytes);
  }

  async function generateTotp(config, now = Date.now()) {
    const step = Math.floor(now / 1000 / config.period);
    const counter = new Uint8Array(8);
    new DataView(counter.buffer).setBigUint64(0, BigInt(step));
    const key = await crypto.subtle.importKey("raw", decodeBase32(config.secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
    const offset = digest[digest.length - 1] & 15;
    const value = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
    return {
      code: String(value % 1000000).padStart(6, "0"),
      remainingSeconds: config.period - Math.floor(now / 1000) % config.period
    };
  }

  const api = { parseTotpSecret, generateTotp };
  root.ISCTOTP = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
