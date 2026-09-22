import { useEffect, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Subject from "../models/Subject";
import { getStorageItem, setStorageItem } from "../lib/storage";
import SearchableSelect from "../components/SearchableSelect";
import { timeToMinutes } from "../lib/time";
import { CURRENT_SUBJECTS_KEY, SCRAPED_SUBJECTS_KEY } from "../lib/constants";
import { findProfessorConflicts } from "../lib/conflicts";
import { tooltipPosition } from "../lib/tooltip";

interface LocationState {
    file?: File;
    profesor?: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function parseCSV(text: string): Subject[] {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map((h) => h.trim());

    const rows: Subject[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        // Handle quoted fields (e.g. "101, 102, 103")
        const values: string[] = [];
        let current = "";
        let inQuotes = false;
        for (const char of line) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === "," && !inQuotes) {
                values.push(current.trim());
                current = "";
            } else {
                current += char;
            }
        }
        values.push(current.trim());

        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => {
            obj[h] = values[idx] ?? "";
        });

        const s = new Subject();
        s.codigo_materia = obj.codigo_materia ?? "";
        s.materia = obj.materia ?? "";
        s.tipo = obj.tipo ?? "";
        s.paralelo = Number(obj.paralelo) || 0;
        s.profesor = obj.profesor ?? "";
        s.cupo_maximo = Number(obj.cupo_maximo) || 0;
        s.cupo_disponible = Number(obj.cupo_disponible) || 0;
        s.planificada_quincenalmente = obj.planificada_quincenalmente ?? "";
        s.aula_examen_parcial = obj.aula_examen_parcial ?? "";
        s.aula_examen_final = obj.aula_examen_final ?? "";
        s.aula_mejoramiento = obj.aula_mejoramiento ?? "";
        s.paralelos_asociados = obj.paralelos_asociados ?? "";
        s.dia = obj.dia ?? "";
        s.hora_inicio = obj.hora_inicio ?? "";
        s.hora_fin = obj.hora_fin ?? "";
        s.aula = obj.aula ?? "";
        s.bloque = obj.bloque ?? "";
        s.fecha_examen_parcial = obj.fecha_examen_parcial ?? "";
        s.inicio_examen_parcial = obj.inicio_examen_parcial ?? "";
        s.fin_examen_parcial = obj.fin_examen_parcial ?? "";
        s.fecha_examen_final = obj.fecha_examen_final ?? "";
        s.inicio_examen_final = obj.inicio_examen_final ?? "";
        s.fin_examen_final = obj.fin_examen_final ?? "";
        s.fecha_examen_mejoramiento = obj.fecha_examen_mejoramiento ?? "";
        s.inicio_examen_mejoramiento = obj.inicio_examen_mejoramiento ?? "";
        s.fin_examen_mejoramiento = obj.fin_examen_mejoramiento ?? "";
        s.nivel = obj.nivel ?? "";

        rows.push(s);
    }

    return rows;
}

const DAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const DAY_KEYS = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES"];

// 30-minute slot grid from 07:00 → 22:00
const GRID_START = 7 * 60; // 420 minutes
const GRID_END = 22 * 60; // 1320 minutes
const SLOT_MINUTES = 30;
const TOTAL_SLOTS = (GRID_END - GRID_START) / SLOT_MINUTES; // 30 slots

function minutesToSlotIndex(m: number) {
    return (m - GRID_START) / SLOT_MINUTES;
}

