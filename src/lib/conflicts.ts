import Subject from "../models/Subject";
import { timeToMinutes } from "./time";

export interface Meeting {
    dia: string;
    startMin: number;
    endMin: number;
    row: Subject;
}

export interface Section {
    codigoMateria: string;
    materia: string;
    tipo: "TEORIA" | "PRACTICO";
    paralelo: number;
    profesor: string;
    nivel: string;
    // Números de paralelo de práctica ligados a esta sección (solo relevante en TEORIA;
    // viene del campo "paralelos_asociados" que main.py copia igual en todas las filas
    // de un mismo paralelo de teoría).
    paralelosAsociados: number[];
    meetings: Meeting[];
}

export interface SubjectOption {
    codigoMateria: string;
    materia: string;
    teoria: Section;
    practica: Section | null;
    meetings: Meeting[];
}

export interface ConflictPair {
    a: { section: Section; meeting: Meeting };
    b: { section: Section; meeting: Meeting };
}

export interface ProfessorConflictGroup {
    profesor: string;
    conflicts: ConflictPair[];
}

export interface SubjectPairFeasibility {
    codigoA: string;
    materiaA: string;
    codigoB: string;
    materiaB: string;
    feasible: boolean;
}

type Quincena = "1" | "2" | "TODAS";

function quincenaOf(row: Subject): Quincena {
    const pq = (row.planificada_quincenalmente || "").trim().toUpperCase();
    if (pq === "1 QUINCENA") return "1";
    if (pq === "2 QUINCENA") return "2";
    return "TODAS"; // se dicta todas las semanas
}

// Dos reuniones solo compiten por el mismo horario real si hay al menos una semana en
// que ambas ocurren. Si una es quincenal, igual "TODAS" cae en esa semana → si compiten.
// Solo quedan libres de cruce el par "1 QUINCENA" vs "2 QUINCENA" (semanas alternas).
function quincenasCompatible(a: Subject, b: Subject): boolean {
    const qa = quincenaOf(a);
    const qb = quincenaOf(b);
    if (qa === "TODAS" || qb === "TODAS") return true;
    return qa === qb;
}

export function meetingsOverlap(a: Meeting, b: Meeting): boolean {
    return (
        a.dia === b.dia &&
        a.startMin < b.endMin &&
        b.startMin < a.endMin &&
        quincenasCompatible(a.row, b.row)
    );
}

function parseParalelosAsociados(raw: string): number[] {
    if (!raw) return [];
    return raw
        .split(",")
        .map((p) => parseInt(p.trim(), 10))
        .filter((n) => !Number.isNaN(n));
}

// Agrupa filas (una fila = una reunión semanal) en secciones por materia+tipo+paralelo.
export function buildSections(subjects: Subject[]): Section[] {
    const map = new Map<string, Section>();
    for (const s of subjects) {
        if (!s.dia || !s.hora_inicio || !s.hora_fin) continue;
        const tipo = s.tipo === "TEORIA" ? "TEORIA" : "PRACTICO";
        const key = `${s.codigo_materia}|${tipo}|${s.paralelo}`;
        let section = map.get(key);
        if (!section) {
            section = {
                codigoMateria: s.codigo_materia,
                materia: s.materia,
                tipo,
                paralelo: s.paralelo,
                profesor: s.profesor,
                nivel: s.nivel,
                paralelosAsociados: parseParalelosAsociados(s.paralelos_asociados),
                meetings: [],
            };
            map.set(key, section);
        }
        section.meetings.push({
            dia: s.dia.toUpperCase(),
            startMin: timeToMinutes(s.hora_inicio),
            endMin: timeToMinutes(s.hora_fin),
            row: s,
        });
    }
    return Array.from(map.values());
}

