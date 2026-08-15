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

    const inputStyle: React.CSSProperties = {
        width: "100%",
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: 6,
        color: "#e2e8f0",
        padding: "6px 10px",
        fontSize: 13,
        boxSizing: "border-box",
    };

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
            <div style={{ maxWidth: 640, margin: "0 auto" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>⚙️ Configuración de niveles</h1>
                    <button
                        onClick={() => navigate(-1)}
                        style={{
                            background: "rgba(255,255,255,0.1)",
                            border: "1px solid rgba(255,255,255,0.2)",
                            borderRadius: 8,
                            color: "#e2e8f0",
                            padding: "6px 16px",
                            fontSize: 13,
                            cursor: "pointer",
                        }}
                    >
                        ← Volver
                    </button>
                </div>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 0 }}>
                    Mapeo de código de materia → nivel de la malla curricular. Se usa para clasificar
                    cada materia extraída. Los cambios se guardan en este navegador y los usa tanto la
                    extensión al extraer datos nuevos como este visualizador.
                </p>

                <div
                    style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 12,
                        padding: 16,
                    }}
                >
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 32px", gap: 8, fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6, padding: "0 2px" }}>
                        <span>Código de materia</span>
                        <span>Nivel</span>
                        <span />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflowY: "auto", padding: 2 }}>
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
                                    style={inputStyle}
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
                                    onClick={() => removeRow(row.id)}
                                    title="Eliminar"
                                    style={{
                                        background: "rgba(239,68,68,0.15)",
                                        border: "1px solid rgba(239,68,68,0.4)",
                                        borderRadius: 6,
                                        color: "#fca5a5",
                                        cursor: "pointer",
                                        fontSize: 13,
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={addRow}
                        style={{
                            marginTop: 12,
                            background: "rgba(255,255,255,0.1)",
                            border: "1px dashed rgba(255,255,255,0.3)",
                            borderRadius: 8,
                            color: "#e2e8f0",
                            padding: "8px 0",
                            width: "100%",
                            cursor: "pointer",
                            fontSize: 13,
                        }}
                    >
                        + Agregar materia
                    </button>

                    <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                        <button
                            onClick={handleSave}
                            style={{
                                flex: 1,
                                background: "linear-gradient(135deg, #6366f1, #ec4899)",
                                border: "none",
                                borderRadius: 8,
                                color: "#fff",
                                padding: "10px 0",
                                fontWeight: 700,
                                cursor: "pointer",
                                fontSize: 13,
                            }}
                        >
                            {saved ? "Guardado ✓" : "Guardar cambios"}
                        </button>
                        <button
                            onClick={handleReset}
                            style={{
                                background: "rgba(255,255,255,0.1)",
                                border: "1px solid rgba(255,255,255,0.2)",
                                borderRadius: 8,
                                color: "#e2e8f0",
                                padding: "10px 16px",
                                cursor: "pointer",
                                fontSize: 13,
                            }}
                        >
                            Restaurar por defecto
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
