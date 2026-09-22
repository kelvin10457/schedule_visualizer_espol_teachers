// Claves de storage compartidas entre páginas (ver src/lib/storage.ts).
export const SCRAPED_SUBJECTS_KEY = "scrapedSubjects";
// Snapshot del horario actualmente cargado en pantalla (venga de la extensión o de un
// CSV subido a mano), para que otras páginas como Conflicts.tsx puedan leerlo sin
// depender del state de react-router.
export const CURRENT_SUBJECTS_KEY = "currentSubjects";
// Nivel y paralelos elegidos en Conflicts.tsx, para restaurarlos al volver a la página.
export const CONFLICTS_SELECTION_KEY = "conflictsSelection";
