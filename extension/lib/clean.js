// Port de scrappingAcademicPlatform/utils/data_cleaning.py a JS puro (sin pandas).
// Recibe las filas crudas tal como las arma content-script.js (mismas claves en español
// que usaba main.py) y devuelve filas con exactamente los campos de src/models/Subject.ts.

function normalizeTime(value) {
  const t = (value || "").trim();
  if (!t) return "";
  // El sitio entrega "HH:MM:SS"; por si acaso llega sin segundos, se completan.
  return /^\d{2}:\d{2}$/.test(t) ? `${t}:00` : t;
}

// "18/11/2026 - 14:00 A 16:00" -> { fecha, inicio, fin }
function splitExam(raw) {
  const value = (raw || "").trim();
  if (!value || value === "NAN" || value === "NONE") {
    return { fecha: "", inicio: "", fin: "" };
  }
  const [fechaPart, horaPart] = value.split(" - ");
  if (!horaPart) {
    return { fecha: (fechaPart || "").trim(), inicio: "", fin: "" };
  }
  const [inicio, fin] = horaPart.split(" A ");
  return {
    fecha: (fechaPart || "").trim(),
    inicio: (inicio || "").trim(),
    fin: (fin || "").trim(),
  };
}

function toUpperTrim(v) {
  return typeof v === "string" ? v.trim().toUpperCase() : v;
}

// rawRows: array de objetos con claves "Codigo Materia", "Materia", "Tipo", ... (ver content-script.js)
// mallaCurricular: objeto { CODIGO: "NIVEL ..." }
function cleanRows(rawRows, mallaCurricular) {
  return rawRows.map((row) => {
    const up = {};
    for (const key of Object.keys(row)) up[key] = toUpperTrim(row[key]);

    const parcial = splitExam(up["Examen Parcial"]);
    const final_ = splitExam(up["Examen Final"]);
    const mejoramiento = splitExam(up["Mejoramiento"]);

    const codigo = up["Codigo Materia"] || "";
    const nivel = mallaCurricular[codigo] || "SIN NIVEL";

    return {
      codigo_materia: codigo,
      materia: up["Materia"] || "",
      tipo: up["Tipo"] || "",
      paralelo: Number(up["Paralelo"]) || 0,
      profesor: up["Profesor"] || "",
      cupo_maximo: Number(up["Cupo Maximo"]) || 0,
      cupo_disponible: Number(up["Cupo Disponible"]) || 0,
      planificada_quincenalmente: up["Planificada Quincenalmente"] || "",
      aula_examen_parcial: up["Aula Examen Parcial"] || "",
      aula_examen_final: up["Aula Examen Final"] || "",
      aula_mejoramiento: up["Aula Mejoramiento"] || "",
      paralelos_asociados: up["Paralelos Asociados"] || "",
      dia: up["Dia"] || "",
      hora_inicio: normalizeTime(up["Hora Inicio"]),
      hora_fin: normalizeTime(up["Hora Fin"]),
      aula: up["Aula"] || "",
      bloque: up["Bloque"] || "",
      fecha_examen_parcial: parcial.fecha,
      inicio_examen_parcial: parcial.inicio,
      fin_examen_parcial: parcial.fin,
      fecha_examen_final: final_.fecha,
      inicio_examen_final: final_.inicio,
      fin_examen_final: final_.fin,
      fecha_examen_mejoramiento: mejoramiento.fecha,
      inicio_examen_mejoramiento: mejoramiento.inicio,
      fin_examen_mejoramiento: mejoramiento.fin,
      nivel,
    };
  });
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n");
}
