import { useEffect, useMemo, useState } from "react";
import Subject from "../models/Subject";
import { tooltipPosition } from "../lib/tooltip";

export interface WeekBlock {
    id: string;
    dia: string; // LUNES, MARTES, MIÉRCOLES, JUEVES, VIERNES
    startMin: number;
    endMin: number;
    title: string;
    subtitle?: string;
    color: { bg: string; border: string };
    conflicted?: boolean;
    // Fila original — se usa para el tooltip detallado y el badge de tipo/quincena,
    // igual que en el horario principal (Schedule.tsx).
    subject: Subject;
}

export type FreeKind = "TODAS" | "1" | "2";

export interface FreeBlockInput {
    dia: string;
    startMin: number;
    endMin: number;
    freeIn: FreeKind;
}

const FREE_KIND_STYLE: Record<FreeKind, { bg: string; border: string; label: string }> = {
    TODAS: { bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.4)", label: "Libre todas las semanas" },
    "1": { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.45)", label: "Libre en 1ª quincena" },
    "2": { bg: "rgba(168,85,247,0.12)", border: "rgba(168,85,247,0.45)", label: "Libre en 2ª quincena" },
};

function fmtTime(m: number): string {
    return `${Math.floor(m / 60).toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}`;
}

function blockTooltipRows(b: WeekBlock): [string, string | number][] {
    const s = b.subject;
    const pq = s.planificada_quincenalmente?.trim().toUpperCase() ?? "";
    const rows: [string, string | number][] = [
        ["Código", s.codigo_materia],
        ["Tipo", s.tipo],
        ["Paralelo", s.paralelo],
        ["Profesor", s.profesor],
        ["Horario", `${fmtTime(b.startMin)} – ${fmtTime(b.endMin)}`],
        ["Aula", `${s.aula} · ${s.bloque}`],
        ["Cupo", `${s.cupo_disponible} / ${s.cupo_maximo}`],
        ["Nivel", s.nivel],
    ];
    if (pq === "1 QUINCENA" || pq === "2 QUINCENA") {
        rows.push(["Quincena", pq === "1 QUINCENA" ? "1ª Quincena" : "2ª Quincena"]);
    }
    return rows;
}

