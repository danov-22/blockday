(function () {
  "use strict";

  let selectedDate = new Date();
  let settingsTab = "general";

  const dateKey = date => [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("-");
  const sameDay = (a, b) => dateKey(a) === dateKey(b);
  const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  const longDate = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

  function activeView() {
    return document.querySelector('[data-testid="calendar-view-switcher"] .active')?.textContent.toLowerCase() || "day";
  }

  function moveDate(direction) {
    const next = new Date(selectedDate);
    const view = activeView();
    if (view === "month") next.setMonth(next.getMonth() + direction);
    else next.setDate(next.getDate() + direction * (view === "week" ? 7 : 1));
    selectedDate = next;
    renderCalendarDate();
  }

  function renderCalendarDate() {
    const label = document.querySelector('[data-testid="text-calendar-date"]');
    if (label) {
      const view = activeView();
      let text;
      if (view === "month") text = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(selectedDate);
      else text = (sameDay(selectedDate, new Date()) ? "Today, " : "") + shortDate.format(selectedDate);
      if (label.textContent !== text) label.textContent = text;
    }
    const heading = document.querySelector('[data-testid="button-add-block"]')?.closest(".page-heading")?.querySelector(".eyebrow");
    if (heading && heading.textContent !== longDate.format(selectedDate)) heading.textContent = longDate.format(selectedDate);
    renderMonth();
    renderWeek();
  }

  function renderMonth() {
    const grid = document.querySelector('[data-testid="calendar-month-view"] .month-grid');
    if (!grid) return;
    const key = selectedDate.getFullYear() + "-" + selectedDate.getMonth();
    if (grid.dataset.calendarKey === key) return;
    grid.dataset.calendarKey = key;
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const mondayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const first = new Date(year, month, 1 - mondayOffset);
    const blocks = (() => { try { return JSON.parse(localStorage.getItem("blockday-blocks") || "[]"); } catch (_) { return []; } })();
    grid.innerHTML = "";
    ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].forEach(day => {
      const head = document.createElement("div");
      head.className = "month-head";
      head.textContent = day;
      grid.appendChild(head);
    });
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(first);
      date.setDate(first.getDate() + index);
      const cell = document.createElement("div");
      cell.className = "month-cell" + (date.getMonth() !== month ? " muted-day" : "");
      cell.dataset.date = dateKey(date);
      const number = document.createElement("span");
      number.className = "month-num" + (sameDay(date, new Date()) ? " today" : "");
      number.textContent = date.getDate();
      cell.appendChild(number);
      if (date.getMonth() === month && blocks.length && date.getDate() % 5 === 0) {
        const event = document.createElement("span");
        event.className = "month-event";
        event.textContent = blocks[date.getDate() % blocks.length]?.title || "Time block";
        cell.appendChild(event);
      }
      cell.addEventListener("click", () => {
        selectedDate = date;
        document.querySelector('[data-testid="button-view-day"]')?.click();
        setTimeout(renderCalendarDate);
      });
      grid.appendChild(cell);
    }
  }

  function renderWeek() {
    const view = document.querySelector('[data-testid="calendar-week-view"]');
    if (!view) return;
    const heads = view.querySelectorAll(".week-head");
    if (heads.length !== 7) return;
    const monday = new Date(selectedDate);
    monday.setDate(selectedDate.getDate() - ((selectedDate.getDay() + 6) % 7));
    const key = dateKey(monday);
    if (view.dataset.calendarKey === key) return;
    view.dataset.calendarKey = key;
    heads.forEach((head, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      head.classList.toggle("today", sameDay(date, new Date()));
      head.innerHTML = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][index] + "<strong>" + date.getDate() + "</strong>";
    });
  }

  function settingsSections() {
    const layout = document.querySelector(".settings-layout");
    if (!layout) return null;
    const content = layout.querySelector(":scope > div");
    return content ? { layout, content, sections: Array.from(content.querySelectorAll(":scope > .setting-section")) } : null;
  }

  function applySettingsTab() {
    const found = settingsSections();
    if (!found) return;
    document.querySelectorAll(".settings-tab").forEach(button => button.classList.toggle("active", button.dataset.testid === "settings-tab-" + settingsTab));
    let custom = document.getElementById("blockday-settings-panel");
    found.sections.forEach(section => {
      const title = section.querySelector("h2")?.textContent || "";
      const visible = settingsTab === "general" ? title !== "Locked content" : settingsTab === "privacy" ? title === "Locked content" : false;
      section.hidden = !visible;
    });
    const save = found.content.querySelector('[data-testid="button-save-settings"]');
    if (save) save.hidden = settingsTab !== "general";
    if (settingsTab === "routines") {
      if (!custom) {
        custom = document.createElement("section");
        custom.id = "blockday-settings-panel";
        custom.className = "setting-section enhancement-panel";
        found.content.prepend(custom);
      }
      let blocks = [];
      try { blocks = JSON.parse(localStorage.getItem("blockday-blocks") || "[]"); } catch (_) {}
      const routines = blocks.filter(block => block.recurring);
      custom.innerHTML = '<h2>Routines</h2><p>Recurring time blocks appear here.</p><div class="setting-row"><div class="setting-copy"><strong>' + routines.length + ' active routine' + (routines.length === 1 ? "" : "s") + '</strong><span>Create or edit a calendar block and enable “Repeat this as a routine”.</span></div><a class="button" href="/">Open calendar</a></div>';
      custom.hidden = false;
    } else if (custom) custom.hidden = true;
  }

  function toggleMoreMenu(button) {
    let menu = document.getElementById("blockday-more-menu");
    if (menu) { menu.remove(); return; }
    menu = document.createElement("div");
    menu.id = "blockday-more-menu";
    menu.className = "more-menu";
    menu.innerHTML = '<a href="/settings">Settings</a><button type="button" data-export-blockday>Export local backup</button>';
    button.parentElement.appendChild(menu);
  }

  function exportLocalData() {
    const data = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith("blockday-")) data[key] = localStorage.getItem(key);
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "blockday-backup-" + dateKey(new Date()) + ".json";
    link.click();
    URL.revokeObjectURL(url);
    document.getElementById("blockday-more-menu")?.remove();
  }

  document.addEventListener("click", event => {
    const target = event.target.closest("button, [data-export-blockday]");
    if (!target) return;
    if (target.dataset.testid === "button-previous-date") { event.preventDefault(); moveDate(-1); }
    if (target.dataset.testid === "button-next-date") { event.preventDefault(); moveDate(1); }
    if (target.dataset.testid === "button-today") { event.preventDefault(); selectedDate = new Date(); renderCalendarDate(); }
    if (target.dataset.testid?.startsWith("settings-tab-")) {
      event.preventDefault();
      settingsTab = target.dataset.testid.replace("settings-tab-", "");
      applySettingsTab();
    }
    if (target.dataset.testid === "button-more") { event.preventDefault(); toggleMoreMenu(target); }
    if (target.hasAttribute("data-export-blockday")) exportLocalData();
    if (target.classList.contains("segment")) setTimeout(renderCalendarDate);
  });

  document.addEventListener("click", event => {
    const menu = document.getElementById("blockday-more-menu");
    if (menu && !menu.contains(event.target) && !event.target.closest('[data-testid="button-more"]')) menu.remove();
  });

  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      renderCalendarDate();
      applySettingsTab();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
  renderCalendarDate();
  applySettingsTab();
})();
