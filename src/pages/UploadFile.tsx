import { useState, useRef, type ChangeEvent, type DragEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function UploadFile() {
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [dragging, setDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();

    function handleChange(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file && file.name.endsWith(".csv")) {
            setCsvFile(file);
        } else {
            alert("Ingrese un archivo .csv");
            e.target.value = "";
        }
    }

    function handleDrop(e: DragEvent<HTMLDivElement>) {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.name.endsWith(".csv")) {
            setCsvFile(file);
        } else {
            alert("Ingrese un archivo .csv");
        }
    }

    function handleDragOver(e: DragEvent<HTMLDivElement>) {
        e.preventDefault();
        setDragging(true);
    }

    function handleDragLeave() {
        setDragging(false);
    }

    function handleContinue() {
        if (csvFile) {
            navigate("/show-schedule", { state: { file: csvFile } });
        }
    }

    return (
        <div
            id="upload-page"
            style={{
                minHeight: "100vh",
                background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
                fontFamily: "'Inter', 'Segoe UI', sans-serif",
                color: "#e2e8f0",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "32px 16px",
            }}
        >
            {/* ── Glass card ── */}
            <div
                style={{
                    background: "rgba(255,255,255,0.05)",
                    backdropFilter: "blur(16px)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 20,
                    padding: "48px 44px",
                    width: "100%",
                    maxWidth: 480,
                    boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 32,
                }}
            >
                {/* Logo / brand */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                    <div
                        style={{
                            width: 60,
                            height: 60,
                            borderRadius: 16,
                            background: "linear-gradient(135deg, #6366f1, #ec4899)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 28,
                            boxShadow: "0 8px 24px rgba(99,102,241,0.4)",
                        }}
                    >
                        📅
                    </div>
                    <div style={{ textAlign: "center" }}>
                        <h1
                            style={{
                                margin: 0,
                                fontSize: 22,
                                fontWeight: 700,
                                letterSpacing: "-0.5px",
                                color: "#fff",
                            }}
                        >
                            Visualizador de Horarios
                        </h1>
                        <p
                            style={{
                                margin: "6px 0 0",
                                fontSize: 13,
                                color: "rgba(255,255,255,0.45)",
                            }}
                        >
                            ESPOL · Sube tu archivo de horarios
                        </p>
                    </div>
                </div>

                {/* Drop zone */}
                <div
                    id="drop-zone"
                    onClick={() => inputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    style={{
                        width: "100%",
                        border: `2px dashed ${dragging ? "#6366f1" : csvFile ? "#10b981" : "rgba(255,255,255,0.2)"}`,
                        borderRadius: 14,
                        padding: "32px 20px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 10,
                        cursor: "pointer",
                        background: dragging
                            ? "rgba(99,102,241,0.1)"
                            : csvFile
                                ? "rgba(16,185,129,0.08)"
                                : "rgba(255,255,255,0.03)",
                        transition: "border-color 0.2s, background 0.2s",
                        boxSizing: "border-box",
                    }}
                >
                    <span style={{ fontSize: 36 }}>
                        {csvFile ? "✅" : dragging ? "📂" : "📁"}
                    </span>

                    {csvFile ? (
                        <>
                            <p
                                style={{
                                    margin: 0,
                                    fontWeight: 600,
                                    fontSize: 14,
                                    color: "#10b981",
                                }}
                            >
                                {csvFile.name}
                            </p>
                            <p
                                style={{
                                    margin: 0,
                                    fontSize: 12,
                                    color: "rgba(255,255,255,0.4)",
                                }}
                            >
                                {(csvFile.size / 1024).toFixed(1)} KB · Haz clic para cambiar
                            </p>
                        </>
                    ) : (
                        <>
                            <p
                                style={{
                                    margin: 0,
                                    fontWeight: 600,
                                    fontSize: 14,
                                    color: "rgba(255,255,255,0.8)",
                                }}
                            >
                                Arrastra tu archivo .csv aquí
                            </p>
                            <p
                                style={{
                                    margin: 0,
                                    fontSize: 12,
                                    color: "rgba(255,255,255,0.4)",
                                }}
                            >
                                o haz clic para seleccionar
                            </p>
                        </>
                    )}

                    <input
                        ref={inputRef}
                        id="csv-input"
                        type="file"
                        accept=".csv"
                        onChange={handleChange}
                        style={{ display: "none" }}
                    />
                </div>

                {/* Continue button — only visible when file is loaded */}
                <div
                    style={{
                        width: "100%",
                        overflow: "hidden",
                        maxHeight: csvFile ? 60 : 0,
                        opacity: csvFile ? 1 : 0,
                        transition: "max-height 0.3s ease, opacity 0.3s ease",
                    }}
                >
                    <button
                        id="btn-continue"
                        onClick={handleContinue}
                        style={{
                            width: "100%",
                            padding: "13px 0",
                            background: "linear-gradient(135deg, #6366f1, #ec4899)",
                            border: "none",
                            borderRadius: 10,
                            color: "#fff",
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: "pointer",
                            letterSpacing: "0.2px",
                            boxShadow: "0 6px 20px rgba(99,102,241,0.35)",
                            transition: "opacity 0.2s, transform 0.15s",
                        }}
                        onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.opacity = "0.88";
                            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.01)";
                        }}
                        onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.opacity = "1";
                            (e.currentTarget as HTMLButtonElement).style.transform = "";
                        }}
                    >
                        Continuar al horario →
                    </button>
                </div>

                {/* Footer note */}
                <p
                    style={{
                        margin: 0,
                        fontSize: 11,
                        color: "rgba(255,255,255,0.25)",
                        textAlign: "center",
                    }}
                >
                    Solo se aceptan archivos .csv generados por el sistema de ESPOL
                </p>

                <Link
                    to="/config"
                    style={{
                        fontSize: 11,
                        color: "rgba(165,180,252,0.8)",
                        textDecoration: "underline",
                    }}
                >
                    ⚙️ Configurar niveles de la malla curricular
                </Link>
            </div>
        </div>
    );
}