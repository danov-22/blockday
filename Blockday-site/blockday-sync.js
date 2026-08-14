(function () {
  "use strict";

  const API_URL = "https://script.google.com/macros/s/AKfycbxmTmXP1bCWqA25yklg_PESnTh9wQXMqaslyPslwfNtPluRmHaPvrQsIFFeneFcMUoy/exec";
  const USER_ID_KEY = "blockday-sync-user-id";
  const CONNECTED_KEY = "blockday-appscript";
  const LAST_SYNC_KEY = "blockday-last-sync";

  function read(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function userId() {
    let id = localStorage.getItem(USER_ID_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : "user-" + Date.now() + "-" + Math.random().toString(36).slice(2));
      localStorage.setItem(USER_ID_KEY, id);
    }
    return id;
  }

  async function request(body) {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow"
    });
    if (!response.ok) throw new Error("The sync service returned HTTP " + response.status + ".");
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || "The sync service rejected the request.");
    return result;
  }

  function localData() {
    return {
      blocks: read("blockday-blocks", []),
      ideas: read("blockday-ideas", []),
      dailyNotes: read("blockday-daily-notes", []),
      routines: read("blockday-routines", []),
      settings: [{
        id: "preferences",
        theme: read("blockday-theme", "light"),
        reminders: read("blockday-reminders", true),
        locked: read("blockday-locked", true),
        calendarHours: read("blockday-calendar-hours", { start: 5, end: 24 })
      }]
    };
  }

  function restoreData(data) {
    write("blockday-blocks", data.blocks || []);
    write("blockday-ideas", data.ideas || []);
    write("blockday-daily-notes", data.dailyNotes || []);
    write("blockday-routines", data.routines || []);
    const settings = Array.isArray(data.settings) ? data.settings.find(item => item && item.id === "preferences") : null;
    if (settings) {
      if (settings.theme) write("blockday-theme", settings.theme);
      if (typeof settings.reminders === "boolean") write("blockday-reminders", settings.reminders);
      if (typeof settings.locked === "boolean") write("blockday-locked", settings.locked);
      if (settings.calendarHours) write("blockday-calendar-hours", settings.calendarHours);
    }
  }

  function showStatus(message, kind) {
    const panel = document.getElementById("blockday-sync-panel");
    if (!panel) return;
    const status = panel.querySelector("[data-sync-status]");
    if (status.textContent !== message) status.textContent = message;
    const className = "sync-status " + (kind || "");
    if (status.className !== className) status.className = className;
  }

  function setBusy(busy) {
    document.querySelectorAll("[data-sync-action]").forEach(button => { button.disabled = busy; });
  }

  async function connect() {
    setBusy(true);
    showStatus("Checking the connection…");
    try {
      const response = await fetch(API_URL + "?action=health", { redirect: "follow" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Health check failed.");
      write(CONNECTED_KEY, true);
      mountPanel();
      showStatus("Connected. Choose whether to back up or restore.", "success");
    } catch (error) {
      showStatus("Could not connect: " + error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function disconnect() {
    write(CONNECTED_KEY, false);
    mountPanel();
  }

  async function backup() {
    setBusy(true);
    showStatus("Backing up this device…");
    try {
      const result = await request({ action: "save", userId: userId(), data: localData() });
      localStorage.setItem(LAST_SYNC_KEY, result.savedAt || new Date().toISOString());
      showStatus("Backup complete at " + new Date(result.savedAt || Date.now()).toLocaleString() + ".", "success");
    } catch (error) {
      showStatus("Backup failed: " + error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!confirm("Restore from Google Sheets? This replaces Blockday data currently stored in this browser.")) return;
    setBusy(true);
    showStatus("Restoring from Google Sheets…");
    try {
      const result = await request({ action: "load", userId: userId() });
      const count = ["blocks", "ideas", "dailyNotes", "routines"].reduce((sum, key) => sum + (Array.isArray(result[key]) ? result[key].length : 0), 0);
      if (!count && !confirm("The Sheets backup is empty. Continue and clear this browser's Blockday records?")) {
        showStatus("Restore cancelled.");
        return;
      }
      restoreData(result);
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      alert("Restore complete. Blockday will reload now.");
      location.reload();
    } catch (error) {
      showStatus("Restore failed: " + error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function mountPanel() {
    const connectButton = document.querySelector('[data-testid="button-connect-appscript"]');
    if (!connectButton) return;
    const row = connectButton.closest(".setting-row");
    if (!row) return;
    const connected = read(CONNECTED_KEY, false) === true;
    const buttonText = connected ? "Disconnect" : "Connect";
    if (connectButton.textContent !== buttonText) connectButton.textContent = buttonText;
    const copy = row.querySelector(".setting-copy span");
    const copyText = connected ? "Connected · Google Sheets backup is ready" : "Connect your private Google Sheets backup.";
    if (copy && copy.textContent !== copyText) copy.textContent = copyText;

    let panel = document.getElementById("blockday-sync-panel");
    if (!connected) {
      if (panel) panel.remove();
      return;
    }
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "blockday-sync-panel";
      panel.className = "sync-panel";
      panel.innerHTML = '<div class="sync-actions"><button class="button primary" data-sync-action="backup">Back up this device</button><button class="button" data-sync-action="restore">Restore from Sheets</button></div><p class="sync-status" data-sync-status></p><p class="sync-note">Each browser profile has its own private sync ID. Keep using this browser profile to access the same backup.</p>';
      row.insertAdjacentElement("afterend", panel);
    }
    const lastSync = localStorage.getItem(LAST_SYNC_KEY);
    if (lastSync) showStatus("Last sync: " + new Date(lastSync).toLocaleString() + ".");
  }

  document.addEventListener("click", function (event) {
    const connectButton = event.target.closest('[data-testid="button-connect-appscript"]');
    if (connectButton) {
      event.preventDefault();
      event.stopPropagation();
      read(CONNECTED_KEY, false) === true ? disconnect() : connect();
      return;
    }
    const action = event.target.closest("[data-sync-action]")?.dataset.syncAction;
    if (action === "backup") backup();
    if (action === "restore") restore();
  }, true);

  new MutationObserver(mountPanel).observe(document.documentElement, { childList: true, subtree: true });
  mountPanel();
})();