function TooltipTable({ rows }: { rows: [string, string | number][] }) {
    return (
        <table style={{ borderSpacing: "4px 3px", fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
            <tbody>
                {rows.map(([label, val]) => (
                    <tr key={label}>
                        <td style={{ color: "rgba(255,255,255,0.4)", paddingRight: 8, whiteSpace: "nowrap" }}>{label}</td>
                        <td style={{ color: "#e2e8f0", fontWeight: 500 }}>{val}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

interface MiniWeekGridProps {
    blocks: WeekBlock[];
    freeBlocks?: FreeBlockInput[];
}

const DAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const DAY_KEYS = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES"];

const GRID_START = 7 * 60;
const GRID_END = 22 * 60;
const SLOT_MINUTES = 30;
const TOTAL_SLOTS = (GRID_END - GRID_START) / SLOT_MINUTES;

type TooltipContent = { block: WeekBlock; free?: undefined } | { free: FreeBlockInput; block?: undefined };

type TooltipInfo = TooltipContent & { key: string; x: number; y: number };

// Cuadrícula semanal con el mismo lenguaje visual que el horario principal
// (Schedule.tsx): grilla de 30 min con línea marcada cada hora, tarjetas con badge
// TEO/PRA + rayado de quincena, y tooltip con los datos de la fila. El tooltip se abre
// al pasar el mouse o, en pantallas táctiles, al tocar (y se cierra tocando de nuevo o
// tocando fuera).
export default function MiniWeekGrid({ blocks, freeBlocks }: MiniWeekGridProps) {
    const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

    useEffect(() => {
        if (!tooltip) return;
        const closeOnOutsideTouch = (e: PointerEvent) => {
            if (e.pointerType !== "mouse") setTooltip(null);
        };
        document.addEventListener("pointerdown", closeOnOutsideTouch);
        return () => document.removeEventListener("pointerdown", closeOnOutsideTouch);
    }, [tooltip]);

    function hoverTooltip(e: React.PointerEvent, key: string, content: TooltipContent) {
        if (e.pointerType === "mouse") setTooltip({ ...content, key, x: e.clientX, y: e.clientY });
    }

    function hideHoverTooltip(e: React.PointerEvent) {
        if (e.pointerType === "mouse") setTooltip(null);
    }

    // Evita que el listener de "tocar fuera" cierre el tooltip que este mismo toque va a abrir.
    function keepTouchInside(e: React.PointerEvent) {
        if (e.pointerType !== "mouse") e.stopPropagation();
    }

    function tapTooltip(e: React.PointerEvent, key: string, content: TooltipContent) {
        if (e.pointerType === "mouse") return;
        const { clientX, clientY } = e;
        setTooltip((prev) => (prev?.key === key ? null : { ...content, key, x: clientX, y: clientY }));
    }

    const byDay = useMemo(() => {
        const map: Record<string, WeekBlock[]> = {};
        for (const key of DAY_KEYS) map[key] = [];
        for (const b of blocks) {
            if (map[b.dia]) map[b.dia].push(b);
        }
        return map;
    }, [blocks]);

    const freeByDay = useMemo(() => {
        const map: Record<string, FreeBlockInput[]> = {};
        for (const key of DAY_KEYS) map[key] = [];
        for (const f of freeBlocks ?? []) {
            if (map[f.dia]) map[f.dia].push(f);
        }
        return map;
    }, [freeBlocks]);

    const timeLabels: { label: string; isHour: boolean }[] = [];
    for (let m = GRID_START; m <= GRID_END; m += SLOT_MINUTES) {
        const h = Math.floor(m / 60);
        const min = m % 60;
        timeLabels.push({
            label: `${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`,
            isHour: min === 0,
        });
    }

    return (
        <div
            style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 16,
                overflow: "hidden",
            }}
        >
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "64px repeat(5, 1fr)",
                    background: "rgba(255,255,255,0.08)",
                    borderBottom: "1px solid rgba(255,255,255,0.1)",
                }}
            >
                <div style={{ padding: "12px 8px", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Hora</div>
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

            <div style={{ display: "grid", gridTemplateColumns: "64px repeat(5, 1fr)", position: "relative" }}>
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
                                color: isHour ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.22)",
                                borderTop:
                                    i === 0 ? "none" : isHour ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,255,255,0.03)",
                                fontWeight: isHour ? 500 : 400,
                            }}
                        >
                            {label}
                        </div>
                    ))}
                </div>

                {DAY_KEYS.map((dayKey) => {
                    const dayBlocks = byDay[dayKey] ?? [];

                    // Mismo algoritmo de columnas lado a lado que Schedule.tsx, pero
                    // deliberadamente duplicado aquí: el dataset es chico (un combo de
                    // nivel) y no vale la pena acoplar ambos componentes para esto.
                    type Layout = { col: number; totalCols: number };
                    const n = dayBlocks.length;
                    const layouts: Layout[] = new Array(n).fill(null).map(() => ({ col: 0, totalCols: 1 }));

                    if (n > 0) {
                        const overlaps = (a: WeekBlock, b: WeekBlock) => a.startMin < b.endMin && b.startMin < a.endMin;
                        const order = Array.from({ length: n }, (_, i) => i).sort(
                            (a, b) => dayBlocks[a].startMin - dayBlocks[b].startMin
                        );
                        const colOf: number[] = new Array(n).fill(-1);
                        for (const i of order) {
                            const used = new Set<number>();
                            for (let j = 0; j < n; j++) {
                                if (colOf[j] >= 0 && overlaps(dayBlocks[i], dayBlocks[j])) used.add(colOf[j]);
                            }
                            let col = 0;
                            while (used.has(col)) col++;
                            colOf[i] = col;
                        }
                        const maxColOf = colOf.slice();
                        for (let i = 0; i < n; i++) {
                            for (let j = 0; j < n; j++) {
                                if (i !== j && overlaps(dayBlocks[i], dayBlocks[j])) {
                                    maxColOf[i] = Math.max(maxColOf[i], colOf[j]);
                                }
                            }
                        }
                        for (let i = 0; i < n; i++) layouts[i] = { col: colOf[i], totalCols: maxColOf[i] + 1 };
                    }

                    return (
                        <div
                            key={dayKey}
                            style={{
                                position: "relative",
                                borderLeft: "1px solid rgba(255,255,255,0.07)",
                                height: TOTAL_SLOTS * 30,
                            }}
                        >
                            {timeLabels.map(({ isHour }, i) => (
                                <div
                                    key={i}
                                    style={{
                                        position: "absolute",
                                        top: i * 30,
                                        left: 0,
                                        right: 0,
                                        height: 1,
                                        background: i === 0 ? "transparent" : isHour ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                                        pointerEvents: "none",
                                    }}
                                />
                            ))}

                            {(freeByDay[dayKey] ?? []).map((f, i) => {
                                if (f.startMin < GRID_START || f.endMin > GRID_END) return null;
                                const top = ((f.startMin - GRID_START) / SLOT_MINUTES) * 30;
                                const h = ((f.endMin - f.startMin) / SLOT_MINUTES) * 30;
                                const style = FREE_KIND_STYLE[f.freeIn];
                                const tipKey = `free-${dayKey}-${i}`;
                                return (
                                    <div
                                        key={`free-${i}`}
                                        onPointerMove={(e) => hoverTooltip(e, tipKey, { free: f })}
                                        onPointerLeave={hideHoverTooltip}
                                        onPointerDown={keepTouchInside}
                                        onPointerUp={(e) => tapTooltip(e, tipKey, { free: f })}
                                        style={{
                                            position: "absolute",
                                            top,
                                            left: 0,
                                            right: 0,
                                            height: h,
                                            background: style.bg,
                                            borderTop: `1px dashed ${style.border}`,
                                            borderBottom: `1px dashed ${style.border}`,
                                        }}
                                    />
                                );
                            })}

                            {dayBlocks.map((b, i) => {
                                if (b.startMin < GRID_START || b.endMin > GRID_END) return null;
                                const top = ((b.startMin - GRID_START) / SLOT_MINUTES) * 30;
                                const height = ((b.endMin - b.startMin) / SLOT_MINUTES) * 30;
                                const h = Math.max(height - 4, 18);
                                const { col, totalCols } = layouts[i];
                                const pad = 4;
                                const leftOffset = `calc(${pad}px + (100% - ${pad * 2}px) / ${totalCols} * ${col})`;
                                const rightOffset = `calc(100% - ${pad}px - (100% - ${pad * 2}px) / ${totalCols} * ${col + 1})`;

                                const isTEORIA = b.subject.tipo === "TEORIA";
                                const pq = b.subject.planificada_quincenalmente?.trim().toUpperCase() ?? "";
                                const quincena = pq === "1 QUINCENA" ? 1 : pq === "2 QUINCENA" ? 2 : null;
                                const restingShadow = b.conflicted
                                    ? "0 0 0 2px rgba(239,68,68,0.5), 0 2px 12px rgba(239,68,68,0.5)"
                                    : `0 2px 12px ${b.color.border}40`;

                                return (
                                    <div
                                        key={b.id}
                                        onPointerMove={(e) => hoverTooltip(e, b.id, { block: b })}
                                        onPointerDown={keepTouchInside}
                                        onPointerUp={(e) => tapTooltip(e, b.id, { block: b })}
                                        onPointerLeave={(e) => {
                                            if (e.pointerType !== "mouse") return;
                                            setTooltip(null);
                                            const el = e.currentTarget;
                                            el.style.transform = "";
                                            el.style.zIndex = String(10 + col);
                                            el.style.boxShadow = restingShadow;
                                        }}
                                        onPointerEnter={(e) => {
                                            if (e.pointerType !== "mouse") return;
                                            const el = e.currentTarget;
                                            el.style.transform = "scale(1.02)";
                                            el.style.zIndex = "25";
                                            el.style.boxShadow = `0 6px 20px ${b.color.border}80`;
                                        }}
                                        style={{
                                            position: "absolute",
                                            top: top + 2,
                                            left: leftOffset,
                                            right: rightOffset,
                                            marginLeft: col > 0 ? 2 : 0,
                                            marginRight: col < totalCols - 1 ? 2 : 0,
                                            height: h,
                                            background: b.conflicted ? "rgba(239,68,68,0.35)" : b.color.bg,
                                            border: b.conflicted ? "1.5px solid #ef4444" : `1.5px solid ${b.color.border}`,
                                            borderRadius: 6,
                                            padding: "4px 6px",
                                            cursor: "pointer",
                                            overflow: "hidden",
                                            backdropFilter: "blur(4px)",
                                            boxShadow: restingShadow,
                                            transition: "transform 0.15s, box-shadow 0.15s",
                                            zIndex: 10 + col,
                                        }}
                                    >
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
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {isTEORIA ? "TEO" : quincena ? `PRA · Q${quincena}` : "PRA"}
                                        </div>

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
                                            {b.conflicted ? "⚠ " : ""}
                                            {b.title}
                                        </div>
                                        {height >= 36 && b.subtitle && (
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
                                                {b.subtitle}
                                            </div>
                                        )}
                                        {height >= 52 && b.subject.aula && (
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
                                                🏫 {b.subject.aula}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>

            {tooltip && (
                <div
                    style={{
                        position: "fixed",
                        ...tooltipPosition(tooltip.x, tooltip.y),
                        background: "rgba(15,12,41,0.97)",
                        border: `1px solid ${tooltip.block ? tooltip.block.color.border : FREE_KIND_STYLE[tooltip.free.freeIn].border}`,
                        borderRadius: 10,
                        padding: "12px 14px",
                        zIndex: 999,
                        maxWidth: 280,
                        pointerEvents: "none",
                        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                    }}
                >
                    {tooltip.block ? (
                        <>
                            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: "#fff" }}>
                                {tooltip.block.subject.materia}
                            </div>
                            <TooltipTable rows={blockTooltipRows(tooltip.block)} />
                        </>
                    ) : (
                        <>
                            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: "#fff" }}>
                                {FREE_KIND_STYLE[tooltip.free.freeIn].label}
                            </div>
                            <TooltipTable
                                rows={[
                                    ["Horario", `${fmtTime(tooltip.free.startMin)} – ${fmtTime(tooltip.free.endMin)}`],
                                    [
                                        "Detalle",
                                        tooltip.free.freeIn === "TODAS"
                                            ? "Ninguna clase del nivel en esta franja"
                                            : `Solo hay clases de la ${tooltip.free.freeIn === "1" ? "2ª" : "1ª"} quincena`,
                                    ],
                                ]}
                            />
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