// Para cada materia, arma las combinaciones elegibles: una teoría + (opcionalmente) una
// de sus prácticas asociadas. Si una teoría no tiene prácticas ligadas (o no se
// encontraron en los datos), queda como una opción de solo-teoría.
export function buildSubjectOptions(sections: Section[]): Map<string, SubjectOption[]> {
    const byCodigo = new Map<string, Section[]>();
    for (const sec of sections) {
        if (!byCodigo.has(sec.codigoMateria)) byCodigo.set(sec.codigoMateria, []);
        byCodigo.get(sec.codigoMateria)!.push(sec);
    }

    const result = new Map<string, SubjectOption[]>();
    for (const [codigo, secs] of byCodigo) {
        const materia = secs[0]?.materia ?? codigo;
        const teorias = secs.filter((s) => s.tipo === "TEORIA");
        const practicasByParalelo = new Map<number, Section>();
        for (const s of secs) if (s.tipo === "PRACTICO") practicasByParalelo.set(s.paralelo, s);

        const options: SubjectOption[] = [];

        if (teorias.length === 0) {
            for (const p of secs) {
                options.push({ codigoMateria: codigo, materia, teoria: p, practica: null, meetings: p.meetings });
            }
        } else {
            for (const teoria of teorias) {
                const linked = teoria.paralelosAsociados
                    .map((n) => practicasByParalelo.get(n))
                    .filter((s): s is Section => !!s);

                if (linked.length === 0) {
                    options.push({ codigoMateria: codigo, materia, teoria, practica: null, meetings: teoria.meetings });
                } else {
                    for (const practica of linked) {
                        options.push({
                            codigoMateria: codigo,
                            materia,
                            teoria,
                            practica,
                            meetings: [...teoria.meetings, ...practica.meetings],
                        });
                    }
                }
            }
        }
        result.set(codigo, options);
    }
    return result;
}

export function optionsConflict(a: SubjectOption, b: SubjectOption): boolean {
    for (const ma of a.meetings) {
        for (const mb of b.meetings) {
            if (meetingsOverlap(ma, mb)) return true;
        }
    }
    return false;
}

// Cruces reales de horario de cada profesor (dos secciones distintas que le chocan).
export function findProfessorConflicts(subjects: Subject[]): ProfessorConflictGroup[] {
    const sections = buildSections(subjects);
    const byProfesor = new Map<string, Section[]>();
    for (const sec of sections) {
        if (!sec.profesor) continue;
        if (!byProfesor.has(sec.profesor)) byProfesor.set(sec.profesor, []);
        byProfesor.get(sec.profesor)!.push(sec);
    }

    const groups: ProfessorConflictGroup[] = [];
    for (const [profesor, secs] of byProfesor) {
        const conflicts: ConflictPair[] = [];
        for (let i = 0; i < secs.length; i++) {
            for (let j = i + 1; j < secs.length; j++) {
                // Dos paralelos de la MISMA materia+paralelo teórico/práctico no cuentan
                // (sería la misma sección duplicada, no un cruce real).
                if (secs[i].codigoMateria === secs[j].codigoMateria && secs[i].paralelo === secs[j].paralelo && secs[i].tipo === secs[j].tipo) {
                    continue;
                }
                for (const ma of secs[i].meetings) {
                    for (const mb of secs[j].meetings) {
                        if (meetingsOverlap(ma, mb)) {
                            conflicts.push({ a: { section: secs[i], meeting: ma }, b: { section: secs[j], meeting: mb } });
                        }
                    }
                }
            }
        }
        if (conflicts.length > 0) groups.push({ profesor, conflicts });
    }
    return groups.sort((a, b) => b.conflicts.length - a.conflicts.length);
}

// Para cada par de materias del nivel, ¿existe al menos una combinación de paralelos sin
// cruce entre ellas? Si no, ese par es un cruce "inevitable" sin importar qué paralelo
// se elija.
export function pairwiseFeasibility(optionsByCodigo: Map<string, SubjectOption[]>): SubjectPairFeasibility[] {
    const codes = Array.from(optionsByCodigo.keys());
    const out: SubjectPairFeasibility[] = [];
    for (let i = 0; i < codes.length; i++) {
        for (let j = i + 1; j < codes.length; j++) {
            const optsA = optionsByCodigo.get(codes[i])!;
            const optsB = optionsByCodigo.get(codes[j])!;
            let feasible = false;
            outer: for (const a of optsA) {
                for (const b of optsB) {
                    if (!optionsConflict(a, b)) {
                        feasible = true;
                        break outer;
                    }
                }
            }
            out.push({
                codigoA: codes[i],
                materiaA: optsA[0]?.materia ?? codes[i],
                codigoB: codes[j],
                materiaB: optsB[0]?.materia ?? codes[j],
                feasible,
            });
        }
    }
    return out;
}

