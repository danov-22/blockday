(function () {
  "use strict";

  let selectedDate = new Date();
  let settingsTab = "general";

  const dateKey = date => [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("-");
  const dateFromKey = value => {
    const parts = String(value || "").split("-").map(Number);
    return parts.length === 3 && parts.every(Number.isFinite) ? new Date(parts[0], parts[1] - 1, parts[2], 12) : new Date();
  };
  const sameDay = (a, b) => dateKey(a) === dateKey(b);
  const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  const longDate = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

  function readBlocks() {
    try { return JSON.parse(localStorage.getItem("blockday-blocks") || "[]"); } catch (_) { return []; }
  }

  function calendarHours() {
    try {
      const saved = JSON.parse(localStorage.getItem("blockday-calendar-hours") || "{}");
      return { start: Number.isInteger(saved.start) ? saved.start : 5, end: Number.isInteger(saved.end) ? saved.end : 24 };
    } catch (_) { return { start: 5, end: 24 }; }
  }

  function hourLabel(hour) {
    const normalized = hour % 24;
    if (normalized === 0) return "12 AM";
    if (normalized === 12) return "12 PM";
    return (normalized > 12 ? normalized - 12 : normalized) + (normalized > 11 ? " PM" : " AM");
  }

  function migrateBlockDates() {
    const blocks = readBlocks();
    let changed = false;
    blocks.forEach(block => {
      if (!block.date) { block.date = dateKey(new Date()); changed = true; }
    });
    if (changed) localStorage.setItem("blockday-blocks", JSON.stringify(blocks));
  }

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
    renderDayHours();
    renderWeek();
    mountCalendarActions();
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
    const blocks = readBlocks();
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
      const dayBlocks = blocks.filter(block => block.date === dateKey(date));
      if (date.getMonth() === month && dayBlocks.length) {
        const event = document.createElement("span");
        event.className = "month-event";
        event.textContent = dayBlocks[0]?.title || "Time block";
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

  function renderDayHours() {
    const grid = document.querySelector('[data-testid="calendar-day-view"] .day-grid');
    if (!grid) return;
    const axis = grid.querySelector(".time-axis");
    const column = grid.querySelector(".day-column");
    if (!axis || !column) return;
    const hours = calendarHours();
    const hourHeight = innerWidth <= 700 ? 78 : 72;
    const key = hours.start + "-" + hours.end + "-" + hourHeight;
    if (grid.dataset.hoursKey !== key) {
      grid.dataset.hoursKey = key;
      axis.innerHTML = "";
      for (let hour = hours.start; hour < hours.end; hour += 1) {
        const label = document.createElement("div");
        label.className = "time-label";
        label.textContent = hourLabel(hour);
        label.style.height = hourHeight + "px";
        axis.appendChild(label);
      }
      grid.style.minHeight = (hours.end - hours.start) * hourHeight + "px";
      column.style.backgroundSize = "100% " + hourHeight + "px";
    }
    const blocks = readBlocks();
    column.querySelectorAll(".block").forEach(element => {
      const id = element.dataset.testid?.replace("block-", "");
      const block = blocks.find(item => String(item.id) === id);
      if (!block) return;
      const visible = block.date === dateKey(selectedDate) && block.start < hours.end && block.start + block.duration > hours.start;
      element.hidden = !visible;
      if (visible) {
        element.style.top = Math.max(0, block.start - hours.start) * hourHeight + "px";
        element.style.height = Math.max(52, Math.min(block.duration, hours.end - block.start) * hourHeight - 8) + "px";
      }
    });
  }

  function renderWeek() {
    const view = document.querySelector('[data-testid="calendar-week-view"]');
    if (!view) return;
    const monday = new Date(selectedDate);
    monday.setDate(selectedDate.getDate() - ((selectedDate.getDay() + 6) % 7));
    const hours = calendarHours();
    const key = dateKey(monday) + "-" + hours.start + "-" + hours.end;
    if (view.dataset.calendarKey === key) return;
    view.dataset.calendarKey = key;
    const grid = view.querySelector(".week-grid");
    if (!grid) return;
    grid.innerHTML = '<div class="week-corner"></div>';
    const dates = [];
    for (let index = 0; index < 7; index += 1) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      dates.push(date);
      const head = document.createElement("button");
      head.type = "button";
      head.className = "week-head";
      head.classList.toggle("today", sameDay(date, new Date()));
      head.innerHTML = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][index] + "<strong>" + date.getDate() + "</strong>";
      head.addEventListener("click", () => { selectedDate = date; document.querySelector('[data-testid="button-view-day"]')?.click(); setTimeout(renderCalendarDate); });
      grid.appendChild(head);
    }
    const blocks = readBlocks();
    for (let hour = hours.start; hour < hours.end; hour += 1) {
      const label = document.createElement("div");
      label.className = "time-label week-time";
      label.textContent = hourLabel(hour);
      grid.appendChild(label);
      dates.forEach(date => {
        const cell = document.createElement("div");
        cell.className = "week-col";
        blocks.filter(block => block.date === dateKey(date) && Math.floor(block.start) === hour).forEach(block => {
          const item = document.createElement("div");
          item.className = "mini-block" + (block.completed ? " done" : "");
          item.textContent = block.title;
          cell.appendChild(item);
        });
        grid.appendChild(cell);
      });
    }
  }

  function mountCalendarActions() {
    const heading = document.querySelector('[data-testid="button-add-block"]')?.closest(".page-heading");
    if (!heading || document.getElementById("blockday-reset-schedule")) return;
    const add = heading.querySelector('[data-testid="button-add-block"]');
    const actions = document.createElement("div");
    actions.className = "calendar-heading-actions";
    actions.innerHTML = '<button class="button ghost" id="blockday-reset-schedule" type="button">Reset schedule</button>';
    if (add) actions.appendChild(add);
    heading.appendChild(actions);
  }

  function showResetDialog() {
    const dialog = document.createElement("div");
    dialog.className = "overlay";
    dialog.id = "blockday-reset-dialog";
    dialog.innerHTML = '<div class="dialog reset-dialog"><div class="dialog-head"><div><h2>Reset schedule</h2><p>Choose what to clear. This cannot be undone.</p></div><button class="icon-button" data-reset-scope="cancel" aria-label="Close">×</button></div><div class="reset-options"><button class="button" data-reset-scope="day">This day</button><button class="button" data-reset-scope="week">This week</button><button class="button" data-reset-scope="month">This month</button><button class="button danger" data-reset-scope="all">Everything</button></div></div>';
    document.body.appendChild(dialog);
  }

  function resetSchedule(scope) {
    if (scope === "cancel") { document.getElementById("blockday-reset-dialog")?.remove(); return; }
    if (!confirm("Clear " + (scope === "all" ? "the entire schedule" : "blocks for this " + scope) + "?")) return;
    const selected = new Date(selectedDate);
    const monday = new Date(selected);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(selected.getDate() - ((selected.getDay() + 6) % 7));
    const nextMonday = new Date(monday); nextMonday.setDate(monday.getDate() + 7);
    const keep = readBlocks().filter(block => {
      if (scope === "all") return false;
      const date = dateFromKey(block.date);
      if (scope === "day") return !sameDay(date, selected);
      if (scope === "week") return date < monday || date >= nextMonday;
      return date.getFullYear() !== selected.getFullYear() || date.getMonth() !== selected.getMonth();
    });
    localStorage.setItem("blockday-blocks", JSON.stringify(keep));
    location.reload();
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
    let hoursPanel = document.getElementById("blockday-hours-settings");
    if (!hoursPanel) {
      const hours = calendarHours();
      hoursPanel = document.createElement("section");
      hoursPanel.id = "blockday-hours-settings";
      hoursPanel.className = "setting-section";
      hoursPanel.innerHTML = '<h2>Calendar hours</h2><p>Choose the first and last hour shown in day and week views. All 24 hours remain available.</p><div class="hours-settings"><label>Day starts<select class="select" data-hours-start></select></label><label>Day ends<select class="select" data-hours-end></select></label></div>';
      const start = hoursPanel.querySelector("[data-hours-start]");
      const end = hoursPanel.querySelector("[data-hours-end]");
      for (let hour = 0; hour < 24; hour += 1) start.add(new Option(hourLabel(hour), hour, false, hour === hours.start));
      for (let hour = 1; hour <= 24; hour += 1) end.add(new Option(hour === 24 ? "12 AM (next day)" : hourLabel(hour), hour, false, hour === hours.end));
      found.content.prepend(hoursPanel);
    }
    hoursPanel.hidden = settingsTab !== "general";
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
    const signedIn = Boolean(sessionStorage.getItem("blockday-auth-user"));
    menu.innerHTML = '<a href="/settings">Settings</a>' + (signedIn ? "" : '<a href="/login">Sign in with Google</a>') + '<button type="button" data-export-blockday>Export local backup</button>';
    button.parentElement.appendChild(menu);
  }

  function mountBrand() {
    document.querySelectorAll(".brand-mark").forEach(mark => { if (mark.textContent !== "b-d") mark.textContent = "b-d"; });
    const topbar = document.querySelector(".topbar-left");
    if (topbar && !document.getElementById("blockday-mobile-brand")) {
      const mark = document.createElement("a");
      mark.id = "blockday-mobile-brand";
      mark.className = "brand-mark mobile-brand";
      mark.href = "/";
      mark.textContent = "b-d";
      topbar.prepend(mark);
    }
  }

  function dismissThemeToast() {
    document.querySelectorAll('[data-testid="status-settings-toast"]').forEach(toast => {
      if (toast.textContent.trim() === "Theme updated") toast.remove();
    });
  }

  function renderInsights() {
    const completionCard = document.querySelector('[data-testid="stat-completion"]');
    if (!completionCard) return;
    const blocks = readBlocks();
    const now = new Date();
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const weekDates = Array.from({ length: 7 }, (_, index) => { const date = new Date(monday); date.setDate(monday.getDate() + index); return date; });
    const weekly = blocks.filter(block => weekDates.some(date => block.date === dateKey(date)));
    const completed = weekly.filter(block => block.completed);
    const completion = weekly.length ? Math.round(completed.length / weekly.length * 100) : 0;
    const focus = completed.reduce((sum, block) => sum + (Number(block.duration) || 0), 0);
    let streak = 0;
    const cursor = new Date(now);
    while (blocks.some(block => block.completed && block.date === dateKey(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
    const setValue = (testid, value) => {
      const node = document.querySelector('[data-testid="' + testid + '"] .stat-value');
      if (node && node.textContent !== String(value)) node.textContent = value;
    };
    setValue("stat-completion", completion + "%");
    setValue("stat-streak", streak);
    setValue("stat-focus", Math.round(focus * 10) / 10);
    setValue("stat-routines", blocks.filter(block => block.recurring).length);
    document.querySelectorAll("[data-testid^='bar-day-'] .bar").forEach((bar, index) => {
      const dayBlocks = blocks.filter(block => block.date === dateKey(weekDates[index]));
      const value = dayBlocks.length ? Math.round(dayBlocks.filter(block => block.completed).length / dayBlocks.length * 100) : 0;
      bar.style.height = value + "%";
    });
    const range = document.querySelector(".chart-card .eyebrow");
    if (range) range.textContent = shortDate.format(weekDates[0]) + "–" + shortDate.format(weekDates[6]);
    const notes = document.querySelector(".streak-list");
    if (notes) {
      const busiest = weekDates.map(date => ({ date, hours: blocks.filter(block => block.completed && block.date === dateKey(date)).reduce((sum, block) => sum + (Number(block.duration) || 0), 0) })).sort((a, b) => b.hours - a.hours)[0];
      const routines = blocks.filter(block => block.recurring).length;
      const markup = blocks.length
        ? '<div class="streak-row"><strong>' + streak + '-day streak</strong><span>current momentum</span></div><div class="streak-row"><strong>' + (busiest.hours ? longDate.format(busiest.date) : "No focus blocks yet") + '</strong><span>' + (busiest.hours ? busiest.hours + " focused hours" : "this week") + '</span></div><div class="streak-row"><strong>' + routines + ' routine' + (routines === 1 ? "" : "s") + '</strong><span>in your schedule</span></div>'
        : '<div class="empty insights-note-empty"><strong>No schedule data yet.</strong><span>Add a block and complete it to begin seeing patterns.</span></div>';
      if (notes.innerHTML !== markup) notes.innerHTML = markup;
    }
    document.querySelector(".insights-grid")?.classList.toggle("insights-empty", blocks.length === 0);
  }

  function fixBrainstormSpacing() {
    const compose = document.querySelector('[data-testid="input-idea-compose"]');
    compose?.closest(".page")?.classList.add("brainstorm-page");
  }

  function stampSavedBlockDate() {
    const title = document.querySelector('[data-testid="input-block-title"]')?.value;
    const start = Number(document.querySelector('[data-testid="input-block-start"]')?.value);
    setTimeout(() => {
      const blocks = readBlocks();
      const candidates = blocks.filter(block => block.title === title && Number(block.start) === start);
      const block = candidates[candidates.length - 1] || blocks[blocks.length - 1];
      if (block) {
        block.date = dateKey(selectedDate);
        localStorage.setItem("blockday-blocks", JSON.stringify(blocks));
      }
    }, 100);
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
    if (target.id === "blockday-reset-schedule") showResetDialog();
    if (target.dataset.resetScope) resetSchedule(target.dataset.resetScope);
    if (target.dataset.testid === "button-save-block") stampSavedBlockDate();
  });

  document.addEventListener("change", event => {
    if (!event.target.matches("[data-hours-start], [data-hours-end]")) return;
    const start = Number(document.querySelector("[data-hours-start]").value);
    const end = Number(document.querySelector("[data-hours-end]").value);
    if (start >= end) {
      alert("The end of the day must be later than the start.");
      return;
    }
    localStorage.setItem("blockday-calendar-hours", JSON.stringify({ start, end }));
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
      mountBrand();
      dismissThemeToast();
      renderInsights();
      fixBrainstormSpacing();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
  migrateBlockDates();
  renderCalendarDate();
  applySettingsTab();
  mountBrand();
  dismissThemeToast();
  renderInsights();
  fixBrainstormSpacing();
})();
