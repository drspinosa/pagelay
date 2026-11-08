/**
 * @license
 * SPDX-License-Identifier: MIT
 *
 * PageLay — Open Recent Documents Service (Maximum 10 Documents)
 *
 * Stores lightweight recent-document metadata in `window.localStorage` and, in a dedicated
 * IndexedDB database (`pagelay_recent_files_v1`) kept strictly separate from `pagelay_local_recovery_v1`:
 * 1. `recent_handles`: Structured-cloneable `FileSystemFileHandle` references where supported.
 * 2. `recent_blobs`: Lightweight local `.lay` binary Blob snapshots (up to 10 entries, with
 *    conservative per-file, total-cache, and browser storage quota headroom limits) so recent
 *    documents reopen with a single click even in embedded previews and mobile browsers where
 *    persistent `FileSystemFileHandle` access is unavailable.
 *
 * Architectural guarantees:
 * - Maximum 10 recent entries, ordered most-recently opened or saved first.
 * - Caches the exact `.lay` binary without modifying original images or document geometry.
 * - Never compromises or deletes IndexedDB recovery checkpoints (`pagelay_local_recovery_v1`).
 * - Deduplicates identifiable files using `FileSystemFileHandle.isSameEntry()` when handles
 *   are available, or `(documentId + filename)` when handles are unavailable, without
 *   falsely merging two distinct files that merely share the same filename.
 * - Removes obsolete cached `.lay` blobs whenever a recent entry is removed or pruned.
 */

import { Orientation, PageLayDocument, PaperFormat } from '../model/documentTypes';
import {
  canUseNativeOpenFilePickerSync,
  LayFileSystemHandle,
  loadDocumentFromLayFile,
  normalizeDocumentName,
} from './layFileService';

export const MAX_RECENT_DOCUMENTS = 10;

/**
 * Conservative limits for local `.lay` Blob caching in `pagelay_recent_files_v1`:
 * - Max 25 MB for any single cached `.lay` file
 * - Max 80 MB total across all cached recent `.lay` files
 * - At least 60 MB of remaining browser storage quota headroom required so
 *   `pagelay_local_recovery_v1` draft recovery checkpoints are never starved
 */
export const MAX_SINGLE_CACHED_LAY_BYTES = 25 * 1024 * 1024;
export const MAX_TOTAL_CACHED_LAY_BYTES = 80 * 1024 * 1024;
const MIN_FREE_QUOTA_HEADROOM_BYTES = 60 * 1024 * 1024;

const RECENT_LOCAL_STORAGE_KEY = 'pagelay_recent_documents_v1';
const RECENT_DB_NAME = 'pagelay_recent_files_v1';
const RECENT_DB_VERSION = 2;
const STORE_RECENT_HANDLES = 'recent_handles';
const STORE_RECENT_BLOBS = 'recent_blobs';

export interface RecentDocumentEntry {
  id: string;
  filename: string;
  documentId: string;
  documentName: string;
  paperSize?: PaperFormat;
  orientation?: Orientation;
  pageCount?: number;
  fileSizeBytes?: number;
  lastAccessedAtMs: number;
  lastAccessedAtIso: string;
  lastAction: 'opened' | 'saved' | 'saved-download';
  hasStoredHandle: boolean;
  hasCachedBlob: boolean;
}

interface StoredHandleRecord {
  id: string;
  filename: string;
  documentId: string;
  handle: LayFileSystemHandle;
  updatedAtMs: number;
}

interface StoredBlobRecord {
  id: string;
  filename: string;
  documentId: string;
  blob: Blob;
  sizeBytes: number;
  updatedAtMs: number;
}

export interface RecordRecentOptions {
  doc: PageLayDocument;
  filename?: string;
  fileHandle?: LayFileSystemHandle | null;
  layBlob?: Blob | null;
  fileSizeBytes?: number;
  action: 'opened' | 'saved' | 'saved-download';
  targetRecentEntryId?: string;
}

export type RecentEntryAvailabilityStatus =
  | 'open-directly'
  | 'local-copy'
  | 'locate-file';

