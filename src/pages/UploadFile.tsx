import { useState, useRef, type ChangeEvent, type DragEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppMark from "../components/AppMark";

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
            className="page"
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "32px 16px",
            }}
        >
            <div
                className="card"
                style={{
                    padding: "32px 28px",
                    width: "100%",
                    maxWidth: 440,
                    display: "flex",
                    flexDirection: "column",
                    gap: 20,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <AppMark size={36} />
                    <div>
                        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Visualizador de Horarios</h1>
                        <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--text-2)" }}>
                            ESPOL · Sube tu archivo de horarios
                        </p>
                    </div>
                </div>

                {/* Drop zone */}
                <div
                    id="drop-zone"
                    role="button"
                    tabIndex={0}
                    onClick={() => inputRef.current?.click()}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
                    }}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    style={{
                        width: "100%",
                        border: `1px dashed ${dragging ? "var(--accent)" : csvFile ? "var(--success-border)" : "var(--border-strong)"}`,
                        borderRadius: 8,
                        padding: "28px 20px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 6,
                        cursor: "pointer",
                        textAlign: "center",
                        background: dragging ? "var(--accent-soft)" : csvFile ? "var(--success-soft)" : "var(--surface-2)",
                        transition: "border-color 0.15s, background-color 0.15s",
                    }}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={csvFile ? "var(--success)" : "var(--text-3)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 4 }}>
                        {csvFile ? (
                            <>
                                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                                <path d="M14 3v5h5M9 14l2 2 4-4" />
                            </>
                        ) : (
                            <path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                        )}
                    </svg>

                    {csvFile ? (
                        <>
                            <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: "var(--text)", wordBreak: "break-all" }}>
                                {csvFile.name}
                            </p>
                            <p style={{ margin: 0, fontSize: 12, color: "var(--text-2)" }}>
                                {(csvFile.size / 1024).toFixed(1)} KB · Haz clic para cambiar
                            </p>
                        </>
                    ) : (
                        <>
                            <p style={{ margin: 0, fontWeight: 500, fontSize: 14, color: "var(--text)" }}>
                                Arrastra tu archivo .csv aquí
                            </p>
                            <p style={{ margin: 0, fontSize: 12, color: "var(--text-2)" }}>
                                o haz clic para seleccionarlo
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

                <button
                    id="btn-continue"
                    className="btn btn-primary btn-lg"
                    onClick={handleContinue}
                    disabled={!csvFile}
                    style={{ width: "100%" }}
                >
                    Continuar al horario
                </button>

                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                        paddingTop: 16,
                        borderTop: "1px solid var(--border)",
                        fontSize: 12,
                        color: "var(--text-3)",
                    }}
                >
                    <span>Solo archivos .csv generados por el sistema de ESPOL</span>
                    <Link to="/config" className="link-button" style={{ color: "var(--text-2)" }}>
                        Configurar niveles
                    </Link>
                </div>
            </div>
        </div>
    );
}
