import { useMemo } from "react";

export interface WeekBlock {
    id: string;
    dia: string; // LUNES, MARTES, MIÉRCOLES, JUEVES, VIERNES
    startMin: number;
    endMin: number;
    title: string;
    subtitle?: string;
    color: { bg: string; border: string };
    conflicted?: boolean;
}

interface MiniWeekGridProps {
    blocks: WeekBlock[];
}

const DAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const DAY_KEYS = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES"];

const GRID_START = 7 * 60;
const GRID_END = 22 * 60;
const SLOT_MINUTES = 30;
const TOTAL_SLOTS = (GRID_END - GRID_START) / SLOT_MINUTES;

// Cuadrícula semanal simple y autocontenida (no comparte código con el horario
// principal a propósito: aquí siempre son pocos bloques — el combo de un nivel — y no
// necesita todo el manejo de filtros/leyenda/tooltip del horario completo).
export default function MiniWeekGrid({ blocks }: MiniWeekGridProps) {
    const byDay = useMemo(() => {
        const map: Record<string, WeekBlock[]> = {};
        for (const key of DAY_KEYS) map[key] = [];
        for (const b of blocks) {
            if (map[b.dia]) map[b.dia].push(b);
        }
        return map;
    }, [blocks]);

    const timeLabels: { label: string; isHour: boolean }[] = [];
    for (let m = GRID_START; m <= GRID_END; m += 60) {
        timeLabels.push({ label: `${Math.floor(m / 60).toString().padStart(2, "0")}:00`, isHour: true });
    }

    return (
        <div
            style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                overflow: "hidden",
            }}
        >
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "50px repeat(5, 1fr)",
                    background: "rgba(255,255,255,0.08)",
                    borderBottom: "1px solid rgba(255,255,255,0.1)",
                }}
            >
                <div style={{ padding: "8px 6px", fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Hora</div>
                {DAY_LABELS.map((d) => (
                    <div key={d} style={{ padding: "8px 6px", fontSize: 11, fontWeight: 600, textAlign: "center" }}>
                        {d}
                    </div>
                ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "50px repeat(5, 1fr)", position: "relative" }}>
                <div style={{ position: "relative" }}>
                    {timeLabels.map(({ label }, i) => (
                        <div
                            key={label}
                            style={{
                                height: 60,
                                fontSize: 9,
                                color: "rgba(255,255,255,0.35)",
                                padding: "2px 4px 0 6px",
                                borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
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
                            {timeLabels.map((_, i) => (
                                <div
                                    key={i}
                                    style={{
                                        position: "absolute",
                                        top: i * 60,
                                        left: 0,
                                        right: 0,
                                        height: 1,
                                        background: i === 0 ? "transparent" : "rgba(255,255,255,0.06)",
                                    }}
                                />
                            ))}

                            {dayBlocks.map((b, i) => {
                                if (b.startMin < GRID_START || b.endMin > GRID_END) return null;
                                const top = ((b.startMin - GRID_START) / SLOT_MINUTES) * 30;
                                const h = Math.max(((b.endMin - b.startMin) / SLOT_MINUTES) * 30 - 4, 18);
                                const { col, totalCols } = layouts[i];
                                const pad = 3;
                                const leftOffset = `calc(${pad}px + (100% - ${pad * 2}px) / ${totalCols} * ${col})`;
                                const rightOffset = `calc(100% - ${pad}px - (100% - ${pad * 2}px) / ${totalCols} * ${col + 1})`;

                                return (
                                    <div
                                        key={b.id}
                                        title={`${b.title}${b.subtitle ? " — " + b.subtitle : ""}`}
                                        style={{
                                            position: "absolute",
                                            top: top + 2,
                                            left: leftOffset,
                                            right: rightOffset,
                                            height: h,
                                            background: b.conflicted ? "rgba(239,68,68,0.35)" : b.color.bg,
                                            border: b.conflicted ? "1.5px solid #ef4444" : `1.5px solid ${b.color.border}`,
                                            boxShadow: b.conflicted ? "0 0 0 2px rgba(239,68,68,0.35)" : "none",
                                            borderRadius: 5,
                                            padding: "3px 5px",
                                            overflow: "hidden",
                                            cursor: "default",
                                        }}
                                    >
                                        <div style={{ fontSize: 9, fontWeight: 700, color: "#fff", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {b.conflicted ? "⚠ " : ""}
                                            {b.title}
                                        </div>
                                        {h >= 34 && b.subtitle && (
                                            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.8)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                {b.subtitle}
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
    );
}