export function getRecentEntryAvailabilityStatus(
  entry: RecentDocumentEntry
): {
  status: RecentEntryAvailabilityStatus;
  label: 'Open directly' | 'Local copy' | 'Locate file';
  description: string;
} {
  const canUseDirectHandle =
    entry.hasStoredHandle && canUseNativeOpenFilePickerSync();
  if (canUseDirectHandle) {
    return {
      status: 'open-directly',
      label: 'Open directly',
      description: 'Accessible original file',
    };
  }
  if (entry.hasCachedBlob) {
    return {
      status: 'local-copy',
      label: 'Local copy',
      description: 'Cached version available',
    };
  }
  return {
    status: 'locate-file',
    label: 'Locate file',
    description: 'Locate file on your device to reopen',
  };
}

export type ReopenRecentResult =
  | {
      status: 'opened-handle';
      doc: PageLayDocument;
      fileHandle: LayFileSystemHandle;
      layBlob: Blob;
      filename: string;
    }
  | {
      status: 'opened-cached';
      doc: PageLayDocument;
      cachedBlob: Blob;
      filename: string;
    }
  | {
      status: 'not-found-removed';
      updatedEntries: RecentDocumentEntry[];
      message: string;
    }
  | {
      status: 'not-found-has-cache';
      updatedEntry: RecentDocumentEntry;
      updatedEntries: RecentDocumentEntry[];
      message: string;
    }
  | {
      status: 'needs-reselection';
      reason: 'no-handle-or-cache' | 'permission-denied' | 'invalid-handle';
      hasCachedCopy: boolean;
      updatedEntries?: RecentDocumentEntry[];
      message: string;
    }
  | {
      status: 'corrupt-file';
      message: string;
    };

let recentDbPromise: Promise<IDBDatabase> | null = null;

function ensureLayExtension(rawFilename: string, fallbackDocName: string): string {
  const trimmed = (rawFilename || '').trim();
  if (trimmed) {
    return /\.lay$/i.test(trimmed) ? trimmed : `${trimmed}.lay`;
  }
  const cleanDoc = normalizeDocumentName(fallbackDocName);
  return `${cleanDoc}.lay`;
}

