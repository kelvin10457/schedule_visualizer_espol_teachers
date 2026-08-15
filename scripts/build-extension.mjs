// Arma la carpeta extension-dist/ lista para "Cargar descomprimida" en chrome://extensions.
// No usa ningún bundler nuevo: el contenido de extension/ ya es JS plano, así que solo
// compila la app de React (vite build) con rutas relativas y copia todo junto.
import { execSync } from "node:child_process";
import { cpSync, rmSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "extension-dist");
const appOutDir = path.join(outDir, "app");
const extensionDir = path.join(root, "extension");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

console.log("1/2 Compilando la app de React (vite build)...");
execSync(`npx vite build --outDir "${appOutDir}" --base "./" --emptyOutDir`, {
  cwd: root,
  stdio: "inherit",
});

console.log("2/2 Copiando archivos de la extensión...");
// Se copia entrada por entrada (en vez de la carpeta extension/ entera) para no depender
// de si fs.cpSync anida "extension/" dentro de un outDir que ya existe (creado por vite arriba).
for (const entry of readdirSync(extensionDir)) {
  cpSync(path.join(extensionDir, entry), path.join(outDir, entry), { recursive: true });
}

console.log(`\nListo. Carga esta carpeta como extensión sin empaquetar:\n  ${outDir}\n`);
console.log("Pasos: chrome://extensions -> activar 'Modo de desarrollador' -> 'Cargar descomprimida' -> seleccionar esa carpeta.");
