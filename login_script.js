(async function () {
  "use strict";
  if (location.origin !== "https://isct.ex-tic.com" || !/^\/auth\/session\/?$/.test(location.pathname)) return;

  const submitted = new Set();
  const visible = (element) => !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
  let stopped = false;
  let running = false;
  let inspectAgain = false;
  let selectedPassword = false;

  function stop() {
    stopped = true;
    observer.disconnect();
    clearTimeout(deadline);
    document.removeEventListener("input", onManualInput, true);
    document.removeEventListener("click", onManualMethod, true);
  }

  function onManualInput(event) {
    if (event.isTrusted && event.target.matches("form#login input[name='identifier'], form#login input[name='password']")) stop();
  }

  function onManualMethod(event) {
    if (event.isTrusted && event.target.closest("#fido2-form-selector, #password-form-selector, form#cancel")) stop();
  }

  function context() {
    const form = document.querySelector("form#login");
    if (!form) return null;
    const action = new URL(form.action, location.href);
    if (action.origin !== location.origin || action.pathname !== "/auth/session" || form.method.toLowerCase() !== "post") return null;
    if ([...form.querySelectorAll(".warning, .error")].some(visible)) return { failure: true };
    if (!visible(form)) return { hidden: true };
    const password = form.querySelector("input#password[name='password']");
    const wrapper = form.querySelector("#password-field-wrapper");
    // The live site hides the password off screen rather than with display:none.
    const passwordReady = visible(password) && !!wrapper && !wrapper.classList.contains("move-off-screen");
    const stage = passwordReady ? "password" : "username";
    const input = stage === "password" ? password : form.querySelector("input#identifier[name='identifier'][type='text']");
    const button = form.querySelector("button[type='submit'], input[type='submit']");
    if (!visible(input) || !visible(button)) return null;
    return { form, input, button, stage };
  }

  async function inspect() {
    if (stopped) return;
    if (running) { inspectAgain = true; return; }
    running = true;
    try {
      const current = context();
      if (!current) return;
      if (current.failure) return stop();
      if (current.hidden) {
        // The site may select its FIDO2 tab after the username step.
        const selector = document.getElementById("password-form-selector");
        if (submitted.has("username") && !selectedPassword && visible(selector) && visible(document.getElementById("fido2-form-wrapper"))) {
          selectedPassword = true;
          selector.click();
        }
        return;
      }
      const { form, input, button, stage } = current;
      if (submitted.has(stage)) return;
      if (input.disabled || input.readOnly || button.disabled) return;
      const reply = await chrome.runtime.sendMessage({ type: "GET_LOGIN_VALUE", field: stage });
      if (stopped) return;
      if (!reply?.value || reply.error) return stop();
      const latest = context();
      if (!latest || latest.failure || latest.hidden || latest.stage !== stage || latest.form !== form) return;
      if (latest.input.value && latest.input.value !== reply.value) return stop();
      if (latest.input.disabled || latest.input.readOnly || latest.button.disabled) return;
      if (stage === "password") {
        const identifier = form.querySelector("input#identifier[name='identifier']");
        if (identifier?.value.trim() !== reply.account) return stop();
      }
      if (input.value !== reply.value) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(input, reply.value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      submitted.add(stage);
      // Preserve identifier-first AJAX, normal form handling, and CSRF fields.
      button.click();
      if (stage === "password") stop();
    } catch {
      stop();
      console.warn("ISCT login: Automatic entry stopped. Check the extension settings and the site's message.");
    } finally {
      running = false;
      if (inspectAgain && !stopped) {
        inspectAgain = false;
        queueMicrotask(inspect);
      }
    }
  }

  const observer = new MutationObserver(inspect);
  const deadline = setTimeout(stop, 300000);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  document.addEventListener("input", onManualInput, true);
  document.addEventListener("click", onManualMethod, true);
  await inspect();
})();
