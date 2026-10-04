// Browser-level smoke test with a mock response at the real second-factor URL.
// Requires Chromium/Chrome for Testing and Node 22. No account or real OTP is used.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { generateTotp, parseTotpSecret } = require("../core.js");
const extensionDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixtureHtml = await readFile(new URL("./fixtures/second-factor.html", import.meta.url), "utf8");
const profile = await mkdtemp(path.join(os.tmpdir(), "isct-otp-browser-"));
const port = 20000 + Math.floor(Math.random() * 20000);
const chrome = spawn(process.env.CHROME_BIN || "chromium", [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run",
  `--remote-debugging-port=${port}`,
  `--disable-extensions-except=${extensionDirectory}`,
  `--load-extension=${extensionDirectory}`,
  `--user-data-dir=${profile}`,
  "about:blank"
], { stdio: "ignore" });

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

async function evaluate(connection, expression) {
  const response = await connection.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}

async function waitForSubmission() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await evaluate(page, "({ code: document.body?.dataset.submitted || '', sent: document.body?.dataset.sent || '' })");
    if (result.code) return result;
    await delay(100);
  }
  throw new Error("The extension did not submit an OTP within ten seconds.");
}

async function navigateWithMock(html, marker) {
  page.mockHtml = html;
  await page.send("Page.navigate", { url: "https://isct.ex-tic.com/auth/session/second_factor" });
  for (let attempt = 0; attempt < 50; attempt++) {
    const loaded = await evaluate(page, "document.body?.dataset.testCase || ''");
    if (loaded === marker) return;
    await delay(100);
  }
  throw new Error(`Mock ${marker} page did not load.`);
}

try {
  let list;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      list = await targets();
      for (const target of list.filter((item) => item.type === "service_worker" && item.url.endsWith("/service_worker.js"))) {
        const candidate = new CDP(target.webSocketDebuggerUrl);
        await candidate.ready;
        const name = await evaluate(candidate, "chrome.runtime?.getManifest?.().name");
        if (name === "Science Tokyo OTP Autofill") {
          worker = candidate;
          break;
        }
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
  page.on("Fetch.requestPaused", (event) => {
    page.send("Fetch.fulfillRequest", {
      requestId: event.requestId,
      responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "text/html; charset=utf-8" }],
      body: Buffer.from(page.mockHtml).toString("base64")
    }).catch((error) => { throw error; });
  });
  await page.send("Fetch.enable", {
    patterns: [{ urlPattern: "https://isct.ex-tic.com/auth/session/second_factor*", requestStage: "Request" }]
  });

  await evaluate(worker, 'chrome.storage.local.set({mode:"totp"})');
  await evaluate(worker, 'chrome.storage.local.remove("totp")');
  await navigateWithMock(fixtureHtml.replace('data-test-case="fixture"', 'data-test-case="unconfigured"'), "unconfigured");
  await delay(500);
  const unconfigured = await evaluate(page, "fixtureResult");
  assert.equal(unconfigured.selectionCount, 0);
  assert.equal(unconfigured.submitCount, 0);
  assert.equal(unconfigured.sendCount, 0);
  console.log("Unconfigured: no method selected and no authentication attempted.");

  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  await evaluate(worker, `chrome.storage.local.set({mode:"totp",totp:{secret:"${secret}",period:30,digits:6}})`);
  const totpHtml = fixtureHtml.replace('data-test-case="fixture"', 'data-test-case="totp"');
  await navigateWithMock(totpHtml, "totp");
  const totpResult = await waitForSubmission();
  const now = Date.now();
  const config = parseTotpSecret(secret);
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

  const emailCode = "44059";
  const emailBody = Buffer.from(`ワンタイムパスワード：${emailCode}`).toString("base64url");
  const mockMessage = {
    id: "mock-email-1",
    internalDate: String(Date.now()),
    payload: {
      headers: [
        { name: "From", value: "Extic <noreply@ex-tic.com>" },
        { name: "Subject", value: "Extic ログイン用ワンタイムパスワード" }
      ],
      mimeType: "text/plain",
      body: { data: emailBody }
    }
  };
  await evaluate(worker, `chrome.storage.local.set({mode:"gmail",gmailConnected:true})`);
  await evaluate(worker, `getToken=async()=>"mock-token";gmailConfigured=()=>true;gmailJson=async(url)=>url.includes("format=full")?${JSON.stringify(mockMessage)}:{messages:[{id:"mock-email-1"}]}`);
  const gmailHtml = fixtureHtml.replace('data-test-case="fixture"', 'data-test-case="gmail"');
  await navigateWithMock(gmailHtml, "gmail");
  const gmailResult = await waitForSubmission();
  assert.equal(gmailResult.code, emailCode);
  assert.equal(gmailResult.sent, "yes");
  const emailFormResult = await evaluate(page, "fixtureResult");
  assert.equal(emailFormResult.selected, "emailotp-form-selector");
  assert.equal(emailFormResult.selectionCount, 1);
  assert.equal(emailFormResult.formId, "emailotp-form");
  assert.equal(emailFormResult.fields.emailotp, emailCode);
  assert.equal(emailFormResult.fields.authenticity_token, "TEST-CSRF-TOKEN");
  assert.equal(emailFormResult.sendCount, 1);
  assert.equal(emailFormResult.submitCount, 1);
  assert.equal(emailFormResult.otherSubmits, 0);
  console.log("Gmail mock: email method selected, send clicked, correct form submitted once.");
} finally {
  worker?.close();
  page?.close();
  chrome.kill("SIGTERM");
  console.log(`Temporary Chrome profile: ${profile}`);
}
