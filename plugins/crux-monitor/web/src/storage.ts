// IndexedDB storage for read status tracking

const DB_NAME = "crux-monitor";
const STORE_NAME = "read-events";

let db: IDBDatabase | null = null;

/**
 * Initialize IndexedDB database
 */
export async function initDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const target = event.target as IDBOpenDBRequest;
      const database = target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Get read status for an event
 */
export async function getReadStatus(eventId: string): Promise<boolean> {
  const database = db;
  if (!database) return false;
  return new Promise((resolve) => {
    const tx = database.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(eventId);
    request.onsuccess = () => resolve(!!request.result);
    request.onerror = () => resolve(false);
  });
}

/**
 * Set read status for an event
 */
export async function setReadStatus(eventId: string, isRead: boolean): Promise<void> {
  const database = db;
  if (!database) return;
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    if (isRead) {
      store.put(true, eventId);
    } else {
      store.delete(eventId);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
