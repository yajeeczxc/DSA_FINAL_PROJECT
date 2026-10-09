const directory = {
  "L1": { name: "Vitto, Dag Johny Phol M.", type: "Student" },
  "L2": { name: "Pineda, Christian James T.", type: "Student" },
  "L3": { name: "Lolin, Angeline M.", type: "Student" },
  "L4": { name: "Amongan, Shamille E.", type: "Student" },
  "S1": { name: "Jordan Reyes", type: "Staff" }
};


const patrons = new Map(Object.entries(directory));

const emptyState = { staff: null, visits: [], log: [] };
let state = readState();


function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem("libraryVisitDesk")) || {};
    return {
      staff: saved.staff ?? null,
      visits: new Map((saved.visits || []).map((v) => [v.id, v])),
      log: saved.log || []
    };
  } catch {
    return { staff: null, visits: new Map(), log: [] };
  }
}


function saveState() {
  localStorage.setItem("libraryVisitDesk", JSON.stringify({ ...state, visits: [...state.visits.values()] }));
}
function normaliseId(value) {
  return String(value ?? "").replace(/\s+/g, "").toUpperCase();
}
function currentTime() { return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date()); }
function today() { return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date()); }

function nowISO() { return new Date().toISOString(); }

function formatTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(d);
} 
function goTo(page) { window.location.href = page; }

function showScanResult(result) {
  const panel = document.querySelector("#scan-result");
  if (!panel) return;
  const icon = document.querySelector("#scan-result-icon");
  icon.textContent = result.success ? "✓" : "!";
  icon.classList.toggle("error", !result.success);
  document.querySelector("#scan-result-eyebrow").textContent = result.eyebrow;
  document.querySelector("#scan-result-title").textContent = result.title;
  document.querySelector("#scan-result-message").textContent = result.message;
  panel.hidden = false;
  const input = document.querySelector("#visit-id");
  input.value = "";
  window.requestAnimationFrame(() => input.focus());
}

function addLog(action, visit, by) {
  state.log.push({
    time: nowISO(), action, id: visit.id, name: visit.name,
    staff: by || state.staff?.id || "Staff",
    checkinTime: visit.checkinTime, type: visit.type
  });
}


function forceCheckOut(id) {
  const visit = state.visits.get(id);
  if (!visit) return;
  if (!confirm(`Force check-out ${visit.name}?`)) return;
  state.visits.delete(id);
  addLog("Force checked out", visit);
  saveState();
  renderDashboard();
  renderActiveTable();
}


const CLOSING_HOUR = 20;


function manilaParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}


function isStale(visit) {
  const checkedIn = new Date(visit.checkinTime);
  if (isNaN(checkedIn)) return true; 
  const then = manilaParts(checkedIn);
  const now = manilaParts(new Date());
  if (now.day > then.day) return true; 
  return now.hour >= CLOSING_HOUR && then.hour < CLOSING_HOUR; 
}


function autoCloseVisits() {
  let closed = 0;
  for (const [id, visit] of state.visits) {
    if (isStale(visit)) {
      state.visits.delete(id);
      addLog("Auto checked out", visit, "SYSTEM");
      closed++;
    }
  }
  if (closed > 0) saveState();
  return closed;
}

function undoLastEntry() {
  const last = state.log[state.log.length - 1];

  if (!last || last.action.startsWith("Correction")) {
    showScanResult({
      success: false,
      eyebrow: "Nothing to undo",
      title: "No entry to undo",
      message: "There is no recent entry to reverse, or the last entry is already a correction."
    });
    return;
  }

  if (!confirm(`Undo "${last.action}" for ${last.name}?`)) return;

  const visit = { id: last.id, name: last.name, type: last.type, checkinTime: last.checkinTime || nowISO() };
  let label;

  if (last.action === "Checked in") {
    state.visits.delete(last.id);
    label = "Correction: check-in undone";
  } else {
    state.visits.set(last.id, visit);
    label = "Correction: check-out undone";
  }

  addLog(label, visit);
  delete lastScan[last.id];
  saveState();
  showScanResult({
    success: true,
    eyebrow: "Correction recorded",
    title: "Last entry undone",
    message: `${last.name}: "${last.action}" was reversed. The correction was added to Report / Logs.`
  });
}