// Busca (backtracking con poda) una combinación de una opción por materia sin ningún
// cruce entre sí. Devuelve null si agota la búsqueda sin encontrar ninguna.
export function findConflictFreeCombo(optionsByCodigo: Map<string, SubjectOption[]>): SubjectOption[] | null {
    const codes = Array.from(optionsByCodigo.keys()).sort(
        (a, b) => optionsByCodigo.get(a)!.length - optionsByCodigo.get(b)!.length
    );

    const chosen: SubjectOption[] = [];
    let nodesVisited = 0;
    const MAX_NODES = 300000;

    function backtrack(idx: number): boolean {
        if (idx === codes.length) return true;
        const options = optionsByCodigo.get(codes[idx])!;
        for (const opt of options) {
            nodesVisited++;
            if (nodesVisited > MAX_NODES) return false;
            if (chosen.every((c) => !optionsConflict(c, opt))) {
                chosen.push(opt);
                if (backtrack(idx + 1)) return true;
                chosen.pop();
            }
        }
        return false;
    }

    return backtrack(0) ? [...chosen] : null;
}

// Como findConflictFreeCombo pero junta TODAS las combinaciones sin cruce (hasta un tope),
// para poder navegarlas una por una en vez de quedarse con la primera que encuentra.
export function findAllConflictFreeCombos(
    optionsByCodigo: Map<string, SubjectOption[]>,
    maxResults = 200
): { combos: SubjectOption[][]; truncated: boolean } {
    const codes = Array.from(optionsByCodigo.keys()).sort(
        (a, b) => optionsByCodigo.get(a)!.length - optionsByCodigo.get(b)!.length
    );

    const chosen: SubjectOption[] = [];
    const combos: SubjectOption[][] = [];
    let nodesVisited = 0;
    const MAX_NODES = 300000;
    let truncated = false;

    function backtrack(idx: number): void {
        if (combos.length >= maxResults || nodesVisited > MAX_NODES) {
            truncated = true;
            return;
        }
        if (idx === codes.length) {
            combos.push([...chosen]);
            return;
        }
        const options = optionsByCodigo.get(codes[idx])!;
        for (const opt of options) {
            nodesVisited++;
            if (nodesVisited > MAX_NODES) {
                truncated = true;
                return;
            }
            if (chosen.every((c) => !optionsConflict(c, opt))) {
                chosen.push(opt);
                backtrack(idx + 1);
                chosen.pop();
                if (combos.length >= maxResults) {
                    truncated = true;
                    return;
                }
            }
        }
    }

    backtrack(0);
    return { combos, truncated };
}

export interface FreeBlock {
    dia: string;
    startMin: number;
    endMin: number;
}

const ALL_DAY_KEYS = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES"];

// Huecos: intervalos del día en que ninguna sección del nivel tiene clase (sin importar
// materia, tipo o paralelo). Ahí cabría un paralelo nuevo sin chocar con nada de lo que
// ya se dicta en ese nivel — útil para detectar dónde abrir cupo cuando la demanda supera
// la capacidad actual.
export function computeFreeBlocks(sections: Section[], gridStart = 7 * 60, gridEnd = 22 * 60): FreeBlock[] {
    const byDay = new Map<string, { start: number; end: number }[]>();
    for (const key of ALL_DAY_KEYS) byDay.set(key, []);
    for (const sec of sections) {
        for (const m of sec.meetings) {
            if (!byDay.has(m.dia)) continue;
            byDay.get(m.dia)!.push({ start: m.startMin, end: m.endMin });
        }
    }

    const result: FreeBlock[] = [];
    for (const dia of ALL_DAY_KEYS) {
        const intervals = byDay.get(dia)!.sort((a, b) => a.start - b.start);
        let cursor = gridStart;
        for (const { start, end } of intervals) {
            const clampedStart = Math.max(start, gridStart);
            const clampedEnd = Math.min(end, gridEnd);
            if (clampedStart > cursor) {
                result.push({ dia, startMin: cursor, endMin: clampedStart });
            }
            cursor = Math.max(cursor, clampedEnd);
        }
        if (cursor < gridEnd) {
            result.push({ dia, startMin: cursor, endMin: gridEnd });
        }
    }
    return result;
}
