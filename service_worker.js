importScripts("core.js", "vault.js");

const SITE_URL = /^https:\/\/isct\.ex-tic\.com\/auth\/session\/second_factor(?:[/?#]|$)/;
const LOGIN_URL = /^https:\/\/isct\.ex-tic\.com\/auth\/session\/?(?:[?#]|$)/;
let settingsQueue = Promise.resolve();

function withSettings(operation) {
  const next = settingsQueue.then(operation);
  settingsQueue = next.catch(() => {});
  return next;
}

async function loadConfig() {
  const { automaticSettings, deviceKey } = await chrome.storage.local.get(["automaticSettings", "deviceKey"]);
  return automaticSettings ? ISCTVault.decryptAutomatic(automaticSettings, deviceKey) : null;
}

async function saveConfig(config) {
  const settings = await chrome.storage.local.get("deviceKey");
  const deviceKey = Array.isArray(settings.deviceKey) && settings.deviceKey.length === 32 && settings.deviceKey.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    ? settings.deviceKey : ISCTVault.createDeviceKey();
  const automaticSettings = await ISCTVault.encryptAutomatic(config, deviceKey);
  await chrome.storage.local.set({ automaticSettings, deviceKey });
  // Remove the old record only after the replacement has been saved successfully.
  await chrome.storage.local.remove(["vault", "totp", "mode", "gmailConnected"]);
}

const storageReady = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
  chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
]).then(async () => {
  await chrome.storage.local.remove(["mode", "gmailConnected"]);
  await chrome.storage.session.remove(["unlockedVault", "usedMessageIds"]);
  const { automaticSettings, vault, totp } = await chrome.storage.local.get(["automaticSettings", "vault", "totp"]);
  if (!automaticSettings && !vault && totp) await saveConfig(ISCTVault.validateConfig(totp));
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

function isOptions(sender) {
  return sender.id === chrome.runtime.id && ["options.html", "options.ja.html", "options.zh-CN.html"].some((page) => sender.url === chrome.runtime.getURL(page));
}

async function handleMessage(request, sender) {
  await storageReady;
  return withSettings(async () => {
    if (isOptions(sender)) return handleOptions(request);
    if (sender.id !== chrome.runtime.id || !sender.tab) return { error: "Request denied." };
    if (LOGIN_URL.test(sender.url || "")) {
      if (request?.type !== "GET_LOGIN_VALUE" || !["username", "password"].includes(request.field)) return { error: "Request denied." };
      const config = await loadConfig();
      const value = request.field === "password" && !config?.username ? "" : config?.[request.field] || "";
      return { value, ...(request.field === "password" ? { account: config?.username || "" } : {}) };
    }
    if (!SITE_URL.test(sender.url || "")) return { error: "Request denied." };
    if (request?.type !== "GET_STATUS" && request?.type !== "GET_CODE") return { error: "Request denied." };
    const config = await loadConfig();
    if (request.type === "GET_STATUS") return { ready: !!config?.secret };
    if (!config?.secret) return { error: "Save your setup key in extension settings first." };
    const result = await ISCTOTP.generateTotp(config);
    return result.remainingSeconds < 6 ? { pending: true } : { code: result.code };
  });
}

async function handleOptions(request) {
  if (request?.type === "DELETE_KEY") {
    await chrome.storage.local.remove(["automaticSettings", "deviceKey", "vault", "totp"]);
    await chrome.storage.session.remove("unlockedVault");
    return { removed: true };
  }
  let config;
  try { config = await loadConfig(); }
  catch (error) {
    if (request?.type !== "GET_SETTINGS" && !(request?.type === "SAVE_SETTINGS" && request.secret)) throw error;
    config = null;
  }
  if (request?.type === "GET_SETTINGS") {
    const { vault } = await chrome.storage.local.get("vault");
    return { saved: !!config, ready: !!config?.secret, needsMigration: !config && !!vault, username: config?.username || "", passwordSaved: !!config?.password };
  }
  if (request?.type === "SAVE_SETTINGS") {
    let next = config ? { ...config } : {};
    if (request.secret) next = { ...next, ...ISCTOTP.parseTotpSecret(request.secret) };
    if (request.username) next.username = request.username;
    if (request.password) next.password = request.password;
    const { vault } = await chrome.storage.local.get("vault");
    if (!config && vault && !next.secret) throw new Error("Import previous settings before saving.");
    await saveConfig(next);
    return { saved: true, ready: !!next.secret };
  }
  if (request?.type === "MIGRATE_LEGACY") {
    const { vault } = await chrome.storage.local.get("vault");
    if (!vault) throw new Error("No previous settings to import.");
    const previous = await ISCTVault.decryptVault(vault, request.passphrase);
    await saveConfig(previous);
    return { imported: true };
  }
  if (request?.type === "REVEAL_SETTINGS") {
    if (!config) throw new Error("No saved settings.");
    return { secret: config.secret || "", username: config.username || "", password: config.password || "" };
  }
  if (request?.type === "REVEAL_KEY") {
    if (!config?.secret) throw new Error("Enter your setup key.");
    return { secret: config.secret };
  }
  if (request?.type === "GET_LOCAL_CODE") {
    if (!config?.secret) throw new Error("Enter your setup key.");
    return ISCTOTP.generateTotp(config);
  }
  return { error: "Unknown request." };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender).then(sendResponse).catch((error) => sendResponse({ error: error.message || "Operation failed." }));
  return true;
});
