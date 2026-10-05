// Browser-level smoke test with a mock response at the real second-factor URL.
// Requires Chromium/Chrome for Testing and Node 22. No account or real OTP is used.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { generateTotp, parseTotpSecret } = require("../core.js");
const extensionDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixtureHtml = await readFile(new URL("./fixtures/second-factor.html", import.meta.url), "utf8");
const chromeManifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
const loginHtml = await readFile(new URL("./fixtures/login.html", import.meta.url), "utf8");
const profile = await mkdtemp(path.join(os.tmpdir(), "isct-otp-browser-"));
const port = 20000 + Math.floor(Math.random() * 20000);
function startChrome() { return spawn(process.env.CHROME_BIN || "chromium", [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run",
  `--remote-debugging-port=${port}`,
  `--disable-extensions-except=${extensionDirectory}`,
  `--load-extension=${extensionDirectory}`,
  `--user-data-dir=${profile}`,
  "about:blank"
], { stdio: "ignore" }); }
let chrome = startChrome();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let worker;
let page;

class CDP {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const callback = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) callback.reject(new Error(message.error.message));
        else callback.resolve(message.result);
      } else {
        for (const callback of this.listeners.get(message.method) || []) callback(message.params);
      }
    });
  }
  on(method, callback) {
    this.listeners.set(method, [...(this.listeners.get(method) || []), callback]);
  }
  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return result;
  }
  close() { this.socket.close(); }
}

async function targets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  return response.json();
}

async function evaluate(connection, expression, contextId) {
  const response = await connection.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, ...(contextId ? { contextId } : {}) });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}

async function waitForUi(expression, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(page, expression)) return;
    await delay(100);
  }
  const state = await evaluate(page, '({hidden:document.hidden,status:document.getElementById("status")?.textContent,keyState:document.getElementById("secretState")?.textContent,codeDisabled:document.getElementById("showCode")?.disabled})');
  throw new Error(`Options UI did not finish: ${label}; ${JSON.stringify(state)}`);
}

async function navigateOptions() {
  const url = await evaluate(worker, 'chrome.runtime.getURL("options.html")');
  await page.send("Page.navigate", { url });
  await waitForUi('!!document.getElementById("secretState")?.textContent', "options load");
}

async function optionsCall(message) {
  return evaluate(page, `chrome.runtime.sendMessage(${JSON.stringify(message)})`);
}

async function stopChrome() {
  worker?.close();
  page?.close();
  worker = page = null;
  if (chrome.exitCode === null) {
    const exited = once(chrome, "exit");
    chrome.kill("SIGTERM");
    await exited;
  }
}

async function connectChrome() {
  let list;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      list = await targets();
      for (const target of list.filter((item) => item.type === "service_worker" && item.url.endsWith("/service_worker.js"))) {
        const candidate = new CDP(target.webSocketDebuggerUrl);
        await candidate.ready;
        const name = await evaluate(candidate, "chrome.runtime?.getManifest?.().name");
        if (name === "Science Tokyo OTP Autofill") { worker = candidate; break; }
        candidate.close();
      }
      if (worker) break;
    } catch { /* Chrome is starting. */ }
    await delay(100);
  }
  assert.ok(list, "Chrome did not start.");
  const pageTarget = list.find((target) => target.type === "page" && target.url === "about:blank");
  assert.ok(worker && pageTarget, "The extension service worker did not load.");
  page = new CDP(pageTarget.webSocketDebuggerUrl);
  await Promise.all([worker.ready, page.ready]);
  await page.send("Page.enable");
}

async function waitForSubmission() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await evaluate(page, "({ code: document.body?.dataset.submitted || '', sent: document.body?.dataset.sent || '' })");
    if (result.code) return result;
    await delay(100);
  }
  throw new Error("The extension did not submit an OTP within ten seconds.");
}

async function navigateWithMock(html, marker, url = "https://isct.ex-tic.com/auth/session/second_factor") {
  page.mockHtml = html;
  await page.send("Page.navigate", { url });
  for (let attempt = 0; attempt < 50; attempt++) {
    const loaded = await evaluate(page, "document.body?.dataset.testCase || ''");
    if (loaded === marker) return;
    await delay(100);
  }
  throw new Error(`Mock ${marker} page did not load.`);
}