// Vibrant, distinct color palette for professors
const PROFESSOR_COLORS = [
    { bg: "rgba(99,102,241,0.85)", border: "#6366f1", light: "rgba(99,102,241,0.18)" },
    { bg: "rgba(236,72,153,0.85)", border: "#ec4899", light: "rgba(236,72,153,0.18)" },
    { bg: "rgba(16,185,129,0.85)", border: "#10b981", light: "rgba(16,185,129,0.18)" },
    { bg: "rgba(245,158,11,0.85)", border: "#f59e0b", light: "rgba(245,158,11,0.18)" },
    { bg: "rgba(59,130,246,0.85)", border: "#3b82f6", light: "rgba(59,130,246,0.18)" },
    { bg: "rgba(239,68,68,0.85)", border: "#ef4444", light: "rgba(239,68,68,0.18)" },
    { bg: "rgba(168,85,247,0.85)", border: "#a855f7", light: "rgba(168,85,247,0.18)" },
    { bg: "rgba(20,184,166,0.85)", border: "#14b8a6", light: "rgba(20,184,166,0.18)" },
    { bg: "rgba(249,115,22,0.85)", border: "#f97316", light: "rgba(249,115,22,0.18)" },
    { bg: "rgba(6,182,212,0.85)", border: "#06b6d4", light: "rgba(6,182,212,0.18)" },
    { bg: "rgba(132,204,22,0.85)", border: "#84cc16", light: "rgba(132,204,22,0.18)" },
    { bg: "rgba(251,113,133,0.85)", border: "#fb7185", light: "rgba(251,113,133,0.18)" },
];

// ── component ─────────────────────────────────────────────────────────────────

interface TooltipInfo {
    subject: Subject;
    x: number;
    y: number;
}

