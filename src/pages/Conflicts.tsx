import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Subject from "../models/Subject";
import { getStorageItem, setStorageItem } from "../lib/storage";
import { CONFLICTS_SELECTION_KEY, CURRENT_SUBJECTS_KEY } from "../lib/constants";
import {
    buildSections,
    buildSubjectOptions,
    computeFreeBlocks,
    findAllConflictFreeCombos,
    findConflictFreeCombo,
    findProfessorConflicts,
    meetingsOverlap,
    optionsConflict,
    pairwiseFeasibility,
    type FreeKind,
    type SubjectOption,
} from "../lib/conflicts";
import Combobox from "../components/Combobox";
import MiniWeekGrid, { type WeekBlock } from "../components/MiniWeekGrid";

const FREE_KIND_LEGEND: { kind: FreeKind; label: string; bg: string; border: string }[] = [
    { kind: "TODAS", label: "Libre todas las semanas", bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.5)" },
    { kind: "1", label: "Libre en 1ª quincena", bg: "rgba(245,158,11,0.18)", border: "rgba(245,158,11,0.55)" },
    { kind: "2", label: "Libre en 2ª quincena", bg: "rgba(168,85,247,0.18)", border: "rgba(168,85,247,0.55)" },
];

const SUBJECT_COLORS = [
    { bg: "rgba(99,102,241,0.85)", border: "#6366f1" },
    { bg: "rgba(236,72,153,0.85)", border: "#ec4899" },
    { bg: "rgba(16,185,129,0.85)", border: "#10b981" },
    { bg: "rgba(245,158,11,0.85)", border: "#f59e0b" },
    { bg: "rgba(59,130,246,0.85)", border: "#3b82f6" },
    { bg: "rgba(168,85,247,0.85)", border: "#a855f7" },
    { bg: "rgba(20,184,166,0.85)", border: "#14b8a6" },
    { bg: "rgba(249,115,22,0.85)", border: "#f97316" },
];

interface SavedSelection {
    nivel: string;
    picks: Record<string, string>;
}

// Identificador estable de una opción que sobrevive a recargar el horario (los objetos
// SubjectOption se reconstruyen en cada carga, así que no se pueden guardar tal cual).
function optionKey(opt: SubjectOption): string {
    return `${opt.teoria.tipo}${opt.teoria.paralelo}|${opt.practica?.paralelo ?? ""}`;
}

function optionLabel(opt: SubjectOption): string {
    const teoriaPart = `Teoría P${opt.teoria.paralelo} — ${opt.teoria.profesor}`;
    if (!opt.practica) return teoriaPart;
    return `${teoriaPart}  +  Práctica ${opt.practica.paralelo} — ${opt.practica.profesor}`;
}

const cardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    padding: 16,
};

