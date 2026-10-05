(async function () {
  "use strict";
  if (location.origin !== "https://isct.ex-tic.com" || !/^\/auth\/session\/second_factor(?:\/|$)/.test(location.pathname)) return;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = (element) => !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
  function getOtpForm() {
    const form = document.getElementById("totp-form");
    const input = form?.querySelector("input#totp[name='totp']");
    if (!visible(input)) return null;
    const action = new URL(form.action, location.href);
    if (action.origin !== location.origin || action.pathname !== "/auth/session/second_factor" || form.method.toLowerCase() !== "post") return null;
    return { form, input };
  }

  function clickWithoutDefaultSubmit(button) {
    // The site's click handler selects the OTP app wrapper.
    button.addEventListener("click", (event) => event.preventDefault(), { once: true });
    button.click();
  }

  async function waitForOtpForm() {
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
        const context = getOtpForm();
        if (context) return finish(context);
        if (visible(document.getElementById("emailotp-form-wrapper")) || visible(document.getElementById("fido2-form-wrapper"))) {
          console.warn("ISCT OTP: Another authentication method is already selected. Automatic entry stopped.");
          return finish(null);
        }
        const selector = document.getElementById("totp-form-selector");
        if (selectionAttempts < 3 && visible(selector) && !selector.disabled && !selectionTimer) {
          selectionAttempts++;
          clickWithoutDefaultSubmit(selector);
          const selected = getOtpForm();
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

  function hasFailure(context) {
    return visible(context.form.querySelector(".message.warning"));
  }

  function fillAndSubmit(code) {
    const context = getOtpForm();
    if (!context || hasFailure(context)) return false;
    const { form, input } = context;
    if (input.disabled || input.readOnly || input.value.trim()) return false;
    const next = form.querySelector("button[type='submit']");
    if (!visible(next) || next.disabled) return false;
    if (!/^[0-9]{6}$/.test(code)) return false;
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
  if (!status?.ready) return;
  const context = await waitForOtpForm();
  if (!context || context.input.value.trim() || hasFailure(context)) return;

  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const current = getOtpForm();
    if (!current || current.input.disabled || current.input.readOnly || current.input.value.trim()) return;
    if (hasFailure(current)) {
      console.warn("ISCT OTP: The site reported a verification error. Automatic attempts stopped.");
      return;
    }
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_CODE" });
      if (response?.error) {
        console.warn(`ISCT OTP: ${response.error}`);
        return;
      }
      if (response?.code) {
        fillAndSubmit(response.code);
        return;
      }
    } catch (error) {
      console.warn("ISCT OTP: Could not retrieve the code.", error);
      return;
    }
    await sleep(1000);
  }
  console.warn("ISCT OTP: Timed out waiting for a new code.");
})();
