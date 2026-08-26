(function () {
  "use strict";
  const API_URL = "https://script.google.com/macros/s/AKfycbyMPgUg0MQlPtHMNBZYAks0_x1VZ2HXb7_iX873gcpg9Vee2LjRIacJHs-ua33OATXH/exec";
  const themes = ["sage", "ocean", "berry", "sand"];
  const read = (key, fallback) => { try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value); } catch (_) { return fallback; } };
  const profile = () => read("blockday-profile", {});
  const apiUrl = () => localStorage.getItem("blockday-sync-url") || API_URL;
  const session = () => localStorage.getItem("blockday-auth-session") || "";
  const esc = value => String(value || "").replace(/[&<>\"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" }[char]));
  function applyIdentity() {
    const saved = profile();
    document.documentElement.dataset.palette = themes.includes(saved.theme) ? saved.theme : "sage";
    const heading = document.querySelector('[data-testid="button-add-block"]')?.closest(".page-heading")?.querySelector("h1");
    const personalizedHeading = saved.name ? saved.name + "’s day" : "";
    if (heading && personalizedHeading && heading.textContent !== personalizedHeading) heading.textContent = personalizedHeading;
  }
  function mountProfileSettings() {
    const content = document.querySelector(".settings-layout > div");
    if (!content || document.getElementById("blockday-profile-settings")) return;
    const user = read("blockday-auth-user", {}), saved = profile(), section = document.createElement("section");
    section.id = "blockday-profile-settings"; section.className = "setting-section";
    section.innerHTML = '<h2>Your Blockday</h2><p>Choose the identity and color shown in your planner and shared schedule.</p><div class="profile-grid"><label>Display name<input class="input" data-profile-name maxlength="40" value="' + esc(saved.name || user.name || "") + '"></label><label>Planner title<input class="input" data-profile-title maxlength="60" value="' + esc(saved.title || "My Blockday") + '"></label></div><div class="palette-picker">' + themes.map(theme => '<button type="button" class="palette ' + theme + '" data-palette="' + theme + '" aria-label="Use ' + theme + ' theme"></button>').join("") + '</div><div class="profile-actions"><button class="button primary" type="button" data-save-profile>Save identity</button><button class="button" type="button" data-switch-account>Switch Google account</button><button class="button ghost danger" type="button" data-sign-out>Sign out</button></div>';
    if (new URLSearchParams(location.search).has("demo")) section.querySelectorAll("[data-switch-account],[data-sign-out]").forEach(button => button.remove());
    content.prepend(section);
  }
  function mountShareButton() {
    if (new URLSearchParams(location.search).has("demo")) return;
    const actions = document.querySelector(".calendar-heading-actions");
    if (!actions || actions.querySelector("[data-share-schedule]")) return;
    const button = document.createElement("button"); button.type = "button"; button.className = "button"; button.dataset.shareSchedule = ""; button.textContent = "Share schedule"; actions.prepend(button);
  }
  function hideTechnicalConnections() {
    const button = document.querySelector('[data-testid="button-connect-appscript"]');
    const section = button?.closest(".setting-section");
    if (section) section.hidden = true;
  }
  function shareDialog() {
    document.getElementById("blockday-share-dialog")?.remove();
    const saved = read("blockday-share", {}), dialog = document.createElement("div");
    dialog.className = "overlay"; dialog.id = "blockday-share-dialog";
    dialog.innerHTML = '<div class="dialog share-dialog"><div class="dialog-head"><div><h2>Share your schedule</h2><p>Anyone with the link can see only the details you select.</p></div><button class="icon-button" data-close-share aria-label="Close">×</button></div><label class="share-check"><input type="checkbox" data-share-notes ' + (saved.includeNotes ? "checked" : "") + '> Include daily notes</label><label class="share-check"><input type="checkbox" checked disabled> Include scheduled blocks</label><div class="share-actions"><button class="button primary" data-publish-share>Generate private link</button>' + (saved.token ? '<button class="button danger ghost" data-unpublish-share>Disable link</button>' : "") + '</div><p data-share-status>' + (saved.url ? 'Current link: <a href="' + esc(saved.url) + '" target="_blank" rel="noopener">open shared schedule</a>' : "The link is not searchable and can be disabled anytime.") + '</p></div>';
    document.body.appendChild(dialog);
  }
  async function publishShare() {
    const status = document.querySelector("[data-share-status]");
    if (!session()) { status.textContent = "Sign in with Google before publishing."; return; }
    status.textContent = "Creating link…";
    const blocks = read("blockday-blocks", []).map(({ id, title, start, duration, date, color }) => ({ id, title, start, duration, date, color }));
    const notes = document.querySelector("[data-share-notes]")?.checked ? read("blockday-daily-notes", []) : [];
    try {
      const response = await fetch(apiUrl(), { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "publish", session: session(), data: { profile: profile(), blocks, dailyNotes: notes } }) });
      const result = await response.json(); if (!result.ok) throw new Error(result.error || "Could not publish.");
      const url = location.origin + location.pathname + "?share=" + encodeURIComponent(result.token);
      localStorage.setItem("blockday-share", JSON.stringify({ token: result.token, url, includeNotes: Boolean(notes.length) }));
      await navigator.clipboard?.writeText(url); status.innerHTML = 'Link copied: <a href="' + esc(url) + '" target="_blank" rel="noopener">open shared schedule</a>';
    } catch (error) { status.textContent = error.message; }
  }
  async function unpublishShare() {
    const saved = read("blockday-share", {}), status = document.querySelector("[data-share-status]");
    try {
      const response = await fetch(apiUrl(), { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "unpublish", session: session(), token: saved.token }) });
      const result = await response.json(); if (!result.ok) throw new Error(result.error || "Could not disable link.");
      localStorage.removeItem("blockday-share"); status.textContent = "The shared link has been disabled.";
    } catch (error) { status.textContent = error.message; }
  }
  function timeLabel(value) {
    const minutes = Math.round(Number(value) * 60), hour = Math.floor(minutes / 60) % 24, minute = minutes % 60;
    return new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  async function renderPublicSchedule(token) {
    document.documentElement.classList.add("public-view"); document.body.innerHTML = '<main class="public-schedule"><p>Loading shared Blockday…</p></main>';
    try {
      const response = await fetch(apiUrl() + "?action=public&token=" + encodeURIComponent(token)), result = await response.json();
      if (!result.ok) throw new Error(result.error || "This schedule is unavailable.");
      const data = result.data || {}, owner = data.profile?.name || "A Blockday user";
      const grouped = (data.blocks || []).sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.start - b.start).reduce((all, block) => ((all[block.date || "Unscheduled"] ||= []).push(block), all), {});
      document.documentElement.dataset.palette = themes.includes(data.profile?.theme) ? data.profile.theme : "sage";
      document.body.innerHTML = '<main class="public-schedule"><header><img src="/favicon.svg" alt=""><span class="eyebrow">Shared Blockday</span><h1>' + esc(data.profile?.title || owner + "’s schedule") + '</h1><p>Read-only schedule shared by ' + esc(owner) + '.</p></header>' + Object.keys(grouped).map(date => '<section><h2>' + esc(date) + '</h2>' + grouped[date].map(block => '<article><time>' + timeLabel(block.start) + '–' + timeLabel(Number(block.start) + Number(block.duration)) + '</time><strong>' + esc(block.title) + '</strong></article>').join("") + '</section>').join("") + ((data.dailyNotes || []).length ? '<section><h2>Notes</h2>' + data.dailyNotes.map(note => '<p>' + esc(note.text || note.note || "") + '</p>').join("") + '</section>' : "") + '<footer>Shared with Blockday · Private by default</footer></main>';
    } catch (error) { document.body.innerHTML = '<main class="public-schedule empty"><h1>Link unavailable</h1><p>' + esc(error.message) + '</p></main>'; }
  }
  function improveMinuteInputs() {
    const start = document.querySelector('[data-testid="input-block-start"]'), duration = document.querySelector('[data-testid="input-block-duration"]'), step = String(1 / 12);
    if (start && start.step !== step) { start.step = step; start.closest(".field").querySelector("label").textContent = "Starts at (5-minute precision)"; }
    if (duration && duration.step !== step) { duration.step = step; duration.min = step; duration.closest(".field").querySelector("label").textContent = "Duration (5-minute precision)"; }
  }
  function mountTopbar() {
    const left = document.querySelector(".topbar-left"), actions = document.querySelector(".top-actions");
    if (!left || !actions) return;
    if (!document.getElementById("blockday-top-logo")) {
      const logo = document.createElement("a"); logo.id = "blockday-top-logo"; logo.className = "theme-logo"; logo.href = "/"; logo.setAttribute("aria-label", "Blockday home"); left.prepend(logo);
    }
    if (!document.getElementById("blockday-clock")) {
      const clock = document.createElement("time"); clock.id = "blockday-clock"; clock.className = "device-clock"; actions.prepend(clock);
      const tick = () => { clock.dateTime = new Date().toISOString(); clock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };
      tick(); setInterval(tick, 1000);
    }
    if (new URLSearchParams(location.search).has("demo") && !document.getElementById("blockday-exit-demo")) {
      const exit = document.createElement("button"); exit.id = "blockday-exit-demo"; exit.className = "button demo-exit"; exit.type = "button"; exit.textContent = "← Exit demo"; exit.addEventListener("click", () => window.BlockdayDemo?.exit()); actions.prepend(exit);
    }
  }
  document.addEventListener("click", event => {
    if (event.target.closest("[data-share-schedule]")) shareDialog();
    if (event.target.closest("[data-close-share]")) document.getElementById("blockday-share-dialog")?.remove();
    if (event.target.closest("[data-publish-share]")) publishShare(); if (event.target.closest("[data-unpublish-share]")) unpublishShare();
    const palette = event.target.closest("[data-palette]");
    if (palette) {
      const selectedTheme = palette.dataset.palette;
      document.documentElement.dataset.palette = selectedTheme;
      localStorage.setItem("blockday-profile", JSON.stringify({ ...profile(), theme: selectedTheme }));
    }
    if (event.target.closest("[data-save-profile]")) { localStorage.setItem("blockday-profile", JSON.stringify({ name: document.querySelector("[data-profile-name]").value.trim(), title: document.querySelector("[data-profile-title]").value.trim(), theme: document.documentElement.dataset.palette || "sage" })); applyIdentity(); }
    if (event.target.closest("[data-sign-out]")) window.BlockdayAuth?.signOut(); if (event.target.closest("[data-switch-account]")) window.BlockdayAuth?.switchAccount();
  });
  const token = new URLSearchParams(location.search).get("share"); if (token) { renderPublicSchedule(token); return; }
  new MutationObserver(() => { applyIdentity(); mountProfileSettings(); mountShareButton(); improveMinuteInputs(); mountTopbar(); hideTechnicalConnections(); }).observe(document.documentElement, { childList: true, subtree: true }); applyIdentity(); mountTopbar(); hideTechnicalConnections();
})();