export default function Schedule() {
    const navigate = useNavigate();
    const location = useLocation();
    const state = location.state as LocationState | null;
    const file = state?.file;

    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [source, setSource] = useState<"extension" | "file" | "saved" | null>(null);
    const [filterProfesor, setFilterProfesor] = useState<string>(state?.profesor ?? "ALL");
    const [filterNivel, setFilterNivel] = useState<string>("ALL");
    const [filterTipo, setFilterTipo] = useState<string>("ALL");
    const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

    useEffect(() => {
        let cancelled = false;

        // Si la extensión acaba de extraer datos, ya están listos en storage — no
        // dependemos de ningún archivo ni servidor.
        getStorageItem<Subject[] | null>(SCRAPED_SUBJECTS_KEY, null).then((stored) => {
            if (cancelled) return;
            if (stored && stored.length > 0) {
                setSubjects(stored);
                setSource("extension");
                setStorageItem(CURRENT_SUBJECTS_KEY, stored);
                return;
            }

            if (!file) {
                // Sin archivo nuevo (p. ej. al volver desde Cruces): reusar el último
                // horario cargado en vez de mandar al usuario a subirlo otra vez.
                getStorageItem<Subject[]>(CURRENT_SUBJECTS_KEY, []).then((current) => {
                    if (cancelled) return;
                    if (current.length === 0) {
                        navigate("/");
                        return;
                    }
                    setSubjects(current);
                    setSource("saved");
                });
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target?.result as string;
                const parsed = parseCSV(text);
                setSubjects(parsed);
                setSource("file");
                setStorageItem(CURRENT_SUBJECTS_KEY, parsed);
            };
            reader.readAsText(file, "UTF-8");
        });

        return () => {
            cancelled = true;
        };
    }, []);

    // Unique professors sorted alphabetically
    const professors = useMemo(() => {
        const set = new Set(subjects.map((s) => s.profesor).filter(Boolean));
        return ["ALL", ...Array.from(set).sort()];
    }, [subjects]);

    // Unique niveles sorted
    const niveles = useMemo(() => {
        const set = new Set(subjects.map((s) => s.nivel).filter(Boolean));
        return ["ALL", ...Array.from(set).sort()];
    }, [subjects]);

    // Assign a stable color index to each professor
    const professorColorMap = useMemo(() => {
        const map: Record<string, number> = {};
        let idx = 0;
        for (const p of professors) {
            if (p !== "ALL") {
                map[p] = idx % PROFESSOR_COLORS.length;
                idx++;
            }
        }
        return map;
    }, [professors]);

    const filteredSubjects = useMemo(() => {
        return subjects.filter((s) => {
            const matchProfesor = filterProfesor === "ALL" || s.profesor === filterProfesor;
            const matchNivel = filterNivel === "ALL" || s.nivel === filterNivel;
            const matchTipo = filterTipo === "ALL" || s.tipo === filterTipo;
            return matchProfesor && matchNivel && matchTipo;
        });
    }, [subjects, filterProfesor, filterNivel, filterTipo]);

    // Filas involucradas en un cruce de horario del mismo profesor (sobre TODAS las
    // materias, sin importar los filtros activos, para que el chequeo sea completo).
    const conflictedRows = useMemo(() => {
        const set = new Set<Subject>();
        for (const group of findProfessorConflicts(subjects)) {
            for (const pair of group.conflicts) {
                set.add(pair.a.meeting.row);
                set.add(pair.b.meeting.row);
            }
        }
        return set;
    }, [subjects]);

    // Group subjects by day
    const byDay = useMemo(() => {
        const map: Record<string, Subject[]> = {};
        for (const key of DAY_KEYS) map[key] = [];
        for (const s of filteredSubjects) {
            const dayKey = s.dia.toUpperCase();
            if (map[dayKey]) map[dayKey].push(s);
        }
        return map;
    }, [filteredSubjects]);

    // Tooltip: con mouse se muestra al pasar por encima; en pantallas táctiles se abre al
    // tocar una clase y se cierra tocándola de nuevo o tocando fuera.
    useEffect(() => {
        if (!tooltip) return;
        const closeOnOutsideTouch = (e: PointerEvent) => {
            if (e.pointerType !== "mouse") setTooltip(null);
        };
        document.addEventListener("pointerdown", closeOnOutsideTouch);
        return () => document.removeEventListener("pointerdown", closeOnOutsideTouch);
    }, [tooltip]);

    function handleCellHover(e: React.PointerEvent, s: Subject) {
        if (e.pointerType === "mouse") setTooltip({ subject: s, x: e.clientX, y: e.clientY });
    }

    function handleCellTap(e: React.PointerEvent, s: Subject) {
        if (e.pointerType === "mouse") return;
        const { clientX, clientY } = e;
        setTooltip((prev) => (prev?.subject === s ? null : { subject: s, x: clientX, y: clientY }));
    }

    // Time labels for left axis — every 30 minutes
    const timeLabels: { label: string; isHour: boolean }[] = [];
    for (let m = GRID_START; m <= GRID_END; m += 30) {
        const h = Math.floor(m / 60);
        const min = m % 60;
        timeLabels.push({
            label: `${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`,
            isHour: min === 0,
        });
    }

    return (
        <div
            id="schedule-page"
            style={{
                minHeight: "100vh",
                background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
                fontFamily: "'Inter', 'Segoe UI', sans-serif",
                color: "#e2e8f0",
                padding: "0 0 40px 0",
            }}
        >
            {/* ── Header ── */}
            <header
                style={{
                    background: "rgba(255,255,255,0.05)",
                    backdropFilter: "blur(12px)",
                    borderBottom: "1px solid rgba(255,255,255,0.1)",
                    padding: "18px 32px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    flexWrap: "wrap",
                    position: "sticky",
                    top: 0,
                    zIndex: 50,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            background: "linear-gradient(135deg,#6366f1,#ec4899)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 20,
                        }}
                    >
                        📅
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px" }}>
                            Visualizador de Horarios
                        </h1>
                        <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                            ESPOL · {source === "extension" ? "extraído automáticamente" : source === "saved" ? "último horario cargado" : file?.name}
                        </p>
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    {/* Tipo filter */}
                    <label style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Tipo:</label>
                    <SearchableSelect
                        options={["TEORIA", "PRACTICO"]}
                        value={filterTipo}
                        onChange={setFilterTipo}
                        allLabel="Todos los tipos"
                        width={140}
                    />

                    {/* Nivel filter */}
                    <label style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Nivel:</label>
                    <SearchableSelect
                        options={niveles.filter((n) => n !== "ALL")}
                        value={filterNivel}
                        onChange={setFilterNivel}
                        allLabel="Todos los niveles"
                        width={200}
                    />

                    {/* Professor filter */}
                    <label style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Profesor:</label>
                    <SearchableSelect
                        options={professors.filter((p) => p !== "ALL")}
                        value={filterProfesor}
                        onChange={setFilterProfesor}
                        allLabel="Todos los profesores"
                        width={280}
                    />

                    <button
                        id="btn-config"
                        onClick={() => navigate("/config")}
                        style={{
                            background: "rgba(255,255,255,0.1)",
                            border: "1px solid rgba(255,255,255,0.2)",
                            borderRadius: 8,
                            color: "#e2e8f0",
                            padding: "6px 16px",
                            fontSize: 13,
                            cursor: "pointer",
                            transition: "background 0.2s",
                        }}
                        onMouseEnter={(e) =>
                            ((e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.18)")
                        }
                        onMouseLeave={(e) =>
                            ((e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)")
                        }
                    >
                        ⚙️ Niveles
                    </button>

                    <button
                        id="btn-conflicts"
                        onClick={() => navigate("/conflicts")}
                        style={{
                            background: conflictedRows.size > 0 ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.1)",
                            border: conflictedRows.size > 0 ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(255,255,255,0.2)",
                            borderRadius: 8,
                            color: "#e2e8f0",
                            padding: "6px 16px",
                            fontSize: 13,
                            cursor: "pointer",
                            transition: "background 0.2s",
                        }}
                    >
                        🔀 Cruces{conflictedRows.size > 0 ? ` (${conflictedRows.size})` : ""}
                    </button>

                    <button
                        id="btn-back"
                        onClick={() => navigate("/")}
                        style={{
                            background: "rgba(255,255,255,0.1)",
                            border: "1px solid rgba(255,255,255,0.2)",
                            borderRadius: 8,
                            color: "#e2e8f0",
                            padding: "6px 16px",
                            fontSize: 13,
                            cursor: "pointer",
                            transition: "background 0.2s",
                        }}
                        onMouseEnter={(e) =>
                            ((e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.18)")
                        }
                        onMouseLeave={(e) =>
                            ((e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)")
                        }
                    >
                        ← Volver
                    </button>
                </div>
            </header>

            {/* ── Stats Bar ── */}
            <div
                style={{
                    display: "flex",
                    gap: 16,
                    padding: "16px 32px",
                    flexWrap: "wrap",
                }}
            >
                {[
                    {
                        label: "Total clases",
                        value: filteredSubjects.length,
                        icon: "📚",
                        color: "#6366f1",
                    },
                    {
                        label: "Profesores",
                        value: professors.length - 1,
                        icon: "👩‍🏫",
                        color: "#ec4899",
                    },
                    {
                        label: "Materias únicas",
                        value: new Set(filteredSubjects.map((s) => s.codigo_materia)).size,
                        icon: "🔖",
                        color: "#10b981",
                    },
                    {
                        label: "Aulas",
                        value: new Set(filteredSubjects.map((s) => s.aula).filter(Boolean)).size,
                        icon: "🏫",
                        color: "#f59e0b",
                    },
                ].map((stat) => (
                    <div
                        key={stat.label}
                        style={{
                            background: "rgba(255,255,255,0.06)",
                            border: `1px solid ${stat.color}40`,
                            borderRadius: 12,
                            padding: "12px 20px",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            minWidth: 130,
                        }}
                    >
                        <span style={{ fontSize: 22 }}>{stat.icon}</span>
                        <div>
                            <div
                                style={{ fontSize: 22, fontWeight: 700, color: stat.color, lineHeight: 1 }}
                            >
                                {stat.value}
                            </div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                                {stat.label}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Weekly Grid ── */}
            <div style={{ padding: "0 32px", overflowX: "auto" }}>
                <div
                    style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 16,
                        overflow: "hidden",
                        minWidth: 760,
                    }}
                >
                    {/* Day headers */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "64px repeat(5, 1fr)",
                            background: "rgba(255,255,255,0.08)",
                            borderBottom: "1px solid rgba(255,255,255,0.1)",
                        }}
                    >
                        <div style={{ padding: "12px 8px", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                            Hora
                        </div>
                        {DAY_LABELS.map((d) => (
                            <div
                                key={d}
                                style={{
                                    padding: "12px 8px",
                                    fontSize: 13,
                                    fontWeight: 600,
                                    textAlign: "center",
                                    color: "#e2e8f0",
                                    letterSpacing: "0.3px",
                                }}
                            >
                                {d}
                            </div>
                        ))}
                    </div>

                    {/* Grid body */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "64px repeat(5, 1fr)",
                            position: "relative",
                        }}
                    >
                        {/* Time axis — every 30 min */}
                        <div style={{ position: "relative" }}>
                            {timeLabels.map(({ label, isHour }, i) => (
                                <div
                                    key={label}
                                    style={{
                                        height: 30,
                                        display: "flex",
                                        alignItems: "flex-start",
                                        padding: "3px 6px 0 8px",
                                        fontSize: isHour ? 10 : 9,
                                        color: isHour
                                            ? "rgba(255,255,255,0.45)"
                                            : "rgba(255,255,255,0.22)",
                                        borderTop:
                                            i === 0
                                                ? "none"
                                                : isHour
                                                    ? "1px solid rgba(255,255,255,0.08)"
                                                    : "1px solid rgba(255,255,255,0.03)",
                                        fontWeight: isHour ? 500 : 400,
                                    }}
                                >
                                    {label}
                                </div>
                            ))}
                        </div>

                        {/* Day columns */}
                        {DAY_KEYS.map((dayKey, _colIdx) => {
                            const daySubjects = byDay[dayKey] ?? [];

                            return (
                                <div
                                    key={dayKey}
                                    style={{
                                        position: "relative",
                                        borderLeft: "1px solid rgba(255,255,255,0.07)",
                                        height: TOTAL_SLOTS * 30,
                                    }}
                                >
                                    {/* Separator lines — every 30 min */}
                                    {timeLabels.map(({ isHour }, i) => (
                                        <div
                                            key={i}
                                            style={{
                                                position: "absolute",
                                                top: i * 30,
                                                left: 0,
                                                right: 0,
                                                height: 1,
                                                background:
                                                    i === 0
                                                        ? "transparent"
                                                        : isHour
                                                            ? "rgba(255,255,255,0.08)"
                                                            : "rgba(255,255,255,0.03)",
                                                pointerEvents: "none",
                                            }}
                                        />
                                    ))}

                                    {/* Class blocks — side-by-side columns for any overlapping intervals */}
                                    {(() => {
                                        // ── Overlap layout algorithm ──────────────────────────────
                                        // For each subject compute its pixel interval [top, top+h).
                                        // Then assign columns so no two overlapping subjects share a column.
                                        // Finally, find the maximum number of columns each subject must
                                        // share (its "group width") to know how wide to draw it.

                                        type Layout = { col: number; totalCols: number };
                                        const n = daySubjects.length;
                                        const layouts: Layout[] = new Array(n).fill(null).map(() => ({ col: 0, totalCols: 1 }));

                                        if (n > 0) {
                                            // Build adjacency: subjects i and j overlap if their time intervals intersect
                                            const overlaps = (a: Subject, b: Subject) => {
                                                const aStart = timeToMinutes(a.hora_inicio);
                                                const aEnd = timeToMinutes(a.hora_fin);
                                                const bStart = timeToMinutes(b.hora_inicio);
                                                const bEnd = timeToMinutes(b.hora_fin);
                                                return aStart < bEnd && bStart < aEnd;
                                            };

                                            // Assign column greedily (sorted by start time)
                                            const order = Array.from({ length: n }, (_, i) => i)
                                                .sort((a, b) => timeToMinutes(daySubjects[a].hora_inicio) - timeToMinutes(daySubjects[b].hora_inicio));

                                            const colOf: number[] = new Array(n).fill(-1);
                                            for (const i of order) {
                                                const usedCols = new Set<number>();
                                                for (let j = 0; j < n; j++) {
                                                    if (colOf[j] >= 0 && overlaps(daySubjects[i], daySubjects[j])) {
                                                        usedCols.add(colOf[j]);
                                                    }
                                                }
                                                let col = 0;
                                                while (usedCols.has(col)) col++;
                                                colOf[i] = col;
                                            }

                                            // For each subject, compute the maximum column in its overlap group
                                            // (i.e. the total number of columns needed for the widest group it's in)
                                            const maxColOf: number[] = colOf.slice();
                                            for (let i = 0; i < n; i++) {
                                                for (let j = 0; j < n; j++) {
                                                    if (i !== j && overlaps(daySubjects[i], daySubjects[j])) {
                                                        maxColOf[i] = Math.max(maxColOf[i], colOf[j]);
                                                    }
                                                }
                                            }

                                            for (let i = 0; i < n; i++) {
                                                layouts[i] = { col: colOf[i], totalCols: maxColOf[i] + 1 };
                                            }
                                        }

                                        return daySubjects.map((s, sIdx) => {
                                            const startMin = timeToMinutes(s.hora_inicio);
                                            const endMin = timeToMinutes(s.hora_fin);

                                            if (startMin < GRID_START || endMin > GRID_END) return null;

                                            const top = minutesToSlotIndex(startMin) * 30;
                                            const height = ((endMin - startMin) / SLOT_MINUTES) * 30;
                                            const h = Math.max(height - 4, 18);

                                            const colorIdx = professorColorMap[s.profesor] ?? 0;
                                            const color = PROFESSOR_COLORS[colorIdx];
                                            const isTEORIA = s.tipo === "TEORIA";
                                            const pq = s.planificada_quincenalmente?.trim().toUpperCase() ?? "";
                                            const quincena = pq === "1 QUINCENA" ? 1 : pq === "2 QUINCENA" ? 2 : null;
                                            const isConflicted = filterProfesor !== "ALL" && conflictedRows.has(s);
                                            const restingShadow = isConflicted
                                                ? "0 0 0 2px rgba(239,68,68,0.5), 0 2px 12px rgba(239,68,68,0.5)"
                                                : `0 2px 12px ${color.border}40`;

                                            const { col, totalCols } = layouts[sIdx];

                                            // Compute left/right as percentages inside the 4px-padded column area
                                            const pad = 4;
                                            const leftOffset = `calc(${pad}px + (100% - ${pad * 2}px) / ${totalCols} * ${col})`;
                                            const rightOffset = `calc(100% - ${pad}px - (100% - ${pad * 2}px) / ${totalCols} * ${col + 1})`;

                                            return (
                                                <div
                                                    key={`${s.codigo_materia}-${s.tipo}-${s.paralelo}-${s.dia}-${sIdx}`}
                                                    id={`class-${s.codigo_materia}-${dayKey}-${sIdx}`}
                                                    onPointerMove={(e) => handleCellHover(e, s)}
                                                    onPointerDown={(e) => {
                                                        if (e.pointerType !== "mouse") e.stopPropagation();
                                                    }}
                                                    onPointerUp={(e) => handleCellTap(e, s)}
                                                    onPointerLeave={(e) => {
                                                        if (e.pointerType !== "mouse") return;
                                                        setTooltip(null);
                                                        const el = e.currentTarget as HTMLElement;
                                                        el.style.transform = "";
                                                        el.style.zIndex = String(10 + col);
                                                        el.style.boxShadow = restingShadow;
                                                    }}
                                                    style={{
                                                        position: "absolute",
                                                        top: top + 2,
                                                        left: leftOffset,
                                                        right: rightOffset,
                                                        // Slight inner gap between side-by-side cards
                                                        marginLeft: col > 0 ? 2 : 0,
                                                        marginRight: col < totalCols - 1 ? 2 : 0,
                                                        height: h,
                                                        background: color.bg,
                                                        border: isConflicted ? "1.5px solid #ef4444" : `1.5px solid ${color.border}`,
                                                        borderRadius: 6,
                                                        padding: "4px 6px",
                                                        cursor: "pointer",
                                                        overflow: "hidden",
                                                        backdropFilter: "blur(4px)",
                                                        boxShadow: restingShadow,
                                                        transition: "transform 0.15s, box-shadow 0.15s",
                                                        zIndex: 10 + col,
                                                    }}
                                                    onPointerEnter={(e) => {
                                                        if (e.pointerType !== "mouse") return;
                                                        const el = e.currentTarget as HTMLElement;
                                                        el.style.transform = "scale(1.02)";
                                                        el.style.zIndex = "25";
                                                        el.style.boxShadow = `0 6px 20px ${color.border}80`;
                                                    }}
                                                >
                                                    {/* Type + quincena badge */}
                                                    <div
                                                        style={{
                                                            position: "absolute",
                                                            top: 4,
                                                            right: 4,
                                                            background: isTEORIA
                                                                ? "rgba(255,255,255,0.25)"
                                                                : quincena
                                                                    ? quincena === 1
                                                                        ? "rgba(245,158,11,0.55)"
                                                                        : "rgba(168,85,247,0.55)"
                                                                    : "rgba(0,0,0,0.25)",
                                                            borderRadius: 3,
                                                            padding: "1px 4px",
                                                            fontSize: 8,
                                                            fontWeight: 700,
                                                            letterSpacing: "0.4px",
                                                            color: "#fff",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: 2,
                                                            whiteSpace: "nowrap",
                                                        }}
                                                    >
                                                        {isTEORIA
                                                            ? "TEO"
                                                            : quincena
                                                                ? `PRA · Q${quincena}`
                                                                : "PRA"}
                                                    </div>

                                                    {/* Diagonal stripe for quincena */}
                                                    {!isTEORIA && quincena && (
                                                        <div
                                                            style={{
                                                                position: "absolute",
                                                                inset: 0,
                                                                borderRadius: 5,
                                                                backgroundImage:
                                                                    quincena === 1
                                                                        ? "repeating-linear-gradient(45deg, rgba(245,158,11,0.12) 0px, rgba(245,158,11,0.12) 2px, transparent 2px, transparent 8px)"
                                                                        : "repeating-linear-gradient(45deg, rgba(168,85,247,0.12) 0px, rgba(168,85,247,0.12) 2px, transparent 2px, transparent 8px)",
                                                                pointerEvents: "none",
                                                            }}
                                                        />
                                                    )}

                                                    <div
                                                        style={{
                                                            fontSize: 10,
                                                            fontWeight: 700,
                                                            color: "#fff",
                                                            lineHeight: 1.2,
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis",
                                                            whiteSpace: "nowrap",
                                                            paddingRight: totalCols === 1 ? 28 : 4,
                                                        }}
                                                    >
                                                        {isConflicted ? "⚠ " : ""}
                                                        {s.codigo_materia}
                                                    </div>
                                                    {height >= 36 && (
                                                        <div
                                                            style={{
                                                                fontSize: 9,
                                                                color: "rgba(255,255,255,0.85)",
                                                                overflow: "hidden",
                                                                textOverflow: "ellipsis",
                                                                display: "-webkit-box",
                                                                WebkitLineClamp: 2,
                                                                WebkitBoxOrient: "vertical",
                                                                lineHeight: 1.3,
                                                            }}
                                                        >
                                                            {s.materia}
                                                        </div>
                                                    )}
                                                    {height >= 52 && (
                                                        <div
                                                            style={{
                                                                fontSize: 8,
                                                                color: "rgba(255,255,255,0.65)",
                                                                marginTop: 2,
                                                                overflow: "hidden",
                                                                textOverflow: "ellipsis",
                                                                whiteSpace: "nowrap",
                                                            }}
                                                        >
                                                            🏫 {s.aula}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ── Legend ── */}
            {filterProfesor === "ALL" && professors.length > 1 && (
                <div style={{ padding: "20px 32px 0" }}>
                    <div
                        style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: 12,
                            padding: "16px 20px",
                        }}
                    >
                        <p
                            style={{
                                margin: "0 0 12px 0",
                                fontSize: 12,
                                fontWeight: 600,
                                color: "rgba(255,255,255,0.5)",
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                            }}
                        >
                            Leyenda de Profesores
                        </p>
                        <div
                            style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "8px 20px",
                            }}
                        >
                            {professors
                                .filter((p) => p !== "ALL")
                                .map((p) => {
                                    const colorIdx = professorColorMap[p] ?? 0;
                                    const color = PROFESSOR_COLORS[colorIdx];
                                    return (
                                        <div
                                            key={p}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 6,
                                                cursor: "pointer",
                                            }}
                                            onClick={() => setFilterProfesor(p)}
                                        >
                                            <div
                                                style={{
                                                    width: 10,
                                                    height: 10,
                                                    borderRadius: 3,
                                                    background: color.bg,
                                                    border: `1.5px solid ${color.border}`,
                                                    flexShrink: 0,
                                                }}
                                            />
                                            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
                                                {p}
                                            </span>
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Tooltip ── */}
            {tooltip && (
                <div
                    style={{
                        position: "fixed",
                        ...tooltipPosition(tooltip.x, tooltip.y),
                        background: "rgba(15,12,41,0.97)",
                        border: `1px solid ${PROFESSOR_COLORS[professorColorMap[tooltip.subject.profesor] ?? 0].border
                            }`,
                        borderRadius: 10,
                        padding: "12px 14px",
                        zIndex: 999,
                        maxWidth: 280,
                        pointerEvents: "none",
                        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                    }}
                >
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: "#fff" }}>
                        {tooltip.subject.materia}
                    </div>
                    <table style={{ borderSpacing: "4px 3px", fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
                        <tbody>
                            {[
                                ["Código", tooltip.subject.codigo_materia],
                                ["Tipo", tooltip.subject.tipo],
                                ["Paralelo", tooltip.subject.paralelo],
                                ["Profesor", tooltip.subject.profesor],
                                ["Horario", `${tooltip.subject.hora_inicio.slice(0, 5)} – ${tooltip.subject.hora_fin.slice(0, 5)}`],
                                ["Aula", `${tooltip.subject.aula} · ${tooltip.subject.bloque}`],
                                ["Cupo", `${tooltip.subject.cupo_disponible} / ${tooltip.subject.cupo_maximo}`],
                                ["Nivel", tooltip.subject.nivel],
                                ...(() => { const pq = tooltip.subject.planificada_quincenalmente?.trim().toUpperCase() ?? ""; return pq === "1 QUINCENA" || pq === "2 QUINCENA" ? [["Quincena", pq === "1 QUINCENA" ? "1ª Quincena" : "2ª Quincena"]] : []; })(),
                            ].map(([label, val]) => (
                                <tr key={String(label)}>
                                    <td style={{ color: "rgba(255,255,255,0.4)", paddingRight: 8, whiteSpace: "nowrap" }}>
                                        {label}
                                    </td>
                                    <td style={{ color: "#e2e8f0", fontWeight: 500 }}>{val}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}