export default function Conflicts() {
    const navigate = useNavigate();
    const [subjects, setSubjects] = useState<Subject[] | null>(null);
    const [selectedNivel, setSelectedNivel] = useState("");
    const [selection, setSelection] = useState<Record<string, SubjectOption>>({});
    const [autoResult, setAutoResult] = useState<
        | { status: "idle" }
        | { status: "found"; combo: SubjectOption[] }
        | { status: "not-found" }
    >({ status: "idle" });
    const [combosState, setCombosState] = useState<
        | { status: "idle" }
        | { status: "ready"; combos: SubjectOption[][]; truncated: boolean; index: number }
    >({ status: "idle" });

    const pendingRestore = useRef<SavedSelection | null>(null);

    useEffect(() => {
        Promise.all([
            getStorageItem<Subject[]>(CURRENT_SUBJECTS_KEY, []),
            getStorageItem<SavedSelection | null>(CONFLICTS_SELECTION_KEY, null),
        ]).then(([loaded, saved]) => {
            setSubjects(loaded);
            if (saved && loaded.some((s) => s.nivel === saved.nivel)) {
                pendingRestore.current = saved;
                setSelectedNivel(saved.nivel);
            }
        });
    }, []);

    const professorConflicts = useMemo(() => (subjects ? findProfessorConflicts(subjects) : []), [subjects]);

    const niveles = useMemo(() => {
        if (!subjects) return [];
        return Array.from(new Set(subjects.map((s) => s.nivel).filter(Boolean))).sort();
    }, [subjects]);

    const optionsByCodigo = useMemo(() => {
        if (!subjects || !selectedNivel) return new Map<string, SubjectOption[]>();
        const levelSubjects = subjects.filter((s) => s.nivel === selectedNivel);
        return buildSubjectOptions(buildSections(levelSubjects));
    }, [subjects, selectedNivel]);

    const codes = useMemo(() => Array.from(optionsByCodigo.keys()).sort(), [optionsByCodigo]);

    // Secciones crudas del nivel (todas las materias, tipos y paralelos) — se usan para
    // detectar los huecos libres, independientemente de qué opción esté seleccionada.
    const levelSections = useMemo(() => {
        if (!subjects || !selectedNivel) return [];
        return buildSections(subjects.filter((s) => s.nivel === selectedNivel));
    }, [subjects, selectedNivel]);

    const freeBlocks = useMemo(() => computeFreeBlocks(levelSections), [levelSections]);

    // Al cambiar de nivel, arranca con la primera opción de cada materia y limpia el
    // resultado de la búsqueda automática anterior.
    // Si hay una selección guardada para este nivel (venimos de recargar la página), se
    // restaura; los paralelos que ya no existan en el horario actual caen a la primera opción.
    useEffect(() => {
        const saved = pendingRestore.current?.nivel === selectedNivel ? pendingRestore.current : null;
        pendingRestore.current = null;
        const initial: Record<string, SubjectOption> = {};
        for (const code of codes) {
            const opts = optionsByCodigo.get(code);
            if (!opts || opts.length === 0) continue;
            const savedKey = saved?.picks[code];
            initial[code] = (savedKey && opts.find((o) => optionKey(o) === savedKey)) || opts[0];
        }
        setSelection(initial);
        setAutoResult({ status: "idle" });
        setCombosState({ status: "idle" });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedNivel]);

    useEffect(() => {
        if (!selectedNivel || Object.keys(selection).length === 0) return;
        const picks: Record<string, string> = {};
        for (const [code, opt] of Object.entries(selection)) picks[code] = optionKey(opt);
        setStorageItem<SavedSelection>(CONFLICTS_SELECTION_KEY, { nivel: selectedNivel, picks });
    }, [selectedNivel, selection]);

    function applyCombo(combo: SubjectOption[]) {
        const next: Record<string, SubjectOption> = {};
        for (const opt of combo) next[opt.codigoMateria] = opt;
        setSelection(next);
    }

    function handleAutoSearch() {
        setCombosState({ status: "idle" });
        const combo = findConflictFreeCombo(optionsByCodigo);
        if (combo) {
            applyCombo(combo);
            setAutoResult({ status: "found", combo });
        } else {
            setAutoResult({ status: "not-found" });
        }
    }

    function handleShowAllCombos() {
        const { combos, truncated } = findAllConflictFreeCombos(optionsByCodigo);
        if (combos.length === 0) {
            setCombosState({ status: "idle" });
            setAutoResult({ status: "not-found" });
            return;
        }
        applyCombo(combos[0]);
        setAutoResult({ status: "found", combo: combos[0] });
        setCombosState({ status: "ready", combos, truncated, index: 0 });
    }

    function gotoCombo(delta: number) {
        setCombosState((prev) => {
            if (prev.status !== "ready") return prev;
            const nextIndex = (prev.index + delta + prev.combos.length) % prev.combos.length;
            applyCombo(prev.combos[nextIndex]);
            return { ...prev, index: nextIndex };
        });
    }

    const infeasiblePairs = useMemo(() => {
        if (autoResult.status !== "not-found") return [];
        return pairwiseFeasibility(optionsByCodigo).filter((p) => !p.feasible);
    }, [autoResult, optionsByCodigo]);

    // Cruces dentro de la selección manual actual (independiente del resultado automático).
    const manualConflicts = useMemo(() => {
        const out: { codeA: string; codeB: string }[] = [];
        for (let i = 0; i < codes.length; i++) {
            for (let j = i + 1; j < codes.length; j++) {
                const a = selection[codes[i]];
                const b = selection[codes[j]];
                if (a && b && optionsConflict(a, b)) out.push({ codeA: codes[i], codeB: codes[j] });
            }
        }
        return out;
    }, [codes, selection]);

    const conflictedCodes = useMemo(() => {
        const set = new Set<string>();
        for (const c of manualConflicts) {
            set.add(c.codeA);
            set.add(c.codeB);
        }
        return set;
    }, [manualConflicts]);

    const conflictedRows = useMemo(() => {
        const set = new Set<Subject>();
        for (let i = 0; i < codes.length; i++) {
            for (let j = i + 1; j < codes.length; j++) {
                const a = selection[codes[i]];
                const b = selection[codes[j]];
                if (!a || !b) continue;
                for (const ma of a.meetings) {
                    for (const mb of b.meetings) {
                        if (meetingsOverlap(ma, mb)) {
                            set.add(ma.row);
                            set.add(mb.row);
                        }
                    }
                }
            }
        }
        return set;
    }, [codes, selection]);

    const blocks: WeekBlock[] = useMemo(() => {
        const out: WeekBlock[] = [];
        codes.forEach((code, idx) => {
            const opt = selection[code];
            if (!opt) return;
            const color = SUBJECT_COLORS[idx % SUBJECT_COLORS.length];
            opt.meetings.forEach((m, mIdx) => {
                out.push({
                    id: `${code}-${mIdx}`,
                    dia: m.dia,
                    startMin: m.startMin,
                    endMin: m.endMin,
                    title: code,
                    subtitle: m.row.tipo === "TEORIA" ? `Teoría P${m.row.paralelo}` : `Práctica ${m.row.paralelo}`,
                    color,
                    conflicted: conflictedRows.has(m.row),
                    subject: m.row,
                });
            });
        });
        return out;
    }, [codes, selection, conflictedRows]);

    if (subjects === null) {
        return (
            <div style={{ minHeight: "100vh", background: "#0f0c29", color: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                Cargando...
            </div>
        );
    }

    if (subjects.length === 0) {
        return (
            <div
                style={{
                    minHeight: "100vh",
                    background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
                    color: "#e2e8f0",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 16,
                    fontFamily: "'Inter', 'Segoe UI', sans-serif",
                }}
            >
                <p>No hay ningún horario cargado todavía.</p>
                <button
                    onClick={() => navigate("/")}
                    style={{ background: "linear-gradient(135deg, #6366f1, #ec4899)", border: "none", borderRadius: 8, color: "#fff", padding: "10px 20px", cursor: "pointer" }}
                >
                    Ir a cargar un horario
                </button>
            </div>
        );
    }

    return (
        <div
            style={{
                minHeight: "100vh",
                background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
                fontFamily: "'Inter', 'Segoe UI', sans-serif",
                color: "#e2e8f0",
                padding: "32px 16px 60px",
            }}
        >
            <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🔀 Cruces de horario</h1>
                    <button
                        onClick={() => navigate(-1)}
                        style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, color: "#e2e8f0", padding: "6px 16px", fontSize: 13, cursor: "pointer" }}
                    >
                        ← Volver
                    </button>
                </div>

                {/* ── Cruces de profesores ── */}
                <section style={cardStyle}>
                    <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}>Cruces entre profesores</h2>
                    <p style={{ margin: "0 0 14px", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                        Profesores con dos clases distintas que caen en el mismo día y horario. Haz clic en un nombre para ver su horario.
                    </p>

                    {professorConflicts.length === 0 ? (
                        <div style={{ fontSize: 13, color: "#10b981" }}>✅ No se detectó ningún cruce entre profesores.</div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            {professorConflicts.map((group) => (
                                <div key={group.profesor} style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "10px 14px" }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                                        <button
                                            onClick={() => navigate("/show-schedule", { state: { profesor: group.profesor } })}
                                            title="Ver el horario de este profesor"
                                            style={{
                                                background: "none",
                                                border: "none",
                                                padding: 0,
                                                color: "#e2e8f0",
                                                font: "inherit",
                                                fontWeight: 700,
                                                textDecoration: "underline",
                                                textDecorationColor: "rgba(255,255,255,0.35)",
                                                textUnderlineOffset: 3,
                                                cursor: "pointer",
                                                textAlign: "left",
                                            }}
                                        >
                                            {group.profesor} →
                                        </button>
                                        <span style={{ color: "#fca5a5" }}>{group.conflicts.length} cruce(s)</span>
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                        {group.conflicts.map((c, i) => (
                                            <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                                                <b>{c.a.section.codigoMateria}</b> ({c.a.section.tipo === "TEORIA" ? "Teoría" : "Práctica"} P{c.a.section.paralelo}, {c.a.meeting.dia}{" "}
                                                {formatRange(c.a.meeting.startMin, c.a.meeting.endMin)})
                                                {" ⚠ se cruza con "}
                                                <b>{c.b.section.codigoMateria}</b> ({c.b.section.tipo === "TEORIA" ? "Teoría" : "Práctica"} P{c.b.section.paralelo}, {c.b.meeting.dia} {formatRange(c.b.meeting.startMin, c.b.meeting.endMin)})
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* ── Cruces por nivel ── */}
                <section style={cardStyle}>
                    <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}>¿Se puede tomar todo un nivel sin cruces?</h2>
                    <p style={{ margin: "0 0 14px", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                        Elige un nivel, deja que la herramienta busque una combinación de paralelos sin cruces, o ajústala tú mismo abajo.
                    </p>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <Combobox options={niveles} value={selectedNivel} onChange={setSelectedNivel} placeholder="Elige un nivel..." width={260} />
                        <button
                            onClick={handleAutoSearch}
                            disabled={!selectedNivel || codes.length === 0}
                            style={{
                                background: !selectedNivel || codes.length === 0 ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg, #6366f1, #ec4899)",
                                border: "none",
                                borderRadius: 8,
                                color: "#fff",
                                padding: "8px 16px",
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: !selectedNivel || codes.length === 0 ? "not-allowed" : "pointer",
                            }}
                        >
                            Buscar combinación sin cruces
                        </button>
                        <button
                            onClick={handleShowAllCombos}
                            disabled={!selectedNivel || codes.length === 0}
                            style={{
                                background: "rgba(255,255,255,0.1)",
                                border: "1px solid rgba(255,255,255,0.2)",
                                borderRadius: 8,
                                color: "#e2e8f0",
                                padding: "8px 16px",
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: !selectedNivel || codes.length === 0 ? "not-allowed" : "pointer",
                                opacity: !selectedNivel || codes.length === 0 ? 0.5 : 1,
                            }}
                        >
                            Ver todas las combinaciones sin cruces
                        </button>
                    </div>

                    {combosState.status === "ready" && (
                        <div
                            style={{
                                marginTop: 14,
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                background: "rgba(99,102,241,0.1)",
                                border: "1px solid rgba(99,102,241,0.35)",
                                borderRadius: 10,
                                padding: "8px 12px",
                            }}
                        >
                            <button
                                onClick={() => gotoCombo(-1)}
                                disabled={combosState.combos.length <= 1}
                                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "#e2e8f0", padding: "4px 10px", fontSize: 13, cursor: "pointer" }}
                            >
                                ‹
                            </button>
                            <span style={{ fontSize: 13 }}>
                                Combinación {combosState.index + 1} de {combosState.combos.length}
                                {combosState.truncated ? "+" : ""}
                            </span>
                            <button
                                onClick={() => gotoCombo(1)}
                                disabled={combosState.combos.length <= 1}
                                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "#e2e8f0", padding: "4px 10px", fontSize: 13, cursor: "pointer" }}
                            >
                                ›
                            </button>
                            {combosState.truncated && (
                                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                                    (se limitó la búsqueda a las primeras {combosState.combos.length} para no trabar el navegador)
                                </span>
                            )}
                        </div>
                    )}

                    {selectedNivel && codes.length === 0 && (
                        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 12 }}>Este nivel no tiene materias con horario cargado.</p>
                    )}

                    {autoResult.status === "found" && (
                        <div style={{ marginTop: 14, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.35)", borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>
                            ✅ Sí es posible — se armó una combinación sin cruces para las {autoResult.combo.length} materias de este nivel (aplicada abajo).
                        </div>
                    )}

                    {autoResult.status === "not-found" && (
                        <div style={{ marginTop: 14, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>
                            <div style={{ marginBottom: infeasiblePairs.length > 0 ? 8 : 0 }}>
                                ❌ No existe ninguna combinación de paralelos sin cruces para este nivel.
                            </div>
                            {infeasiblePairs.length > 0 && (
                                <div>
                                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
                                        Pares que siempre se cruzan (sin importar el paralelo elegido):
                                    </div>
                                    {infeasiblePairs.map((p, i) => (
                                        <div key={i} style={{ fontSize: 12 }}>
                                            • {p.materiaA} ({p.codigoA}) ↔ {p.materiaB} ({p.codigoB})
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {codes.length > 0 && (
                        <>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                                {codes.map((code, idx) => {
                                    const opts = optionsByCodigo.get(code) ?? [];
                                    const current = selection[code];
                                    const color = SUBJECT_COLORS[idx % SUBJECT_COLORS.length];
                                    const conflicted = conflictedCodes.has(code);
                                    return (
                                        <div key={code} style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, alignItems: "center" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                                                <span style={{ width: 10, height: 10, borderRadius: 3, background: color.bg, border: `1.5px solid ${color.border}`, flexShrink: 0 }} />
                                                <span style={{ fontWeight: 700 }}>{code}</span>
                                                {conflicted && <span title="Se cruza con otra materia elegida">⚠</span>}
                                            </div>
                                            <select
                                                value={current ? opts.indexOf(current) : 0}
                                                onChange={(e) => {
                                                    const opt = opts[Number(e.target.value)];
                                                    if (opt) setSelection((prev) => ({ ...prev, [code]: opt }));
                                                    setCombosState({ status: "idle" });
                                                }}
                                                style={{
                                                    background: "rgba(255,255,255,0.08)",
                                                    border: conflicted ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(255,255,255,0.2)",
                                                    borderRadius: 8,
                                                    color: "#e2e8f0",
                                                    padding: "6px 10px",
                                                    fontSize: 12,
                                                }}
                                            >
                                                {opts.map((opt, i) => (
                                                    <option key={i} value={i} style={{ background: "#302b63" }}>
                                                        {optionLabel(opt)}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    );
                                })}
                            </div>

                            <div style={{ marginTop: 16 }}>
                                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
                                    Huecos libres del nivel — ningún paralelo de ninguna materia tiene clase ahí, es donde cabría abrir un paralelo nuevo.
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
                                    {FREE_KIND_LEGEND.map(({ kind, label, bg, border }) => (
                                        <div key={kind} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <span style={{ width: 12, height: 12, borderRadius: 3, background: bg, border: `1px dashed ${border}`, flexShrink: 0 }} />
                                            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ marginTop: 8 }}>
                                <MiniWeekGrid blocks={blocks} freeBlocks={freeBlocks} />
                            </div>

                            {freeBlocks.length > 0 && (
                                <div style={{ marginTop: 12 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
                                        Huecos por día
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                        {["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES"].map((dia) => {
                                            const dayFree = freeBlocks.filter((f) => f.dia === dia);
                                            if (dayFree.length === 0) return null;
                                            return (
                                                <div key={dia} style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                                                    <b>{dia.charAt(0) + dia.slice(1).toLowerCase()}</b>:{" "}
                                                    {dayFree.map((f, i) => (
                                                        <span key={i}>
                                                            {formatRange(f.startMin, f.endMin)}
                                                            {f.freeIn !== "TODAS" ? ` (${f.freeIn}ª quincena)` : ""}
                                                            {i < dayFree.length - 1 ? " · " : ""}
                                                        </span>
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}

function formatRange(startMin: number, endMin: number): string {
    const fmt = (m: number) => `${Math.floor(m / 60).toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}`;
    return `${fmt(startMin)}-${fmt(endMin)}`;
}
