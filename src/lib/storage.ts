// Abstracción de almacenamiento: usa chrome.storage.local cuando la app corre dentro
// de la extensión, y localStorage cuando corre como página web normal (npm run dev,
// o un despliegue estático). Así Schedule.tsx y Config.tsx funcionan en ambos casos
// sin ramas de código propias.

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && !!chrome?.storage?.local;
}

export function getStorageItem<T>(key: string, fallback: T): Promise<T> {
  if (hasChromeStorage()) {
    return new Promise((resolve) => {
      chrome!.storage!.local.get([key], (result) => {
        resolve(result[key] !== undefined ? (result[key] as T) : fallback);
      });
    });
  }
  const raw = localStorage.getItem(key);
  if (!raw) return Promise.resolve(fallback);
  try {
    return Promise.resolve(JSON.parse(raw) as T);
  } catch {
    return Promise.resolve(fallback);
  }
}

export function setStorageItem<T>(key: string, value: T): Promise<void> {
  if (hasChromeStorage()) {
    return new Promise((resolve) => {
      chrome!.storage!.local.set({ [key]: value }, () => resolve());
    });
  }
  localStorage.setItem(key, JSON.stringify(value));
  return Promise.resolve();
}

export function isExtensionContext(): boolean {
  return hasChromeStorage();
}