function processVisit(id) {
  const person = patrons.get(id);

  if (!person) {
    showScanResult({
      success: false,
      eyebrow: "ID needs attention",
      title: "Unregistered ID",
      message: "This ID is not in the approved visitor directory. Follow your library's visitor-registration process rather than creating a record here."
    });
    return;
  }

  if (state.visits.has(id)) {
    const visit = state.visits.get(id);
    state.visits.delete(id);
    addLog("Checked out", visit);
    saveState();
    showScanResult({
      success: true,
      eyebrow: "Auto-detected: check-out",
      title: "Check-out recorded",
      message: `${visit.name} was checked out at ${formatTime(nowISO())}. The event was added to today's Report / Logs. Ready for the next scan.`
    });
    return;
  }

  const visit = { id, name: person.name, type: person.type, checkinTime: nowISO() };
  state.visits.set(id, visit);
  addLog("Checked in", visit);
  saveState();
  showScanResult({
    success: true,
    eyebrow: "Auto-detected: check-in",
    title: "Check-in recorded",
    message: `${visit.name} checked in at ${formatTime(visit.checkinTime)}. Their visit is now visible in the Currently-In List. Ready for the next scan.`
  });
}

function setupHeader() {
  const sessionLabel = document.querySelector("#session-label");
  const logoutButton = document.querySelector("#logout-button");
  if (sessionLabel && state.staff) {
    sessionLabel.textContent = `Signed in: ${state.staff.id}`;
    sessionLabel.hidden = false;
  }
  if (logoutButton && state.staff) {
    logoutButton.hidden = false;
    logoutButton.addEventListener("click", () => {
            state.staff = null;
      saveState();
      goTo("welcome.html");
    });
  }
}

function requireSession() {
  if (document.body.dataset.requiresSession === "true" && !state.staff) {
    goTo("login.html");
    return false;
  }
  return true;
}

function addRow(tbody, values) {
  const row = document.createElement("tr");
  values.forEach((value) => {
    const td = document.createElement("td");
    td.textContent = value;
    row.append(td);
  });
  tbody.append(row);
}

function renderDashboard() {
  const count = document.querySelector("#active-count");
  const date = document.querySelector("#dashboard-date");
  if (count) count.textContent = state.visits.size;
  if (date) date.textContent = today();
}

// Render the Currently-In List. One pass over the Map: O(v) for v active visits.
function renderActiveTable() {
  const tbody = document.querySelector("#active-table-body");
  const empty = document.querySelector("#active-empty");
  const description = document.querySelector("#active-description");
  if (!tbody) return;
  tbody.innerHTML = "";
  state.visits.forEach((visit) => {
    addRow(tbody, [visit.id, visit.name, formatTime(visit.checkinTime)]);

    const td = document.createElement("td");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "button button-secondary";
    btn.textContent = "Force check-out";
    btn.addEventListener("click", () => forceCheckOut(visit.id));
    td.append(btn);
    tbody.lastElementChild.append(td);
  });
  const count = state.visits.size;
  empty.hidden = count !== 0;
  description.textContent = `${count} active ${count === 1 ? "visitor" : "visitors"}. Check out through the Scan ID page.`;
}

function renderLogTable() {
  const tbody = document.querySelector("#log-table-body");
  const empty = document.querySelector("#logs-empty");
  if (!tbody) return;
  tbody.innerHTML = "";
      [...state.log].reverse().forEach((e) => addRow(tbody, [formatTime(e.time), e.action, e.id, e.name, e.staff]));
  empty.hidden = state.log.length !== 0;
}

function setupLogin() {
  const form = document.querySelector("#login-form");
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const staffId = normaliseId(data.get("staffId"));
    const password = data.get("password");
    const error = document.querySelector("#login-error");
    if (!staffId || password.length < 4) {
      error.hidden = false;
      return;
    }
    state.staff = { id: staffId, role: data.get("role") };
    saveState();
    goTo("dashboard.html");
  });
}

const lastScan = {};
const SCAN_COOLDOWN_MS = 3000;

function setupScan() {
  const form = document.querySelector("#scan-form");
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const error = document.querySelector("#scan-error");
    const result = document.querySelector("#scan-result");
    error.hidden = true;
    result.hidden = true;

    const id = normaliseId(new FormData(form).get("visitorId"));
    if (!id) { error.hidden = false; return; }

    const now = Date.now();
    if (lastScan[id] && now - lastScan[id] < SCAN_COOLDOWN_MS) {
      showScanResult({
        success: false,
        eyebrow: "Duplicate scan",
        title: "Scanned too quickly",
        message: "This ID was just processed. Wait a few seconds before scanning it again."
      });
      return;
    }
    lastScan[id] = now;
    processVisit(id);
  });
}


function setupUndo() {
  const button = document.querySelector("#undo-button");
  if (!button) return;
  button.addEventListener("click", () => {
    document.querySelector("#scan-error").hidden = true;
    undoLastEntry();
  });
}

if (requireSession()) {
  setupHeader();
  setupLogin();
  setupScan();
  setupUndo();
  autoCloseVisits();
  renderDashboard();
  renderActiveTable();
  renderLogTable();

  setInterval(() => {
    if (autoCloseVisits() > 0) {
      renderDashboard();
      renderActiveTable();
      renderLogTable();
    }
  }, 60000);
}
