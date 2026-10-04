// Browser-level smoke test with a mock response at the real second-factor URL.
// Requires Google Chrome and Node 22. No account, Gmail access, or real OTP is used.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { generateTotp, parseTotpSecret } = require("../core.js");
const extensionDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
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
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = await evaluate(page, "({ code: document.body?.dataset.submitted || '', sent: document.body?.dataset.sent || '' })");
    if (result.code) return result;
    await delay(100);
  }
  throw new Error("The extension did not submit an OTP within five seconds.");
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

  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  await evaluate(worker, `chrome.storage.local.set({mode:"totp",totp:{secret:"${secret}",period:30,digits:6}})`);
  const totpHtml = `<!doctype html><html><body data-test-case="totp"><form id="otp"><input type="text" placeholder="ワンタイムパスワード"><button type="submit">➜ 次へ</button></form><script>document.querySelector("form").addEventListener("submit",event=>{event.preventDefault();document.body.dataset.submitted=document.querySelector("input").value})</script></body></html>`;
  await navigateWithMock(totpHtml, "totp");
  const totpResult = await waitForSubmission();
  const now = Date.now();
  const config = parseTotpSecret(secret);
  const possibleCodes = await Promise.all([generateTotp(config, now), generateTotp(config, now - 30000)]);
  assert.ok(possibleCodes.some((result) => result.code === totpResult.code));
  assert.equal(totpResult.sent, "");
  console.log("TOTP: code filled and Next submitted.");

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
  const gmailHtml = `<!doctype html><html><body data-test-case="gmail"><form id="otp"><button type="button" id="send">ワンタイムパスワードを送信</button><input type="text" placeholder="ワンタイムパスワード"><button type="submit">➜ 次へ</button></form><script>document.querySelector("#send").addEventListener("click",()=>document.body.dataset.sent="yes");document.querySelector("form").addEventListener("submit",event=>{event.preventDefault();document.body.dataset.submitted=document.querySelector("input").value})</script></body></html>`;
  await navigateWithMock(gmailHtml, "gmail");
  const gmailResult = await waitForSubmission();
  assert.equal(gmailResult.code, emailCode);
  assert.equal(gmailResult.sent, "yes");
  console.log("Gmail mock: send clicked, new code parsed, and Next submitted.");
} finally {
  worker?.close();
  page?.close();
  chrome.kill("SIGTERM");
  console.log(`Temporary Chrome profile: ${profile}`);
}
