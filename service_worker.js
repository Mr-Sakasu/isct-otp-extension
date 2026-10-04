importScripts("core.js");

const SITE_URL = /^https:\/\/isct\.ex-tic\.com\/auth\/session\/second_factor(?:[/?#]|$)/;
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me/messages";

// The page can request a code, but cannot read the stored authenticator key.
chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
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
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
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
  if (request?.type === "CONNECT_GMAIL" && isOptions(sender)) {
    if (!gmailConfigured()) throw new Error("Set the Google OAuth client ID in manifest.json first.");
    const token = await getToken(true);
    await gmailJson(`${GMAIL_API}?maxResults=1`, token);
    await chrome.storage.local.set({ gmailConnected: true });
    return { connected: true };
  }
  if (!isSiteTab(sender)) return { error: "Request denied." };
  const settings = await chrome.storage.local.get(["mode", "totp", "gmailConnected"]);
  const mode = settings.mode || "totp";
  if (request?.type === "GET_STATUS") {
    if (mode === "totp") return { mode, ready: !!settings.totp };
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
    if (!settings.totp) return { error: "Add an authenticator setup key in the extension options." };
    const now = Date.now();
    const result = await ISCTOTP.generateTotp(settings.totp, now);
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender).then(sendResponse).catch((error) => sendResponse({ error: error.message || "OTP lookup failed." }));
  return true;
});
