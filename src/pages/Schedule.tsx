import { useEffect, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Subject from "../models/Subject";

interface LocationState {
    file: File;
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

function timeToMinutes(t: string): number {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
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
    const state = location.state as LocationState;
    const file = state?.file;

    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [filterProfesor, setFilterProfesor] = useState<string>("ALL");
    const [filterNivel, setFilterNivel] = useState<string>("ALL");
    const [filterTipo, setFilterTipo] = useState<string>("ALL");
    const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

    useEffect(() => {
        if (!file) {
            navigate("/");
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            setSubjects(parseCSV(text));
        };
        reader.readAsText(file, "UTF-8");
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

    function handleCellHover(e: React.MouseEvent, s: Subject) {
        setTooltip({ subject: s, x: e.clientX, y: e.clientY });
    }

    function handleCellLeave() {
        setTooltip(null);
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
                            ESPOL · {file?.name}
                        </p>
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    {/* Tipo filter */}
                    <label style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Tipo:</label>
                    <select
                        id="filter-tipo"
                        value={filterTipo}
                        onChange={(e) => setFilterTipo(e.target.value)}
                        style={{
                            background: "rgba(255,255,255,0.08)",
                            border: "1px solid rgba(255,255,255,0.2)",
                            borderRadius: 8,
                            color: "#e2e8f0",
                            padding: "6px 12px",
                            fontSize: 13,
                            cursor: "pointer",
                            maxWidth: 140,
                        }}
                    >
                        <option value="ALL" style={{ background: "#302b63" }}>Todos los tipos</option>
                        <option value="TEORIA" style={{ background: "#302b63" }}>Teoría</option>
                        <option value="PRACTICO" style={{ background: "#302b63" }}>Práctico</option>
                    </select>

                    {/* Nivel filter */}
                    <label style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Nivel:</label>
                    <select
                        id="filter-nivel"
                        value={filterNivel}
                        onChange={(e) => setFilterNivel(e.target.value)}
                        style={{
                            background: "rgba(255,255,255,0.08)",
                            border: "1px solid rgba(255,255,255,0.2)",
                            borderRadius: 8,
                            color: "#e2e8f0",
                            padding: "6px 12px",
                            fontSize: 13,
                            cursor: "pointer",
                            maxWidth: 200,
                        }}
                    >
                        {niveles.map((n) => (
                            <option key={n} value={n} style={{ background: "#302b63" }}>
                                {n === "ALL" ? "Todos los niveles" : n}
                            </option>
                        ))}
                    </select>

                    {/* Professor filter */}
                    <label style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Profesor:</label>
                    <select
                        id="filter-profesor"
                        value={filterProfesor}
                        onChange={(e) => setFilterProfesor(e.target.value)}
                        style={{
                            background: "rgba(255,255,255,0.08)",
                            border: "1px solid rgba(255,255,255,0.2)",
                            borderRadius: 8,
                            color: "#e2e8f0",
                            padding: "6px 12px",
                            fontSize: 13,
                            cursor: "pointer",
                            maxWidth: 280,
                        }}
                    >
                        {professors.map((p) => (
                            <option key={p} value={p} style={{ background: "#302b63" }}>
                                {p === "ALL" ? "Todos los profesores" : p}
                            </option>
                        ))}
                    </select>

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

                                    {/* Class blocks */}
                                    {daySubjects.map((s, sIdx) => {
                                        const startMin = timeToMinutes(s.hora_inicio);
                                        const endMin = timeToMinutes(s.hora_fin);

                                        if (startMin < GRID_START || endMin > GRID_END) return null;

                                        const top = minutesToSlotIndex(startMin) * 30;
                                        const height = ((endMin - startMin) / SLOT_MINUTES) * 30;

                                        const colorIdx = professorColorMap[s.profesor] ?? 0;
                                        const color = PROFESSOR_COLORS[colorIdx];
                                        const isTEORIA = s.tipo === "TEORIA";
                                        // Biweekly indicator
                                        const pq = s.planificada_quincenalmente?.trim().toUpperCase() ?? "";
                                        const quincena = pq === "1 QUINCENA" ? 1 : pq === "2 QUINCENA" ? 2 : null;

                                        return (
                                            <div
                                                key={`${s.codigo_materia}-${s.tipo}-${s.paralelo}-${s.dia}-${sIdx}`}
                                                id={`class-${s.codigo_materia}-${dayKey}-${sIdx}`}
                                                onMouseMove={(e) => handleCellHover(e, s)}
                                                onMouseLeave={(e) => {
                                                    handleCellLeave();
                                                    const el = e.currentTarget as HTMLElement;
                                                    el.style.transform = "";
                                                    el.style.zIndex = "10";
                                                    el.style.boxShadow = `0 2px 12px ${color.border}40`;
                                                }}
                                                style={{
                                                    position: "absolute",
                                                    top: top + 2,
                                                    left: 4,
                                                    right: 4,
                                                    height: Math.max(height - 4, 18),
                                                    background: color.bg,
                                                    border: `1.5px solid ${color.border}`,
                                                    borderRadius: 6,
                                                    padding: "4px 6px",
                                                    cursor: "pointer",
                                                    overflow: "hidden",
                                                    backdropFilter: "blur(4px)",
                                                    boxShadow: `0 2px 12px ${color.border}40`,
                                                    transition: "transform 0.15s, box-shadow 0.15s",
                                                    zIndex: 10,
                                                }}
                                                onMouseEnter={(e) => {
                                                    const el = e.currentTarget as HTMLElement;
                                                    el.style.transform = "scale(1.02)";
                                                    el.style.zIndex = "20";
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

                                                {/* Diagonal stripe overlay for quincena classes */}
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
                                                        paddingRight: 28,
                                                    }}
                                                >
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
                                    })}
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
                        top: tooltip.y + 12,
                        left: tooltip.x + 12,
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