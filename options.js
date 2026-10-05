const secretInput = document.getElementById("secret");
const statusText = document.getElementById("status");
const showCodeButton = document.getElementById("showCode");
const revealedKey = document.getElementById("revealedKey");
const hideKeyButton = document.getElementById("hideKey");
let codeTimer = null;
let keyTimer = null;
let codeDisplayVersion = 0;
let keyDisplayVersion = 0;

function status(message) {
  statusText.textContent = ISCTLocale.text(message);
}

async function request(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result || result.error) throw new Error(result?.error || "Extension is unavailable.");
  return result;
}

function hideCode() {
  codeDisplayVersion++;
  clearInterval(codeTimer);
  codeTimer = null;
  document.getElementById("currentCode").textContent = "";
  document.getElementById("codeExpiry").textContent = "";
  showCodeButton.textContent = ISCTLocale.text("Show current code");
}

function hideKey() {
  keyDisplayVersion++;
  clearTimeout(keyTimer);
  keyTimer = null;
  revealedKey.value = "";
  revealedKey.hidden = true;
  hideKeyButton.hidden = true;
}

function clearPassphrases() {
  for (const id of ["newPassphrase", "confirmPassphrase", "unlockPassphrase"]) document.getElementById(id).value = "";
}

async function refresh() {
  const settings = await request({ type: "VAULT_STATUS" });
  const state = document.getElementById("secretState");
  if (settings.legacy) {
    state.textContent = "An older unencrypted key remains. Set and confirm a new passphrase, then Save settings to encrypt it. Leave Setup key blank to keep that key.";
  } else if (!settings.encrypted) state.textContent = "No setup key saved.";
  else if (!settings.unlocked) state.textContent = "Encrypted setup key saved. Locked.";
  else state.textContent = `Encrypted key unlocked until ${new Date(settings.expiresAt).toLocaleTimeString()}.`;
  state.textContent = ISCTLocale.text(state.textContent);
  document.getElementById("unlock").disabled = !settings.encrypted;
  document.getElementById("lock").disabled = !settings.unlocked;
  document.getElementById("showKey").disabled = !settings.encrypted;
  showCodeButton.disabled = !settings.unlocked;
  document.getElementById("loginState").textContent = !settings.unlocked ? "Unlock saved data to check the login settings." :
    settings.passwordSaved ? "Username and university password saved for automatic login." :
    settings.usernameSaved ? "Username saved. University password is not saved yet." : "No university login credentials saved.";
  document.getElementById("loginState").textContent = ISCTLocale.text(document.getElementById("loginState").textContent);
  if (!settings.unlocked) hideCode();
}

// Serialize UI operations to prevent double clicks during key derivation.
let busy = false;
async function act(operation) {
  if (busy) return;
  busy = true;
  const buttons = [...document.querySelectorAll("button")];
  for (const button of buttons) button.disabled = true;
  try {
    await operation();
  } catch (error) {
    status(error.message || "Operation failed.");
  } finally {
    busy = false;
    for (const button of buttons) button.disabled = false;
    await refresh().catch((error) => status(error.message));
  }
}

document.getElementById("save").addEventListener("click", () => act(async () => {
  hideCode();
  hideKey();
  const passphrase = document.getElementById("newPassphrase").value;
  const confirmation = document.getElementById("confirmPassphrase").value;
  if (passphrase !== confirmation) throw new Error("The new passphrases do not match.");
  const message = { type: "SAVE_SETTINGS", secret: secretInput.value.trim(), passphrase,
    username: document.getElementById("username").value.trim(), password: document.getElementById("universityPassword").value };
  clearPassphrases();
  status("Saving settings…");
  await request(message);
  secretInput.value = "";
  document.getElementById("username").value = "";
  document.getElementById("universityPassword").value = "";
  status("Settings saved. The setup key is encrypted when present.");
}));

document.getElementById("unlock").addEventListener("click", () => act(async () => {
  const passphrase = document.getElementById("unlockPassphrase").value;
  clearPassphrases();
  status("Unlocking…");
  await request({ type: "UNLOCK_VAULT", passphrase });
  status("Unlocked for 30 minutes. Open or reload the university's login page to start automatic entry.");
}));

document.getElementById("lock").addEventListener("click", () => act(async () => {
  hideCode();
  hideKey();
  clearPassphrases();
  secretInput.value = "";
  document.getElementById("username").value = "";
  document.getElementById("universityPassword").value = "";
  await request({ type: "LOCK_VAULT" });
  status("Locked. Unlocked session key removed.");
}));

document.getElementById("showKey").addEventListener("click", () => act(async () => {
  hideKey();
  const version = keyDisplayVersion;
  const passphrase = document.getElementById("unlockPassphrase").value;
  clearPassphrases();
  status("Verifying passphrase…");
  const result = await request({ type: "REVEAL_KEY", passphrase });
  if (version !== keyDisplayVersion || document.hidden) return;
  revealedKey.value = result.secret;
  revealedKey.hidden = false;
  hideKeyButton.hidden = false;
  keyTimer = setTimeout(hideKey, 30000);
  status("Saved key shown for 30 seconds. Hide it when finished.");
}));

hideKeyButton.addEventListener("click", hideKey);

async function updateCode(version) {
  const result = await request({ type: "GET_LOCAL_CODE" });
  if (version !== codeDisplayVersion || document.hidden) return;
  document.getElementById("currentCode").textContent = result.code;
  document.getElementById("codeExpiry").textContent = ISCTLocale.text(`Refreshes in ${result.remainingSeconds} seconds.`);
}

showCodeButton.addEventListener("click", () => {
  if (codeTimer !== null) return hideCode();
  const version = ++codeDisplayVersion;
  showCodeButton.textContent = ISCTLocale.text("Hide code");
  codeTimer = setInterval(() => updateCode(version).catch((error) => {
    hideCode();
    status(error.message);
    refresh().catch(() => {});
  }), 1000);
  updateCode(version).catch((error) => {
    hideCode();
    status(error.message);
  });
});

document.getElementById("removeSecret").addEventListener("click", () => act(async () => {
  hideCode();
  hideKey();
  clearPassphrases();
  secretInput.value = "";
  await request({ type: "DELETE_KEY" });
  document.getElementById("username").value = "";
  document.getElementById("universityPassword").value = "";
  status("Saved encrypted data and unlocked session data removed.");
}));

window.addEventListener("pagehide", () => {
  hideCode();
  hideKey();
  clearPassphrases();
  secretInput.value = "";
  document.getElementById("username").value = "";
  document.getElementById("universityPassword").value = "";
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    hideCode();
    hideKey();
    clearPassphrases();
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.unlockedVault) {
    hideKey();
    refresh().catch((error) => status(error.message));
  } else if (area === "local" && (changes.vault || changes.totp)) {
    hideKey();
    hideCode();
    refresh().catch((error) => status(error.message));
  }
});

refresh().catch((error) => status(error.message));
