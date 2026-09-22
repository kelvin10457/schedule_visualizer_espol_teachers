import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getStorageItem, setStorageItem } from "../lib/storage";
import { DEFAULT_MALLA_CURRICULAR, MALLA_CURRICULAR_STORAGE_KEY } from "../lib/mallaCurricular";
import Combobox from "../components/Combobox";

interface Row {
    id: number;
    codigo: string;
    nivel: string;
}

function mapToRows(map: Record<string, string>, nextId: () => number): Row[] {
    return Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([codigo, nivel]) => ({ id: nextId(), codigo, nivel }));
}

export default function Config() {
    const navigate = useNavigate();
    const [rows, setRows] = useState<Row[]>([]);
    const [saved, setSaved] = useState(false);
    const [highlightId, setHighlightId] = useState<number | null>(null);

    const idCounter = useRef(0);
    const nextId = () => ++idCounter.current;

    const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const codigoInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

    useEffect(() => {
        getStorageItem(MALLA_CURRICULAR_STORAGE_KEY, DEFAULT_MALLA_CURRICULAR).then((map) => {
            setRows(mapToRows(map, nextId));
        });
    }, []);

    useEffect(() => {
        if (highlightId == null) return;
        rowRefs.current[highlightId]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        codigoInputRefs.current[highlightId]?.focus();
    }, [highlightId]);

    const nivelOptions = useMemo(() => {
        const set = new Set(rows.map((r) => r.nivel.trim().toUpperCase()).filter(Boolean));
        return Array.from(set).sort();
    }, [rows]);

    function updateRow(id: number, field: keyof Omit<Row, "id">, value: string) {
        setSaved(false);
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    }

    function removeRow(id: number) {
        setSaved(false);
        setRows((prev) => prev.filter((r) => r.id !== id));
        delete rowRefs.current[id];
        delete codigoInputRefs.current[id];
    }

    function addRow() {
        setSaved(false);
        const row: Row = { id: nextId(), codigo: "", nivel: "" };
        setRows((prev) => [...prev, row]);
        setHighlightId(row.id);
    }

    async function handleSave() {
        const map: Record<string, string> = {};
        for (const row of rows) {
            const codigo = row.codigo.trim().toUpperCase();
            const nivel = row.nivel.trim().toUpperCase();
            if (codigo && nivel) map[codigo] = nivel;
        }
        await setStorageItem(MALLA_CURRICULAR_STORAGE_KEY, map);
        setSaved(true);
    }

    async function handleReset() {
        setRows(mapToRows(DEFAULT_MALLA_CURRICULAR, nextId));
        setSaved(false);
    }

    return (
        <div className="page" style={{ padding: "32px 16px 60px" }}>
            <div style={{ maxWidth: 640, margin: "0 auto" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Niveles de la malla curricular</h1>
                        <p className="section-desc" style={{ maxWidth: 520 }}>
                            Mapeo de código de materia → nivel. Se usa para clasificar cada materia extraída.
                            Los cambios se guardan en este navegador y los usan tanto la extensión como este
                            visualizador.
                        </p>
                    </div>
                    <button className="btn" onClick={() => navigate(-1)}>
                        Volver
                    </button>
                </div>

                <div className="card">
                    <div
                        className="eyebrow"
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 32px",
                            gap: 8,
                            padding: "10px 16px",
                            borderBottom: "1px solid var(--border)",
                            background: "var(--surface-2)",
                            borderRadius: "8px 8px 0 0",
                        }}
                    >
                        <span>Código de materia</span>
                        <span>Nivel</span>
                        <span />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 440, overflowY: "auto", padding: "10px 16px" }}>
                        {rows.map((row) => (
                            <div
                                key={row.id}
                                ref={(el) => {
                                    rowRefs.current[row.id] = el;
                                }}
                                onAnimationEnd={() => {
                                    setHighlightId((current) => (current === row.id ? null : current));
                                }}
                                className={row.id === highlightId ? "row-added" : undefined}
                                style={{ display: "grid", gridTemplateColumns: "1fr 1fr 32px", gap: 8 }}
                            >
                                <input
                                    ref={(el) => {
                                        codigoInputRefs.current[row.id] = el;
                                    }}
                                    className="input"
                                    value={row.codigo}
                                    placeholder="ELEG1028"
                                    onChange={(e) => updateRow(row.id, "codigo", e.target.value)}
                                />
                                <Combobox
                                    options={nivelOptions}
                                    value={row.nivel}
                                    onChange={(v) => updateRow(row.id, "nivel", v)}
                                    placeholder="NIVEL 200 - II"
                                    width="100%"
                                    allowCustom
                                />
                                <button
                                    className="btn btn-danger-ghost"
                                    onClick={() => removeRow(row.id)}
                                    title="Eliminar"
                                    aria-label="Eliminar fila"
                                    style={{ padding: 0, width: 32 }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                        <path d="M4 4l8 8M12 4l-8 8" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>

                    <div style={{ padding: "0 16px 16px" }}>
                        <button className="btn btn-ghost" onClick={addRow} style={{ width: "100%", border: "1px dashed var(--border-strong)" }}>
                            + Agregar materia
                        </button>
                    </div>

                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 10,
                            padding: "12px 16px",
                            borderTop: "1px solid var(--border)",
                            background: "var(--surface-2)",
                            borderRadius: "0 0 8px 8px",
                        }}
                    >
                        <button className="btn btn-ghost" onClick={handleReset}>
                            Restaurar por defecto
                        </button>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            {saved && <span style={{ fontSize: 13, color: "var(--success)" }}>Cambios guardados</span>}
                            <button className="btn btn-primary" onClick={handleSave}>
                                Guardar cambios
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
