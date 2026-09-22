const TOOLTIP_WIDTH = 290;
const TOOLTIP_HEIGHT = 260;
const MARGIN = 8;

// Ubica el tooltip junto al cursor/dedo sin que se salga de la pantalla (en celular el
// toque suele caer cerca del borde derecho o inferior).
export function tooltipPosition(x: number, y: number): { left: number; top: number } {
    const left = Math.max(MARGIN, Math.min(x + 12, window.innerWidth - TOOLTIP_WIDTH - MARGIN));
    const below = y + 12;
    const top = below + TOOLTIP_HEIGHT > window.innerHeight ? Math.max(MARGIN, y - TOOLTIP_HEIGHT - 12) : below;
    return { left, top };
}
