import { useState, useRef, useEffect, useMemo, type RefObject } from "react";

export interface PinnedOption {
    label: string;
    value: string;
}

interface ComboboxProps {
    options: string[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    width?: number | string;
    // Si true, un valor tecleado que no está en `options` igual se acepta al confirmar
    // (Enter / clic afuera). Si false, se revierte al valor anterior (comportamiento de
    // "elegir de la lista", usado por los filtros).
    allowCustom?: boolean;
    // Opción fija que siempre aparece arriba del todo sin filtrarse (p.ej. "Todos los X").
    pinnedOption?: PinnedOption;
    inputRef?: RefObject<HTMLInputElement | null>;
}

// Combobox genérico: campo de texto que sugiere opciones al escribir (las que empiezan
// con lo tecleado primero, luego las que solo lo contienen). Base de SearchableSelect
// (filtros, allowCustom=false) y del selector de nivel en Config (allowCustom=true).
export default function Combobox({
    options,
    value,
    onChange,
    placeholder,
    width = 220,
    allowCustom = false,
    pinnedOption,
    inputRef,
}: ComboboxProps) {
    const isPinnedValue = !!pinnedOption && value === pinnedOption.value;
    const [query, setQuery] = useState(isPinnedValue ? "" : value);
    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const queryRef = useRef(query);
    queryRef.current = query;

    useEffect(() => {
        setQuery(pinnedOption && value === pinnedOption.value ? "" : value);
    }, [value, pinnedOption]);

    function commit(raw: string) {
        const trimmed = raw.trim();
        if (!trimmed) {
            if (pinnedOption) {
                onChange(pinnedOption.value);
                setQuery("");
            } else if (allowCustom) {
                onChange("");
            } else {
                setQuery(isPinnedValue ? "" : value);
            }
            return;
        }
        const exact = options.find((o) => o.toLowerCase() === trimmed.toLowerCase());
        if (exact) {
            onChange(exact);
            setQuery(exact);
        } else if (allowCustom) {
            onChange(trimmed);
            setQuery(trimmed);
        } else {
            setQuery(isPinnedValue ? "" : value);
        }
    }

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
                commit(queryRef.current);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [options, allowCustom, pinnedOption, value]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        const starts: string[] = [];
        const contains: string[] = [];
        for (const o of options) {
            const lower = o.toLowerCase();
            if (lower.startsWith(q)) starts.push(o);
            else if (lower.includes(q)) contains.push(o);
        }
        return [...starts, ...contains];
    }, [options, query]);

    function selectOption(opt: string) {
        onChange(opt);
        setQuery(pinnedOption && opt === pinnedOption.value ? "" : opt);
        setOpen(false);
        setHighlight(0);
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
            setOpen(true);
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, filtered.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (filtered.length > 0 && filtered[highlight]) {
                selectOption(filtered[Math.min(highlight, filtered.length - 1)]);
            } else {
                commit(query);
                setOpen(false);
            }
        } else if (e.key === "Escape") {
            setOpen(false);
            setQuery(isPinnedValue ? "" : value);
        }
    }

    return (
        <div ref={containerRef} style={{ position: "relative", width }}>
            <input
                ref={inputRef}
                value={query}
                placeholder={placeholder}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setOpen(true);
                    setHighlight(0);
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={handleKeyDown}
                className="input"
                style={pinnedOption ? { paddingRight: 26 } : undefined}
            />
            {pinnedOption && !isPinnedValue && (
                <button
                    onMouseDown={(e) => {
                        e.preventDefault();
                        selectOption(pinnedOption.value);
                    }}
                    title="Quitar filtro"
                    style={{
                        position: "absolute",
                        right: 6,
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        color: "var(--text-3)",
                        cursor: "pointer",
                        fontSize: 12,
                        lineHeight: 1,
                        padding: 4,
                    }}
                >
                    ✕
                </button>
            )}
            {open && (
                <div
                    style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        right: 0,
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        padding: 4,
                        maxHeight: 240,
                        overflowY: "auto",
                        zIndex: 100,
                        boxShadow: "var(--shadow-pop)",
                    }}
                >
                    {pinnedOption && (
                        <div
                            onMouseDown={(e) => {
                                e.preventDefault();
                                selectOption(pinnedOption.value);
                            }}
                            style={{
                                padding: "6px 8px",
                                borderRadius: 4,
                                fontSize: 13,
                                cursor: "pointer",
                                color: "var(--text-2)",
                                fontWeight: isPinnedValue ? 600 : 400,
                                background: isPinnedValue ? "var(--accent-soft)" : "transparent",
                                borderBottom: "1px solid var(--border)",
                                marginBottom: 2,
                            }}
                        >
                            {pinnedOption.label}
                        </div>
                    )}
                    {filtered.length === 0 && (
                        <div style={{ padding: "6px 8px", fontSize: 12, color: "var(--text-3)" }}>
                            {allowCustom ? "Escribe para crear un nivel nuevo" : "Sin resultados"}
                        </div>
                    )}
                    {filtered.map((opt, i) => (
                        <div
                            key={opt}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                selectOption(opt);
                            }}
                            onMouseEnter={() => setHighlight(i)}
                            style={{
                                padding: "6px 8px",
                                borderRadius: 4,
                                fontSize: 13,
                                cursor: "pointer",
                                color: "var(--text)",
                                fontWeight: opt === value ? 600 : 400,
                                background:
                                    i === highlight
                                        ? "rgba(0,0,0,0.05)"
                                        : opt === value
                                            ? "var(--accent-soft)"
                                            : "transparent",
                            }}
                        >
                            {opt}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