try {
  await connectChrome();
  let contexts = [];
  page.on("Runtime.executionContextCreated", ({ context }) => contexts.push(context));
  page.on("Runtime.executionContextsCleared", () => { contexts = []; });
  await page.send("Runtime.enable");
  page.on("Fetch.requestPaused", (event) => {
    const responseHtml = page.flowHtml && new URL(event.request.url).pathname === "/auth/session/second_factor" ? page.flowHtml : page.mockHtml;
    page.send("Fetch.fulfillRequest", {
      requestId: event.requestId,
      responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "text/html; charset=utf-8" }],
      body: Buffer.from(responseHtml).toString("base64")
    }).catch((error) => { throw error; });
  });
  await page.send("Fetch.enable", {
    patterns: [
      { urlPattern: "https://isct.ex-tic.com/auth/session/second_factor*", requestStage: "Request" },
      { urlPattern: "https://isct.ex-tic.com/auth/session", requestStage: "Request" }
    ]
  });

  await evaluate(worker, 'chrome.storage.local.remove("totp")');
  await navigateWithMock(fixtureHtml.replace('data-test-case="fixture"', 'data-test-case="unconfigured"'), "unconfigured");
  await delay(500);
  const unconfigured = await evaluate(page, "fixtureResult");
  assert.equal(unconfigured.selectionCount, 0);
  assert.equal(unconfigured.submitCount, 0);
  assert.equal(unconfigured.sendCount, 0);
  console.log("Unconfigured: no method selected and no authentication attempted.");

  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const config = parseTotpSecret(secret);
  const passphrase = "test-only browser passphrase with several words";
  await evaluate(worker, 'globalThis.networkCalls=0;globalThis.fetch=async()=>{networkCalls++;throw new Error("Unexpected network request during TOTP test")};');
  await evaluate(worker, `chrome.storage.local.set({totp:{secret:"${secret}",period:30,digits:6}})`);
  await navigateWithMock(fixtureHtml.replace('data-test-case="fixture"', 'data-test-case="legacy"'), "legacy");
  await delay(500);
  assert.equal((await evaluate(page, "fixtureResult")).submitCount, 0);
  await navigateOptions();
  assert.match(await evaluate(page, 'document.getElementById("secretState").textContent'), /unencrypted/);
  await evaluate(page, `document.getElementById("newPassphrase").value=${JSON.stringify(passphrase)};document.getElementById("confirmPassphrase").value=${JSON.stringify(passphrase)};document.getElementById("save").click();`);
  await waitForUi('document.getElementById("status").textContent.startsWith("Settings saved.")', "encrypted migration");
  const localRecord = await evaluate(worker, "chrome.storage.local.get(null)");
  assert.ok(localRecord.vault);
  assert.equal(localRecord.totp, undefined);
  assert.ok(!JSON.stringify(localRecord).includes(secret));
  assert.ok(!JSON.stringify(localRecord).includes(passphrase));
  assert.equal(await evaluate(page, 'document.getElementById("newPassphrase").value'), "");
  assert.equal(await evaluate(page, 'document.getElementById("confirmPassphrase").value'), "");
  await evaluate(page, 'document.getElementById("showCode").click()');
  await waitForUi('/^[0-9]{6}$/.test(document.getElementById("currentCode").textContent)', "enrollment code");
  const localCode = await evaluate(page, 'document.getElementById("currentCode").textContent');
  const currentCodes = await Promise.all([generateTotp(config), generateTotp(config, Date.now() - 30000)]);
  assert.ok(currentCodes.some((result) => result.code === localCode));
  await evaluate(page, 'document.getElementById("showCode").click()');
  await evaluate(page, 'document.getElementById("unlockPassphrase").value="incorrect passphrase";document.getElementById("showKey").click()');
  await waitForUi('document.getElementById("status").textContent.startsWith("Incorrect passphrase")', "reject incorrect reveal password");
  assert.equal(await evaluate(page, 'document.getElementById("revealedKey").value'), "");
  await evaluate(page, `document.getElementById("unlockPassphrase").value=${JSON.stringify(passphrase)};document.getElementById("showKey").click()`);
  await waitForUi('!document.getElementById("revealedKey").hidden', "reveal key");
  assert.equal(await evaluate(page, 'document.getElementById("revealedKey").value'), secret);
  await delay(30500);
  assert.equal(await evaluate(page, 'document.getElementById("revealedKey").value'), "");
  assert.equal(await evaluate(page, 'document.getElementById("revealedKey").hidden'), true);
  console.log("Options: legacy key encrypted, enrollment code generated, passphrases cleared, key reveal requires password and hides after 30 seconds.");

  await evaluate(page, 'document.getElementById("lock").click()');
  await waitForUi('document.getElementById("status").textContent.startsWith("Locked.")', "lock");
  assert.equal((await evaluate(worker, 'chrome.storage.session.get("unlockedVault")')).unlockedVault, undefined);
  await navigateWithMock(fixtureHtml.replace('data-test-case="fixture"', 'data-test-case="locked"'), "locked");
  await delay(500);
  assert.equal((await evaluate(page, "fixtureResult")).selectionCount, 0);
  assert.equal((await evaluate(page, "fixtureResult")).submitCount, 0);
  await navigateOptions();
  await evaluate(page, 'document.getElementById("unlockPassphrase").value="incorrect passphrase";document.getElementById("unlock").click()');
  await waitForUi('document.getElementById("status").textContent.startsWith("Incorrect passphrase")', "reject incorrect unlock password");
  assert.equal((await evaluate(worker, 'chrome.storage.session.get("unlockedVault")')).unlockedVault, undefined);
  assert.deepEqual((await evaluate(worker, 'chrome.storage.local.get("vault")')).vault, localRecord.vault);
  assert.equal((await optionsCall({ type: "UNLOCK_VAULT", passphrase })).unlocked, true);
  await evaluate(worker, 'chrome.storage.session.get("unlockedVault").then(({unlockedVault})=>chrome.storage.session.set({unlockedVault:{...unlockedVault,expiresAt:Date.now()-1}})).then(()=>chrome.alarms.create("otp-vault-auto-lock",{when:Date.now()+100}))');
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!(await evaluate(worker, 'chrome.storage.session.get("unlockedVault")')).unlockedVault) break;
    await delay(100);
  }
  assert.equal((await evaluate(worker, 'chrome.storage.session.get("unlockedVault")')).unlockedVault, undefined);
  await evaluate(page, `document.getElementById("unlockPassphrase").value=${JSON.stringify(passphrase)};document.getElementById("unlock").click()`);
  await waitForUi('document.getElementById("status").textContent.startsWith("Unlocked for")', "unlock");
  assert.ok(await evaluate(worker, 'chrome.alarms.get("otp-vault-auto-lock")'));
  for (const type of ["REVEAL_KEY", "GET_LOCAL_CODE", "UNLOCK_VAULT", "DELETE_KEY", "LOCK_VAULT", "SAVE_SETTINGS", "VAULT_STATUS"]) {
    const denied = await evaluate(worker, `handleMessage({type:${JSON.stringify(type)},passphrase:${JSON.stringify(passphrase)}},{id:chrome.runtime.id,url:"https://isct.ex-tic.com/auth/session/second_factor",tab:{id:1}})`);
    assert.ok(denied.error);
    assert.equal(denied.secret, undefined);
  }
  console.log("Locking: wrong password rejected, locked site inactive, auto-lock clears session, site cannot call key management APIs.");

  const totpHtml = fixtureHtml.replace('data-test-case="fixture"', 'data-test-case="totp"');
  await navigateWithMock(totpHtml, "totp");
  const totpResult = await waitForSubmission();
  const now = Date.now();
  const possibleCodes = await Promise.all([generateTotp(config, now), generateTotp(config, now - 30000)]);
  assert.ok(possibleCodes.some((result) => result.code === totpResult.code));
  assert.equal(totpResult.sent, "");
  const appFormResult = await evaluate(page, "fixtureResult");
  assert.equal(appFormResult.selected, "totp-form-selector");
  assert.equal(appFormResult.selectionCount, 1);
  assert.equal(appFormResult.formId, "totp-form");
  assert.equal(appFormResult.fields.totp, totpResult.code);
  assert.equal(appFormResult.fields.authenticity_token, "TEST-CSRF-TOKEN");
  assert.equal(appFormResult.action, "/auth/session/second_factor");
  assert.equal(appFormResult.sendCount, 0);
  assert.equal(appFormResult.submitCount, 1);
  assert.equal(appFormResult.otherSubmits, 0);
  const contentContext = contexts.findLast((context) => context.origin.startsWith("chrome-extension://") && !context.auxData?.isDefault);
  assert.ok(contentContext, "Extension content-script context not found.");
  const access = await evaluate(page, '(async()=>{const result={};for(const area of ["local","session"]){try{await chrome.storage[area].get(null);result[area]="allowed"}catch{result[area]="denied"}}return result})()', contentContext.id);
  assert.deepEqual(access, { local: "denied", session: "denied" });
  const revealDenied = await evaluate(page, 'chrome.runtime.sendMessage({type:"REVEAL_KEY",passphrase:"test-only browser passphrase with several words"})', contentContext.id);
  assert.ok(revealDenied.error);
  assert.equal(revealDenied.secret, undefined);
  console.log("TOTP: app method selected, code filled, correct form submitted once.");

  const manualHtml = fixtureHtml
    .replace('data-test-case="fixture"', 'data-test-case="manual"')
    .replace('id="authenticator-selector"', 'id="authenticator-selector" style="display:none"')
    .replace('id="totp-form-wrapper" style="display: none"', 'id="totp-form-wrapper" style="display:block"')
    .replace('name="totp" id="totp"', 'name="totp" id="totp" value="654321"');
  await navigateWithMock(manualHtml, "manual");
  await delay(500);
  assert.equal(await evaluate(page, 'document.getElementById("totp").value'), "654321");
  const manual = await evaluate(page, "fixtureResult");
  assert.equal(manual.selectionCount, 0);
  assert.equal(manual.submitCount, 0);
  console.log("Manual input: preserved and not submitted automatically.");

  const otherMethodHtml = fixtureHtml
    .replace('data-test-case="fixture"', 'data-test-case="other-method"')
    .replace('id="authenticator-selector"', 'id="authenticator-selector" style="display:none"')
    .replace('id="emailotp-form-wrapper" style="display: none"', 'id="emailotp-form-wrapper" style="display:block"');
  await navigateWithMock(otherMethodHtml, "other-method");
  await delay(500);
  const otherMethod = await evaluate(page, "fixtureResult");
  assert.equal(otherMethod.selectionCount, 0);
  assert.equal(otherMethod.sendCount, 0);
  assert.equal(otherMethod.submitCount, 0);
  console.log("Another method already selected: no override or submission.");

  const username = "test-science-tokyo-id";
  const universityPassword = "test-only university password";
  await navigateOptions();
  await evaluate(page, `document.getElementById("username").value=${JSON.stringify(username)};document.getElementById("universityPassword").value=${JSON.stringify(universityPassword)};document.getElementById("newPassphrase").value=${JSON.stringify(passphrase)};document.getElementById("confirmPassphrase").value=${JSON.stringify(passphrase)};document.getElementById("save").click()`);
  await waitForUi('document.getElementById("status").textContent.startsWith("Settings saved.") && !document.getElementById("save").disabled', "login credentials saved");
  const encryptedLogin = JSON.stringify(await evaluate(worker, "chrome.storage.local.get(null)"));
  for (const value of [username, universityPassword, secret, passphrase]) assert.ok(!encryptedLogin.includes(value));
  assert.equal(await evaluate(page, 'document.getElementById("universityPassword").value'), "");
  // Keep the persisted snapshot current for the browser restart assertion.
  localRecord.vault = (await evaluate(worker, 'chrome.storage.local.get("vault")')).vault;
  await navigateWithMock(loginHtml, "login", "https://isct.ex-tic.com/auth/session");
  await waitForUi('window.loginResult?.passwordSubmits === 1', "username to password transition");
  const login = await evaluate(page, "loginResult");
  assert.equal(login.username, username);
  assert.equal(login.password, universityPassword);
  assert.equal(login.firstPassword, "");
  assert.equal(login.csrf, "TEST-LOGIN-CSRF-TOKEN");
  assert.equal(login.usernameSubmits, 1);
  assert.equal(login.passwordSubmits, 1);
  await delay(300);
  assert.equal((await evaluate(page, "loginResult")).passwordSubmits, 1);
  const loginContext = contexts.findLast((context) => context.origin.startsWith("chrome-extension://") && !context.auxData?.isDefault);
  assert.ok(loginContext);
  assert.ok((await evaluate(page, 'chrome.runtime.sendMessage({type:"GET_CODE"})', loginContext.id)).error);
  assert.ok((await evaluate(page, 'chrome.runtime.sendMessage({type:"REVEAL_KEY"})', loginContext.id)).error);
  console.log("Login: username submitted first, password filled after AJAX transition, CSRF preserved, both steps submitted once.");

  const rememberedLogin = loginHtml.replace('data-test-case="login"', 'data-test-case="login-remembered"').replace('name="identifier" type="text"', `name="identifier" type="text" value="${username}"`);
  await navigateWithMock(rememberedLogin, "login-remembered", "https://isct.ex-tic.com/auth/session");
  await waitForUi('window.loginResult?.passwordSubmits === 1', "continue with remembered matching username");
  assert.equal((await evaluate(page, "loginResult")).username, username);
  console.log("Remembered username: matching saved identity continues without overwriting the field.");

  for (const [label, html] of [
    ["login-manual", loginHtml.replace('name="identifier" type="text"', 'name="identifier" type="text" value="manual-id"')],
    ["login-warning", loginHtml.replace('class="message warning" style="display:none"', 'class="message warning" style="display:block"')],
    ["login-account-mismatch", loginHtml.replace('data-next="false"', 'data-next="false" data-stage="password"').replace('name="identifier" type="text"', 'name="identifier" type="text" value="different-account"')],
    ["login-external-action", loginHtml.replace('id="login" action="/auth/session"', 'id="login" action="https://example.invalid/auth/session"')]
  ]) {
    await navigateWithMock(html.replace('data-test-case="login"', `data-test-case="${label}"`), label, "https://isct.ex-tic.com/auth/session");
    await delay(300);
    const result = await evaluate(page, "loginResult");
    assert.equal(result.usernameSubmits, 0, label);
    assert.equal(result.passwordSubmits, 0, label);
    assert.equal(await evaluate(page, 'document.querySelector("form#login #password").value'), "", label);
  }
  assert.ok((await evaluate(worker, 'handleMessage({type:"GET_LOGIN_VALUE",field:"password"},{id:chrome.runtime.id,url:"https://isct.ex-tic.com/auth/session/second_factor",tab:{id:1}})')).error);
  assert.ok((await evaluate(worker, 'handleMessage({type:"GET_LOGIN_VALUE",field:"password"},{id:chrome.runtime.id,url:"https://example.invalid/auth/session",tab:{id:1}})')).error);
  console.log("Login safeguards: manual input, errors, different accounts, other form origins, and credential requests from other pages do not proceed.");

  await navigateOptions();
  await optionsCall({ type: "LOCK_VAULT" });
  await navigateWithMock(loginHtml.replace('data-test-case="login"', 'data-test-case="login-locked"'), "login-locked", "https://isct.ex-tic.com/auth/session");
  await delay(300);
  assert.equal((await evaluate(page, "loginResult")).usernameSubmits, 0);
  await navigateOptions();
  assert.equal((await optionsCall({ type: "UNLOCK_VAULT", passphrase })).unlocked, true);
  page.flowHtml = fixtureHtml.replace('data-test-case="fixture"', 'data-test-case="login-flow-otp"');
  // The public site can choose FIDO2 by default after the username AJAX call.
  page.mockHtml = loginHtml.replace('data-next="false"', 'data-next="true" data-fido="true"');
  await page.send("Page.navigate", { url: "https://isct.ex-tic.com/auth/session" });
  await waitForUi('document.body?.dataset.testCase === "login-flow-otp"', "full login reaches OTP");
  await waitForSubmission();
  const fullLogin = await evaluate(page, 'JSON.parse(sessionStorage.getItem("TEST-login-result"))');
  assert.equal(fullLogin.usernameSubmits, 1);
  assert.equal(fullLogin.passwordSubmits, 1);
  assert.equal(fullLogin.methodSelections, 1);
  assert.equal((await evaluate(page, "fixtureResult")).submitCount, 1);
  page.flowHtml = null;
  console.log("Full flow: unlock → username → password → OTP, including the site's default FIDO2 tab selection.");
  assert.equal(await evaluate(worker, "networkCalls"), 0);
  console.log("TOTP privacy: no fetch requests; content script cannot access encrypted local storage or unlocked session storage.");

  // Old versions could select email mode; that stored preference must not disable TOTP.
  await evaluate(worker, 'chrome.storage.local.set({mode:"gmail",gmailConnected:true})');
  await navigateWithMock(fixtureHtml.replace('data-test-case="fixture"', 'data-test-case="old-preference"'), "old-preference");
  await waitForSubmission();
  const oldPreferenceResult = await evaluate(page, "fixtureResult");
  assert.equal(oldPreferenceResult.selected, "totp-form-selector");
  assert.equal(oldPreferenceResult.formId, "totp-form");
  assert.equal(oldPreferenceResult.sendCount, 0);
  assert.equal(oldPreferenceResult.submitCount, 1);
  assert.equal(await evaluate(worker, "networkCalls"), 0);
  assert.equal(chromeManifest.oauth2, undefined);
  assert.equal(chromeManifest.host_permissions, undefined);
  assert.deepEqual(chromeManifest.permissions, ["storage", "alarms"]);
  console.log("Setup-key only: obsolete email preference ignored, no email sent, no OAuth or mailbox permissions.");

  assert.ok((await evaluate(worker, 'chrome.storage.session.get("unlockedVault")')).unlockedVault);
  await stopChrome();
  chrome = startChrome();
  await connectChrome();
  assert.deepEqual((await evaluate(worker, 'chrome.storage.local.get("vault")')).vault, localRecord.vault);
  assert.equal((await evaluate(worker, 'chrome.storage.session.get("unlockedVault")')).unlockedVault, undefined);
  assert.deepEqual(await evaluate(worker, 'chrome.storage.local.get(["mode", "gmailConnected"])'), {});
  await navigateOptions();
  assert.equal((await optionsCall({ type: "VAULT_STATUS" })).unlocked, false);
  assert.equal((await optionsCall({ type: "UNLOCK_VAULT", passphrase })).unlocked, true);
  const deletion = await optionsCall({ type: "DELETE_KEY" });
  assert.equal(deletion.removed, true);
  const remaining = await evaluate(worker, 'chrome.storage.local.get(["vault","totp"])');
  assert.deepEqual(remaining, {});
  assert.equal((await evaluate(worker, 'chrome.storage.session.get("unlockedVault")')).unlockedVault, undefined);
  console.log("Browser restart: only encrypted key persists; unlock needs same passphrase, deletion clears encrypted and session keys.");

  await waitForUi('!document.getElementById("save").disabled', "new enrollment ready");
  await evaluate(page, `document.getElementById("secret").value=${JSON.stringify(secret)};document.getElementById("newPassphrase").value=${JSON.stringify(passphrase)};document.getElementById("confirmPassphrase").value="different passphrase";document.getElementById("save").click()`);
  await waitForUi('document.getElementById("status").textContent.includes("do not match")', "confirmation mismatch");
  assert.deepEqual(await evaluate(worker, 'chrome.storage.local.get("vault")'), {});
  await evaluate(page, `document.getElementById("confirmPassphrase").value=${JSON.stringify(passphrase)};document.getElementById("save").click()`);
  await waitForUi('document.getElementById("status").textContent.startsWith("Settings saved.") && !document.getElementById("save").disabled', "new setup key saved");
  assert.equal(await evaluate(page, 'document.getElementById("secret").value'), "");
  const changedPassphrase = "aBc456";
  await evaluate(page, `document.getElementById("newPassphrase").value=${JSON.stringify(changedPassphrase)};document.getElementById("confirmPassphrase").value=${JSON.stringify(changedPassphrase)};document.getElementById("save").click()`);
  await waitForUi('document.getElementById("newPassphrase").value === "" && document.getElementById("status").textContent.startsWith("Settings saved.") && !document.getElementById("save").disabled', "passphrase changed");
  assert.ok((await optionsCall({ type: "UNLOCK_VAULT", passphrase })).error);
  assert.equal((await optionsCall({ type: "REVEAL_KEY", passphrase: changedPassphrase })).secret, secret);
  for (const [language, filename] of [["en", "options.html"], ["ja", "options.ja.html"], ["zh-CN", "options.zh-CN.html"]]) {
    const url = await evaluate(worker, `chrome.runtime.getURL(${JSON.stringify(filename)})`);
    await page.send("Page.navigate", { url });
    await waitForUi('!!document.getElementById("secretState")?.textContent', `options language ${language}`);
    assert.equal(await evaluate(page, "document.documentElement.lang"), language);
    assert.equal(await evaluate(page, '!!document.getElementById("mode") || !!document.getElementById("connectGmail") || /gmail|oauth/i.test(document.body.textContent)'), false);
    assert.equal((await optionsCall({ type: "VAULT_STATUS" })).unlocked, true);
    assert.deepEqual(await evaluate(page, '[...document.querySelectorAll("nav a")].map(a=>a.getAttribute("href"))'), ["options.html", "options.ja.html", "options.zh-CN.html"]);
    await evaluate(page, 'document.getElementById("showCode").click()');
    await waitForUi('/^[0-9]{6}$/.test(document.getElementById("currentCode").textContent)', `localized code ${language}`);
    if (language === "ja") assert.match(await evaluate(page, 'document.getElementById("codeExpiry").textContent'), /[0-9]+秒/);
    if (language === "zh-CN") assert.match(await evaluate(page, 'document.getElementById("codeExpiry").textContent'), /秒后/);
    await evaluate(page, 'document.getElementById("showCode").click()');
  }
  for (const [language, filename] of [["en", "help.html"], ["ja", "help.ja.html"], ["zh-CN", "help.zh-CN.html"]]) {
    const url = await evaluate(worker, `chrome.runtime.getURL(${JSON.stringify(filename)})`);
    await page.send("Page.navigate", { url });
    await waitForUi('document.images.length === 3 && [...document.images].every(img=>img.complete && img.naturalWidth>0)', `guide images ${language}`);
    assert.equal(await evaluate(page, "document.documentElement.lang"), language);
    assert.deepEqual(await evaluate(page, '[...document.querySelectorAll("nav a")].map(a=>a.getAttribute("href"))'), ["help.html", "help.ja.html", "help.zh-CN.html"]);
    assert.match(await evaluate(page, "document.body.textContent"), /App Authentication/);
    assert.match(await evaluate(page, "document.body.textContent"), /Remove/);
    if (language === "ja") {
      const overflow = await evaluate(page, `(async () => {
        const overflow = [];
        for (const image of document.images) {
          const source = await fetch(image.src).then(response => response.text());
          const svg = new DOMParser().parseFromString(source, "image/svg+xml").documentElement;
          const holder = document.createElement("div");
          holder.style.cssText = "position:absolute;visibility:hidden;left:0;top:0";
          holder.append(svg);
          document.body.append(holder);
          await document.fonts.ready;
          const { width, height } = svg.viewBox.baseVal;
          for (const text of svg.querySelectorAll("text")) {
            const box = text.getBBox();
            if (box.x < 0 || box.y < 0 || box.x + box.width > width + 1 || box.y + box.height > height + 1) {
              overflow.push({ image: image.getAttribute("src"), text: text.textContent });
            }
          }
          holder.remove();
        }
        return overflow;
      })()`);
      assert.deepEqual(overflow, [], "Japanese illustration text must remain within the image");
      const { data } = await page.send("Page.captureScreenshot", { captureBeyondViewport: true });
      await writeFile(path.join(profile, "guide-ja.png"), Buffer.from(data, "base64"));
    }
  }
  console.log("Languages: all three settings pages are authorized and localized; guide pages load original illustrations and relative links.");
  await navigateOptions();
  assert.equal((await optionsCall({ type: "DELETE_KEY" })).removed, true);
  console.log("New enrollment and passphrase change: confirmation checked, plaintext input cleared, setup key preserved, old passphrase rejected.");
} finally {
  await stopChrome();
  console.log(`Temporary Chrome profile: ${profile}`);
}
