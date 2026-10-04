(async function () {
  "use strict";
  if (location.origin !== "https://isct.ex-tic.com" || !/^\/auth\/session\/second_factor(?:\/|$)/.test(location.pathname)) return;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = (element) => !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
  const methods = {
    totp: { selector: "totp-form-selector", form: "totp-form", field: "totp" },
    gmail: { selector: "emailotp-form-selector", form: "emailotp-form", field: "emailotp" }
  };

  function getOtpForm(mode) {
    const method = methods[mode];
    const form = document.getElementById(method.form);
    const input = form?.querySelector(`input#${method.field}[name='${method.field}']`);
    if (!visible(input)) return null;
    const action = new URL(form.action, location.href);
    if (action.origin !== location.origin || action.pathname !== "/auth/session/second_factor" || form.method.toLowerCase() !== "post") return null;
    return { form, input };
  }

  function clickWithoutDefaultSubmit(button) {
    // The site's click handler selects a wrapper or sends email through AJAX.
    button.addEventListener("click", (event) => event.preventDefault(), { once: true });
    button.click();
  }

  async function waitForOtpForm(mode) {
    return new Promise((resolve) => {
      let selectionAttempts = 0;
      let selectionTimer;
      const finish = (result) => {
        observer.disconnect();
        clearTimeout(timeout);
        clearTimeout(selectionTimer);
        resolve(result);
      };
      const inspect = () => {
        const context = getOtpForm(mode);
        if (context) return finish(context);
        const otherMode = mode === "totp" ? "gmail" : "totp";
        if (getOtpForm(otherMode) || visible(document.getElementById("fido2-form-wrapper"))) {
          console.warn("ISCT OTP: The selected site method does not match the extension settings.");
          return finish(null);
        }
        const selector = document.getElementById(methods[mode].selector);
        if (selectionAttempts < 3 && visible(selector) && !selector.disabled && !selectionTimer) {
          selectionAttempts++;
          clickWithoutDefaultSubmit(selector);
          const selected = getOtpForm(mode);
          if (selected) return finish(selected);
          // Allow the site's document-ready handlers to finish binding.
          selectionTimer = setTimeout(() => { selectionTimer = null; inspect(); }, 250);
        }
      };
      const observer = new MutationObserver(inspect);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      const timeout = setTimeout(() => finish(null), 300000);
      inspect();
    });
  }

  function hasFailure(mode, context) {
    const warning = context.form.querySelector(".message.warning");
    if (visible(warning)) return true;
    return mode === "gmail" && [...document.querySelectorAll("#send-otp-form .warning, #send-otp-form .error")].some(visible);
  }

  function fillAndSubmit(mode, code) {
    const context = getOtpForm(mode);
    if (!context || hasFailure(mode, context)) return false;
    const { form, input } = context;
    if (input.disabled || input.readOnly || input.value.trim()) return false;
    const next = form.querySelector("button[type='submit']");
    if (!visible(next) || next.disabled) return false;
    if (!(mode === "totp" ? /^[0-9]{6}$/ : /^[0-9]{4,8}$/).test(code)) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, code);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    // A normal click preserves the site's Rails UJS submit handlers and CSRF field.
    next.click();
    return true;
  }

  let status;
  try {
    status = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
  } catch (error) {
    console.warn("ISCT OTP: Extension is unavailable.", error);
    return;
  }
  if (!status?.ready || !methods[status.mode]) return;
  const context = await waitForOtpForm(status.mode);
  if (!context || context.input.value.trim() || hasFailure(status.mode, context)) return;

  const since = Date.now();
  let sendForm;
  if (status.mode === "gmail") {
    sendForm = document.getElementById("send-otp-form");
    const sendButton = sendForm?.querySelector("button[type='submit']");
    if (!visible(sendButton)) return;
    const sendAction = new URL(sendForm.action, location.href);
    if (sendAction.origin !== location.origin || sendAction.pathname !== "/auth/session/emailotp" || sendForm.method.toLowerCase() !== "post") return;
    if (!sendButton.disabled && !visible(sendForm.querySelector(".message.normal"))) {
      clickWithoutDefaultSubmit(sendButton);
    }
  }

  const interval = status.mode === "gmail" ? 3000 : 1000;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const current = getOtpForm(status.mode);
    if (!current || current.input.disabled || current.input.readOnly || current.input.value.trim()) return;
    if (hasFailure(status.mode, current)) {
      console.warn("ISCT OTP: The site reported a verification or email error. Automatic attempts stopped.");
      return;
    }
    if (sendForm && !visible(sendForm.querySelector(".message.normal"))) {
      await sleep(500);
      continue;
    }
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_CODE", since });
      if (response?.error) {
        console.warn(`ISCT OTP: ${response.error}`);
        return;
      }
      if (response?.code) {
        fillAndSubmit(status.mode, response.code);
        return;
      }
    } catch (error) {
      console.warn("ISCT OTP: Could not retrieve the code.", error);
      return;
    }
    await sleep(interval);
  }
  console.warn("ISCT OTP: Timed out waiting for a new code.");
})();
