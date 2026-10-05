importScripts("core.js", "vault.js");

const SITE_URL = /^https:\/\/isct\.ex-tic\.com\/auth\/session\/second_factor(?:[/?#]|$)/;
const LOGIN_URL = /^https:\/\/isct\.ex-tic\.com\/auth\/session\/?(?:[?#]|$)/;

// Never expose encrypted storage or unlocked session secrets to content scripts.
const storageReady = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
  chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
]).then(async () => {
  // Discard obsolete email-mode metadata when upgrading; keep encrypted login data.
  await chrome.storage.local.remove(["mode", "gmailConnected"]);
  await chrome.storage.session.remove("usedMessageIds");
});
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

function isLoginTab(sender) {
  return sender.id === chrome.runtime.id && !!sender.tab && LOGIN_URL.test(sender.url || "");
}

function isOptions(sender) {
  return sender.id === chrome.runtime.id && ["options.html", "options.ja.html", "options.zh-CN.html"].some((page) => sender.url === chrome.runtime.getURL(page));
}

async function handleMessage(request, sender) {
  await storageReady;
  if (isOptions(sender)) return withVault(() => handleOptions(request));
  if (isLoginTab(sender)) return withVault(async () => {
    if (request?.type !== "GET_LOGIN_VALUE" || !["username", "password"].includes(request.field)) return { error: "Request denied." };
    const { vault } = await chrome.storage.local.get("vault");
    const unlocked = await getUnlocked(vault);
    return unlocked ? { value: unlocked.totp[request.field] || "", ...(request.field === "password" ? { account: unlocked.totp.username || "" } : {}) } : { value: "" };
  });
  if (!isSiteTab(sender)) return { error: "Request denied." };
  return withVault(() => handleSiteMessage(request));
}

async function handleSiteMessage(request) {
  const { vault } = await chrome.storage.local.get("vault");
  const unlocked = await getUnlocked(vault);
  if (request?.type === "GET_STATUS") return { ready: !!unlocked };
  if (request?.type !== "GET_CODE") return { error: "Unknown request." };
  if (!unlocked) return { error: "Unlock your encrypted setup key in the extension options first." };
  const result = await ISCTOTP.generateTotp(unlocked.totp);
  return result.remainingSeconds < 6 ? { pending: true } : { code: result.code };
}

async function handleOptions(request) {
  const settings = await chrome.storage.local.get(["vault", "totp"]);
  if (request?.type === "VAULT_STATUS") {
    const unlocked = await getUnlocked(settings.vault);
    return { encrypted: !!settings.vault, legacy: !!settings.totp,
      unlocked: !!unlocked, expiresAt: unlocked?.expiresAt || 0,
      usernameSaved: !!unlocked?.totp.username, passwordSaved: !!unlocked?.totp.password };
  }
  if (request?.type === "SAVE_SETTINGS") {
    let totp;
    const unlocked = await getUnlocked(settings.vault);
    if (request.secret) totp = { ...(unlocked?.totp || {}), ...ISCTOTP.parseTotpSecret(request.secret) };
    else if (settings.vault) {
      if (!unlocked) throw new Error("Unlock the saved data before changing it.");
      totp = { ...unlocked.totp };
    } else if (settings.totp) totp = ISCTVault.validateConfig(settings.totp);
    else throw new Error("Enter your setup key.");
    if (request.username) totp.username = request.username;
    if (request.password) totp.password = request.password;
    const vault = await ISCTVault.encryptVault(totp, request.passphrase);
    await chrome.storage.local.set({ vault });
    await chrome.storage.local.remove("totp");
    await unlockForSession(vault, totp);
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
