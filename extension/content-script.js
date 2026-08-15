// Content script inyectado en https://www.academico.espol.edu.ec/UI/Registros/*
// Reimplementa la lógica de scrappingAcademicPlatform/main.py usando el DOM real de la
// página (en vez de Playwright). El botón "Buscar" hace un postback clásico de ASP.NET
// (recarga completa de la página), así que el progreso se guarda en chrome.storage.local
// y se retoma en cada carga del content script — igual que main.py hace page.goto() entre
// materias, pero adaptado a que aquí el script se reinyecta desde cero en cada recarga.
// Las páginas de detalle de cada paralelo sí se leen con fetch()+DOMParser (sin navegar),
// porque el captcha en main.py solo se comprueba alrededor del formulario de búsqueda.

(function () {
  if (window.__espolScraperInjected) return;
  window.__espolScraperInjected = true;

  const SEARCH_URL =
    "https://www.academico.espol.edu.ec/UI/Registros/horariosplanificados.aspx";
  const DETAIL_BASE = "https://www.academico.espol.edu.ec/UI/Registros/";
  const JOB_KEY = "espolScrapeJob";

  const SEL = {
    yearInput: "#ctl00_contenido_txtAnio",
    consultButton: "#ctl00_contenido_btnConsultar",
    codeClickable: "#ctl00_contenido_RBList_1",
    codeInput: "#ctl00_contenido_codigoMateria",
    searchButton: "#ctl00_contenido_Button2",
    linksToClasses: ".myLink",
    errorMessage: "#ctl00_contenido_LabelError",
    // detalle de paralelo
    subjectName: "#ctl00_contenido_LabelNombreMateria",
    subjectParallel: "#ctl00_contenido_LabelParalelo",
    teacherName: "#ctl00_contenido_LabelProfesor",
    permittedStudents: "#ctl00_contenido_LabelCupo",
    availableSpaces: "#ctl00_contenido_LabelDisponible",
    dateFirstExam: "#ctl00_contenido_LabelParcial",
    dateSecondExam: "#ctl00_contenido_LabelFinal",
    dateThirdExam: "#ctl00_contenido_LabelMejora",
    aulaFirstExam: "#ctl00_contenido_aulaParcial",
    aulaSecondExam: "#ctl00_contenido_aulaFinal",
    aulaThirdExam: "#ctl00_contenido_aulaMej",
    theoryTable: "#ctl00_contenido_TableHorarios",
  };

  function termSelector(term) {
    if (term === 1) return "#ctl00_contenido_listab_1";
    if (term === 2) return "#ctl00_contenido_listab_2";
    return "#ctl00_contenido_listab_0"; // vacacional / cualquier otro valor
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null;
  }

  async function waitForVisible(selector, timeout) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = document.querySelector(selector);
      if (isVisible(el)) return el;
      await sleep(120);
    }
    return null;
  }

  // ── detección de captcha (mismos selectores que page_has_captcha en main.py) ──────────
  const CAPTCHA_SELECTORS = [
    'iframe[src*="recaptcha"]',
    'iframe[src*="captcha"]',
    'iframe[src*="hcaptcha"]',
    ".g-recaptcha",
    "#g-recaptcha",
    ".h-captcha",
    "div[data-sitekey]",
    'input[id*="captcha"]',
    'div[id*="captcha"]',
    'img[src*="captcha"]',
  ];

  function hasCaptcha() {
    if (CAPTCHA_SELECTORS.some((sel) => document.querySelector(sel))) return true;
    const bodyText = (document.body && document.body.innerText) || "";
    return /captcha/i.test(bodyText);
  }

  let captchaContinueResolver = null;

  function showCaptchaBanner() {
    if (document.getElementById("espol-captcha-banner")) return;
    const div = document.createElement("div");
    div.id = "espol-captcha-banner";
    div.style.cssText =
      "position:fixed;top:16px;right:16px;z-index:2147483647;background:#302b63;" +
      "color:#fff;padding:14px 18px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.45);" +
      "font-family:'Inter','Segoe UI',sans-serif;font-size:13px;max-width:300px;line-height:1.4;";
    div.innerHTML =
      "🔒 Se detectó un captcha.<br>Resuélvelo en esta página y luego haz clic en Continuar." +
      '<br><button id="espol-captcha-continue" style="margin-top:10px;padding:6px 14px;border:none;' +
      "border-radius:6px;background:#6366f1;color:#fff;cursor:pointer;font-size:13px;font-weight:600;\">Continuar</button>";
    document.body.appendChild(div);
    document
      .getElementById("espol-captcha-continue")
      .addEventListener("click", () => captchaContinueResolver && captchaContinueResolver());
  }

  function hideCaptchaBanner() {
    const el = document.getElementById("espol-captcha-banner");
    if (el) el.remove();
  }

  // Se resuelve cuando el captcha desaparece solo o cuando el usuario hace clic en "Continuar".
  async function waitForCaptchaResolved() {
    showCaptchaBanner();
    await new Promise((resolve) => {
      captchaContinueResolver = resolve;
      const interval = setInterval(() => {
        if (!hasCaptcha()) {
          clearInterval(interval);
          resolve();
        }
      }, 1000);
    });
    captchaContinueResolver = null;
    hideCaptchaBanner();
  }

  // ── estado / progreso, leído por popup.js vía chrome.storage ──────────────────────────
  function setStatus(patch) {
    return new Promise((resolve) => {
      chrome.storage.local.get(["scrapeStatus"], (res) => {
        const merged = { ...(res.scrapeStatus || {}), ...patch };
        chrome.storage.local.set({ scrapeStatus: merged }, () => resolve(merged));
      });
    });
  }

  function log(message) {
    console.log("[ESPOL Horarios]", message);
    return new Promise((resolve) => {
      chrome.storage.local.get(["scrapeStatus"], (res) => {
        const status = res.scrapeStatus || { log: [] };
        const entry = `${new Date().toLocaleTimeString()} — ${message}`;
        const nextLog = [...(status.log || []), entry].slice(-300);
        const merged = { ...status, log: nextLog };
        chrome.storage.local.set({ scrapeStatus: merged }, () => resolve(merged));
      });
    });
  }

  // ── estado del trabajo de scraping, sobrevive a la recarga que hace "Buscar" ──────────
  function getJob() {
    return new Promise((resolve) => {
      chrome.storage.local.get([JOB_KEY], (res) => resolve(res[JOB_KEY] || null));
    });
  }

  function saveJob(job) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [JOB_KEY]: job }, () => resolve());
    });
  }

  function clearJob() {
    return new Promise((resolve) => chrome.storage.local.remove([JOB_KEY], resolve));
  }

  // Escribe carácter por carácter simulando tecleo real (keydown/keypress/input/keyup por
  // cada letra). Un solo `el.value = texto` de golpe no dispara eventos por carácter, y si
  // el campo tiene alguna máscara/validación propia del sitio esperando eventos de teclado,
  // puede quedarse solo con el primer carácter. Esto es compatible con ese tipo de campos.
  async function typeIntoField(el, text) {
    el.focus();
    el.value = "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    for (const ch of text) {
      el.value += ch;
      el.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keypress", { key: ch, bubbles: true }));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
      await sleep(20);
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
  }

  // ── llenar el formulario de búsqueda (año, término, radio "por código") ───────────────
  async function fillSearchForm(year, term) {
    const yearInput = document.querySelector(SEL.yearInput);
    if (yearInput) {
      await typeIntoField(yearInput, String(year));
    }
    document.querySelector(termSelector(term))?.click();
    document.querySelector(SEL.consultButton)?.click();
  }

  // Port de fill_info_specific_subject: llena el form, espera a que el campo de código se
  // habilite (reintentando ante captcha) y escribe el código. Un solo intento; los
  // reintentos entre recargas los maneja startSearchForCode con job.attempt.
  async function fillInfoSpecificSubject(code, year, term) {
    await fillSearchForm(year, term);
    await sleep(300);
    document.querySelector(SEL.codeClickable)?.click();

    for (let i = 0; i < 30; i++) {
      if (hasCaptcha()) {
        await log("Captcha detectado, esperando a que lo resuelvas...");
        await waitForCaptchaResolved();
        await log("Captcha resuelto, reintentando la búsqueda...");
        await fillSearchForm(year, term);
        await sleep(300);
        document.querySelector(SEL.codeClickable)?.click();
        i = 0;
        continue;
      }
      const codeInput = document.querySelector(SEL.codeInput);
      if (codeInput && !codeInput.disabled) {
        await typeIntoField(codeInput, code);
        const finalValue = codeInput.value;
        if (finalValue.toLowerCase() === code.toLowerCase()) return true;
        await log(`${code}: el campo de código quedó con "${finalValue}" en vez de "${code}".`);
        return false;
      }
      await sleep(500);
    }
    return false;
  }

  // ── leer cada página de detalle vía fetch (misma sesión, sin navegar) ─────────────────
  async function fetchDetailDoc(url) {
    const res = await fetch(url, { credentials: "include" });
    const html = await res.text();
    return new DOMParser().parseFromString(html, "text/html");
  }

  function text(doc, selector) {
    return doc.querySelector(selector)?.textContent?.trim() ?? "";
  }

  // Port de scrap(): extrae teoría + todos los prácticos de una página de detalle.
  function scrapeDetailDoc(doc, code, results, visited) {
    const materia = text(doc, SEL.subjectName);
    const paralelo = text(doc, SEL.subjectParallel);
    const profesor = text(doc, SEL.teacherName);
    const cupoMax = text(doc, SEL.permittedStudents);
    const cupoDisp = text(doc, SEL.availableSpaces);
    const exParcial = text(doc, SEL.dateFirstExam);
    const exFinal = text(doc, SEL.dateSecondExam);
    const exMejora = text(doc, SEL.dateThirdExam);
    const aulaParcial = text(doc, SEL.aulaFirstExam);
    const aulaFinal = text(doc, SEL.aulaSecondExam);
    const aulaMejora = text(doc, SEL.aulaThirdExam);
    const paralelosAsociados = Array.from(doc.querySelectorAll("a.mostrar")).map((a) =>
      a.textContent.trim()
    );

    const uniqueId = `${code}-${paralelo}`;
    if (visited.has(uniqueId)) return;
    visited.add(uniqueId);

    const theoryRows = doc.querySelectorAll(`${SEL.theoryTable} tbody tr`);
    theoryRows.forEach((row) => {
      const cells = Array.from(row.querySelectorAll("td")).map((td) => td.textContent.trim());
      if (cells.length >= 4) {
        results.push({
          "Codigo Materia": code.toUpperCase(),
          Materia: materia,
          Tipo: "Teoria",
          Paralelo: paralelo,
          Profesor: profesor,
          "Cupo Maximo": cupoMax,
          "Cupo Disponible": cupoDisp,
          "Planificada Quincenalmente": "no",
          "Examen Parcial": exParcial,
          "Aula Examen Parcial": aulaParcial,
          "Examen Final": exFinal,
          "Aula Examen Final": aulaFinal,
          Mejoramiento: exMejora,
          "Aula Mejoramiento": aulaMejora,
          "Paralelos Asociados": paralelosAsociados.join(", "),
          Dia: cells[0],
          "Hora Inicio": cells[1],
          "Hora Fin": cells[2],
          Aula: cells[3],
          Bloque: cells[4] ?? "",
        });
      }
    });

    const practiceDivs = doc.querySelectorAll("div.tabla_horario");
    practiceDivs.forEach((div) => {
      const firstTable = div.querySelector("table");
      const tds = firstTable
        ? Array.from(firstTable.querySelectorAll("td")).map((td) => td.textContent.trim())
        : [];

      let practTeacher = "";
      let practParallel = "";
      let practPlan = "no";
      let practCap = "";
      let practDisp = "";

      for (const t of tds) {
        if (t.includes("Profesor:")) practTeacher = t.replace("Profesor:", "").trim();
        else if (t.includes("Paralelo::") || t.includes("Paralelo:"))
          practParallel = t.replace("Paralelo::", "").replace("Paralelo:", "").trim();
        else if (t.includes("Capacidad:")) practCap = t.replace("Capacidad:", "").trim();
        else if (t.includes("Cupo disponible:")) practDisp = t.replace("Cupo disponible:", "").trim();
      }
      for (let idx = 0; idx < tds.length; idx++) {
        if (tds[idx].includes("Planificada quincenalmente:") && idx + 1 < tds.length) {
          practPlan = tds[idx + 1].trim();
          break;
        }
      }

      const practUniqueId = `${code}-${practParallel}`;
      if (visited.has(practUniqueId)) return;
      visited.add(practUniqueId);

      const practRows = div.querySelectorAll("table.display tbody tr");
      practRows.forEach((row) => {
        const cells = Array.from(row.querySelectorAll("td")).map((td) => td.textContent.trim());
        if (cells.length >= 4) {
          results.push({
            "Codigo Materia": code.toUpperCase(),
            Materia: materia,
            Tipo: "Practico",
            Paralelo: practParallel,
            Profesor: practTeacher,
            "Cupo Maximo": practCap,
            "Cupo Disponible": practDisp,
            "Planificada Quincenalmente": practPlan,
            "Examen Parcial": exParcial,
            "Aula Examen Parcial": aulaParcial,
            "Examen Final": exFinal,
            "Aula Examen Final": aulaFinal,
            Mejoramiento: exMejora,
            "Aula Mejoramiento": aulaMejora,
            "Paralelos Asociados": paralelosAsociados.join(", "),
            Dia: cells[0],
            "Hora Inicio": cells[1],
            "Hora Fin": cells[2],
            Aula: cells[3],
            Bloque: cells[4] ?? "",
          });
        }
      });
    });
  }

  function triggerCsvDownload(cleanedRows) {
    const csv = toCsv(cleanedRows);
    if (!csv) return;
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\..+/, "")
      .replace("T", "_");
    // BOM al inicio (﻿) para que Excel detecte UTF-8 y no rompa acentos/Ñ,
    // igual que hacía main.py al exportar con encoding="utf-8-sig".
    const dataUrl = "data:text/csv;charset=utf-8," + encodeURIComponent("﻿" + csv);
    chrome.runtime.sendMessage({
      type: "DOWNLOAD_CSV",
      dataUrl,
      filename: `subjects_${timestamp}.csv`,
    });
  }

  // ── orquestador: retoma el trabajo guardado en cada carga del content script ──────────

  // Llena el formulario para job.currentCode y hace clic en Buscar. Si eso dispara un
  // postback completo (recarga), esta función queda cortada ahí mismo — está bien, el
  // estado ya se guardó antes del clic y boot() lo retoma en la página siguiente. Si en
  // cambio la página NO navega (actualización en el mismo documento), seguimos nosotros
  // mismos con handleSearchResult tras una breve espera.
  async function startSearchForCode(job) {
    await setStatus({ current: job.currentCode, doneCount: job.doneCount || 0, total: job.totalCodes });
    await log(`Buscando ${job.currentCode} (intento ${(job.attempt || 0) + 1})...`);

    const enabled = await fillInfoSpecificSubject(job.currentCode, job.year, job.term);
    if (!enabled) {
      job.attempt = (job.attempt || 0) + 1;
      if (job.attempt >= 3) {
        await log(`${job.currentCode}: no se pudo cargar tras 3 intentos, se omite.`);
        job.doneCount = (job.doneCount || 0) + 1;
        job.currentCode = null;
        job.phase = "need_search";
      }
      await saveJob(job);
      location.reload();
      return;
    }

    job.phase = "awaiting_search_result";
    await saveJob(job);
    document.querySelector(SEL.searchButton)?.click();

    // Si seguimos vivos tras un momento, es que no hubo navegación — continuamos aquí.
    await sleep(2500);
    const stillJob = await getJob();
    if (stillJob && stillJob.phase === "awaiting_search_result" && stillJob.currentCode === job.currentCode) {
      await handleSearchResult(stillJob);
    }
  }

  // Corre justo después de que aparecen los resultados de "Buscar" (con o sin recarga de
  // por medio). Port de get_parallels_specific_subject + el bucle de scrap() de main.py.
  async function handleSearchResult(job) {
    if (hasCaptcha()) {
      await log("Captcha detectado al buscar paralelos, esperando a que lo resuelvas...");
      await waitForCaptchaResolved();
    }

    const error = await waitForVisible(SEL.errorMessage, 1500);
    let hrefs = [];
    if (!error) {
      const firstLink = await waitForVisible(SEL.linksToClasses, 3000);
      if (firstLink) {
        hrefs = Array.from(document.querySelectorAll(SEL.linksToClasses))
          .map((a) => a.getAttribute("href"))
          .filter(Boolean);
      }
    }

    if (hrefs.length === 0) {
      await log(`${job.currentCode}: no existen datos.`);
    } else {
      await log(`${job.currentCode}: ${hrefs.length} paralelo(s) encontrados, extrayendo...`);
      const visited = new Set(job.visited);
      for (const href of hrefs) {
        const fullUrl = DETAIL_BASE + href;
        try {
          const doc = await fetchDetailDoc(fullUrl);
          scrapeDetailDoc(doc, job.currentCode, job.results, visited);
        } catch (e) {
          await log(`${job.currentCode}: error leyendo un paralelo (${e.message}).`);
        }
      }
      job.visited = Array.from(visited);
    }

    job.doneCount = (job.doneCount || 0) + 1;
    job.currentCode = null;
    job.attempt = 0;
    job.phase = "need_search";
    await saveJob(job);
    location.href = SEARCH_URL;
  }

  async function finishJob(job) {
    await log(`Extracción completa: ${job.results.length} filas.`);
    const malla = await getMallaCurricular();
    const cleaned = cleanRows(job.results, malla);

    await chrome.storage.local.set({ scrapedSubjects: cleaned });
    triggerCsvDownload(cleaned);
    chrome.runtime.sendMessage({ type: "OPEN_RESULTS" });

    await setStatus({ running: false, done: true, current: null, doneCount: job.totalCodes });
    await clearJob();
  }

  async function boot() {
    const job = await getJob();
    if (!job || job.status !== "running") return;

    if (job.phase === "awaiting_search_result") {
      await handleSearchResult(job);
      return;
    }

    if (!job.currentCode) {
      if (job.codesQueue.length === 0) {
        await finishJob(job);
        return;
      }
      job.currentCode = job.codesQueue.shift();
      job.attempt = 0;
      job.phase = "need_search";
      await saveJob(job);
    }

    await startSearchForCode(job);
  }

  async function safeBoot() {
    try {
      await boot();
    } catch (e) {
      await log(`Error inesperado: ${e.message}`);
      await setStatus({ running: false, error: String(e.message) });
      await clearJob();
    }
  }

  async function handleStartMessage({ year, term, codes }) {
    const existing = await getJob();
    if (existing && existing.status === "running") {
      await log("Ya hay una extracción en curso — espera a que termine antes de iniciar otra.");
      return { ok: false, reason: "already_running" };
    }

    await setStatus({
      running: true,
      done: false,
      error: null,
      log: [],
      current: null,
      doneCount: 0,
      total: codes.length,
    });
    await log(`Iniciando extracción de ${codes.length} materia(s) — año ${year}, término ${term}.`);

    const job = {
      status: "running",
      year,
      term,
      codesQueue: [...codes],
      currentCode: null,
      phase: "need_search",
      attempt: 0,
      doneCount: 0,
      totalCodes: codes.length,
      results: [],
      visited: [],
    };
    await saveJob(job);
    await safeBoot();
    return { ok: true };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "START_SCRAPE") {
      handleStartMessage(msg.payload).then((result) => sendResponse(result));
      return true; // mantiene el canal abierto para la respuesta async
    }
  });

  // Al cargar (primera vez o tras el postback de "Buscar"), retoma cualquier trabajo activo.
  safeBoot();
})();
