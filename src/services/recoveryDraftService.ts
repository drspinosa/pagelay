/**
 * @license
 * SPDX-License-Identifier: MIT
 *
 * PageLay — Local IndexedDB Session Recovery, Undo/Redo History & Draft Protection Service
 *
 * Preserves the current unsaved working document and its recent Undo/Redo history in IndexedDB
 * so mobile screen lock/unlock reloads, background tab suspension, or accidental browser refreshes
 * do not cause data loss or break Undo/Redo continuity.
 *
 * Key architectural guarantees:
 * - Dedicated IndexedDB database (`pagelay_local_recovery_v1`) kept strictly separate from `.lay` files
 *   and any future Open Recent list.
 * - Stores original image bytes (`Uint8Array`) once per asset ID in a dedicated `draft_assets` object store
 *   without recompression or downsampling, and avoids rewriting unchanged binary assets across edits or
 *   history snapshots.
 * - Preserves `historyPast` and `historyFuture` stacks (up to 40 snapshots each) alongside all image assets
 *   referenced by either the active pages or any recoverable history snapshot (e.g., deleted images or
 *   undone page imports).
 * - Uses a per-tab session identifier (`window.sessionStorage` + IndexedDB `tabSessionId` & `documentId`)
 *   to quietly auto-restore the same active editing session after a mobile lock/unlock reload or refresh,
 *   while requiring explicit user confirmation when resuming an interrupted session in a new tab or after
 *   a full browser restart.
 */

import {
  ImageAsset,
  Orientation,
  PageData,
  PageLayDocument,
  PaperFormat,
} from '../model/documentTypes';
import { collectReferencedAssetIds } from '../model/documentFactory';
import { sanitizeLoadedPageObjects } from './layFileService';

const DB_NAME = 'pagelay_local_recovery_v1';
const DB_VERSION = 1;
const STORE_META = 'draft_meta';
const STORE_ASSETS = 'draft_assets';
const ACTIVE_DRAFT_KEY = 'active_draft';
const SESSION_STORAGE_KEY = 'pagelay_active_tab_session_v1';
const MAX_HISTORY_SNAPSHOTS = 40;

export interface HistorySnapshot {
  paperSize: PaperFormat;
  orientation: Orientation;
  widthMm: number;
  heightMm: number;
  pages: PageData[];
}

interface StoredAssetMeta {
  id: string;
  filename: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  widthPx: number;
  heightPx: number;
  fileSizeBytes: number;
}

interface StoredAssetBinaryRecord extends StoredAssetMeta {
  originalBytes: Uint8Array;
  updatedAtMs: number;
}

interface StoredRecoveryDraftMeta {
  key: typeof ACTIVE_DRAFT_KEY;
  schemaVersion: 1;
  revision: number;
  savedAtMs: number;
  savedAtIso: string;
  tabSessionId: string;
  activePageIndex: number;
  historyDocumentId: string;
  historyPast: HistorySnapshot[];
  historyFuture: HistorySnapshot[];
  document: {
    id: string;
    name: string;
    version: string;
    createdAt: string;
    updatedAt: string;
    paperSize: PaperFormat;
    orientation: Orientation;
    widthMm: number;
    heightMm: number;
    showGuides: boolean;
    lockGuides: boolean;
    snapToGuides: boolean;
    snapToPageEdges: boolean;
    snapToObjects: boolean;
    angleSnapIncrementDeg: number;
    precisionMode: boolean;
    pages: PageData[];
    assetMetas: StoredAssetMeta[];
  };
}

interface TabSessionMarker {
  tabSessionId: string;
  documentId: string;
  documentName: string;
  isDirty: boolean;
  lastUpdatedAtMs: number;
}

export interface RecoveryDraftSummary {
  documentId: string;
  documentName: string;
  paperSize: PaperFormat;
  orientation: Orientation;
  widthMm: number;
  heightMm: number;
  pageCount: number;
  objectCount: number;
  assetCount: number;
  undoCount: number;
  redoCount: number;
  savedAtMs: number;
  savedAtIso: string;
  revision: number;
  tabSessionId: string;
  isSameActiveTabSession: boolean;
}

export interface RestoredRecoveryDraft {
  doc: PageLayDocument;
  activePageIndex: number;
  historyPast: HistorySnapshot[];
  historyFuture: HistorySnapshot[];
  summary: RecoveryDraftSummary;
}