function generateRecentEntryId(): string {
  return `recent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeRecentEntries(raw: unknown): RecentDocumentEntry[] {
  if (!Array.isArray(raw)) return [];
  const valid: RecentDocumentEntry[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Partial<RecentDocumentEntry>;
    if (typeof candidate.id !== 'string' || !candidate.id) continue;
    if (typeof candidate.filename !== 'string' || !candidate.filename.trim()) continue;

    const lastAccessedAtMs =
      typeof candidate.lastAccessedAtMs === 'number' &&
      Number.isFinite(candidate.lastAccessedAtMs)
        ? candidate.lastAccessedAtMs
        : Date.now();

    const documentName = normalizeDocumentName(
      candidate.documentName || candidate.filename
    );
    const filename = ensureLayExtension(candidate.filename, documentName);

    valid.push({
      id: candidate.id,
      filename,
      documentId:
        typeof candidate.documentId === 'string' && candidate.documentId
          ? candidate.documentId
          : '',
      documentName,
      paperSize: candidate.paperSize,
      orientation: candidate.orientation,
      pageCount:
        typeof candidate.pageCount === 'number' && candidate.pageCount > 0
          ? candidate.pageCount
          : undefined,
      fileSizeBytes:
        typeof candidate.fileSizeBytes === 'number' && candidate.fileSizeBytes > 0
          ? candidate.fileSizeBytes
          : undefined,
      lastAccessedAtMs,
      lastAccessedAtIso:
        typeof candidate.lastAccessedAtIso === 'string' && candidate.lastAccessedAtIso
          ? candidate.lastAccessedAtIso
          : new Date(lastAccessedAtMs).toISOString(),
      lastAction:
        candidate.lastAction === 'saved' ||
        candidate.lastAction === 'saved-download' ||
        candidate.lastAction === 'opened'
          ? candidate.lastAction
          : 'opened',
      hasStoredHandle: Boolean(candidate.hasStoredHandle),
      hasCachedBlob: Boolean(candidate.hasCachedBlob),
    });
  }

  valid.sort((a, b) => b.lastAccessedAtMs - a.lastAccessedAtMs);
  return valid.slice(0, MAX_RECENT_DOCUMENTS);
}

/**
 * Synchronously reads the current list of recent documents from `localStorage`.
 */
export function readRecentDocumentsSync(): RecentDocumentEntry[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(RECENT_LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return sanitizeRecentEntries(parsed);
  } catch {
    return [];
  }
}

function writeRecentDocumentsSync(entries: RecentDocumentEntry[]): RecentDocumentEntry[] {
  const clamped = sanitizeRecentEntries(entries);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        RECENT_LOCAL_STORAGE_KEY,
        JSON.stringify(clamped)
      );
    }
  } catch {
    // Ignore localStorage quota or private browsing errors
  }
  return clamped;
}

function openRecentFilesDatabase(): Promise<IDBDatabase> {
  if (recentDbPromise) return recentDbPromise;

  recentDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window) || !window.indexedDB) {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = window.indexedDB.open(RECENT_DB_NAME, RECENT_DB_VERSION);
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Failed to open IndexedDB.'));
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_RECENT_HANDLES)) {
        db.createObjectStore(STORE_RECENT_HANDLES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_RECENT_BLOBS)) {
        db.createObjectStore(STORE_RECENT_BLOBS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        recentDbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      recentDbPromise = null;
      reject(request.error || new Error('Failed to open recent files database.'));
    };

    request.onblocked = () => {
      recentDbPromise = null;
      reject(new Error('Recent files database is blocked.'));
    };
  });

  return recentDbPromise;
}

function idbReq<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function idbTxDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error || new Error('IndexedDB transaction failed.'));
    tx.onabort = () =>
      reject(tx.error || new Error('IndexedDB transaction aborted.'));
  });
}

/**
 * Checks whether caching a `.lay` Blob of `blobSizeBytes` respects both the single-file limit
 * (`MAX_SINGLE_CACHED_LAY_BYTES`) and the browser's available storage quota headroom so that
 * `pagelay_local_recovery_v1` recovery checkpoints are never starved.
 */
async function canCacheLayBlobUnderQuota(blobSizeBytes: number): Promise<boolean> {
  if (
    !Number.isFinite(blobSizeBytes) ||
    blobSizeBytes <= 0 ||
    blobSizeBytes > MAX_SINGLE_CACHED_LAY_BYTES
  ) {
    return false;
  }

  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.estimate === 'function'
    ) {
      const estimate = await navigator.storage.estimate();
      const quota = estimate.quota;
      const usage = estimate.usage ?? 0;
      if (typeof quota === 'number' && Number.isFinite(quota) && quota > 0) {
        const remainingAfterWrite = quota - usage - blobSizeBytes;
        if (remainingAfterWrite < MIN_FREE_QUOTA_HEADROOM_BYTES) {
          return false;
        }
        if (usage + blobSizeBytes > quota * 0.78) {
          return false;
        }
      }
    }
  } catch {
    // If navigator.storage.estimate fails, rely on MAX_SINGLE_CACHED_LAY_BYTES and MAX_TOTAL_CACHED_LAY_BYTES
  }

  return true;
}

async function getAllStoredHandleRecords(): Promise<StoredHandleRecord[]> {
  try {
    const db = await openRecentFilesDatabase();
    const tx = db.transaction([STORE_RECENT_HANDLES], 'readonly');
    const store = tx.objectStore(STORE_RECENT_HANDLES);
    const records = (await idbReq(store.getAll())) as StoredHandleRecord[];
    await idbTxDone(tx);
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

async function getAllStoredBlobKeys(): Promise<Set<string>> {
  try {
    const db = await openRecentFilesDatabase();
    const tx = db.transaction([STORE_RECENT_BLOBS], 'readonly');
    const store = tx.objectStore(STORE_RECENT_BLOBS);
    const keys = (await idbReq(store.getAllKeys())) as IDBValidKey[];
    await idbTxDone(tx);
    return new Set((Array.isArray(keys) ? keys : []).map((k) => String(k)));
  } catch {
    return new Set();
  }
}

async function getStoredHandleById(
  entryId: string
): Promise<LayFileSystemHandle | null> {
  try {
    const db = await openRecentFilesDatabase();
    const tx = db.transaction([STORE_RECENT_HANDLES], 'readonly');
    const store = tx.objectStore(STORE_RECENT_HANDLES);
    const record = (await idbReq(store.get(entryId))) as
      | StoredHandleRecord
      | undefined;
    await idbTxDone(tx);
    return record?.handle ?? null;
  } catch {
    return null;
  }
}

async function deleteStoredHandleById(entryId: string): Promise<void> {
  try {
    const db = await openRecentFilesDatabase();
    const tx = db.transaction([STORE_RECENT_HANDLES], 'readwrite');
    tx.objectStore(STORE_RECENT_HANDLES).delete(entryId);
    await idbTxDone(tx);
  } catch {
    // Ignore errors
  }
}

async function getStoredBlobById(entryId: string): Promise<Blob | null> {
  try {
    const db = await openRecentFilesDatabase();
    const tx = db.transaction([STORE_RECENT_BLOBS], 'readonly');
    const store = tx.objectStore(STORE_RECENT_BLOBS);
    const record = (await idbReq(store.get(entryId))) as
      | StoredBlobRecord
      | undefined;
    await idbTxDone(tx);
    if (record && record.blob instanceof Blob && record.blob.size > 0) {
      return record.blob;
    }
    return null;
  } catch {
    return null;
  }
}

async function deleteStoredBlobById(entryId: string): Promise<void> {
  try {
    const db = await openRecentFilesDatabase();
    const tx = db.transaction([STORE_RECENT_BLOBS], 'readwrite');
    tx.objectStore(STORE_RECENT_BLOBS).delete(entryId);
    await idbTxDone(tx);
  } catch {
    // Ignore errors
  }
}

async function putAndPruneStoredHandle(
  recordToSave: StoredHandleRecord | null,
  validEntryIds: Set<string>,
  entryIdToRemoveHandle?: string
): Promise<boolean> {
  try {
    const db = await openRecentFilesDatabase();
    const tx = db.transaction([STORE_RECENT_HANDLES], 'readwrite');
    const store = tx.objectStore(STORE_RECENT_HANDLES);

    let storedHandleOk = false;
    if (recordToSave) {
      try {
        store.put(recordToSave);
        storedHandleOk = true;
      } catch {
        storedHandleOk = false;
      }
    } else if (entryIdToRemoveHandle) {
      store.delete(entryIdToRemoveHandle);
    }

    const existingKeys = (await idbReq(store.getAllKeys())) as IDBValidKey[];
    for (const key of existingKeys) {
      const keyStr = String(key);
      if (!validEntryIds.has(keyStr)) {
        store.delete(key);
      }
    }

    await idbTxDone(tx);
    return storedHandleOk;
  } catch {
    return false;
  }
}

/**
 * Stores or updates a cached `.lay` binary Blob in `STORE_RECENT_BLOBS`, prunes any obsolete
 * entries not in `validEntryIds` (the active top <= 10 recent entries), and enforces
 * `MAX_TOTAL_CACHED_LAY_BYTES` by evicting the oldest cached blobs if necessary.
 * Returns the set of entry IDs that currently have a valid cached Blob stored in IndexedDB.
 */
async function putAndPruneStoredBlob(
  recordToSave: StoredBlobRecord | null,
  validEntryIds: Set<string>,
  entryIdToRemoveBlob?: string
): Promise<Set<string>> {
  try {
    const db = await openRecentFilesDatabase();
    const tx = db.transaction([STORE_RECENT_BLOBS], 'readwrite');
    const store = tx.objectStore(STORE_RECENT_BLOBS);

    if (entryIdToRemoveBlob) {
      store.delete(entryIdToRemoveBlob);
    }

    if (recordToSave) {
      try {
        store.put(recordToSave);
      } catch {
        // Ignore individual put failure; getAll() below will reflect actual stored records
      }
    }

    const allRecords = (await idbReq(store.getAll())) as StoredBlobRecord[];
    const keptRecords: StoredBlobRecord[] = [];

    for (const rec of Array.isArray(allRecords) ? allRecords : []) {
      if (!rec || typeof rec.id !== 'string') continue;
      if (
        !validEntryIds.has(rec.id) ||
        !(rec.blob instanceof Blob) ||
        rec.blob.size <= 0 ||
        rec.blob.size > MAX_SINGLE_CACHED_LAY_BYTES
      ) {
        store.delete(rec.id);
      } else {
        keptRecords.push(rec);
      }
    }

    // Enforce MAX_TOTAL_CACHED_LAY_BYTES across all kept entries (newest first)
    keptRecords.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    let runningBytes = 0;
    const finalStoredIds = new Set<string>();

    for (const rec of keptRecords) {
      const recSize = rec.blob.size || rec.sizeBytes || 0;
      if (runningBytes + recSize <= MAX_TOTAL_CACHED_LAY_BYTES) {
        runningBytes += recSize;
        finalStoredIds.add(rec.id);
      } else {
        store.delete(rec.id);
      }
    }

    await idbTxDone(tx);
    return finalStoredIds;
  } catch {
    return new Set();
  }
}

async function checkHandlesSameEntry(
  a: LayFileSystemHandle,
  b: LayFileSystemHandle
): Promise<boolean | null> {
  const fn = (
    a as unknown as {
      isSameEntry?: (other: LayFileSystemHandle) => Promise<boolean>;
    }
  ).isSameEntry;
  if (typeof fn !== 'function') return null;
  try {
    return await fn.call(a, b);
  } catch {
    return null;
  }
}

/**
 * Loads the recent documents list and reconciles `hasStoredHandle` and `hasCachedBlob` flags with IndexedDB.
 */
export async function loadRecentDocuments(): Promise<RecentDocumentEntry[]> {
  const entries = readRecentDocumentsSync();
  if (entries.length === 0) return [];

  const [handleRecords, blobIdSet] = await Promise.all([
    getAllStoredHandleRecords(),
    getAllStoredBlobKeys(),
  ]);
  const handleIdSet = new Set(handleRecords.map((r) => r.id));

  let changed = false;
  const reconciled = entries.map((entry) => {
    const actuallyHasHandle = handleIdSet.has(entry.id);
    const actuallyHasBlob = blobIdSet.has(entry.id);
    if (
      entry.hasStoredHandle !== actuallyHasHandle ||
      entry.hasCachedBlob !== actuallyHasBlob
    ) {
      changed = true;
      return {
        ...entry,
        hasStoredHandle: actuallyHasHandle,
        hasCachedBlob: actuallyHasBlob,
      };
    }
    return entry;
  });

  if (changed) {
    return writeRecentDocumentsSync(reconciled);
  }
  return reconciled;
}

/**
 * Records a successfully opened or saved `.lay` document in the recent list (maximum 10 entries),
 * and caches the untouched `.lay` Blob in `pagelay_recent_files_v1` (`recent_blobs`) when within
 * conservative size and storage quota limits.
 */
export async function recordRecentDocument(
  options: RecordRecentOptions
): Promise<RecentDocumentEntry[]> {
  const {
    doc,
    filename: rawFilename,
    fileHandle = null,
    layBlob = null,
    fileSizeBytes,
    action,
    targetRecentEntryId,
  } = options;

  const finalFilename = ensureLayExtension(
    rawFilename || fileHandle?.name || `${doc.name}.lay`,
    doc.name
  );
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const currentEntries = readRecentDocumentsSync();
  const storedHandles = await getAllStoredHandleRecords();
  const handleByEntryId = new Map<string, LayFileSystemHandle>();
  for (const rec of storedHandles) {
    if (rec && rec.id && rec.handle) {
      handleByEntryId.set(rec.id, rec.handle);
    }
  }

  let matchedEntry: RecentDocumentEntry | undefined;
  const provenDifferentEntryIds = new Set<string>();

  // 1. Check exact FileSystemFileHandle identity (`isSameEntry`) when a handle is available
  if (fileHandle) {
    for (const entry of currentEntries) {
      const existingHandle = handleByEntryId.get(entry.id);
      if (!existingHandle) continue;
      const same = await checkHandlesSameEntry(existingHandle, fileHandle);
      if (same === true) {
        matchedEntry = entry;
        break;
      } else if (same === false) {
        provenDifferentEntryIds.add(entry.id);
      }
    }
  }

  // 2. If reopening a specific recent entry, match that entry provided it wasn't proven to be a different handle
  if (!matchedEntry && targetRecentEntryId) {
    const candidate = currentEntries.find((e) => e.id === targetRecentEntryId);
    if (
      candidate &&
      !provenDifferentEntryIds.has(candidate.id) &&
      (candidate.documentId === doc.id ||
        candidate.filename.toLowerCase() === finalFilename.toLowerCase())
    ) {
      matchedEntry = candidate;
    }
  }

  // 3. Match by combined (documentId + filename) when not proven to be a different disk file
  if (!matchedEntry && doc.id) {
    matchedEntry = currentEntries.find(
      (e) =>
        !provenDifferentEntryIds.has(e.id) &&
        e.documentId === doc.id &&
        e.filename.toLowerCase() === finalFilename.toLowerCase()
    );
  }

  const entryId = matchedEntry?.id || generateRecentEntryId();
  const wantsHandleStorage = Boolean(fileHandle) && action !== 'saved-download';
  const resolvedSizeBytes =
    fileSizeBytes ??
    (layBlob instanceof Blob ? layBlob.size : undefined) ??
    matchedEntry?.fileSizeBytes;

  const newEntry: RecentDocumentEntry = {
    id: entryId,
    filename: finalFilename,
    documentId: doc.id,
    documentName: normalizeDocumentName(doc.name || finalFilename),
    paperSize: doc.paperSize,
    orientation: doc.orientation,
    pageCount: doc.pages?.length || 1,
    fileSizeBytes: resolvedSizeBytes,
    lastAccessedAtMs: nowMs,
    lastAccessedAtIso: nowIso,
    lastAction: action,
    hasStoredHandle: wantsHandleStorage,
    hasCachedBlob: Boolean(matchedEntry?.hasCachedBlob),
  };

  const nextEntries = [
    newEntry,
    ...currentEntries.filter((e) => e.id !== entryId),
  ].slice(0, MAX_RECENT_DOCUMENTS);

  const validIds = new Set(nextEntries.map((e) => e.id));

  // Store & prune FileSystemFileHandle
  const handleRecordToStore: StoredHandleRecord | null =
    wantsHandleStorage && fileHandle
      ? {
          id: entryId,
          filename: finalFilename,
          documentId: doc.id,
          handle: fileHandle,
          updatedAtMs: nowMs,
        }
      : null;

  const storedHandleOk = await putAndPruneStoredHandle(
    handleRecordToStore,
    validIds,
    !wantsHandleStorage ? entryId : undefined
  );

  if (wantsHandleStorage && !storedHandleOk) {
    newEntry.hasStoredHandle = false;
  }

  // Store & prune cached .lay Blob if within conservative size and quota limits
  let blobRecordToStore: StoredBlobRecord | null = null;
  let shouldRemoveExistingBlobForEntry = false;

  if (layBlob instanceof Blob && layBlob.size > 0) {
    const canCache = await canCacheLayBlobUnderQuota(layBlob.size);
    if (canCache) {
      blobRecordToStore = {
        id: entryId,
        filename: finalFilename,
        documentId: doc.id,
        blob: layBlob,
        sizeBytes: layBlob.size,
        updatedAtMs: nowMs,
      };
    } else {
      // New version of this file exceeds cache size/quota limits; do not keep a stale older cached copy
      shouldRemoveExistingBlobForEntry = true;
    }
  }

  const storedBlobIds = await putAndPruneStoredBlob(
    blobRecordToStore,
    validIds,
    shouldRemoveExistingBlobForEntry ? entryId : undefined
  );

  const reconciledEntries = nextEntries.map((entry) => ({
    ...entry,
    hasCachedBlob: storedBlobIds.has(entry.id),
  }));

  return writeRecentDocumentsSync(reconciledEntries);
}

/**
 * Removes a single recent document entry from `localStorage` and deletes any associated
 * `FileSystemFileHandle` and cached `.lay` Blob from `pagelay_recent_files_v1` IndexedDB.
 * Never touches actual user files on disk or the currently open document in PageLay.
 */
export async function removeRecentDocumentEntry(
  entryId: string
): Promise<RecentDocumentEntry[]> {
  const current = readRecentDocumentsSync();
  const next = current.filter((e) => e.id !== entryId);
  const saved = writeRecentDocumentsSync(next);
  const validIds = new Set(saved.map((e) => e.id));
  await Promise.all([
    putAndPruneStoredHandle(null, validIds, entryId),
    putAndPruneStoredBlob(null, validIds, entryId),
  ]);
  return saved;
}

/**
 * Clears all recent document records, stored handles, and cached `.lay` Blobs from
 * `localStorage` and `pagelay_recent_files_v1` IndexedDB.
 * Never touches actual user files on disk, `pagelay_local_recovery_v1`, or the active document.
 */
export async function clearAllRecentDocuments(): Promise<RecentDocumentEntry[]> {
  writeRecentDocumentsSync([]);
  try {
    const db = await openRecentFilesDatabase();
    const tx = db.transaction(
      [STORE_RECENT_HANDLES, STORE_RECENT_BLOBS],
      'readwrite'
    );
    tx.objectStore(STORE_RECENT_HANDLES).clear();
    tx.objectStore(STORE_RECENT_BLOBS).clear();
    await idbTxDone(tx);
  } catch {
    // Ignore IndexedDB errors in restricted environments
  }
  return [];
}

/**
 * Reopens a recent `.lay` document specifically from its locally cached `.lay` Blob in IndexedDB.
 * Used both as Tier 2 automatic reopen and when the user clicks "Open Local Copy" in `ReopenRecentModal`.
 */
export async function tryReopenRecentFromCachedBlob(
  entry: RecentDocumentEntry
): Promise<
  | {
      status: 'opened-cached';
      doc: PageLayDocument;
      cachedBlob: Blob;
      filename: string;
    }
  | {
      status: 'unavailable';
      updatedEntries: RecentDocumentEntry[];
      message: string;
    }
  | {
      status: 'corrupt-file';
      updatedEntries: RecentDocumentEntry[];
      message: string;
    }
> {
  const cachedBlob = await getStoredBlobById(entry.id);
  if (!cachedBlob) {
    const updatedEntries = writeRecentDocumentsSync(
      readRecentDocumentsSync().map((item) =>
        item.id === entry.id ? { ...item, hasCachedBlob: false } : item
      )
    );
    return {
      status: 'unavailable',
      updatedEntries,
      message: `No local cached copy is stored for "${entry.filename}". Please choose the .lay file from your device to reopen it.`,
    };
  }

  try {
    // Construct a named File instance so loadDocumentFromLayFile preserves the recent entry's filename
    const namedFile =
      cachedBlob instanceof File && cachedBlob.name
        ? cachedBlob
        : new File([cachedBlob], entry.filename, {
            type: cachedBlob.type || 'application/octet-stream',
          });
    const doc = await loadDocumentFromLayFile(namedFile);
    const actualFilename = ensureLayExtension(entry.filename, doc.name);
    return {
      status: 'opened-cached',
      doc,
      cachedBlob,
      filename: actualFilename,
    };
  } catch (err) {
    await deleteStoredBlobById(entry.id);
    const updatedEntries = writeRecentDocumentsSync(
      readRecentDocumentsSync().map((item) =>
        item.id === entry.id ? { ...item, hasCachedBlob: false } : item
      )
    );
    return {
      status: 'corrupt-file',
      updatedEntries,
      message:
        err instanceof Error
          ? err.message
          : `Cached local copy of "${entry.filename}" could not be unpacked.`,
    };
  }
}

/**
 * Reopens a recent `.lay` document following the 3-tier priority:
 * 1. Where a valid `FileSystemFileHandle` exists and is supported in the current browser context,
 *    reopen the original file directly from disk.
 *    - If the browser confirms `NotFoundError`:
 *      - If no valid cached copy remains, automatically removes the invalid recent entry and notifies the user.
 *      - If a valid cached copy exists, retains the entry (clearing `hasStoredHandle`) and returns
 *        `status: 'not-found-has-cache'` so the UI can notify the user and offer to open the cached copy.
 *    - If permission is denied or blocked, retains the entry and returns `status: 'needs-reselection'`.
 * 2. Where a file handle is unavailable (e.g. embedded preview, mobile browser, download save, or drag-and-drop open),
 *    automatically uses the locally cached `.lay` copy if one exists (`status: 'opened-cached'`).
 * 3. Only requests manual file reselection (`status: 'needs-reselection'`) when neither method is available.
 */
export async function tryReopenRecentDocument(
  entry: RecentDocumentEntry
): Promise<ReopenRecentResult> {
  const canAttemptHandle =
    entry.hasStoredHandle && canUseNativeOpenFilePickerSync();

  if (canAttemptHandle) {
    const handle = await getStoredHandleById(entry.id);
    if (handle && typeof handle.getFile === 'function') {
      // Check / request read permission on the stored handle
      let permissionGranted = true;
      try {
        if (typeof handle.queryPermission === 'function') {
          const perm = await handle.queryPermission({ mode: 'read' });
          if (perm !== 'granted') {
            if (typeof handle.requestPermission === 'function') {
              const requested = await handle.requestPermission({ mode: 'read' });
              permissionGranted = requested === 'granted';
            } else {
              permissionGranted = false;
            }
          }
        }
      } catch {
        permissionGranted = false;
      }

      if (!permissionGranted) {
        const cachedBlob = await getStoredBlobById(entry.id);
        const hasCachedCopy = Boolean(cachedBlob);
        return {
          status: 'needs-reselection',
          reason: 'permission-denied',
          hasCachedCopy,
          message: hasCachedCopy
            ? `Permission to read the original file "${entry.filename}" was not granted. You can open the local cached copy stored in this browser, or choose the file from your device.`
            : `Permission to read "${entry.filename}" was not granted. You can locate and choose the file from your device to reopen it.`,
        };
      }

      let file: File | null = null;
      try {
        file = await handle.getFile();
      } catch (err) {
        const errName = (err as { name?: string })?.name || '';
        if (errName === 'NotFoundError') {
          // Confirmed missing original file on disk
          await deleteStoredHandleById(entry.id);
          const cachedBlob = await getStoredBlobById(entry.id);
          if (!cachedBlob) {
            const updatedEntries = await removeRecentDocumentEntry(entry.id);
            return {
              status: 'not-found-removed',
              updatedEntries,
              message: `Original file "${entry.filename}" no longer exists at its previous location and was removed from Recent Documents.`,
            };
          }

          // A valid cached copy exists: retain the entry with hasStoredHandle = false, hasCachedBlob = true
          const updatedEntries = writeRecentDocumentsSync(
            readRecentDocumentsSync().map((item) =>
              item.id === entry.id
                ? { ...item, hasStoredHandle: false, hasCachedBlob: true }
                : item
            )
          );
          const updatedEntry =
            updatedEntries.find((item) => item.id === entry.id) || {
              ...entry,
              hasStoredHandle: false,
              hasCachedBlob: true,
            };

          return {
            status: 'not-found-has-cache',
            updatedEntry,
            updatedEntries,
            message: `The original file "${entry.filename}" no longer exists at its previous location. A local cached copy is available in this browser — you can open the local copy or choose the file from your device.`,
          };
        }

        if (errName === 'NotAllowedError' || errName === 'SecurityError') {
          const cachedBlob = await getStoredBlobById(entry.id);
          const hasCachedCopy = Boolean(cachedBlob);
          return {
            status: 'needs-reselection',
            reason: 'permission-denied',
            hasCachedCopy,
            message: hasCachedCopy
              ? `Access to the original file "${entry.filename}" was blocked or expired. You can open the local cached copy or choose the file from your device.`
              : `Access to "${entry.filename}" was blocked or expired. Choose the file from your device to reopen it.`,
          };
        }
        // For any other unexpected handle error, fall through to Tier 2 (cached copy) if available
      }

      if (file) {
        try {
          const doc = await loadDocumentFromLayFile(file);
          const actualFilename = ensureLayExtension(
            file.name || handle.name || entry.filename,
            doc.name
          );
          return {
            status: 'opened-handle',
            doc,
            fileHandle: handle,
            layBlob: file,
            filename: actualFilename,
          };
        } catch (err) {
          return {
            status: 'corrupt-file',
            message:
              err instanceof Error
                ? err.message
                : `Failed to parse "${entry.filename}" as a valid PageLay (.lay) archive.`,
          };
        }
      }
    } else {
      // Handle record was missing from IndexedDB; mark hasStoredHandle = false and try Tier 2 cached blob
      writeRecentDocumentsSync(
        readRecentDocumentsSync().map((item) =>
          item.id === entry.id ? { ...item, hasStoredHandle: false } : item
        )
      );
    }
  }

  // Tier 2: Where a file handle is unavailable, use a locally cached .lay copy if one exists
  const cachedAttempt = await tryReopenRecentFromCachedBlob(entry);
  if (cachedAttempt.status === 'opened-cached') {
    return {
      status: 'opened-cached',
      doc: cachedAttempt.doc,
      cachedBlob: cachedAttempt.cachedBlob,
      filename: cachedAttempt.filename,
    };
  }

  if (cachedAttempt.status === 'corrupt-file') {
    return {
      status: 'corrupt-file',
      message: cachedAttempt.message,
    };
  }

  // Tier 3: Neither a usable file handle nor a cached local copy is available.
  // Be honest and never claim to know whether the original file exists on disk when no handle was checked.
  return {
    status: 'needs-reselection',
    reason: 'no-handle-or-cache',
    hasCachedCopy: false,
    updatedEntries: cachedAttempt.updatedEntries,
    message: `Direct file access and a local cached copy are not available for "${entry.filename}" in this browser. Choose the .lay file from your device to reopen it.`,
  };
}

/**
 * Formats a recent entry's timestamp into a concise, human-friendly label for the Recent menu.
 */
export function formatRecentTimestamp(timestampMs: number): string {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return '';
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - timestampMs) / 1000));

  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    return `${mins}m ago`;
  }
  const date = new Date(timestampMs);
  const nowDate = new Date(now);
  const isSameDay =
    date.getFullYear() === nowDate.getFullYear() &&
    date.getMonth() === nowDate.getMonth() &&
    date.getDate() === nowDate.getDate();

  if (isSameDay) {
    return `Today, ${date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }

  return date.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
