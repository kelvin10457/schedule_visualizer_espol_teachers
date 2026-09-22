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
import { BLOCK_COLORS } from "../lib/palette";

const FREE_KIND_LEGEND: { kind: FreeKind; label: string; bg: string; border: string }[] = [
    { kind: "TODAS", label: "Libre todas las semanas", bg: "rgba(30,122,76,0.10)", border: "rgba(30,122,76,0.5)" },
    { kind: "1", label: "Libre en 1ª quincena", bg: "rgba(154,101,18,0.10)", border: "rgba(154,101,18,0.5)" },
    { kind: "2", label: "Libre en 2ª quincena", bg: "rgba(101,71,154,0.10)", border: "rgba(101,71,154,0.5)" },
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
            const color = BLOCK_COLORS[idx % BLOCK_COLORS.length];
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
            <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-2)" }}>
                Cargando...
            </div>
        );
    }

    if (subjects.length === 0) {
        return (
            <div
                className="page"
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 16,
                }}
            >
                <p style={{ margin: 0, color: "var(--text-2)" }}>No hay ningún horario cargado todavía.</p>
                <button className="btn btn-primary" onClick={() => navigate("/")}>
                    Ir a cargar un horario
                </button>
            </div>
        );
    }

    const noLevel = !selectedNivel || codes.length === 0;

    return (
        <div className="page" style={{ padding: "32px 16px 60px" }}>
            <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                    <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Cruces de horario</h1>
                    <button className="btn" onClick={() => navigate(-1)}>
                        Volver
                    </button>
                </div>

                {/* ── Cruces de profesores ── */}
                <section className="card" style={{ padding: 20 }}>
                    <h2 className="section-title">Cruces entre profesores</h2>
                    <p className="section-desc" style={{ marginBottom: 16 }}>
                        Profesores con dos clases distintas que caen en el mismo día y horario. Haz clic en un nombre para ver su horario.
                    </p>

                    {professorConflicts.length === 0 ? (
                        <div className="callout callout-success">No se detectó ningún cruce entre profesores.</div>
                    ) : (
                        <div style={{ border: "1px solid var(--border)", borderRadius: 6 }}>
                            {professorConflicts.map((group, gIdx) => (
                                <div
                                    key={group.profesor}
                                    style={{ padding: "12px 14px", borderTop: gIdx === 0 ? "none" : "1px solid var(--border)" }}
                                >
                                    <div style={{ fontSize: 13, marginBottom: 6, display: "flex", justifyContent: "space-between", gap: 12 }}>
                                        <button
                                            className="link-button"
                                            onClick={() => navigate("/show-schedule", { state: { profesor: group.profesor } })}
                                            title="Ver el horario de este profesor"
                                            style={{ fontWeight: 600 }}
                                        >
                                            {group.profesor}
                                        </button>
                                        <span style={{ color: "var(--danger)", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}>
                                            {group.conflicts.length} {group.conflicts.length === 1 ? "cruce" : "cruces"}
                                        </span>
                                    </div>
                                    <div className="tabular" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                        {group.conflicts.map((c, i) => (
                                            <div key={i} style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>
                                                <b style={{ color: "var(--text)", fontWeight: 600 }}>{c.a.section.codigoMateria}</b> ({c.a.section.tipo === "TEORIA" ? "Teoría" : "Práctica"} P{c.a.section.paralelo}, {c.a.meeting.dia}{" "}
                                                {formatRange(c.a.meeting.startMin, c.a.meeting.endMin)})
                                                <span style={{ color: "var(--text-3)" }}>{" se cruza con "}</span>
                                                <b style={{ color: "var(--text)", fontWeight: 600 }}>{c.b.section.codigoMateria}</b> ({c.b.section.tipo === "TEORIA" ? "Teoría" : "Práctica"} P{c.b.section.paralelo}, {c.b.meeting.dia} {formatRange(c.b.meeting.startMin, c.b.meeting.endMin)})
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* ── Cruces por nivel ── */}
                <section className="card" style={{ padding: 20 }}>
                    <h2 className="section-title">¿Se puede tomar todo un nivel sin cruces?</h2>
                    <p className="section-desc" style={{ marginBottom: 16 }}>
                        Elige un nivel, deja que la herramienta busque una combinación de paralelos sin cruces, o ajústala tú mismo abajo.
                    </p>

                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <Combobox options={niveles} value={selectedNivel} onChange={setSelectedNivel} placeholder="Elige un nivel..." width={260} />
                        <button className="btn btn-primary" onClick={handleAutoSearch} disabled={noLevel}>
                            Buscar combinación sin cruces
                        </button>
                        <button className="btn" onClick={handleShowAllCombos} disabled={noLevel}>
                            Ver todas las combinaciones
                        </button>
                    </div>

                    {combosState.status === "ready" && (
                        <div
                            className="tabular"
                            style={{
                                marginTop: 14,
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                flexWrap: "wrap",
                            }}
                        >
                            <div style={{ display: "inline-flex", alignItems: "center", border: "1px solid var(--border-strong)", borderRadius: 6, overflow: "hidden" }}>
                                <button
                                    className="btn btn-ghost"
                                    onClick={() => gotoCombo(-1)}
                                    disabled={combosState.combos.length <= 1}
                                    aria-label="Combinación anterior"
                                    style={{ borderRadius: 0, width: 32, padding: 0 }}
                                >
                                    ‹
                                </button>
                                <span style={{ fontSize: 13, padding: "0 12px", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)", lineHeight: "32px" }}>
                                    Combinación {combosState.index + 1} de {combosState.combos.length}
                                    {combosState.truncated ? "+" : ""}
                                </span>
                                <button
                                    className="btn btn-ghost"
                                    onClick={() => gotoCombo(1)}
                                    disabled={combosState.combos.length <= 1}
                                    aria-label="Combinación siguiente"
                                    style={{ borderRadius: 0, width: 32, padding: 0 }}
                                >
                                    ›
                                </button>
                            </div>
                            {combosState.truncated && (
                                <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                                    Se limitó la búsqueda a las primeras {combosState.combos.length} para no trabar el navegador.
                                </span>
                            )}
                        </div>
                    )}

                    {selectedNivel && codes.length === 0 && (
                        <p style={{ fontSize: 13, color: "var(--text-2)", marginTop: 12, marginBottom: 0 }}>Este nivel no tiene materias con horario cargado.</p>
                    )}

                    {autoResult.status === "found" && (
                        <div className="callout callout-success" style={{ marginTop: 14 }}>
                            <strong style={{ fontWeight: 600 }}>Sí es posible.</strong> Se armó una combinación sin cruces para las {autoResult.combo.length} materias de este nivel (aplicada abajo).
                        </div>
                    )}

                    {autoResult.status === "not-found" && (
                        <div className="callout callout-danger" style={{ marginTop: 14 }}>
                            <div style={{ marginBottom: infeasiblePairs.length > 0 ? 8 : 0 }}>
                                <strong style={{ fontWeight: 600 }}>No es posible.</strong> No existe ninguna combinación de paralelos sin cruces para este nivel.
                            </div>
                            {infeasiblePairs.length > 0 && (
                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4, opacity: 0.8 }}>
                                        Pares que siempre se cruzan (sin importar el paralelo elegido):
                                    </div>
                                    <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>
                                        {infeasiblePairs.map((p, i) => (
                                            <li key={i} style={{ fontSize: 12 }}>
                                                {p.materiaA} ({p.codigoA}) ↔ {p.materiaB} ({p.codigoB})
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}

                    {codes.length > 0 && (
                        <>
                            <div style={{ marginTop: 20, border: "1px solid var(--border)", borderRadius: 6 }}>
                                {codes.map((code, idx) => {
                                    const opts = optionsByCodigo.get(code) ?? [];
                                    const current = selection[code];
                                    const color = BLOCK_COLORS[idx % BLOCK_COLORS.length];
                                    const conflicted = conflictedCodes.has(code);
                                    return (
                                        <div
                                            key={code}
                                            style={{
                                                display: "grid",
                                                gridTemplateColumns: "150px 1fr",
                                                gap: 12,
                                                alignItems: "center",
                                                padding: "8px 12px",
                                                borderTop: idx === 0 ? "none" : "1px solid var(--border)",
                                            }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                                                <span style={{ width: 8, height: 8, borderRadius: 2, background: color.border, flexShrink: 0 }} />
                                                <span style={{ fontWeight: 600 }}>{code}</span>
                                                {conflicted && (
                                                    <span title="Se cruza con otra materia elegida" style={{ fontSize: 11, color: "var(--danger)", fontWeight: 500 }}>
                                                        cruce
                                                    </span>
                                                )}
                                            </div>
                                            <select
                                                className={conflicted ? "input is-danger" : "input"}
                                                value={current ? opts.indexOf(current) : 0}
                                                onChange={(e) => {
                                                    const opt = opts[Number(e.target.value)];
                                                    if (opt) setSelection((prev) => ({ ...prev, [code]: opt }));
                                                    setCombosState({ status: "idle" });
                                                }}
                                            >
                                                {opts.map((opt, i) => (
                                                    <option key={i} value={i}>
                                                        {optionLabel(opt)}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    );
                                })}
                            </div>

                            <div style={{ marginTop: 20 }}>
                                <div className="eyebrow" style={{ marginBottom: 4 }}>
                                    Huecos libres del nivel
                                </div>
                                <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--text-2)" }}>
                                    Ningún paralelo de ninguna materia tiene clase ahí; es donde cabría abrir un paralelo nuevo.
                                </p>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
                                    {FREE_KIND_LEGEND.map(({ kind, label, bg, border }) => (
                                        <div key={kind} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <span style={{ width: 12, height: 12, borderRadius: 2, background: bg, border: `1px dashed ${border}`, flexShrink: 0 }} />
                                            <span style={{ fontSize: 12, color: "var(--text-2)" }}>{label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ marginTop: 10, overflowX: "auto" }}>
                                <div style={{ minWidth: 620 }}>
                                    <MiniWeekGrid blocks={blocks} freeBlocks={freeBlocks} />
                                </div>
                            </div>

                            {freeBlocks.length > 0 && (
                                <div style={{ marginTop: 16 }}>
                                    <div className="eyebrow" style={{ marginBottom: 6 }}>
                                        Huecos por día
                                    </div>
                                    <div className="tabular" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                        {["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES"].map((dia) => {
                                            const dayFree = freeBlocks.filter((f) => f.dia === dia);
                                            if (dayFree.length === 0) return null;
                                            return (
                                                <div key={dia} style={{ fontSize: 12, color: "var(--text-2)", display: "grid", gridTemplateColumns: "80px 1fr", gap: 8 }}>
                                                    <span style={{ fontWeight: 600, color: "var(--text)" }}>{dia.charAt(0) + dia.slice(1).toLowerCase()}</span>
                                                    <span>
                                                        {dayFree.map((f, i) => (
                                                            <span key={i}>
                                                                {formatRange(f.startMin, f.endMin)}
                                                                {f.freeIn !== "TODAS" ? ` (${f.freeIn}ª quincena)` : ""}
                                                                {i < dayFree.length - 1 ? " · " : ""}
                                                            </span>
                                                        ))}
                                                    </span>
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
