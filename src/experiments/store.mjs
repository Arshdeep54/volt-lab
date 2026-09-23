import { validateRun, verifyImportedRun } from './artifact.mjs';

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('volt-lab-experiments', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('runs', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction(mode, operation) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('runs', mode);
    const request = operation(tx.objectStore('runs'));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error('Experiment storage aborted.'));
    };
  });
}

export async function saveRun(run) {
  validateRun(run);
  await transaction('readwrite', (store) => store.put(run));
}
export async function listRuns() {
  const runs = await transaction('readonly', (store) => store.getAll());
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getRun(id) {
  const run = await transaction('readonly', (store) => store.get(id));
  if (!run) throw new Error('Saved experiment no longer exists.');
  return validateRun(run);
}
export async function deleteRun(id) {
  await transaction('readwrite', (store) => store.delete(id));
}
export async function importRun(file, provenance = {}) {
  if (file.size > 8 * 1024 * 1024)
    throw new Error('Experiment files must be under 8 MB.');
  const run = verifyImportedRun(JSON.parse(await file.text()), provenance);
  await saveRun(run);
  return run;
}
