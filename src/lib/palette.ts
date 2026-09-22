import type { CSSProperties } from "react";

// Colores de las tarjetas de clase en las cuadrículas semanales (Schedule.tsx y
// MiniWeekGrid.tsx). Tonos apagados: `bg` es el relleno claro de la tarjeta y
// `border` el color de la franja izquierda / muestra en la leyenda.
export interface BlockColor {
    bg: string;
    border: string;
}

export const BLOCK_COLORS: BlockColor[] = [
    { bg: "#e3ebf6", border: "#3867a8" },
    { bg: "#dcefeb", border: "#2b7a6e" },
    { bg: "#f6ead2", border: "#a8741a" },
    { bg: "#f3dde4", border: "#a84464" },
    { bg: "#e5edda", border: "#4f7f2e" },
    { bg: "#eae2f1", border: "#74509a" },
    { bg: "#f5e0d6", border: "#b0532e" },
    { bg: "#dcecf4", border: "#2f7aa0" },
    { bg: "#e4e7ec", border: "#4f5d6e" },
    { bg: "#eeecd6", border: "#7a7430" },
    { bg: "#f1dddb", border: "#9c3b33" },
    { bg: "#e2e3f3", border: "#4a4f9c" },
];

export const CONFLICT_COLOR: BlockColor = { bg: "#fbe4e1", border: "#b42318" };

// Rayado diagonal para prácticas quincenales (patrón funcional, no decorativo).
export function quincenaHatch(quincena: 1 | 2): string {
    const c = quincena === 1 ? "rgba(154,101,18,0.10)" : "rgba(101,71,154,0.10)";
    return `repeating-linear-gradient(45deg, ${c} 0px, ${c} 2px, transparent 2px, transparent 7px)`;
}

export function badgeStyle(isTeoria: boolean, quincena: 1 | 2 | null): CSSProperties {
    if (isTeoria) return { background: "rgba(255,255,255,0.75)", color: "var(--text-2)" };
    if (quincena === 1) return { background: "var(--q1-soft)", color: "var(--q1)", boxShadow: "inset 0 0 0 1px var(--q1-border)" };
    if (quincena === 2) return { background: "var(--q2-soft)", color: "var(--q2)", boxShadow: "inset 0 0 0 1px var(--q2-border)" };
    return { background: "rgba(0,0,0,0.06)", color: "var(--text-2)" };
}
