import { useEffect, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Subject from "../models/Subject";
import { getStorageItem, setStorageItem } from "../lib/storage";
import SearchableSelect from "../components/SearchableSelect";
import { timeToMinutes } from "../lib/time";
import { CURRENT_SUBJECTS_KEY, SCRAPED_SUBJECTS_KEY } from "../lib/constants";
import { findProfessorConflicts } from "../lib/conflicts";
import { tooltipPosition } from "../lib/tooltip";
import { badgeStyle, BLOCK_COLORS, CONFLICT_COLOR, quincenaHatch } from "../lib/palette";
import AppMark from "../components/AppMark";

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
                map[p] = idx % BLOCK_COLORS.length;
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

    const stats = [
        { label: "clases", value: filteredSubjects.length },
        { label: "profesores", value: professors.length - 1 },
        { label: "materias", value: new Set(filteredSubjects.map((s) => s.codigo_materia)).size },
        { label: "aulas", value: new Set(filteredSubjects.map((s) => s.aula).filter(Boolean)).size },
    ];

    const tooltipQuincena = (() => {
        const pq = tooltip?.subject.planificada_quincenalmente?.trim().toUpperCase() ?? "";
        return pq === "1 QUINCENA" ? "1ª Quincena" : pq === "2 QUINCENA" ? "2ª Quincena" : null;
    })();

    return (
        <div id="schedule-page" className="page" style={{ paddingBottom: 40 }}>
            {/* ── Header ── */}
            <header
                style={{
                    background: "var(--surface)",
                    borderBottom: "1px solid var(--border)",
                    padding: "12px 24px",
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
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <AppMark />
                    <div style={{ minWidth: 0 }}>
                        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Visualizador de Horarios</h1>
                        <p style={{ margin: 0, fontSize: 12, color: "var(--text-3)" }}>
                            ESPOL · {source === "extension" ? "extraído automáticamente" : source === "saved" ? "último horario cargado" : file?.name}
                        </p>
                    </div>
                </div>

                <nav style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <button id="btn-conflicts" className="btn" onClick={() => navigate("/conflicts")}>
                        Cruces
                        {conflictedRows.size > 0 && <span className="btn-badge">{conflictedRows.size}</span>}
                    </button>
                    <button id="btn-config" className="btn" onClick={() => navigate("/config")}>
                        Niveles
                    </button>
                    <button id="btn-back" className="btn btn-ghost" onClick={() => navigate("/")}>
                        Cargar otro archivo
                    </button>
                </nav>
            </header>

            {/* ── Filtros + resumen ── */}
            <div
                style={{
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    gap: 16,
                    flexWrap: "wrap",
                    padding: "16px 24px",
                }}
            >
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span className="field-label">Tipo</span>
                        <SearchableSelect
                            options={["TEORIA", "PRACTICO"]}
                            value={filterTipo}
                            onChange={setFilterTipo}
                            allLabel="Todos los tipos"
                            width={150}
                        />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span className="field-label">Nivel</span>
                        <SearchableSelect
                            options={niveles.filter((n) => n !== "ALL")}
                            value={filterNivel}
                            onChange={setFilterNivel}
                            allLabel="Todos los niveles"
                            width={200}
                        />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span className="field-label">Profesor</span>
                        <SearchableSelect
                            options={professors.filter((p) => p !== "ALL")}
                            value={filterProfesor}
                            onChange={setFilterProfesor}
                            allLabel="Todos los profesores"
                            width={280}
                        />
                    </div>
                </div>

                <div className="tabular" style={{ display: "flex", gap: 20, fontSize: 13, color: "var(--text-2)", paddingBottom: 6 }}>
                    {stats.map((stat) => (
                        <span key={stat.label}>
                            <strong style={{ color: "var(--text)", fontWeight: 600 }}>{stat.value}</strong> {stat.label}
                        </span>
                    ))}
                </div>
            </div>

            {/* ── Weekly Grid ── */}
            <div style={{ padding: "0 24px", overflowX: "auto" }}>
                <div className="card" style={{ overflow: "hidden", minWidth: 760 }}>
                    {/* Day headers */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "56px repeat(5, 1fr)",
                            background: "var(--surface-2)",
                            borderBottom: "1px solid var(--border)",
                        }}
                    >
                        <div />
                        {DAY_LABELS.map((d) => (
                            <div
                                key={d}
                                style={{
                                    padding: "10px 8px",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    textAlign: "center",
                                    color: "var(--text-2)",
                                    borderLeft: "1px solid var(--border)",
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
                            gridTemplateColumns: "56px repeat(5, 1fr)",
                            position: "relative",
                        }}
                    >
                        {/* Time axis — etiqueta cada hora */}
                        <div style={{ position: "relative" }} className="tabular">
                            {timeLabels.map(({ label, isHour }, i) =>
                                i === timeLabels.length - 1 ? null : (
                                    <div
                                        key={label}
                                        style={{
                                            height: 30,
                                            padding: "2px 8px 0 0",
                                            textAlign: "right",
                                            fontSize: 11,
                                            color: "var(--text-3)",
                                            borderTop: i === 0 ? "none" : `1px solid ${isHour ? "var(--grid-line-hour)" : "transparent"}`,
                                        }}
                                    >
                                        {isHour ? label : ""}
                                    </div>
                                )
                            )}
                        </div>

                        {/* Day columns */}
                        {DAY_KEYS.map((dayKey) => {
                            const daySubjects = byDay[dayKey] ?? [];

                            return (
                                <div
                                    key={dayKey}
                                    style={{
                                        position: "relative",
                                        borderLeft: "1px solid var(--border)",
                                        height: TOTAL_SLOTS * 30,
                                    }}
                                >
                                    {/* Separator lines — every 30 min */}
                                    {timeLabels.map(({ isHour }, i) =>
                                        i === 0 ? null : (
                                            <div
                                                key={i}
                                                style={{
                                                    position: "absolute",
                                                    top: i * 30,
                                                    left: 0,
                                                    right: 0,
                                                    height: 1,
                                                    background: isHour ? "var(--grid-line-hour)" : "var(--grid-line)",
                                                    pointerEvents: "none",
                                                }}
                                            />
                                        )
                                    )}

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
                                            const h = Math.max(height - 3, 18);

                                            const isTEORIA = s.tipo === "TEORIA";
                                            const pq = s.planificada_quincenalmente?.trim().toUpperCase() ?? "";
                                            const quincena = pq === "1 QUINCENA" ? 1 : pq === "2 QUINCENA" ? 2 : null;
                                            const isConflicted = filterProfesor !== "ALL" && conflictedRows.has(s);
                                            const color = isConflicted ? CONFLICT_COLOR : BLOCK_COLORS[professorColorMap[s.profesor] ?? 0];

                                            const { col, totalCols } = layouts[sIdx];

                                            // Compute left/right as percentages inside the padded column area
                                            const pad = 3;
                                            const leftOffset = `calc(${pad}px + (100% - ${pad * 2}px) / ${totalCols} * ${col})`;
                                            const rightOffset = `calc(100% - ${pad}px - (100% - ${pad * 2}px) / ${totalCols} * ${col + 1})`;

                                            return (
                                                <div
                                                    key={`${s.codigo_materia}-${s.tipo}-${s.paralelo}-${s.dia}-${sIdx}`}
                                                    id={`class-${s.codigo_materia}-${dayKey}-${sIdx}`}
                                                    className="class-block"
                                                    onPointerMove={(e) => handleCellHover(e, s)}
                                                    onPointerDown={(e) => {
                                                        if (e.pointerType !== "mouse") e.stopPropagation();
                                                    }}
                                                    onPointerUp={(e) => handleCellTap(e, s)}
                                                    onPointerLeave={(e) => {
                                                        if (e.pointerType === "mouse") setTooltip(null);
                                                    }}
                                                    style={{
                                                        position: "absolute",
                                                        top: top + 1,
                                                        left: leftOffset,
                                                        right: rightOffset,
                                                        // Slight inner gap between side-by-side cards
                                                        marginLeft: col > 0 ? 1 : 0,
                                                        marginRight: col < totalCols - 1 ? 1 : 0,
                                                        height: h,
                                                        background: color.bg,
                                                        borderLeft: `3px solid ${color.border}`,
                                                        outline: isConflicted ? `1px solid ${color.border}` : undefined,
                                                        outlineOffset: -1,
                                                        borderRadius: 4,
                                                        padding: "3px 6px",
                                                        cursor: "pointer",
                                                        overflow: "hidden",
                                                        zIndex: 10 + col,
                                                    }}
                                                >
                                                    {/* Diagonal stripe for quincena */}
                                                    {!isTEORIA && quincena && (
                                                        <div
                                                            style={{
                                                                position: "absolute",
                                                                inset: 0,
                                                                backgroundImage: quincenaHatch(quincena),
                                                                pointerEvents: "none",
                                                            }}
                                                        />
                                                    )}

                                                    <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 4 }}>
                                                        <div
                                                            style={{
                                                                flex: 1,
                                                                minWidth: 0,
                                                                fontSize: 11,
                                                                fontWeight: 600,
                                                                color: isConflicted ? "var(--danger)" : "var(--text)",
                                                                lineHeight: 1.3,
                                                                overflow: "hidden",
                                                                textOverflow: "ellipsis",
                                                                whiteSpace: "nowrap",
                                                            }}
                                                        >
                                                            {isConflicted ? "⚠︎ " : ""}
                                                            {s.codigo_materia}
                                                        </div>
                                                        {/* Type + quincena badge — se omite cuando el bloque comparte columna */}
                                                        {totalCols === 1 && (
                                                            <span
                                                                style={{
                                                                    flexShrink: 0,
                                                                    borderRadius: 3,
                                                                    padding: "0 4px",
                                                                    fontSize: 9,
                                                                    fontWeight: 600,
                                                                    lineHeight: "14px",
                                                                    letterSpacing: "0.02em",
                                                                    whiteSpace: "nowrap",
                                                                    ...badgeStyle(isTEORIA, quincena),
                                                                }}
                                                            >
                                                                {isTEORIA ? "TEO" : quincena ? `PRA · Q${quincena}` : "PRA"}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {height >= 36 && (
                                                        <div
                                                            style={{
                                                                position: "relative",
                                                                fontSize: 10,
                                                                color: "var(--text-2)",
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
                                                                position: "relative",
                                                                fontSize: 10,
                                                                color: "var(--text-3)",
                                                                marginTop: 1,
                                                                overflow: "hidden",
                                                                textOverflow: "ellipsis",
                                                                whiteSpace: "nowrap",
                                                            }}
                                                        >
                                                            {s.aula}
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
                <div style={{ padding: "16px 24px 0" }}>
                    <div className="card" style={{ padding: "14px 16px" }}>
                        <div className="eyebrow" style={{ marginBottom: 10 }}>
                            Profesores
                        </div>
                        <div
                            style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "4px 8px",
                            }}
                        >
                            {professors
                                .filter((p) => p !== "ALL")
                                .map((p) => {
                                    const color = BLOCK_COLORS[professorColorMap[p] ?? 0];
                                    return (
                                        <button
                                            key={p}
                                            className="btn btn-ghost"
                                            style={{ height: 26, padding: "0 8px", fontSize: 12 }}
                                            onClick={() => setFilterProfesor(p)}
                                        >
                                            <span
                                                style={{
                                                    width: 8,
                                                    height: 8,
                                                    borderRadius: 2,
                                                    background: color.border,
                                                    flexShrink: 0,
                                                }}
                                            />
                                            {p}
                                        </button>
                                    );
                                })}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Tooltip ── */}
            {tooltip && (
                <div className="tooltip" style={tooltipPosition(tooltip.x, tooltip.y)}>
                    <div className="tooltip-title">{tooltip.subject.materia}</div>
                    <table>
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
                                ...(tooltipQuincena ? [["Quincena", tooltipQuincena]] : []),
                            ].map(([label, val]) => (
                                <tr key={String(label)}>
                                    <td>{label}</td>
                                    <td>{val}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

