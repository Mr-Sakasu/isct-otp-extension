importScripts("core.js", "vault.js");

const SITE_URL = /^https:\/\/isct\.ex-tic\.com\/auth\/session\/second_factor(?:[/?#]|$)/;
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me/messages";

// Never expose encrypted storage or unlocked session secrets to content scripts.
const storageReady = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
  chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
]);
const LOCK_ALARM = "otp-vault-auto-lock";
const UNLOCK_MS = 30 * 60 * 1000;
let vaultQueue = Promise.resolve();

function withVault(operation) {
  const next = vaultQueue.then(operation);
  vaultQueue = next.catch(() => {});
  return next;
}

async function lockVault() {
  await chrome.storage.session.remove("unlockedVault");
  await chrome.alarms.clear(LOCK_ALARM);
}

function vaultTag(vault) {
  // Chrome's storage serialization may reorder object properties.
  return JSON.stringify([vault.version, vault.algorithm, vault.kdf, vault.iterations, vault.salt, vault.iv, vault.ciphertext]);
}

async function unlockForSession(vault, totp) {
  const expiresAt = Date.now() + UNLOCK_MS;
  await chrome.storage.session.set({ unlockedVault: { vaultTag: vaultTag(vault), totp, expiresAt } });
  await chrome.alarms.create(LOCK_ALARM, { when: expiresAt });
}

async function getUnlocked(vault) {
  const { unlockedVault } = await chrome.storage.session.get("unlockedVault");
  if (!vault || !unlockedVault || unlockedVault.vaultTag !== vaultTag(vault) || unlockedVault.expiresAt <= Date.now()) {
    if (unlockedVault) await lockVault();
    return null;
  }
  return unlockedVault;
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== LOCK_ALARM) return;
  withVault(async () => {
    await storageReady;
    const { unlockedVault } = await chrome.storage.session.get("unlockedVault");
    if (unlockedVault && unlockedVault.expiresAt <= Date.now()) await lockVault();
  }).catch(() => {});
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

function isSiteTab(sender) {
  return sender.id === chrome.runtime.id && !!sender.tab && SITE_URL.test(sender.url || "");
}

function isOptions(sender) {
  return sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL("options.html");
}

function gmailConfigured() {
  return !chrome.runtime.getManifest().oauth2.client_id.startsWith("REPLACE_WITH_");
}

async function getToken(interactive) {
  const result = await chrome.identity.getAuthToken({ interactive });
  if (!result?.token) throw new Error("Gmail authorization is unavailable.");
  return result.token;
}

