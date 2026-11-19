const DB_NAME = 'TrailGuardianDB';
const DB_VERSION = 2;
const TILE_STORE = 'tiles';
const SESSION_STORE = 'active_session';
const SESSION_KEY = 'current_active_track';

let databasePromise = null;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve) => {
    if (!('indexedDB' in window)) {
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(TILE_STORE)) {
        database.createObjectStore(TILE_STORE);
      }
      if (!database.objectStoreNames.contains(SESSION_STORE)) {
        database.createObjectStore(SESSION_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return databasePromise;
}

async function withTileStore(mode, operation) {
  const database = await openDatabase();
  if (!database) return null;

  try {
    const transaction = database.transaction(TILE_STORE, mode);
    const result = operation(transaction.objectStore(TILE_STORE));
    await transactionDone(transaction);
    return result;
  } catch {
    return null;
  }
}

export const tileCache = {
  async getTile(url) {
    const database = await openDatabase();
    if (!database) return null;

    try {
      const transaction = database.transaction(TILE_STORE, 'readonly');
      return await requestToPromise(transaction.objectStore(TILE_STORE).get(url));
    } catch {
      return null;
    }
  },

  async saveTile(url, blob) {
    await withTileStore('readwrite', (store) => store.put(blob, url));
  },

  async countTiles() {
    const database = await openDatabase();
    if (!database) return 0;

    try {
      const transaction = database.transaction(TILE_STORE, 'readonly');
      return await requestToPromise(transaction.objectStore(TILE_STORE).count());
    } catch {
      return 0;
    }
  },

  async clearTiles() {
    await withTileStore('readwrite', (store) => store.clear());
  },

  async deleteTiles(urls = []) {
    await withTileStore('readwrite', (store) => {
      for (const url of urls) store.delete(url);
    });
  },
};

export const sessionStore = {
  async save(snapshot) {
    await withSessionStore('readwrite', (store) =>
      store.put(snapshot, SESSION_KEY),
    );
  },

  async load() {
    const database = await openDatabase();
    if (!database) return null;

    try {
      const transaction = database.transaction(SESSION_STORE, 'readonly');
      return await requestToPromise(
        transaction.objectStore(SESSION_STORE).get(SESSION_KEY),
      );
    } catch {
      return null;
    }
  },

  async clear() {
    await withSessionStore('readwrite', (store) => store.delete(SESSION_KEY));
  },
};

async function withSessionStore(mode, operation) {
  const database = await openDatabase();
  if (!database) return null;

  try {
    const transaction = database.transaction(SESSION_STORE, mode);
    const result = operation(transaction.objectStore(SESSION_STORE));
    await transactionDone(transaction);
    return result;
  } catch {
    return null;
  }
}
