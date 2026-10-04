const modeInput = document.getElementById("mode");
const secretInput = document.getElementById("secret");
const statusText = document.getElementById("status");

function status(message) {
  statusText.textContent = message;
}

async function refresh() {
  const settings = await chrome.storage.local.get(["mode", "totp", "gmailConnected"]);
  modeInput.value = settings.mode || "totp";
  document.getElementById("secretState").textContent = settings.totp ? "A setup key is saved on this browser." : "No setup key saved.";
  document.getElementById("gmailState").textContent = settings.gmailConnected ? "Gmail was connected on this browser." : "Gmail is not connected yet.";
}

document.getElementById("save").addEventListener("click", async () => {
  try {
    const update = { mode: modeInput.value };
    if (secretInput.value.trim()) update.totp = ISCTOTP.parseTotpSecret(secretInput.value);
    await chrome.storage.local.set(update);
    secretInput.value = "";
    await refresh();
    status("Settings saved.");
  } catch (error) {
    status(error.message);
  }
});

document.getElementById("removeSecret").addEventListener("click", async () => {
  await chrome.storage.local.remove("totp");
  secretInput.value = "";
  await refresh();
  status("Saved setup key removed.");
});

document.getElementById("connectGmail").addEventListener("click", async () => {
  status("Opening Google authorization…");
  try {
    const result = await chrome.runtime.sendMessage({ type: "CONNECT_GMAIL" });
    if (result?.error) throw new Error(result.error);
    await refresh();
    status("Gmail connected.");
  } catch (error) {
    status(error.message || "Gmail authorization failed.");
  }
});

refresh().catch((error) => status(error.message));
