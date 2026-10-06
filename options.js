const secretInput = document.getElementById("secret");
const statusText = document.getElementById("status");
const revealedKey = document.getElementById("revealedKey");
const revealedSettings = document.getElementById("revealedSettings");
const revealedUsername = document.getElementById("revealedUsername");
const revealedPassword = document.getElementById("revealedPassword");
const showKeyButton = document.getElementById("showKey");
let codeTimer = null;
let codeVersion = 0;
let keyVersion = 0;
let busy = false;

function status(message) {
  statusText.textContent = ISCTLocale.text(message);
}

async function request(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result || result.error) throw new Error(result?.error || "Extension is unavailable.");
  return result;
}

function hideKey() {
  keyVersion++;
  revealedKey.value = "";
  revealedUsername.value = "";
  revealedPassword.value = "";
  revealedKey.hidden = true;
  revealedSettings.hidden = true;
  showKeyButton.textContent = ISCTLocale.text("Show saved settings");
}

function stopCode() {
  codeVersion++;
  clearInterval(codeTimer);
  codeTimer = null;
  document.getElementById("currentCode").textContent = "";
  document.getElementById("codeExpiry").textContent = "";
}

async function updateCode(version) {
  const result = await request({ type: "GET_LOCAL_CODE" });
  if (version !== codeVersion || document.hidden) return;
  document.getElementById("currentCode").textContent = result.code;
  document.getElementById("codeExpiry").textContent = ISCTLocale.text(`Refreshes in ${result.remainingSeconds} seconds.`);
}

async function refresh() {
  const settings = await request({ type: "GET_SETTINGS" });
  document.getElementById("migration").hidden = !settings.needsMigration;
  document.getElementById("secretState").textContent = ISCTLocale.text(settings.ready ? "Saved. Automatic entry is ready." : settings.saved ? "Saved. Add your setup key to enable OTP entry." : "You can save one field at a time.");
  if (!document.getElementById("username").value) document.getElementById("username").value = settings.username;
  showKeyButton.disabled = !settings.saved;
  document.getElementById("codeSection").hidden = !settings.ready;
  if (!settings.ready || document.hidden) stopCode();
  else if (codeTimer === null) {
    const version = ++codeVersion;
    codeTimer = setInterval(() => updateCode(version).catch(() => stopCode()), 1000);
    await updateCode(version);
  }
}

async function act(operation) {
  if (busy) return;
  busy = true;
  const buttons = [...document.querySelectorAll("button")];
  for (const button of buttons) button.disabled = true;
  try { await operation(); }
  catch (error) { status(error.message || "Operation failed."); }
  finally {
    busy = false;
    for (const button of buttons) button.disabled = false;
    await refresh().catch((error) => status(error.message));
  }
}

document.getElementById("save").addEventListener("click", () => act(async () => {
  hideKey();
  stopCode();
  const message = { type: "SAVE_SETTINGS", secret: secretInput.value.trim(),
    username: document.getElementById("username").value.trim(), password: document.getElementById("universityPassword").value };
  status("Saving…");
  const result = await request(message);
  secretInput.value = "";
  document.getElementById("universityPassword").value = "";
  status(result.ready ? "Saved. Open the university login page." : "Saved. You can add the remaining settings later.");
}));

document.getElementById("migrate").addEventListener("click", () => act(async () => {
  const passphrase = document.getElementById("legacyPassphrase").value;
  document.getElementById("legacyPassphrase").value = "";
  status("Importing…");
  await request({ type: "MIGRATE_LEGACY", passphrase });
  status("Imported. Automatic entry is ready.");
}));

showKeyButton.addEventListener("click", () => act(async () => {
  if (!revealedKey.hidden) return hideKey();
  const version = ++keyVersion;
  const result = await request({ type: "REVEAL_SETTINGS" });
  if (version !== keyVersion || document.hidden) return;
  revealedKey.value = result.secret;
  revealedUsername.value = result.username;
  revealedPassword.value = result.password;
  revealedKey.hidden = false;
  revealedSettings.hidden = false;
  showKeyButton.textContent = ISCTLocale.text("Hide saved settings");
}));

document.getElementById("removeSecret").addEventListener("click", () => act(async () => {
  hideKey();
  stopCode();
  await request({ type: "DELETE_KEY" });
  secretInput.value = "";
  document.getElementById("username").value = "";
  document.getElementById("universityPassword").value = "";
  status("Saved data removed.");
}));

function clearSensitiveFields() {
  hideKey();
  stopCode();
  secretInput.value = "";
  document.getElementById("universityPassword").value = "";
  document.getElementById("legacyPassphrase").value = "";
}
window.addEventListener("pagehide", clearSensitiveFields);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearSensitiveFields();
  else refresh().catch((error) => status(error.message));
});
document.getElementById("savedData").addEventListener("toggle", () => {
  if (!document.getElementById("savedData").open) hideKey();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.automaticSettings || changes.vault || changes.totp)) {
    hideKey();
    stopCode();
    refresh().catch((error) => status(error.message));
  }
});
refresh().catch((error) => status(error.message));
