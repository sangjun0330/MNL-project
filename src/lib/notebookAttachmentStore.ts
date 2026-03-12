const DB_NAME = "rnest-notebook"
const STORE_NAME = "memo_attachments"
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("이 브라우저에서는 로컬 첨부 저장을 지원하지 않습니다."))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }

    request.onerror = () => {
      reject(request.error ?? new Error("로컬 첨부 저장소를 열지 못했습니다."))
    }
  })
  return dbPromise
}

async function runRequest<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode)
    const store = transaction.objectStore(STORE_NAME)
    const request = handler(store)

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 요청이 실패했습니다."))
  })
}

export async function saveMemoAttachmentBlob(blobKey: string, blob: Blob) {
  await runRequest("readwrite", (store) => store.put(blob, blobKey))
}

export async function loadMemoAttachmentBlob(blobKey: string) {
  const result = await runRequest<Blob | undefined>("readonly", (store) => store.get(blobKey))
  return result instanceof Blob ? result : null
}

export async function deleteMemoAttachmentBlob(blobKey: string) {
  await runRequest("readwrite", (store) => store.delete(blobKey))
}
