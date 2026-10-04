(async function () {
  "use strict";
  if (location.origin !== "https://isct.ex-tic.com" || !/^\/auth\/session\/second_factor(?:\/|$)/.test(location.pathname)) return;

  const SEND_LABEL = /(?:ワンタイムパスワードを送信|send one[- ]time password)/i;
  const NEXT_LABEL = /(?:次へ|next|続行|continue)/i;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const labelOf = (element) => (element.tagName === "INPUT" ? element.value : element.textContent).trim();
  const visible = (element) => !!(element.getClientRects().length && !element.disabled);

  function findButton(pattern) {
    return [...document.querySelectorAll("button, input[type='submit'], input[type='button']")]
      .find((element) => visible(element) && pattern.test(labelOf(element)));
  }

  function findOtpField() {
    const candidates = [...document.querySelectorAll("input")]
      .filter((input) => visible(input) && ["text", "password", "tel", "number"].includes(input.type));
    if (!candidates.length) return null;
    const named = candidates.find((input) =>
      input.autocomplete === "one-time-code" ||
      /(?:one[-_ ]time|otp|ワンタイム|verification[-_ ]?code)/i.test(
        [input.name, input.id, input.placeholder, input.getAttribute("aria-label")].join(" ")
      )
    );
    return named || (candidates.length === 1 ? candidates[0] : null);
  }

  function fillAndSubmit(code) {
    const input = findOtpField();
    if (!input || input.value.trim()) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, code);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    const form = input.form;
    const next = findButton(NEXT_LABEL) || (form && [...form.querySelectorAll("button[type='submit'], input[type='submit']")]
      .find((button) => visible(button) && !SEND_LABEL.test(labelOf(button))));
    if (next) {
      next.click();
      return true;
    }
    if (form && !findButton(SEND_LABEL)) {
      form.requestSubmit();
      return true;
    }
    console.warn("ISCT OTP: Code filled, but the Next button was not found.");
    return true;
  }

  const field = findOtpField() || await new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const current = findOtpField();
      if (current) {
        observer.disconnect();
        clearTimeout(timeout);
        resolve(current);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    const timeout = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, 300000);
  });
  if (!field) return;

  let status;
  try {
    status = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
  } catch (error) {
    console.warn("ISCT OTP: Extension is unavailable.", error);
    return;
  }
  if (!status?.ready) return;

  const sendButton = findButton(SEND_LABEL);
  if (status.mode === "gmail" && !sendButton) {
    console.warn("ISCT OTP: Select email authentication on the site.");
    return;
  }
  if (status.mode === "totp" && sendButton) {
    console.warn("ISCT OTP: Select app authentication on the site.");
    return;
  }

  let since = Date.now();
  if (status.mode === "gmail") {
    const previousSend = Number(sessionStorage.getItem("isctOtpEmailSentAt"));
    if (Number.isFinite(previousSend) && Date.now() - previousSend < 120000) {
      since = previousSend;
    } else {
      sessionStorage.setItem("isctOtpEmailSentAt", String(since));
      sendButton.click();
    }
  }

  const interval = status.mode === "gmail" ? 3000 : 1000;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const currentField = findOtpField();
    if (!currentField || currentField.value.trim()) return;
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_CODE", since });
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
    await sleep(interval);
  }
  console.warn("ISCT OTP: Timed out waiting for a new code.");
})();