export interface RecoveryStorageDiagnostics {
  available: boolean;
  isEmbeddedPreview: boolean;
  isPersistentStorage: boolean | null;
  limitationReason: string | null;
}

export interface SaveCheckpointResult {
  status: 'saved' | 'skipped-stale' | 'quota-exceeded' | 'unavailable' | 'error';
  savedAtIso?: string;
  historyTruncated?: boolean;
  errorMessage?: string;
}

/**
 * Capture the pre-existing `sessionStorage` marker on module initialization (before React effects run)
 * so we can reliably detect whether this exact browser tab reloaded an active unsaved editing session.
 */
function readInitialTabSessionMarker(): TabSessionMarker | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TabSessionMarker>;
    if (
      parsed &&
      typeof parsed.tabSessionId === 'string' &&
      parsed.tabSessionId.length > 0 &&
      typeof parsed.documentId === 'string' &&
      parsed.documentId.length > 0
    ) {
      return {
        tabSessionId: parsed.tabSessionId,
        documentId: parsed.documentId,
        documentName:
          typeof parsed.documentName === 'string'
            ? parsed.documentName
            : 'Untitled Document',
        isDirty: Boolean(parsed.isDirty),
        lastUpdatedAtMs:
          typeof parsed.lastUpdatedAtMs === 'number'
            ? parsed.lastUpdatedAtMs
            : 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}

const initialTabMarkerOnLoad: TabSessionMarker | null = readInitialTabSessionMarker();

const currentTabSessionId: string =
  initialTabMarkerOnLoad?.tabSessionId ||
  `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function writeTabSessionMarker(marker: TabSessionMarker): void {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(marker));
  } catch {
    // Ignore sessionStorage errors in restricted WebViews
  }
}

/**
 * Records in `window.sessionStorage` that this browser tab is actively editing an unsaved document.
 */
export function markTabSessionDirty(documentId: string, documentName: string): void {
  writeTabSessionMarker({
    tabSessionId: currentTabSessionId,
    documentId,
    documentName,
    isDirty: true,
    lastUpdatedAtMs: Date.now(),
  });
}

/**
 * Records in `window.sessionStorage` that the active document in this tab is clean (saved, discarded,
 * or newly created/opened), preventing stale quiet auto-recovery on subsequent reloads.
 */
export function markTabSessionClean(documentId: string, documentName: string): void {
  writeTabSessionMarker({
    tabSessionId: currentTabSessionId,
    documentId,
    documentName,
    isDirty: false,
    lastUpdatedAtMs: Date.now(),
  });
}

export function getActiveTabSessionId(): string {
  return currentTabSessionId;
}

/**
 * In-memory cache of asset signatures currently stored in `draft_assets` so routine edits
 * (moving objects, drawing pen strokes, editing text/dimensions, Undo/Redo) never rewrite
 * multi-megabyte image binaries.
 */
const persistedAssetSignatures = new Map<string, string>();

let dbPromise: Promise<IDBDatabase> | null = null;
let latestRequestedRevision = 0;
let operationQueue: Promise<unknown> = Promise.resolve();

function computeAssetSignature(asset: StoredAssetMeta): string {
  return `${asset.id}|${asset.fileSizeBytes}|${asset.widthPx}x${asset.heightPx}|${asset.mimeType}|${asset.filename}`;
}

function enqueueOperation<T>(task: () => Promise<T>): Promise<T> {
  const next = operationQueue.then(task, task);
  operationQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function isQuotaExceededError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DOMException) {
    return (
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22
    );
  }
  const name = (err as { name?: string })?.name;
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

function toUint8Array(raw: unknown): Uint8Array | null {
  if (raw instanceof Uint8Array) {
    return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  }
  if (raw instanceof ArrayBuffer) {
    return new Uint8Array(raw);
  }
  if (ArrayBuffer.isView(raw)) {
    return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  }
  return null;
}

function isEmbeddedIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

function openRecoveryDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window) || !window.indexedDB) {
      reject(new Error('IndexedDB is not available in this browser environment.'));
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = window.indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Failed to open IndexedDB.'));
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        db.createObjectStore(STORE_ASSETS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(
        request.error || new Error('IndexedDB access was blocked or failed to initialize.')
      );
    };

    request.onblocked = () => {
      dbPromise = null;
      reject(new Error('IndexedDB database upgrade is blocked by another open tab.'));
    };
  });

  return dbPromise;
}

function idbRequestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function idbTransactionComplete(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed.'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction was aborted.'));
  });
}

/**
 * Checks whether IndexedDB is available and writable in the current browser / embedded preview environment.
 */
export async function probeRecoveryStorage(): Promise<RecoveryStorageDiagnostics> {
  const isEmbeddedPreview = isEmbeddedIframe();
  let isPersistentStorage: boolean | null = null;

  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.persisted === 'function'
    ) {
      isPersistentStorage = await navigator.storage.persisted();
    }
  } catch {
    isPersistentStorage = null;
  }

  try {
    const db = await openRecoveryDatabase();
    const tx = db.transaction([STORE_META], 'readonly');
    const store = tx.objectStore(STORE_META);
    await idbRequestToPromise(store.count());
    await idbTransactionComplete(tx);

    return {
      available: true,
      isEmbeddedPreview,
      isPersistentStorage,
      limitationReason: null,
    };
  } catch (err) {
    const reason =
      err instanceof Error
        ? err.message
        : 'Browser blocked local IndexedDB storage (e.g., private browsing or strict site data restrictions).';
    return {
      available: false,
      isEmbeddedPreview,
      isPersistentStorage,
      limitationReason: reason,
    };
  }
}

/**
 * Determines whether the persisted IndexedDB checkpoint belongs to the exact same active browser tab
 * editing session that just reloaded (e.g., mobile screen lock/unlock reload or in-tab refresh).
 */
function isSameActiveSessionReload(meta: StoredRecoveryDraftMeta): boolean {
  if (!initialTabMarkerOnLoad) return false;
  if (!initialTabMarkerOnLoad.isDirty) return false;
  if (!meta.tabSessionId || !meta.document?.id) return false;

  return (
    initialTabMarkerOnLoad.tabSessionId === meta.tabSessionId &&
    initialTabMarkerOnLoad.documentId === meta.document.id
  );
}

function sanitizeHistoryStack(
  rawStack: unknown,
  fallbackPaperSize: PaperFormat,
  fallbackOrientation: Orientation,
  fallbackWidthMm: number,
  fallbackHeightMm: number
): HistorySnapshot[] {
  if (!Array.isArray(rawStack)) return [];
  const sanitized: HistorySnapshot[] = [];

  for (const item of rawStack.slice(-MAX_HISTORY_SNAPSHOTS)) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Partial<HistorySnapshot>;
    if (!Array.isArray(candidate.pages) || candidate.pages.length === 0) continue;

    const cleanPages: PageData[] = candidate.pages.map((p, idx) => ({
      ...p,
      id: p?.id || `page_${idx + 1}`,
      name: p?.name || `Page ${idx + 1}`,
      guidelines: Array.isArray(p?.guidelines) ? p.guidelines : [],
      objects: sanitizeLoadedPageObjects(p?.objects || []),
    }));

    sanitized.push({
      paperSize: candidate.paperSize || fallbackPaperSize,
      orientation: candidate.orientation || fallbackOrientation,
      widthMm: Number(candidate.widthMm) || fallbackWidthMm,
      heightMm: Number(candidate.heightMm) || fallbackHeightMm,
      pages: cleanPages,
    });
  }

  return sanitized;
}

function buildSummaryFromMeta(meta: StoredRecoveryDraftMeta): RecoveryDraftSummary {
  const pages = Array.isArray(meta.document.pages) ? meta.document.pages : [];
  let objectCount = 0;
  for (const p of pages) {
    if (p && Array.isArray(p.objects)) {
      objectCount += p.objects.length;
    }
  }
  const hasMatchingHistoryDoc =
    !meta.historyDocumentId || meta.historyDocumentId === meta.document.id;
  const undoCount =
    hasMatchingHistoryDoc && Array.isArray(meta.historyPast)
      ? meta.historyPast.length
      : 0;
  const redoCount =
    hasMatchingHistoryDoc && Array.isArray(meta.historyFuture)
      ? meta.historyFuture.length
      : 0;

  return {
    documentId: meta.document.id,
    documentName: (meta.document.name || 'Untitled Document').trim(),
    paperSize: meta.document.paperSize || 'A0',
    orientation: meta.document.orientation || 'landscape',
    widthMm: Number(meta.document.widthMm) || 1189,
    heightMm: Number(meta.document.heightMm) || 841,
    pageCount: pages.length || 1,
    objectCount,
    assetCount: Array.isArray(meta.document.assetMetas)
      ? meta.document.assetMetas.length
      : 0,
    undoCount,
    redoCount,
    savedAtMs: meta.savedAtMs,
    savedAtIso: meta.savedAtIso,
    revision: meta.revision,
    tabSessionId: meta.tabSessionId || '',
    isSameActiveTabSession: isSameActiveSessionReload(meta),
  };
}

/**
 * Checks on startup whether a valid, complete local recovery draft exists in IndexedDB.
 * Verifies that all referenced binary image assets exist in `draft_assets` without loading
 * multi-megabyte buffers until restoration runs.
 */
export async function peekRecoveryDraftSummary(): Promise<RecoveryDraftSummary | null> {
  return enqueueOperation(async () => {
    try {
      const db = await openRecoveryDatabase();
      const tx = db.transaction([STORE_META, STORE_ASSETS], 'readonly');
      const metaStore = tx.objectStore(STORE_META);
      const assetStore = tx.objectStore(STORE_ASSETS);

      const meta = (await idbRequestToPromise(
        metaStore.get(ACTIVE_DRAFT_KEY)
      )) as StoredRecoveryDraftMeta | undefined;

      if (
        !meta ||
        meta.schemaVersion !== 1 ||
        !meta.document ||
        !Array.isArray(meta.document.pages) ||
        meta.document.pages.length === 0
      ) {
        return null;
      }

      // If this exact tab explicitly marked a newer clean/saved state after the draft timestamp, ignore stale draft
      if (
        initialTabMarkerOnLoad &&
        !initialTabMarkerOnLoad.isDirty &&
        initialTabMarkerOnLoad.tabSessionId === meta.tabSessionId &&
        initialTabMarkerOnLoad.lastUpdatedAtMs > meta.savedAtMs
      ) {
        return null;
      }

      // Verify that every referenced image asset record is present in `draft_assets`
      for (const assetMeta of meta.document.assetMetas || []) {
        const count = await idbRequestToPromise(assetStore.count(assetMeta.id));
        if (count === 0) {
          return null;
        }
      }

      await idbTransactionComplete(tx);
      return buildSummaryFromMeta(meta);
    } catch {
      return null;
    }
  });
}

/**
 * Restores the full `PageLayDocument`, its untouched original binary image assets (`Uint8Array`),
 * and its `historyPast` and `historyFuture` Undo/Redo stacks from IndexedDB.
 * Also binds the restored draft to the current `tabSessionId` so subsequent reloads in the same
 * session do not re-prompt the user.
 */
export async function restoreRecoveryDraft(): Promise<RestoredRecoveryDraft | null> {
  return enqueueOperation(async () => {
    try {
      const db = await openRecoveryDatabase();
      const tx = db.transaction([STORE_META, STORE_ASSETS], 'readwrite');
      const metaStore = tx.objectStore(STORE_META);
      const assetStore = tx.objectStore(STORE_ASSETS);

      const meta = (await idbRequestToPromise(
        metaStore.get(ACTIVE_DRAFT_KEY)
      )) as StoredRecoveryDraftMeta | undefined;

      if (
        !meta ||
        meta.schemaVersion !== 1 ||
        !meta.document ||
        !Array.isArray(meta.document.pages) ||
        meta.document.pages.length === 0
      ) {
        return null;
      }

      const assetsRecord: Record<string, ImageAsset> = {};
      persistedAssetSignatures.clear();

      for (const assetMeta of meta.document.assetMetas || []) {
        const storedRecord = (await idbRequestToPromise(
          assetStore.get(assetMeta.id)
        )) as StoredAssetBinaryRecord | undefined;

        if (!storedRecord) {
          throw new Error(
            `Recovery draft is missing image asset "${assetMeta.filename}".`
          );
        }

        const originalBytes = toUint8Array(storedRecord.originalBytes);
        if (!originalBytes || originalBytes.byteLength === 0) {
          throw new Error(
            `Recovery draft image asset "${assetMeta.filename}" is empty or unreadable.`
          );
        }

        const blob = new Blob([originalBytes as unknown as BlobPart], {
          type: storedRecord.mimeType,
        });
        const objectUrl = URL.createObjectURL(blob);

        const restoredAsset: ImageAsset = {
          id: storedRecord.id,
          filename: storedRecord.filename,
          mimeType: storedRecord.mimeType,
          originalBytes,
          objectUrl,
          widthPx: storedRecord.widthPx,
          heightPx: storedRecord.heightPx,
          fileSizeBytes: originalBytes.byteLength,
        };

        assetsRecord[restoredAsset.id] = restoredAsset;
        persistedAssetSignatures.set(
          restoredAsset.id,
          computeAssetSignature(restoredAsset)
        );
      }

      // Bind the checkpoint's tabSessionId to the current tab so subsequent mobile reloads in this tab
      // are recognized as the same active session and do not repeatedly show the modal dialogue.
      if (meta.tabSessionId !== currentTabSessionId) {
        metaStore.put({
          ...meta,
          tabSessionId: currentTabSessionId,
        });
      }

      await idbTransactionComplete(tx);

      const d = meta.document;
      const paperSize: PaperFormat = d.paperSize || 'A0';
      const orientation: Orientation = d.orientation || 'landscape';
      const widthMm = Number(d.widthMm) || 1189;
      const heightMm = Number(d.heightMm) || 841;

      const sanitizedPages: PageData[] = d.pages.map((p, idx) => ({
        ...p,
        id: p.id || `page_${idx + 1}`,
        name: p.name || `Page ${idx + 1}`,
        guidelines: Array.isArray(p.guidelines) ? p.guidelines : [],
        objects: sanitizeLoadedPageObjects(p.objects || []),
      }));

      const docId = d.id || `doc_${Date.now()}`;
      const docName = (d.name || 'Untitled Document').trim();

      const restoredDoc: PageLayDocument = {
        id: docId,
        name: docName,
        version: d.version || '1.0.0',
        createdAt: d.createdAt || new Date().toISOString(),
        updatedAt: d.updatedAt || meta.savedAtIso || new Date().toISOString(),
        paperSize,
        orientation,
        widthMm,
        heightMm,
        showGuides: d.showGuides ?? true,
        lockGuides: d.lockGuides ?? false,
        snapToGuides: d.snapToGuides ?? true,
        snapToPageEdges: d.snapToPageEdges ?? true,
        snapToObjects: d.snapToObjects ?? true,
        angleSnapIncrementDeg:
          typeof d.angleSnapIncrementDeg === 'number' &&
          Number.isFinite(d.angleSnapIncrementDeg)
            ? Math.max(1, Math.min(45, Math.round(d.angleSnapIncrementDeg)))
            : 15,
        precisionMode: Boolean(d.precisionMode),
        pages: sanitizedPages,
        assets: assetsRecord,
      };

      const hasMatchingHistoryDoc =
        !meta.historyDocumentId || meta.historyDocumentId === docId;

      const restoredHistoryPast = hasMatchingHistoryDoc
        ? sanitizeHistoryStack(
            meta.historyPast,
            paperSize,
            orientation,
            widthMm,
            heightMm
          )
        : [];

      const restoredHistoryFuture = hasMatchingHistoryDoc
        ? sanitizeHistoryStack(
            meta.historyFuture,
            paperSize,
            orientation,
            widthMm,
            heightMm
          )
        : [];

      const clampedPageIndex = Math.max(
        0,
        Math.min(
          typeof meta.activePageIndex === 'number' ? meta.activePageIndex : 0,
          sanitizedPages.length - 1
        )
      );

      if (meta.revision > latestRequestedRevision) {
        latestRequestedRevision = meta.revision;
      }

      markTabSessionDirty(docId, docName);

      return {
        doc: restoredDoc,
        activePageIndex: clampedPageIndex,
        historyPast: restoredHistoryPast,
        historyFuture: restoredHistoryFuture,
        summary: buildSummaryFromMeta({
          ...meta,
          tabSessionId: currentTabSessionId,
        }),
      };
    } catch {
      return null;
    }
  });
}

function collectAllReferencedAssetIdsAcrossHistory(
  currentPages: PageData[],
  historyPast: HistorySnapshot[],
  historyFuture: HistorySnapshot[]
): Set<string> {
  const allPages: PageData[] = [...currentPages];
  for (const snap of historyPast) {
    if (snap && Array.isArray(snap.pages)) {
      allPages.push(...snap.pages);
    }
  }
  for (const snap of historyFuture) {
    if (snap && Array.isArray(snap.pages)) {
      allPages.push(...snap.pages);
    }
  }
  return collectReferencedAssetIds(allPages);
}

/**
 * Persists a local recovery checkpoint for the given `PageLayDocument` and its Undo/Redo history in IndexedDB:
 * - Writes only new or changed binary image assets (`Uint8Array`) to `draft_assets`.
 * - Preserves all image assets referenced by current pages OR by any snapshot in `historyPast` / `historyFuture`
 *   so Undoing a deleted image or Redoing an imported page after recovery retains full-resolution image data.
 * - Never persists temporary `blob:` object URLs.
 * - Uses monotonic revision numbering so an older checkpoint never overwrites a newer checkpoint.
 */
export async function saveRecoveryCheckpoint(
  doc: PageLayDocument,
  activePageIndex: number,
  historyPast: HistorySnapshot[] = [],
  historyFuture: HistorySnapshot[] = []
): Promise<SaveCheckpointResult> {
  const requestRevision = ++latestRequestedRevision;
  const savedAtMs = Date.now();
  const savedAtIso = new Date(savedAtMs).toISOString();

  // Synchronously update sessionStorage so this tab's active document & dirty state are recorded immediately
  markTabSessionDirty(doc.id, doc.name);

  // Deep-clone pages and bounded history stacks synchronously at request time
  const pagesClone: PageData[] = JSON.parse(JSON.stringify(doc.pages));
  const boundedPast: HistorySnapshot[] = JSON.parse(
    JSON.stringify(historyPast.slice(-MAX_HISTORY_SNAPSHOTS))
  );
  const boundedFuture: HistorySnapshot[] = JSON.parse(
    JSON.stringify(historyFuture.slice(0, MAX_HISTORY_SNAPSHOTS))
  );

  const referencedIds = collectAllReferencedAssetIdsAcrossHistory(
    pagesClone,
    boundedPast,
    boundedFuture
  );

  // Keep all assets referenced by current pages or any recoverable Undo/Redo snapshot
  const allDocAssets = Object.values(doc.assets);
  const assetsToKeep = allDocAssets.filter((a) => referencedIds.has(a.id));

  const assetMetas: StoredAssetMeta[] = assetsToKeep.map((a) => ({
    id: a.id,
    filename: a.filename,
    mimeType: a.mimeType,
    widthPx: a.widthPx,
    heightPx: a.heightPx,
    fileSizeBytes: a.fileSizeBytes,
  }));

  const buildMetaRecord = (
    pastSlice: HistorySnapshot[],
    futureSlice: HistorySnapshot[]
  ): StoredRecoveryDraftMeta => ({
    key: ACTIVE_DRAFT_KEY,
    schemaVersion: 1,
    revision: requestRevision,
    savedAtMs,
    savedAtIso,
    tabSessionId: currentTabSessionId,
    activePageIndex,
    historyDocumentId: doc.id,
    historyPast: pastSlice,
    historyFuture: futureSlice,
    document: {
      id: doc.id,
      name: doc.name,
      version: doc.version,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt || savedAtIso,
      paperSize: doc.paperSize,
      orientation: doc.orientation,
      widthMm: doc.widthMm,
      heightMm: doc.heightMm,
      showGuides: doc.showGuides,
      lockGuides: doc.lockGuides,
      snapToGuides: doc.snapToGuides,
      snapToPageEdges: doc.snapToPageEdges,
      snapToObjects: doc.snapToObjects,
      angleSnapIncrementDeg: doc.angleSnapIncrementDeg ?? 15,
      precisionMode: Boolean(doc.precisionMode),
      pages: pagesClone,
      assetMetas,
    },
  });

  return enqueueOperation(async (): Promise<SaveCheckpointResult> => {
    if (requestRevision < latestRequestedRevision) {
      return { status: 'skipped-stale' };
    }

    let db: IDBDatabase;
    try {
      db = await openRecoveryDatabase();
    } catch (err) {
      return {
        status: 'unavailable',
        errorMessage:
          err instanceof Error
            ? err.message
            : 'IndexedDB is unavailable in this browser environment.',
      };
    }

    const attemptTransaction = async (
      pastToStore: HistorySnapshot[],
      futureToStore: HistorySnapshot[]
    ): Promise<void> => {
      const tx = db.transaction([STORE_META, STORE_ASSETS], 'readwrite');
      const metaStore = tx.objectStore(STORE_META);
      const assetStore = tx.objectStore(STORE_ASSETS);

      const existingMeta = (await idbRequestToPromise(
        metaStore.get(ACTIVE_DRAFT_KEY)
      )) as StoredRecoveryDraftMeta | undefined;

      if (
        existingMeta &&
        typeof existingMeta.revision === 'number' &&
        existingMeta.revision > requestRevision
      ) {
        return;
      }

      const activeAssetIdSet = new Set(assetsToKeep.map((a) => a.id));
      const newlyWrittenSignatures = new Map<string, string>();

      for (const asset of assetsToKeep) {
        const sig = computeAssetSignature(asset);
        const alreadyInMemoryCache = persistedAssetSignatures.get(asset.id) === sig;

        let needsWrite = !alreadyInMemoryCache;
        if (!needsWrite) {
          const existingCount = await idbRequestToPromise(assetStore.count(asset.id));
          if (existingCount === 0) {
            needsWrite = true;
          }
        }

        if (needsWrite) {
          const binaryRecord: StoredAssetBinaryRecord = {
            id: asset.id,
            filename: asset.filename,
            mimeType: asset.mimeType,
            widthPx: asset.widthPx,
            heightPx: asset.heightPx,
            fileSizeBytes: asset.fileSizeBytes,
            originalBytes: asset.originalBytes,
            updatedAtMs: savedAtMs,
          };
          assetStore.put(binaryRecord);
        }
        newlyWrittenSignatures.set(asset.id, sig);
      }

      const existingAssetKeys = (await idbRequestToPromise(
        assetStore.getAllKeys()
      )) as IDBValidKey[];
      for (const key of existingAssetKeys) {
        const keyStr = String(key);
        if (!activeAssetIdSet.has(keyStr)) {
          assetStore.delete(key);
        }
      }

      metaStore.put(buildMetaRecord(pastToStore, futureToStore));

      await idbTransactionComplete(tx);

      persistedAssetSignatures.clear();
      for (const [id, sig] of newlyWrittenSignatures.entries()) {
        persistedAssetSignatures.set(id, sig);
      }
    };

    try {
      await attemptTransaction(boundedPast, boundedFuture);
      return {
        status: 'saved',
        savedAtIso,
      };
    } catch (err) {
      // If storage quota is tight with full history depth, retry with the most recent 8 snapshots before failing
      if (
        isQuotaExceededError(err) &&
        (boundedPast.length > 8 || boundedFuture.length > 4)
      ) {
        try {
          await attemptTransaction(
            boundedPast.slice(-8),
            boundedFuture.slice(0, 4)
          );
          return {
            status: 'saved',
            savedAtIso,
            historyTruncated: true,
          };
        } catch (retryErr) {
          if (isQuotaExceededError(retryErr)) {
            return {
              status: 'quota-exceeded',
              errorMessage:
                'Browser local storage quota exceeded. Recent recovery checkpoint and Undo history could not be saved — please Save (.lay) directly to disk.',
            };
          }
        }
      }

      if (isQuotaExceededError(err)) {
        return {
          status: 'quota-exceeded',
          errorMessage:
            'Browser local storage quota exceeded. Please Save (.lay) directly to disk to protect your work.',
        };
      }
      return {
        status: 'error',
        errorMessage:
          err instanceof Error
            ? err.message
            : 'Failed to write local recovery checkpoint.',
      };
    }
  });
}

/**
 * Deliberately removes the active recovery draft and all stored recovery image binaries from IndexedDB,
 * and marks the current tab session as clean so old discarded work never reappears on the next launch.
 */
export async function clearRecoveryDraft(
  cleanDocumentId?: string,
  cleanDocumentName?: string
): Promise<void> {
  ++latestRequestedRevision;
  persistedAssetSignatures.clear();

  if (cleanDocumentId) {
    markTabSessionClean(cleanDocumentId, cleanDocumentName || 'Untitled Document');
  } else {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {
      // Ignore sessionStorage errors
    }
  }

  return enqueueOperation(async () => {
    try {
      const db = await openRecoveryDatabase();
      const tx = db.transaction([STORE_META, STORE_ASSETS], 'readwrite');
      tx.objectStore(STORE_META).delete(ACTIVE_DRAFT_KEY);
      tx.objectStore(STORE_ASSETS).clear();
      await idbTransactionComplete(tx);
    } catch {
      // Ignore errors if IndexedDB is unavailable in private/restricted mode
    }
  });
}
