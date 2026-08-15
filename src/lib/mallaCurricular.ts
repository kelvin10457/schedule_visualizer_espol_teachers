// Debe mantenerse igual a extension/lib/malla-curricular.js (DEFAULT_MALLA_CURRICULAR).
// Solo se usa como valor inicial de la página de Configuración; una vez que el usuario
// guarda cambios ahí, chrome.storage/localStorage bajo la clave "mallaCurricular" manda.
export const DEFAULT_MALLA_CURRICULAR: Record<string, string> = {
  MATG1045: "NIVEL 100 - I",
  FISG1005: "NIVEL 100 - I",
  QUIG1032: "NIVEL 100 - I",
  INDG1033: "NIVEL 100 - I",
  IDIG1006: "NIVEL 100 - I",

  MATG1049: "NIVEL 100 - II",
  MATG1046: "NIVEL 100 - II",
  FISG1006: "NIVEL 100 - II",
  CCPG1043: "NIVEL 100 - II",
  IDIG1007: "NIVEL 100 - II",

  MATG1050: "NIVEL 200 - I",
  IDIG2012: "NIVEL 200 - I",
  ESTG1034: "NIVEL 200 - I",
  ELEG1030: "NIVEL 200 - I",
  EYAG1044: "NIVEL 200 - I",
  IDIG1008: "NIVEL 200 - I",

  MATG1052: "NIVEL 200 - II",
  EYAG1040: "NIVEL 200 - II",
  ELEG1028: "NIVEL 200 - II",
  EYAG1043: "NIVEL 200 - II",
  ELEG1051: "NIVEL 200 - II",
  IDIG1009: "NIVEL 200 - II",

  ADMG1005: "NIVEL 300 - I",
  ELEG1049: "NIVEL 300 - I",
  ELEG1038: "NIVEL 300 - I",
  ELEG1040: "NIVEL 300 - I",
  IDIG1010: "NIVEL 300 - I",

  EYAG1035: "NIVEL 300 - II",
  ELEG1050: "NIVEL 300 - II",
  ELEG1041: "NIVEL 300 - II",
  ADSG1026: "NIVEL 300 - II",

  MATG1054: "NIVEL 400 - I",
  ELEG1044: "NIVEL 400 - I",
  ELEG1032: "NIVEL 400 - I",
  ELEG1035: "NIVEL 400 - I",
  ELEG1029: "NIVEL 400 - I",
  ELEG1031: "NIVEL 400 - I",

  ELEG1047: "NIVEL 400 - II",
  ELEG1046: "NIVEL 400 - II",
  ELEG1033: "NIVEL 400 - II",
  ELEG1036: "NIVEL 400 - II",
  ELEG1039: "NIVEL 400 - II",

  ELEG1037: "NIVEL 500 - I",
  ELEG1042: "NIVEL 500 - I",
};

export const MALLA_CURRICULAR_STORAGE_KEY = "mallaCurricular";
