// Declaración ambiental mínima de la API de chrome.storage que usa este proyecto.
// Solo existe en tiempo de ejecución cuando la app corre dentro de la extensión
// (chrome-extension://...); en el resto de casos (npm run dev, hosting normal) el
// helper de src/lib/storage.ts cae a localStorage. No se instala @types/chrome
// completo para no arrastrar cientos de APIs que no se usan.
declare const chrome:
  | {
      storage?: {
        local: {
          get(keys: string[], cb: (result: Record<string, unknown>) => void): void;
          set(items: Record<string, unknown>, cb?: () => void): void;
        };
      };
      runtime?: { id?: string };
    }
  | undefined;
