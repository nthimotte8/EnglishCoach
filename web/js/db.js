// Local storage in the browser (IndexedDB). Nothing leaves the computer.
const DB_NAME = 'english-coach';
const VERSION = 1;
const STORES = ['materials', 'sessions', 'cards', 'settings'];

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of ['materials', 'sessions', 'cards']) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Stockage du navigateur indisponible.'));
  });
  return dbp;
}

const done = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
async function store(name, mode = 'readonly') {
  return (await open()).transaction(name, mode).objectStore(name);
}

export async function put(name, value) {
  const id = await done((await store(name, 'readwrite')).put(value));
  return { ...value, id };
}
export async function get(name, id) { return done((await store(name)).get(id)); }
export async function all(name) { return done((await store(name)).getAll()); }
export async function del(name, id) { return done((await store(name, 'readwrite')).delete(id)); }

export async function getSetting(key, fallback = null) {
  const v = await done((await store('settings')).get(key));
  return v === undefined ? fallback : v;
}
export async function setSetting(key, value) {
  return done((await store('settings', 'readwrite')).put(value, key));
}

/** Full backup as a plain object (for export to a JSON file). */
export async function exportAll() {
  const out = { app: 'english-coach', version: VERSION, exportedAt: new Date().toISOString() };
  for (const s of ['materials', 'sessions', 'cards']) out[s] = await all(s);
  const st = await store('settings');
  const keys = await done(st.getAllKeys());
  const values = await done((await store('settings')).getAll());
  out.settings = Object.fromEntries(keys.map((k, i) => [k, values[i]]));
  return out;
}

/** Replace everything with a backup made by exportAll(). */
export async function importAll(data) {
  if (!data || data.app !== 'english-coach') throw new Error('Ce fichier n’est pas une sauvegarde English Coach.');
  const db = await open();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, 'readwrite');
    for (const s of STORES) tx.objectStore(s).clear();
    for (const s of ['materials', 'sessions', 'cards']) for (const row of data[s] ?? []) tx.objectStore(s).put(row);
    for (const [k, v] of Object.entries(data.settings ?? {})) tx.objectStore('settings').put(v, k);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAll() {
  const db = await open();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, 'readwrite');
    for (const s of STORES) tx.objectStore(s).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
