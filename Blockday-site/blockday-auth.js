(function () {
  "use strict";
  const clientId = String(window.BLOCKDAY_GOOGLE_CLIENT_ID || "").trim();
  const credentialKey = "blockday-auth-credential";
  const userKey = "blockday-auth-user";
  const sessionKey = "blockday-auth-session";
  const privateKeys = ["blockday-blocks", "blockday-ideas", "blockday-daily-notes", "blockday-routines", "blockday-profile", "blockday-share"];
  const demoKeys = privateKeys.concat(["blockday-theme", "blockday-reminders", "blockday-locked", "blockday-calendar-hours", "blockday-appscript", "blockday-sync-pending"]);
  const demoBackupKey = "blockday-demo-backup";
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
  function switchWorkspace(nextSub) {
    const previous = currentUser();
    const snapshot = {}; privateKeys.forEach(key => { const value = localStorage.getItem(key); if (value !== null) snapshot[key] = value; });
    if (previous?.sub) privateKeys.forEach(key => { if (snapshot[key] !== undefined) localStorage.setItem("blockday-user-" + previous.sub + "-" + key, snapshot[key]); });
    privateKeys.forEach(key => localStorage.removeItem(key));
    if (nextSub) {
      const hasSavedWorkspace = privateKeys.some(key => localStorage.getItem("blockday-user-" + nextSub + "-" + key) !== null);
      privateKeys.forEach(key => { const value = localStorage.getItem("blockday-user-" + nextSub + "-" + key); if (value !== null) localStorage.setItem(key, value); else if (!previous?.sub && !hasSavedWorkspace && snapshot[key] !== undefined) localStorage.setItem(key, snapshot[key]); });
    }
  }
  function restoreDemo() {
    const raw = localStorage.getItem(demoBackupKey);
    if (!raw) return;
    let backup = {}; try { backup = JSON.parse(raw); } catch (_) {}
    demoKeys.forEach(key => localStorage.removeItem(key));
    Object.keys(backup).forEach(key => localStorage.setItem(key, backup[key]));
    localStorage.removeItem(demoBackupKey);
  }
  function prepareDemo() {
    if (localStorage.getItem(demoBackupKey)) return;
    const backup = {}; demoKeys.forEach(key => { const value = localStorage.getItem(key); if (value !== null) backup[key] = value; });
    localStorage.setItem(demoBackupKey, JSON.stringify(backup));
    demoKeys.forEach(key => localStorage.removeItem(key));
    const now = new Date(), key = [now.getFullYear(), now.getMonth() + 1, now.getDate()].join("-");
    localStorage.setItem("blockday-blocks", JSON.stringify([
      { id: "demo-1", title: "Deep work", start: 9 + 10 / 60, duration: 1.25, date: key, color: "green", completed: false },
      { id: "demo-2", title: "Walk + reset", start: 11 + 35 / 60, duration: .5, date: key, color: "gold", completed: true },
      { id: "demo-3", title: "Build the next thing", start: 13.25, duration: 1 + 25 / 60, date: key, color: "blue", completed: false }
    ]));
    localStorage.setItem("blockday-profile", JSON.stringify({ name: "Jamie", title: "Jamie’s Blockday", theme: "sage" }));
    localStorage.setItem("blockday-calendar-hours", JSON.stringify({ start: 7, end: 18 }));
    localStorage.setItem("blockday-appscript", "false");
  }
  function enterDemo() {
    prepareDemo();
    location.href = "/?demo=1";
  }
  window.BlockdayDemo = { enter: enterDemo, exit: function () { restoreDemo(); location.href = "/"; } };
  function loginScreen(configured) {
    if (document.getElementById("blockday-login")) return;
    const screen = document.createElement("main");
    screen.id = "blockday-login";
    screen.className = "login-screen";
    screen.innerHTML = '<div class="landing-shell"><nav class="landing-nav"><a class="landing-brand" href="/"><img src="/favicon.svg" alt="">Blockday</a><a href="#demo">Demo</a><a href="#pricing">Price</a><a class="button" href="/login">Sign in</a></nav><section class="landing-hero"><div><span class="eyebrow">Your day, in your hands</span><h1>Make time feel like yours again.</h1><p>A private planner for precise time blocks, personal themes, and schedules you share only when you choose.</p><div class="landing-actions"><div id="blockday-google-button"></div><button class="button" type="button" data-open-demo>Try the demo app</button></div><p class="login-note"></p></div><div class="demo-window" id="demo" aria-label="Blockday demo"><div class="demo-top"><i></i><span>Jamie’s Blockday</span><b>Tuesday</b></div><div class="demo-grid"><time>9:00</time><article class="demo-block a"><strong>Deep work</strong><span>9:10–10:25</span></article><time>11:00</time><article class="demo-block b"><strong>Walk + reset</strong><span>11:35–12:05</span></article><time>1:00</time><article class="demo-block c"><strong>Build the next thing</strong><span>1:15–2:40</span></article></div></div></section><section class="landing-features"><article><b>5-minute precision</b><span>Plan real life, not just whole hours.</span></article><article><b>Private by default</b><span>Each Google account gets its own schedule.</span></article><article><b>Made personally yours</b><span>Name, identity, and dedicated color themes.</span></article><article><b>Share selectively</b><span>Publish a read-only link, then disable it anytime.</span></article></section><section class="landing-price" id="pricing"><span class="eyebrow">Simple ownership</span><h2>One purchase. Free updates.</h2><p>No tiers and no subscription. Launch target: <strong>Rp50.000</strong> (final payment setup can follow).</p></section><footer class="landing-footer">© Blockday · Calm planning, privately held.</footer></div>';
    document.body.appendChild(screen);
    screen.querySelector("[data-open-demo]").addEventListener("click", enterDemo);
    if (!configured) {
      screen.querySelector(".login-note").textContent = "Google sign-in needs its OAuth Client ID before launch. Add it in auth-config.js.";
      screen.querySelector("#blockday-google-button").innerHTML = '<button class="button primary" type="button" data-google-not-ready>Sign in / Register with Google</button>';
      screen.querySelector("[data-google-not-ready]").addEventListener("click", () => { screen.querySelector(".login-note").textContent = "Google sign-in is not active yet. Add the OAuth Client ID in auth-config.js to enable registration."; });
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
      switchWorkspace(user.sub);
      localStorage.setItem(credentialKey, response.credential);
      localStorage.setItem(userKey, JSON.stringify(user));
      localStorage.setItem(sessionKey, result.session);
      localStorage.setItem("blockday-welcome-complete", "true");
      location.replace("/?app=1");
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
      signOut();
    });
    actions.prepend(button);
  }
  function signOut() {
    if (!confirm("Sign out of Blockday on this device? Your local data will remain here.")) return;
    switchWorkspace(""); google?.accounts?.id?.disableAutoSelect();
    localStorage.removeItem(credentialKey); localStorage.removeItem(userKey); localStorage.removeItem(sessionKey); localStorage.removeItem("blockday-welcome-complete"); location.href = "/";
  }
  function switchAccount() {
    switchWorkspace(""); google?.accounts?.id?.disableAutoSelect();
    localStorage.removeItem(credentialKey); localStorage.removeItem(userKey); localStorage.removeItem(sessionKey); localStorage.removeItem("blockday-welcome-complete"); location.href = "/login";
  }
  window.BlockdayAuth = { signOut, switchAccount, currentUser };
  const params = new URLSearchParams(location.search);
  if (params.has("demo")) prepareDemo();
  if (!params.has("demo") && localStorage.getItem(demoBackupKey)) restoreDemo();
  const user = currentUser();
  const publicLanding = !params.has("share") && !params.has("app") && !params.has("demo");
  if (!params.has("share") && (location.pathname === "/login" || publicLanding || (!user && !params.has("demo")))) {
    loginScreen(Boolean(clientId));
    if (user && location.pathname !== "/login") {
      document.getElementById("blockday-google-button").innerHTML = '<a class="button primary" href="/?app=1">Open my Blockday</a>';
      document.querySelector(".login-note").textContent = "Signed in as " + (user.email || user.name || "your Google account") + ".";
    } else if (clientId) renderGoogleButton();
  }
  if (user) {
    new MutationObserver(() => mountAccount(user)).observe(document.documentElement, { childList: true, subtree: true });
    mountAccount(user);
  }
})();
