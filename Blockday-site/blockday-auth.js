(function () {
  "use strict";
  const clientId = String(window.BLOCKDAY_GOOGLE_CLIENT_ID || "").trim();
  const credentialKey = "blockday-auth-credential";
  const userKey = "blockday-auth-user";
  const sessionKey = "blockday-auth-session";
  const defaultApiUrl = "https://script.google.com/macros/s/AKfycbxmTmXP1bCWqA25yklg_PESnTh9wQXMqaslyPslwfNtPluRmHaPvrQsIFFeneFcMUoy/exec";

  function decodeCredential(credential) {
    const payload = credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(atob(payload).split("").map(char => "%" + ("00" + char.charCodeAt(0).toString(16)).slice(-2)).join("")));
  }
  function currentUser() {
    try {
      const user = JSON.parse(localStorage.getItem(userKey) || "null");
      if (user?.sub) return user;
    } catch (_) {}
    localStorage.removeItem(credentialKey);
    localStorage.removeItem(userKey);
    return null;
  }
  function loginScreen(configured) {
    if (document.getElementById("blockday-login")) return;
    const screen = document.createElement("main");
    screen.id = "blockday-login";
    screen.className = "login-screen";
    screen.innerHTML = '<section class="login-card"><div class="login-logo"><img src="/favicon.svg" alt="Blockday"></div><span class="eyebrow">Your time, privately held</span><h1>Welcome to Blockday.</h1><p>Plan locally, keep working offline, and back up to your own Google Sheet when you reconnect.</p><div id="blockday-google-button"></div><p class="login-note"></p></section>';
    document.body.appendChild(screen);
    if (!configured) {
      screen.querySelector(".login-note").textContent = "Google login is ready for configuration. Add the OAuth Web Client ID to auth-config.js to activate it.";
      screen.querySelector("#blockday-google-button").innerHTML = '<button class="button" type="button" data-continue-local>Continue on this device</button>';
      screen.querySelector("[data-continue-local]").addEventListener("click", () => {
        localStorage.setItem("blockday-welcome-complete", "true");
        screen.remove();
        if (location.pathname === "/login") history.replaceState(null, "", "/");
      });
    }
  }
  async function handleCredential(response) {
    try {
      const user = decodeCredential(response.credential);
      if (user.aud !== clientId || !user.sub) throw new Error("The Google account response was not issued for Blockday.");
      const apiUrl = localStorage.getItem("blockday-sync-url") || defaultApiUrl;
      const authResponse = await fetch(apiUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "authenticate", credential: response.credential }), redirect: "follow" });
      const result = await authResponse.json();
      if (!result.ok || !result.session) throw new Error(result.error || "Blockday could not create a secure session.");
      localStorage.setItem(credentialKey, response.credential);
      localStorage.setItem(userKey, JSON.stringify(user));
      localStorage.setItem(sessionKey, result.session);
      localStorage.setItem("blockday-welcome-complete", "true");
      location.replace("/");
    } catch (error) {
      const note = document.querySelector(".login-note");
      if (note) note.textContent = error.message;
    }
  }
  function renderGoogleButton() {
    if (!window.google?.accounts?.id) return setTimeout(renderGoogleButton, 100);
    google.accounts.id.initialize({ client_id: clientId, callback: handleCredential, auto_select: false });
    google.accounts.id.renderButton(document.getElementById("blockday-google-button"), { theme: "outline", size: "large", shape: "pill", text: "continue_with", width: 280 });
  }
  function mountAccount(user) {
    if (!user || document.getElementById("blockday-account")) return;
    const actions = document.querySelector(".top-actions");
    if (!actions) return;
    const button = document.createElement("button");
    button.id = "blockday-account";
    button.className = "account-button";
    button.title = user.email || "Google account";
    button.innerHTML = user.picture ? '<img alt="" src="' + user.picture.replace(/"/g, "") + '">' : (user.name || "U").slice(0, 1);
    button.addEventListener("click", () => {
      if (!confirm("Sign out of Blockday on this device? Your local data will remain here.")) return;
      google?.accounts?.id?.disableAutoSelect();
      localStorage.removeItem(credentialKey);
      localStorage.removeItem(userKey);
      localStorage.removeItem(sessionKey);
      localStorage.removeItem("blockday-welcome-complete");
      location.reload();
    });
    actions.prepend(button);
  }
  const user = currentUser();
  const firstVisit = localStorage.getItem("blockday-welcome-complete") !== "true";
  if (location.pathname === "/login" || firstVisit || (clientId && !user)) {
    loginScreen(Boolean(clientId));
    if (clientId) renderGoogleButton();
  }
  if (user) {
    new MutationObserver(() => mountAccount(user)).observe(document.documentElement, { childList: true, subtree: true });
    mountAccount(user);
  }
})();
