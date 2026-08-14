(function () {
  "use strict";
  const clientId = String(window.BLOCKDAY_GOOGLE_CLIENT_ID || "").trim();
  const credentialKey = "blockday-auth-credential";
  const userKey = "blockday-auth-user";

  function decodeCredential(credential) {
    const payload = credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(atob(payload).split("").map(char => "%" + ("00" + char.charCodeAt(0).toString(16)).slice(-2)).join("")));
  }
  function currentUser() {
    try {
      const user = JSON.parse(sessionStorage.getItem(userKey) || "null");
      if (user?.exp && user.exp * 1000 > Date.now()) return user;
    } catch (_) {}
    sessionStorage.removeItem(credentialKey);
    sessionStorage.removeItem(userKey);
    return null;
  }
  function loginScreen(configured) {
    if (document.getElementById("blockday-login")) return;
    const screen = document.createElement("main");
    screen.id = "blockday-login";
    screen.className = "login-screen";
    screen.innerHTML = '<section class="login-card"><div class="login-logo">b-d</div><span class="eyebrow">Your time, privately held</span><h1>Welcome to Blockday.</h1><p>Plan locally, keep working offline, and back up to your own Google Sheet when you reconnect.</p><div id="blockday-google-button"></div><p class="login-note"></p></section>';
    document.body.appendChild(screen);
    if (!configured) {
      screen.querySelector(".login-note").textContent = "Google login is ready for configuration. Add the OAuth Web Client ID to auth-config.js to activate it.";
      screen.querySelector("#blockday-google-button").innerHTML = '<a class="button" href="/">Continue to Blockday</a>';
    }
  }
  function handleCredential(response) {
    try {
      const user = decodeCredential(response.credential);
      if (user.aud !== clientId || !user.sub) throw new Error("The Google account response was not issued for Blockday.");
      sessionStorage.setItem(credentialKey, response.credential);
      sessionStorage.setItem(userKey, JSON.stringify(user));
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
      sessionStorage.removeItem(credentialKey);
      sessionStorage.removeItem(userKey);
      location.reload();
    });
    actions.prepend(button);
  }
  const user = currentUser();
  if (location.pathname === "/login" || (clientId && !user)) {
    loginScreen(Boolean(clientId));
    if (clientId) renderGoogleButton();
  }
  if (user) {
    new MutationObserver(() => mountAccount(user)).observe(document.documentElement, { childList: true, subtree: true });
    mountAccount(user);
  }
})();
