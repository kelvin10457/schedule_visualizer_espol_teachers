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
                style={{
                    width: "100%",
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 8,
                    color: "#e2e8f0",
                    padding: pinnedOption ? "6px 26px 6px 12px" : "6px 10px",
                    fontSize: 13,
                    boxSizing: "border-box",
                }}
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
                        color: "rgba(255,255,255,0.5)",
                        cursor: "pointer",
                        fontSize: 12,
                        padding: 2,
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
                        background: "#1e1b3a",
                        border: "1px solid rgba(255,255,255,0.2)",
                        borderRadius: 8,
                        maxHeight: 220,
                        overflowY: "auto",
                        zIndex: 100,
                        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                    }}
                >
                    {pinnedOption && (
                        <div
                            onMouseDown={(e) => {
                                e.preventDefault();
                                selectOption(pinnedOption.value);
                            }}
                            style={{
                                padding: "7px 12px",
                                fontSize: 13,
                                cursor: "pointer",
                                color: isPinnedValue ? "#fff" : "rgba(255,255,255,0.6)",
                                background: isPinnedValue ? "rgba(99,102,241,0.25)" : "transparent",
                            }}
                        >
                            {pinnedOption.label}
                        </div>
                    )}
                    {filtered.length === 0 && (
                        <div style={{ padding: "7px 12px", fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
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
                                padding: "7px 12px",
                                fontSize: 13,
                                cursor: "pointer",
                                color: "#e2e8f0",
                                background:
                                    i === highlight
                                        ? "rgba(99,102,241,0.3)"
                                        : opt === value
                                            ? "rgba(99,102,241,0.15)"
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
