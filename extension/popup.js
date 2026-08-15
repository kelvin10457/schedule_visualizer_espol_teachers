const SEARCH_URL = "https://www.academico.espol.edu.ec/UI/Registros/horariosplanificados.aspx";
const APP_SCHEDULE_URL = chrome.runtime.getURL("app/index.html#/show-schedule");
const APP_CONFIG_URL = chrome.runtime.getURL("app/index.html#/config");

const els = {
  notice: document.getElementById("notice"),
  form: document.getElementById("scrape-form"),
  year: document.getElementById("year"),
  term: document.getElementById("term"),
  codes: document.getElementById("codes"),
  btnStart: document.getElementById("btn-start"),
  btnView: document.getElementById("btn-view"),
  btnConfig: document.getElementById("btn-config"),
  status: document.getElementById("status"),
  statusLabel: document.getElementById("status-label"),
  statusCount: document.getElementById("status-count"),
  log: document.getElementById("log"),
};

function parseCodesInput(text) {
  const codes = [];
  const re = /^([A-Za-z]+)\s*(\d+)(?:\s*-\s*(\d+))?$/;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    const prefix = m[1].toLowerCase();
    const start = m[2];
    const end = m[3];
    if (end) {
      const startNum = parseInt(start, 10);
      const endNum = parseInt(end, 10);
      const width = start.length;
      for (let n = startNum; n <= endNum; n++) {
        codes.push(prefix + String(n).padStart(width, "0"));
      }
    } else {
      codes.push(prefix + start);
    }
  }
  return codes;
}

function saveFormValues() {
  chrome.storage.local.set({
    lastForm: {
      year: els.year.value,
      term: els.term.value,
      codes: els.codes.value,
    },
  });
}

function restoreFormValues() {
  chrome.storage.local.get(["lastForm"], (res) => {
    const saved = res.lastForm;
    els.year.value = saved?.year || String(new Date().getFullYear());
    els.term.value = saved?.term || "2";
    els.codes.value = saved?.codes || "";
  });
}

let cachedOnSearchPage = false;
let cachedRunning = false;

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function updateStartButtonState() {
  if (cachedRunning) {
    els.btnStart.disabled = true;
    els.btnStart.textContent = "Extracción en curso...";
  } else {
    els.btnStart.disabled = !cachedOnSearchPage;
    els.btnStart.textContent = "Iniciar extracción";
  }
}

async function checkActiveTab() {
  const tab = await getActiveTab();
  const onSearchPage = !!tab?.url && tab.url.startsWith(SEARCH_URL);
  cachedOnSearchPage = onSearchPage;

  if (!onSearchPage) {
    els.notice.style.display = "block";
    els.notice.innerHTML =
      "Abre primero la página de horarios planificados de ESPOL e inicia sesión. " +
      "Esta extensión reutiliza esa sesión — no debes escribir tu contraseña aquí." +
      '<button id="btn-open-espol">Abrir la página de ESPOL</button>';
    document.getElementById("btn-open-espol").addEventListener("click", () => {
      chrome.tabs.create({ url: SEARCH_URL });
      window.close();
    });
  } else {
    els.notice.style.display = "none";
  }
  updateStartButtonState();
  return onSearchPage;
}

function renderStatus(status) {
  cachedRunning = !!status?.running;
  updateStartButtonState();

  if (!status || (!status.running && !status.done && !status.error && !(status.log || []).length)) {
    els.status.style.display = "none";
    return;
  }
  els.status.style.display = "block";

  if (status.running) {
    els.statusLabel.textContent = status.current ? `Extrayendo ${status.current}...` : "Extrayendo...";
    els.statusCount.textContent =
      status.total ? `${status.doneCount ?? 0}/${status.total}` : "";
  } else if (status.error) {
    els.statusLabel.textContent = "Error";
    els.statusCount.textContent = "";
  } else if (status.done) {
    els.statusLabel.textContent = "Completado ✅";
    els.statusCount.textContent = "";
  } else {
    els.statusLabel.textContent = "Estado";
    els.statusCount.textContent = "";
  }

  const log = status.log || [];
  els.log.innerHTML = log.map((line) => `<div>${escapeHtml(line)}</div>`).join("");
  els.log.scrollTop = els.log.scrollHeight;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

async function refreshStatus() {
  chrome.storage.local.get(["scrapeStatus"], (res) => renderStatus(res.scrapeStatus));
}

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const codes = parseCodesInput(els.codes.value);
  if (codes.length === 0) {
    alert("Ingresa al menos una materia válida, por ejemplo: ELEG 1028-1052");
    return;
  }
  saveFormValues();

  const tab = await getActiveTab();
  const onSearchPage = await checkActiveTab();
  if (!onSearchPage || !tab) return;

  const payload = {
    year: parseInt(els.year.value, 10),
    term: parseInt(els.term.value, 10),
    codes,
  };

  chrome.tabs.sendMessage(tab.id, { type: "START_SCRAPE", payload }, (resp) => {
    if (chrome.runtime.lastError || !resp) {
      alert("No se pudo iniciar la extracción. Recarga la página de ESPOL e inténtalo de nuevo.");
      return;
    }
    if (!resp.ok) {
      if (resp.reason === "already_running") {
        alert("Ya hay una extracción en curso. Espera a que termine (mira el estado abajo) antes de iniciar otra.");
      } else {
        alert("No se pudo iniciar la extracción. Recarga la página de ESPOL e inténtalo de nuevo.");
      }
    }
    refreshStatus();
  });
});

els.btnView.addEventListener("click", () => {
  chrome.tabs.create({ url: APP_SCHEDULE_URL });
});

els.btnConfig.addEventListener("click", () => {
  chrome.tabs.create({ url: APP_CONFIG_URL });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.scrapeStatus) {
    renderStatus(changes.scrapeStatus.newValue);
  }
});

restoreFormValues();
checkActiveTab();
refreshStatus();