async function gmailJson(url, token) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Gmail request failed (${response.status}).`);
  return response.json();
}

async function getGmailCode(since) {
  let token;
  try {
    token = await getToken(false);
  } catch {
    throw new Error("Connect Gmail from the extension options first.");
  }
  const query = encodeURIComponent("from:noreply@ex-tic.com newer_than:5m");
  let listing;
  try {
    listing = await gmailJson(`${GMAIL_API}?q=${query}&maxResults=10`, token);
  } catch (error) {
    if (!String(error.message).includes("401")) throw error;
    await chrome.identity.removeCachedAuthToken({ token });
    token = await getToken(false);
    listing = await gmailJson(`${GMAIL_API}?q=${query}&maxResults=10`, token);
  }
  const used = (await chrome.storage.session.get("usedMessageIds")).usedMessageIds || [];
  for (const item of listing.messages || []) {
    if (used.includes(item.id)) continue;
    const message = await gmailJson(`${GMAIL_API}/${encodeURIComponent(item.id)}?format=full`, token);
    const receivedAt = Number(message.internalDate);
    if (!Number.isFinite(receivedAt) || receivedAt < since - 15000 || receivedAt > Date.now() + 15000) continue;
    const code = ISCTOTP.parseOtpEmail(message);
    if (code) {
      await chrome.storage.session.set({ usedMessageIds: [...used.slice(-19), item.id] });
      return code;
    }
  }
  return null;
}

async function handleMessage(request, sender) {
  await storageReady;
  if (request?.type === "CONNECT_GMAIL" && isOptions(sender)) {
    if (!gmailConfigured()) throw new Error("Set the Google OAuth client ID in manifest.json first.");
    const token = await getToken(true);
    await gmailJson(`${GMAIL_API}?maxResults=1`, token);
    await chrome.storage.local.set({ gmailConnected: true });
    return { connected: true };
  }
  if (isOptions(sender)) return withVault(() => handleOptions(request));
  if (!isSiteTab(sender)) return { error: "Request denied." };
  return withVault(() => handleSiteMessage(request));
}

async function handleSiteMessage(request) {
  const settings = await chrome.storage.local.get(["mode", "vault", "gmailConnected"]);
  const mode = settings.mode || "totp";
  if (request?.type === "GET_STATUS") {
    if (mode === "totp") return { mode, ready: !!(await getUnlocked(settings.vault)) };
    if (!gmailConfigured() || !settings.gmailConnected) return { mode, ready: false };
    try {
      await getToken(false);
      return { mode, ready: true };
    } catch {
      return { mode, ready: false };
    }
  }
  if (request?.type !== "GET_CODE") return { error: "Unknown request." };
  if (mode === "totp") {
    const unlocked = await getUnlocked(settings.vault);
    if (!unlocked) return { error: "Unlock your encrypted setup key in the extension options first." };
    const result = await ISCTOTP.generateTotp(unlocked.totp);
    return result.remainingSeconds < 6 ? { pending: true } : { code: result.code };
  }
  if (mode === "gmail") {
    if (!gmailConfigured() || !settings.gmailConnected) return { error: "Connect Gmail in the extension options." };
    const since = Number(request.since);
    if (!Number.isFinite(since) || since < Date.now() - 300000 || since > Date.now() + 15000) return { error: "Invalid OTP request time." };
    const code = await getGmailCode(since);
    return code ? { code } : { pending: true };
  }
  return { error: "Choose an OTP method in the extension options." };
}

async function handleOptions(request) {
  const settings = await chrome.storage.local.get(["mode", "vault", "totp", "gmailConnected"]);
  if (request?.type === "VAULT_STATUS") {
    const unlocked = await getUnlocked(settings.vault);
    return { mode: settings.mode || "totp", encrypted: !!settings.vault, legacy: !!settings.totp,
      unlocked: !!unlocked, expiresAt: unlocked?.expiresAt || 0, gmailConnected: !!settings.gmailConnected };
  }
  if (request?.type === "SAVE_SETTINGS") {
    if (!["totp", "gmail"].includes(request.mode)) throw new Error("Choose an OTP method.");
    if (request.secret || request.passphrase || settings.totp) {
      let totp;
      if (request.secret) totp = ISCTOTP.parseTotpSecret(request.secret);
      else if (settings.vault) {
        const unlocked = await getUnlocked(settings.vault);
        if (!unlocked) throw new Error("Unlock the saved key before changing its passphrase.");
        totp = unlocked.totp;
      } else if (settings.totp) totp = ISCTVault.validateConfig(settings.totp);
      else throw new Error("Enter your setup key.");
      const vault = await ISCTVault.encryptVault(totp, request.passphrase);
      await chrome.storage.local.set({ mode: request.mode, vault });
      await chrome.storage.local.remove("totp");
      await unlockForSession(vault, totp);
    } else {
      if (request.mode === "totp" && !settings.vault) throw new Error("Enter a setup key and a new encryption passphrase first.");
      await chrome.storage.local.set({ mode: request.mode });
    }
    return { saved: true };
  }
  if (request?.type === "UNLOCK_VAULT") {
    if (!settings.vault) throw new Error("Save an encrypted setup key first.");
    const totp = await ISCTVault.decryptVault(settings.vault, request.passphrase);
    await unlockForSession(settings.vault, totp);
    return { unlocked: true };
  }
  if (request?.type === "LOCK_VAULT") {
    await lockVault();
    return { locked: true };
  }
  if (request?.type === "REVEAL_KEY") {
    if (!settings.vault) throw new Error("Save an encrypted setup key first.");
    const totp = await ISCTVault.decryptVault(settings.vault, request.passphrase);
    return { secret: totp.secret };
  }
  if (request?.type === "GET_LOCAL_CODE") {
    const unlocked = await getUnlocked(settings.vault);
    if (!unlocked) throw new Error("Unlock the saved key first.");
    return ISCTOTP.generateTotp(unlocked.totp);
  }
  if (request?.type === "DELETE_KEY") {
    await lockVault();
    await chrome.storage.local.remove(["vault", "totp"]);
    return { removed: true };
  }
  return { error: "Unknown request." };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender).then(sendResponse).catch((error) => sendResponse({ error: error.message || "OTP lookup failed." }));
  return true;
});
