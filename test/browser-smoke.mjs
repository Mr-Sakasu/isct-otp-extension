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

let contexts = [];
async function attachPage() {
  contexts = [];
  page.on("Runtime.executionContextCreated", ({ context }) => contexts.push(context));
  page.on("Runtime.executionContextsCleared", () => { contexts = []; });
  await page.send("Runtime.enable");
  page.on("Fetch.requestPaused", (event) => {
    const responseHtml = page.flowHtml && new URL(event.request.url).pathname === "/auth/session/second_factor" ? page.flowHtml : page.mockHtml;
    page.send("Fetch.fulfillRequest", {
      requestId: event.requestId, responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "text/html; charset=utf-8" }],
      body: Buffer.from(responseHtml).toString("base64")
    }).catch((error) => { throw error; });
  });
  await page.send("Fetch.enable", { patterns: [
    { urlPattern: "https://isct.ex-tic.com/auth/session/second_factor*", requestStage: "Request" },
    { urlPattern: "https://isct.ex-tic.com/auth/session", requestStage: "Request" }
  ] });
}

try {
  await connectChrome();
  await attachPage();
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const config = parseTotpSecret(secret);
  const username = "test-science-tokyo-id";
  const universityPassword = "test-only university password";
  const passphrase = "test-only old encryption passphrase";
  await evaluate(worker, 'globalThis.networkCalls=0;globalThis.fetch=async()=>{networkCalls++;throw new Error("Unexpected extension network request")};');

  await navigateWithMock(fixtureHtml.replace('data-test-case="fixture"', 'data-test-case="unconfigured"'), "unconfigured");
  await delay(300);
  assert.equal((await evaluate(page, "fixtureResult")).selectionCount, 0);
  assert.equal((await evaluate(page, "fixtureResult")).submitCount, 0);
  await navigateOptions();
  assert.deepEqual(await evaluate(page, '[...document.querySelectorAll("input")].filter(el=>el.getClientRects().length>0).map(el=>el.id)'), ["secret", "username", "universityPassword"]);
  assert.equal(await evaluate(page, '!!document.getElementById("unlock") || !!document.getElementById("newPassphrase")'), false);
  await evaluate(page, 'document.getElementById("save").click()');
  await waitForUi('document.getElementById("status").textContent === "Enter your setup key."', "require setup key");
  await evaluate(page, `document.getElementById("secret").value=${JSON.stringify(secret)};document.getElementById("save").click()`);
  await waitForUi('document.getElementById("status").textContent.startsWith("Saved.") && !document.getElementById("save").disabled', "save with no encryption passphrase");
  await waitForUi('/^[0-9]{6}$/.test(document.getElementById("currentCode").textContent)', "code appears automatically");
  const documentCode = await evaluate(page, 'document.getElementById("currentCode").textContent');
  const possible = await Promise.all([generateTotp(config), generateTotp(config, Date.now()-30000)]);
  assert.ok(possible.some(result=>result.code===documentCode), "code matches TOTP");
  assert.equal(await evaluate(page, 'document.getElementById("secret").value'), "");
  await evaluate(page, 'document.getElementById("savedData").open=true;document.getElementById("showKey").click()');
  await waitForUi('!document.getElementById("revealedKey").hidden', "show key without a passphrase");
  assert.equal(await evaluate(page, 'document.getElementById("revealedKey").value'), secret);
  await evaluate(page, 'document.getElementById("showKey").click()');
  await waitForUi('document.getElementById("revealedKey").hidden', "hide key");
  console.log("Simple setup: three fields, Save once, current code visible, no unlock or new passphrase.");

  // A saved key must stay active even when the worker's clock moves beyond 30 minutes.
  await evaluate(worker, 'globalThis.originalNow=Date.now;Date.now=()=>originalNow()+60*60*1000');
  const later = await evaluate(worker, 'handleMessage({type:"GET_STATUS"},{id:chrome.runtime.id,url:"https://isct.ex-tic.com/auth/session/second_factor",tab:{id:1}})');
  assert.equal(later.ready, true);
  await evaluate(worker, 'Date.now=originalNow');

  // Existing passphrase-protected records need a single successful import.
  const legacyVault = await evaluate(worker, `ISCTVault.encryptVault({...${JSON.stringify(config)},username:${JSON.stringify(username)},password:${JSON.stringify(universityPassword)}},${JSON.stringify(passphrase)})`);
  await evaluate(worker, `chrome.storage.local.set({vault:${JSON.stringify(legacyVault)}}).then(()=>chrome.storage.local.remove(["automaticSettings","deviceKey"]))`);
  await navigateWithMock(fixtureHtml.replace('data-test-case="fixture"', 'data-test-case="legacy"'), "legacy");
  await delay(300);
  assert.equal((await evaluate(page, "fixtureResult")).submitCount, 0);
  await navigateOptions();
  assert.equal(await evaluate(page, 'document.getElementById("migration").hidden'), false);
  await evaluate(page, 'document.getElementById("legacyPassphrase").value="incorrect old passphrase";document.getElementById("migrate").click()');
  await waitForUi('document.getElementById("status").textContent.startsWith("Incorrect passphrase")', "wrong import passphrase");
  assert.deepEqual((await evaluate(worker, 'chrome.storage.local.get("vault")')).vault, legacyVault);
  assert.equal((await optionsCall({ type: "GET_SETTINGS" })).ready, false);
  await evaluate(page, `document.getElementById("legacyPassphrase").value=${JSON.stringify(passphrase)};document.getElementById("migrate").click()`);
  await waitForUi('document.getElementById("status").textContent.startsWith("Imported.") && document.getElementById("migration").hidden', "one-time import");
  assert.equal(await evaluate(page, 'document.getElementById("legacyPassphrase").value'), "");
  const localRecord = await evaluate(worker, "chrome.storage.local.get(null)");
  assert.ok(localRecord.automaticSettings);
  assert.equal(localRecord.deviceKey.length, 32);
  assert.equal(localRecord.vault, undefined);
  for (const value of [secret, username, universityPassword, passphrase]) assert.ok(!JSON.stringify(localRecord).includes(value));
  assert.equal((await evaluate(worker, 'chrome.storage.session.get("unlockedVault")')).unlockedVault, undefined);
  await evaluate(page, 'document.getElementById("save").click()');
  await waitForUi('document.getElementById("status").textContent.startsWith("Saved.") && !document.getElementById("save").disabled', "blank fields keep saved data");
  assert.equal((await optionsCall({ type: "REVEAL_KEY" })).secret, secret);
  for (const type of ["GET_SETTINGS", "REVEAL_KEY", "GET_LOCAL_CODE", "MIGRATE_LEGACY", "DELETE_KEY", "SAVE_SETTINGS"]) {
    const denied = await evaluate(worker, `handleMessage({type:${JSON.stringify(type)}},{id:chrome.runtime.id,url:"https://isct.ex-tic.com/auth/session/second_factor",tab:{id:1}})`);
    assert.ok(denied.error);
  }
  console.log("Migration: wrong passphrase preserves the old record; successful import keeps all login details and removes the old vault.");

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
  const revealDenied = await evaluate(page, 'chrome.runtime.sendMessage({type:"REVEAL_KEY",})', contentContext.id);
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


  assert.equal(await evaluate(worker, "networkCalls"), 0);
  assert.deepEqual(chromeManifest.permissions, ["storage"]);
  assert.equal(chromeManifest.oauth2, undefined);
  assert.equal(chromeManifest.host_permissions, undefined);
  await evaluate(worker, 'chrome.storage.local.set({mode:"gmail",gmailConnected:true})');
  await stopChrome();
  chrome = startChrome();
  await connectChrome();
  await attachPage();
  assert.deepEqual(await evaluate(worker, 'chrome.storage.local.get(["mode","gmailConnected"])'), {});
  page.flowHtml = fixtureHtml.replace('data-test-case="fixture"', 'data-test-case="restart-flow-otp"');
  page.mockHtml = loginHtml.replace('data-next="false"', 'data-next="true" data-fido="true"');
  await page.send("Page.navigate", { url: "https://isct.ex-tic.com/auth/session" });
  await waitForUi('document.body?.dataset.testCase === "restart-flow-otp"', "full flow after restart without opening settings");
  await waitForSubmission();
  const restartedLogin = await evaluate(page, 'JSON.parse(sessionStorage.getItem("TEST-login-result"))');
  assert.equal(restartedLogin.username, username);
  assert.equal(restartedLogin.password, universityPassword);
  assert.equal(restartedLogin.usernameSubmits, 1);
  assert.equal(restartedLogin.passwordSubmits, 1);
  assert.equal(restartedLogin.methodSelections, 1);
  assert.equal((await evaluate(page, "fixtureResult")).submitCount, 1);
  page.flowHtml = null;
  console.log("Chrome restart: username → password → OTP completes automatically, without opening settings or unlocking.");

  for (const [language, filename] of [["en", "options.html"], ["ja", "options.ja.html"], ["zh-CN", "options.zh-CN.html"]]) {
    const url = await evaluate(worker, `chrome.runtime.getURL(${JSON.stringify(filename)})`);
    await page.send("Page.navigate", { url });
    await waitForUi('!!document.getElementById("secretState")?.textContent', `options ${language}`);
    assert.equal(await evaluate(page, "document.documentElement.lang"), language);
    assert.equal(await evaluate(page, '!!document.getElementById("unlock") || !!document.getElementById("newPassphrase") || !!document.getElementById("mode") || !!document.getElementById("connectGmail")'), false);
    assert.equal(await evaluate(page, 'document.getElementById("migration").hidden'), true);
    assert.equal((await optionsCall({ type: "GET_SETTINGS" })).ready, true);
    assert.deepEqual(await evaluate(page, '[...document.querySelectorAll("nav a")].map(a=>a.getAttribute("href"))'), ["options.html", "options.ja.html", "options.zh-CN.html"]);
    await waitForUi('/^[0-9]{6}$/.test(document.getElementById("currentCode").textContent)', `current code ${language}`);
    if (language === "ja") assert.match(await evaluate(page, 'document.getElementById("codeExpiry").textContent'), /[0-9]+秒/);
    if (language === "zh-CN") assert.match(await evaluate(page, 'document.getElementById("codeExpiry").textContent'), /秒/);
    if (language === "ja") {
      const { data } = await page.send("Page.captureScreenshot", { captureBeyondViewport: true });
      await writeFile(path.join(profile, "options-ja.png"), Buffer.from(data, "base64"));
    }
  }
  for (const [language, filename] of [["en", "help.html"], ["ja", "help.ja.html"], ["zh-CN", "help.zh-CN.html"]]) {
    const url = await evaluate(worker, `chrome.runtime.getURL(${JSON.stringify(filename)})`);
    await page.send("Page.navigate", { url });
    await waitForUi('document.images.length === 3 && [...document.images].every(img=>img.complete && img.naturalWidth>0)', `guide images ${language}`);
    assert.equal(await evaluate(page, "document.documentElement.lang"), language);
    assert.deepEqual(await evaluate(page, '[...document.querySelectorAll("nav a")].map(a=>a.getAttribute("href"))'), ["help.html", "help.ja.html", "help.zh-CN.html"]);
    assert.match(await evaluate(page, "document.body.textContent"), /App Authentication/);
    assert.match(await evaluate(page, "document.body.textContent"), /Remove/);
    {
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
            if (!getComputedStyle(text).fontFamily.startsWith('Meiryo')) {
              overflow.push({ image: image.getAttribute("src"), font: getComputedStyle(text).fontFamily });
            }
            const box = text.getBBox();
            if (box.x < 0 || box.y < 0 || box.x + box.width > width + 1 || box.y + box.height > height + 1) {
              overflow.push({ image: image.getAttribute("src"), text: text.textContent });
            }
          }
          holder.remove();
        }
        return overflow;
      })()`);
      assert.deepEqual(overflow, [], `${language} illustrations must use Meiryo and keep text within the image`);
    }
    if (language === "ja") {
      const { data } = await page.send("Page.captureScreenshot", { captureBeyondViewport: true });
      await writeFile(path.join(profile, "guide-ja.png"), Buffer.from(data, "base64"));
    }
  }

  await navigateOptions();
  assert.equal((await optionsCall({ type: "DELETE_KEY" })).removed, true);
  assert.deepEqual(await evaluate(worker, 'chrome.storage.local.get(["automaticSettings","deviceKey","vault","totp"])'), {});
  await navigateWithMock(fixtureHtml.replace('data-test-case="fixture"', 'data-test-case="deleted"'), "deleted");
  await delay(300);
  assert.equal((await evaluate(page, "fixtureResult")).selectionCount, 0);
  assert.equal((await evaluate(page, "fixtureResult")).submitCount, 0);

  // Recover malformed storage by entering a new key; Delete also works on damaged data.
  await navigateOptions();
  await optionsCall({ type: "SAVE_SETTINGS", secret });
  await evaluate(worker, 'chrome.storage.local.set({deviceKey:[1]})');
  assert.equal((await optionsCall({ type: "GET_SETTINGS" })).ready, false);
  assert.equal((await optionsCall({ type: "SAVE_SETTINGS", secret })).saved, true);
  assert.equal((await optionsCall({ type: "REVEAL_KEY" })).secret, secret);
  await evaluate(worker, 'chrome.storage.local.set({deviceKey:[1]})');
  assert.equal((await optionsCall({ type: "DELETE_KEY" })).removed, true);

  // Version 0.2 plaintext settings migrate on startup without asking for a password.
  await evaluate(worker, `chrome.storage.local.set({totp:${JSON.stringify(config)}})`);
  await stopChrome();
  chrome = startChrome();
  await connectChrome();
  await attachPage();
  await navigateWithMock(fixtureHtml.replace('data-test-case="fixture"', 'data-test-case="plaintext-upgrade"'), "plaintext-upgrade");
  await waitForSubmission();
  assert.equal((await evaluate(worker, 'chrome.storage.local.get("totp")')).totp, undefined);
  assert.ok((await evaluate(worker, 'chrome.storage.local.get("automaticSettings")')).automaticSettings);
  console.log("Simple settings, all three languages, illustrations, deletion, damaged-data recovery, and plaintext upgrades passed.");
} finally {
  await stopChrome();
  console.log(`Temporary Chrome profile: ${profile}`);
}
