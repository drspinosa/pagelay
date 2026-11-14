/**
 * @license
 * SPDX-License-Identifier: MIT
 *
 * PageLay — Application Shell & State Coordinator
 * Tagline: Simple page layouts. No fuss.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  AVAILABLE_FONTS,
  GroupObject,
  Guideline,
  ImageObject,
  Orientation,
  PageData,
  PageLayDocument,
  PageObject,
  PaperFormat,
  ToolType,
} from './model/documentTypes';
import {
  cloneObject,
  clonePage,
  createBlankPage,
  createNewDocument,
  createSampleExhibitionDocument,
  generateId,
  prepareImportedPagesFromDocument,
} from './model/documentFactory';
import {
  CSS_PX_PER_MM_AT_100,
  formatMm,
  getCombinedBoundsMm,
  syncLinearBoundingBox,
  translatePageObjectMm,
} from './utils/units';
import {
  canUseNativeOpenFilePickerSync,
  importImageFileToAsset,
  LayFileSystemHandle,
  loadDocumentFromLayFile,
  openDocumentWithNativePicker,
  saveDocumentAsLayFileWithPicker,
  saveDocumentAsWithNativePicker,
  saveDocumentToExistingOrNewHandle,
} from './services/layFileService';
import { TopToolbar } from './components/TopToolbar';
import { PagesSidebar } from './components/PagesSidebar';
import { EditorCanvas } from './components/EditorCanvas';
import { PropertiesPanel } from './components/PropertiesPanel';
import { HelpPanel } from './components/HelpPanel';
import { StatusBar } from './components/StatusBar';
import { RULER_THICKNESS_PX } from './components/Rulers';
import {
  ExportModal,
  NewDocumentModal,
  RecoveryDraftModal,
  ReopenRecentModal,
  SaveAsModal,
  SaveAsOutcome,
  UnsavedChangesModal,
} from './components/Modals';
import {
  clearRecoveryDraft,
  HistorySnapshot,
  markTabSessionClean,
  markTabSessionDirty,
  peekRecoveryDraftSummary,
  probeRecoveryStorage,
  RecoveryDraftSummary,
  restoreRecoveryDraft,
  saveRecoveryCheckpoint,
} from './services/recoveryDraftService';
import {
  clearAllRecentDocuments,
  loadRecentDocuments,
  readRecentDocumentsSync,
  RecentDocumentEntry,
  recordRecentDocument,
  RecordRecentOptions,
  removeRecentDocumentEntry,
  tryReopenRecentDocument,
  tryReopenRecentFromCachedBlob,
} from './services/recentFilesService';
import {
  createPageLayClipboardPayload,
  inspectSystemClipboardForPaste,
  PageLayClipboardPayload,
  prepareInternalPasteFromPayload,
} from './services/clipboardService';

type PendingReplacementAction =
  | { type: 'open-new-modal' }
  | {
      type: 'create-blank';
      name: string;
      paperSize: PaperFormat;
      orientation: Orientation;
      widthMm: number;
      heightMm: number;
    }
  | { type: 'open-picker' }
  | { type: 'open-file'; file: File }
  | { type: 'open-recent'; entry: RecentDocumentEntry }
  | { type: 'load-sample' };

type SaveDocumentOutcome =
  | 'saved-native'
  | 'needs-fallback-modal'
  | 'cancelled'
  | 'failed';

function createSnapshot(doc: PageLayDocument): HistorySnapshot {
  return {
    paperSize: doc.paperSize,
    orientation: doc.orientation,
    widthMm: doc.widthMm,
    heightMm: doc.heightMm,
    pages: JSON.parse(JSON.stringify(doc.pages)),
  };
}

function countDocumentObjects(targetDoc: PageLayDocument): number {
  let count = 0;
  for (const page of targetDoc.pages || []) {
    count += Array.isArray(page.objects) ? page.objects.length : 0;
  }
  return count;
}

function logDocumentLifecycle(
  stage: string,
  targetDoc: PageLayDocument,
  extra?: Record<string, unknown>
): void {
  console.info('[PageLay Lifecycle]', {
    stage,
    docId: targetDoc.id,
    docName: targetDoc.name,
    pages: targetDoc.pages?.length ?? 0,
    objects: countDocumentObjects(targetDoc),
    ...extra,
  });
}

export default function App() {
  // Default document: A0 landscape, 1189 mm wide × 841 mm high
  const [doc, setDoc] = useState<PageLayDocument>(() => {
    const initialDoc = createNewDocument('Untitled A0 Layout', 'A0', 'landscape');
    logDocumentLifecycle('initial-blank-state-created', initialDoc);
    return initialDoc;
  });
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [croppingImageId, setCroppingImageId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [activeHighlightColor, setActiveHighlightColor] = useState<string>('#FACC15');
  const [penColor, setPenColor] = useState<string>('#0F172A');
  const [penWidthMm, setPenWidthMm] = useState<number>(0.8);
  const [freehandHighlighterColor, setFreehandHighlighterColor] =
    useState<string>('#FACC15');
  const [freehandHighlighterWidthMm, setFreehandHighlighterWidthMm] =
    useState<number>(6);

  // Responsive sidebar visibility: open by default on desktop (>= 1024px), drawer on mobile (< 1024px)
  const [isPagesOpen, setIsPagesOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [isPropertiesOpen, setIsPropertiesOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  );
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);

  // Viewport Zoom & Pan (only affects visual display, never canonical mm document geometry)
  const [zoom, setZoom] = useState<number>(0.18);
  const [panX, setPanX] = useState<number>(24);
  const [panY, setPanY] = useState<number>(24);
  const [cursorMm, setCursorMm] = useState<{ x: number; y: number } | null>(null);

  // Undo / Redo History Stacks & Runtime File Handle (never serialized into .lay documents)
  const [historyPast, setHistoryPast] = useState<HistorySnapshot[]>([]);
  const [historyFuture, setHistoryFuture] = useState<HistorySnapshot[]>([]);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [activeFileHandle, setActiveFileHandle] = useState<LayFileSystemHandle | null>(
    null
  );
  const isSavingRef = useRef<boolean>(false);
  const [isSavingInModal, setIsSavingInModal] = useState<boolean>(false);

  // Synchronized refs to avoid stale closures during rapid Undo/Redo, drag commits, or file drops
  const docRef = useRef<PageLayDocument>(doc);
  docRef.current = doc;
  const activePageIndexRef = useRef<number>(activePageIndex);
  activePageIndexRef.current = activePageIndex;
  const historyPastRef = useRef<HistorySnapshot[]>(historyPast);
  historyPastRef.current = historyPast;
  const historyFutureRef = useRef<HistorySnapshot[]>(historyFuture);
  historyFutureRef.current = historyFuture;
  const isDirtyRef = useRef<boolean>(isDirty);
  isDirtyRef.current = isDirty;

  // Monotonic document session generation guard: increments whenever the user opens a file,
  // creates a document, loads Sample A0, or edits the document so stale startup recovery never overwrites it.
  const documentSessionGenRef = useRef<number>(0);
  const hasUserReplacedOrEditedDocRef = useRef<boolean>(false);

  const viewportViewRef = useRef({ zoom, panX, panY });
  viewportViewRef.current = { zoom, panX, panY };

  // Clipboard for Copy / Paste (supports multi-object/group copy + cross-document asset preservation)
  const clipboardPayloadRef = useRef<PageLayClipboardPayload | null>(null);
  const lastKeydownCopyTimestampRef = useRef<number>(0);

  // Modals & Notifications
  const [isNewModalOpen, setIsNewModalOpen] = useState<boolean>(false);
  const [isSaveAsModalOpen, setIsSaveAsModalOpen] = useState<boolean>(false);
  const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState<boolean>(false);
  const [pendingReplacementAction, setPendingReplacementAction] =
    useState<PendingReplacementAction | null>(null);
  const pendingReplacementRef = useRef<PendingReplacementAction | null>(null);
  const newModalAuthorisedRef = useRef<boolean>(false);

  // Open Recent Documents State (Maximum 10 entries, persisted in localStorage + separate IndexedDB handles)
  const [recentDocuments, setRecentDocuments] = useState<RecentDocumentEntry[]>(() =>
    readRecentDocumentsSync()
  );
  const [reopenRecentModalState, setReopenRecentModalState] = useState<{
    isOpen: boolean;
    entry: RecentDocumentEntry | null;
    reasonMessage: string | null;
    canOpenLocalCopy: boolean;
  }>({
    isOpen: false,
    entry: null,
    reasonMessage: null,
    canOpenLocalCopy: false,
  });
  const pendingReopenRecentEntryIdRef = useRef<string | undefined>(undefined);

  // Local IndexedDB Draft Recovery State
  const [recoveryDraftSummary, setRecoveryDraftSummary] =
    useState<RecoveryDraftSummary | null>(null);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState<boolean>(false);
  const [isRecoveringDraft, setIsRecoveringDraft] = useState<boolean>(false);
  const [isRecoveryReady, setIsRecoveryReady] = useState<boolean>(false);
  const recoveryReadyRef = useRef<boolean>(false);
  const hasCheckedStartupRecoveryRef = useRef<boolean>(false);
  const [lastRecoveryCheckpointAt, setLastRecoveryCheckpointAt] = useState<
    string | null
  >(null);
  const [recoveryStorageWarning, setRecoveryStorageWarning] = useState<
    string | null
  >(null);
  const checkpointTimerRef = useRef<number | null>(null);

  const [exportModalState, setExportModalState] = useState<{
    isOpen: boolean;
    tab: 'pdf' | 'image';
  }>({ isOpen: false, tab: 'pdf' });
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'info' | 'error';
  } | null>(null);

  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const hiddenImageInputRef = useRef<HTMLInputElement | null>(null);
  const hiddenLayInputRef = useRef<HTMLInputElement | null>(null);

  // Reconcile stored recent document handles on startup without touching recovery storage
  useEffect(() => {
    void loadRecentDocuments().then((loaded) => {
      setRecentDocuments(loaded);
    });
  }, []);

  const recordRecentAndSyncState = useCallback(
    async (options: RecordRecentOptions) => {
      const updated = await recordRecentDocument(options);
      setRecentDocuments(updated);
    },
    []
  );

  const handleRemoveRecentDocument = useCallback(async (entryId: string) => {
    const updated = await removeRecentDocumentEntry(entryId);
    setRecentDocuments(updated);
    setReopenRecentModalState((prev) =>
      prev.entry?.id === entryId
        ? {
            isOpen: false,
            entry: null,
            reasonMessage: null,
            canOpenLocalCopy: false,
          }
        : prev
    );
  }, []);

  const handleClearRecentDocuments = useCallback(async () => {
    const cleared = await clearAllRecentDocuments();
    setRecentDocuments(cleared);
  }, []);

  // Keep browser document.title synchronized with the internal PageLay document name
  useEffect(() => {
    const cleanTitle = (doc.name || 'Untitled Document').trim();
    document.title = `${cleanTitle} — PageLay`;
  }, [doc.name]);

  // Warn before browser tab close or refresh when the active document has unsaved changes
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const showToast = useCallback((text: string, type: 'info' | 'error' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  }, []);

  /**
   * Computes a zoom level and pan offset that fits the physical document page inside the central workspace.
   * Uses `docRef.current` for defaults so its callback identity remains stable across document dimension changes.
   */
  const fitPageToWorkspace = useCallback(
    (
      targetWidthMm?: number,
      targetHeightMm?: number,
      mode: 'page' | 'width' = 'page'
    ) => {
      const el = workspaceRef.current;
      if (!el) return;
      const wMm = targetWidthMm ?? docRef.current.widthMm;
      const hMm = targetHeightMm ?? docRef.current.heightMm;
      const paddingPx = el.clientWidth < 640 ? 24 : 56;
      const availW = Math.max(120, el.clientWidth - RULER_THICKNESS_PX - paddingPx);
      const availH = Math.max(120, el.clientHeight - RULER_THICKNESS_PX - paddingPx);

      const pagePxWAt100 = wMm * CSS_PX_PER_MM_AT_100;
      const pagePxHAt100 = hMm * CSS_PX_PER_MM_AT_100;

      const scaleX = availW / pagePxWAt100;
      const scaleY = availH / pagePxHAt100;
      const nextZoom = Number(
        Math.min(
          2.5,
          Math.max(0.04, mode === 'width' ? scaleX : Math.min(scaleX, scaleY))
        ).toFixed(3)
      );

      const renderedW = pagePxWAt100 * nextZoom;
      const renderedH = pagePxHAt100 * nextZoom;

      setZoom(nextZoom);
      setPanX(Math.max(12, Math.round((el.clientWidth - RULER_THICKNESS_PX - renderedW) / 2)));
      setPanY(Math.max(12, Math.round((el.clientHeight - RULER_THICKNESS_PX - renderedH) / 2)));
    },
    []
  );

  // Fit page nicely on initial mount, document dimension changes, and mobile viewport/orientation resizes
  useEffect(() => {
    fitPageToWorkspace(doc.widthMm, doc.heightMm, 'page');
    const el = workspaceRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    let prevW = el.clientWidth;
    let prevH = el.clientHeight;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const newW = Math.round(entry.contentRect.width);
      const newH = Math.round(entry.contentRect.height);
      if (Math.abs(newW - prevW) > 16 || Math.abs(newH - prevH) > 16) {
        prevW = newW;
        prevH = newH;
        fitPageToWorkspace(doc.widthMm, doc.heightMm, 'page');
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [fitPageToWorkspace, doc.widthMm, doc.heightMm]);

  const markDirty = useCallback(() => {
    hasUserReplacedOrEditedDocRef.current = true;
    isDirtyRef.current = true;
    newModalAuthorisedRef.current = false;
    setIsDirty(true);
    markTabSessionDirty(docRef.current.id, docRef.current.name);
  }, []);

  const markClean = useCallback((hasActiveSessionDoc = true) => {
    isDirtyRef.current = false;
    newModalAuthorisedRef.current = false;
    setIsDirty(false);
    markTabSessionClean(
      docRef.current.id,
      docRef.current.name,
      hasActiveSessionDoc
    );
  }, []);

  const cancelPendingRecoveryCheckpoint = useCallback(() => {
    if (checkpointTimerRef.current !== null) {
      window.clearTimeout(checkpointTimerRef.current);
      checkpointTimerRef.current = null;
    }
  }, []);

  /**
   * Persists the active clean document (e.g., immediately after opening a `.lay` file, saving a `.lay` file,
   * creating a new document, or loading Sample A0) into IndexedDB with `isDirty: false`.
   * This guarantees that if the mobile browser or preview host reloads 2–3 seconds after returning from
   * the native file picker, the opened/saved document is seamlessly restored instead of a blank A0 layout.
   */
  const persistCleanActiveDocumentCheckpoint = useCallback(
    async (
      targetDoc: PageLayDocument,
      targetPageIndex = 0,
      past: HistorySnapshot[] = [],
      future: HistorySnapshot[] = []
    ) => {
      cancelPendingRecoveryCheckpoint();
      recoveryReadyRef.current = true;
      setIsRecoveryReady(true);
      setLastRecoveryCheckpointAt(null);
      const res = await saveRecoveryCheckpoint(
        targetDoc,
        targetPageIndex,
        past,
        future,
        { isDirty: false }
      );
      logDocumentLifecycle('clean-session-checkpoint-persisted', targetDoc, {
        status: res.status,
      });
    },
    [cancelPendingRecoveryCheckpoint]
  );

  const flushRecoveryCheckpointNow = useCallback(async () => {
    cancelPendingRecoveryCheckpoint();
    if (!recoveryReadyRef.current || !isDirtyRef.current) return;
    const res = await saveRecoveryCheckpoint(
      docRef.current,
      activePageIndexRef.current,
      historyPastRef.current,
      historyFutureRef.current,
      { isDirty: true }
    );
    if (res.status === 'saved' && res.savedAtIso) {
      setLastRecoveryCheckpointAt(
        new Date(res.savedAtIso).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
      if (res.historyTruncated) {
        setRecoveryStorageWarning(
          'Browser storage is nearly full — older Undo steps were trimmed. Please Save (.lay) directly to disk.'
        );
      } else {
        setRecoveryStorageWarning((prev) => (prev ? null : prev));
      }
    } else if (
      res.status === 'quota-exceeded' ||
      res.status === 'unavailable' ||
      res.status === 'error'
    ) {
      const warning =
        res.errorMessage ||
        'Local draft recovery storage is unavailable or full. Use Save (.lay) directly to protect your work.';
      setRecoveryStorageWarning(warning);
    }
  }, [cancelPendingRecoveryCheckpoint]);

  const resolveAndClearRecoveryDraft = useCallback(
    async (cleanDoc?: PageLayDocument) => {
      cancelPendingRecoveryCheckpoint();
      setLastRecoveryCheckpointAt(null);
      const target = cleanDoc ?? docRef.current;
      logDocumentLifecycle('recovery-draft-cleared', target);
      await clearRecoveryDraft(target.id, target.name);
    },
    [cancelPendingRecoveryCheckpoint]
  );

  /**
   * Synchronously clears both undo and redo history stacks and refs (used only when creating or opening a new document).
   */
  const clearHistory = useCallback(() => {
    historyPastRef.current = [];
    historyFutureRef.current = [];
    setHistoryPast([]);
    setHistoryFuture([]);
  }, []);

  /**
   * Restores the persisted recovery draft or active session document (including document contents,
   * original binary images, active page index, and `historyPast` / `historyFuture` Undo/Redo stacks)
   * into active editor state.
   */
  const applyRestoredRecoveryDraft = useCallback(
    async (expectedSessionGen?: number): Promise<boolean> => {
      if (
        expectedSessionGen !== undefined &&
        (documentSessionGenRef.current !== expectedSessionGen ||
          hasUserReplacedOrEditedDocRef.current)
      ) {
        logDocumentLifecycle(
          'recovery-restore-aborted-before-read-due-to-newer-session',
          docRef.current,
          {
            expectedSessionGen,
            currentSessionGen: documentSessionGenRef.current,
          }
        );
        return false;
      }

      const restored = await restoreRecoveryDraft();
      if (!restored) {
        return false;
      }

      // Guard again after awaiting IndexedDB read in case the user opened a file while reading
      if (
        expectedSessionGen !== undefined &&
        (documentSessionGenRef.current !== expectedSessionGen ||
          hasUserReplacedOrEditedDocRef.current)
      ) {
        logDocumentLifecycle(
          'recovery-restore-aborted-after-read-due-to-newer-session',
          docRef.current,
          {
            expectedSessionGen,
            currentSessionGen: documentSessionGenRef.current,
            restoredDocId: restored.doc.id,
          }
        );
        return false;
      }

      const restoredIsDirty = restored.isDirty;
      docRef.current = restored.doc;
      activePageIndexRef.current = restored.activePageIndex;
      historyPastRef.current = restored.historyPast;
      historyFutureRef.current = restored.historyFuture;
      isDirtyRef.current = restoredIsDirty;
      newModalAuthorisedRef.current = false;

      setDoc(restored.doc);
      setActivePageIndex(restored.activePageIndex);
      setHistoryPast(restored.historyPast);
      setHistoryFuture(restored.historyFuture);
      // Never assume an earlier file handle is still writable after a restart
      setActiveFileHandle(null);
      setSelectedObjectId(null);
      setSelectedObjectIds([]);
      setSelectedGuideId(null);
      setCroppingImageId(null);
      setEditingTextId(null);
      setIsDirty(restoredIsDirty);
      setLastSavedAt(null);

      if (restoredIsDirty) {
        setLastRecoveryCheckpointAt(
          new Date(restored.summary.savedAtIso).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        );
        markTabSessionDirty(restored.doc.id, restored.doc.name);
      } else {
        setLastRecoveryCheckpointAt(null);
        markTabSessionClean(restored.doc.id, restored.doc.name, true);
      }

      setIsRecoveryModalOpen(false);
      setRecoveryDraftSummary(null);
      recoveryReadyRef.current = true;
      setIsRecoveryReady(true);

      logDocumentLifecycle('recovery-session-restored', restored.doc, {
        isDirty: restoredIsDirty,
        undoCount: restored.historyPast.length,
        redoCount: restored.historyFuture.length,
      });

      setTimeout(() => {
        fitPageToWorkspace(restored.doc.widthMm, restored.doc.heightMm, 'page');
      }, 50);

      if (restoredIsDirty) {
        showToast('Draft restored locally');
      }
      return true;
    },
    [fitPageToWorkspace, showToast]
  );

  // Startup probe for IndexedDB availability & existing recovery draft / active session document (runs once on mount)
  useEffect(() => {
    if (hasCheckedStartupRecoveryRef.current) return;
    hasCheckedStartupRecoveryRef.current = true;

    const startupSessionGen = documentSessionGenRef.current;
    let cancelled = false;

    (async () => {
      logDocumentLifecycle('startup-recovery-check-start', docRef.current, {
        startupSessionGen,
      });

      const diag = await probeRecoveryStorage();
      if (cancelled) return;
      if (!diag.available) {
        const msg =
          diag.limitationReason ||
          'Local draft recovery is unavailable in this browser environment. Please Save (.lay) frequently.';
        setRecoveryStorageWarning(msg);
        recoveryReadyRef.current = true;
        setIsRecoveryReady(true);
        return;
      }

      const existingSummary = await peekRecoveryDraftSummary();
      if (cancelled) return;

      // Never overwrite a document that the user has already opened, replaced, or edited since mount
      if (
        documentSessionGenRef.current !== startupSessionGen ||
        hasUserReplacedOrEditedDocRef.current ||
        isDirtyRef.current
      ) {
        logDocumentLifecycle(
          'startup-recovery-skipped-active-user-document',
          docRef.current,
          {
            startupSessionGen,
            currentSessionGen: documentSessionGenRef.current,
          }
        );
        recoveryReadyRef.current = true;
        setIsRecoveryReady(true);
        return;
      }

      if (existingSummary) {
        if (existingSummary.isSameActiveTabSession) {
          // Quiet automatic restoration when the browser/preview reloaded the exact same active session
          const restoredOk = await applyRestoredRecoveryDraft(startupSessionGen);
          if (
            !cancelled &&
            !restoredOk &&
            documentSessionGenRef.current === startupSessionGen &&
            !hasUserReplacedOrEditedDocRef.current &&
            existingSummary.isDirty
          ) {
            setRecoveryDraftSummary(existingSummary);
            setIsRecoveryModalOpen(true);
          } else {
            recoveryReadyRef.current = true;
            setIsRecoveryReady(true);
          }
        } else if (existingSummary.isDirty) {
          // Interrupted dirty session from a previous browser launch or another tab: ask for confirmation
          logDocumentLifecycle('startup-recovery-modal-prompted', docRef.current, {
            draftDocId: existingSummary.documentId,
            draftDocName: existingSummary.documentName,
          });
          setRecoveryDraftSummary(existingSummary);
          setIsRecoveryModalOpen(true);
        } else {
          recoveryReadyRef.current = true;
          setIsRecoveryReady(true);
        }
      } else {
        logDocumentLifecycle('startup-recovery-no-existing-draft', docRef.current);
        recoveryReadyRef.current = true;
        setIsRecoveryReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyRestoredRecoveryDraft]);

  // Debounced automatic recovery checkpoint (~1.0 second) after meaningful document edits or Undo/Redo
  useEffect(() => {
    if (!isRecoveryReady || isRecoveryModalOpen || !isDirty) {
      cancelPendingRecoveryCheckpoint();
      return;
    }
    cancelPendingRecoveryCheckpoint();
    checkpointTimerRef.current = window.setTimeout(() => {
      checkpointTimerRef.current = null;
      void flushRecoveryCheckpointNow();
    }, 1000);

    return () => {
      cancelPendingRecoveryCheckpoint();
    };
  }, [
    doc,
    activePageIndex,
    historyPast,
    historyFuture,
    isDirty,
    isRecoveryReady,
    isRecoveryModalOpen,
    cancelPendingRecoveryCheckpoint,
    flushRecoveryCheckpointNow,
  ]);

  // Immediate recovery checkpoint when page becomes hidden, suspended, or unloaded on mobile/desktop
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'hidden' &&
        isDirtyRef.current &&
        recoveryReadyRef.current
      ) {
        void flushRecoveryCheckpointNow();
      }
    };
    const handlePageHide = () => {
      if (isDirtyRef.current && recoveryReadyRef.current) {
        void flushRecoveryCheckpointNow();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('freeze', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('freeze', handlePageHide);
    };
  }, [flushRecoveryCheckpointNow]);

  const handleConfirmRecoverDraft = useCallback(async () => {
    if (isRecoveringDraft) return;
    setIsRecoveringDraft(true);
    try {
      const ok = await applyRestoredRecoveryDraft();
      if (!ok) {
        await clearRecoveryDraft();
        setIsRecoveryModalOpen(false);
        setRecoveryDraftSummary(null);
        recoveryReadyRef.current = true;
        setIsRecoveryReady(true);
        showToast(
          'Could not restore the local recovery draft because it was incomplete or corrupted.',
          'error'
        );
      }
    } finally {
      setIsRecoveringDraft(false);
    }
  }, [applyRestoredRecoveryDraft, isRecoveringDraft, showToast]);

  const handleDiscardRecoveryDraft = useCallback(async () => {
    if (isRecoveringDraft) return;
    setIsRecoveringDraft(true);
    try {
      await resolveAndClearRecoveryDraft(docRef.current);
      setIsRecoveryModalOpen(false);
      setRecoveryDraftSummary(null);
      recoveryReadyRef.current = true;
      setIsRecoveryReady(true);
      showToast('Discarded local working draft');
    } finally {
      setIsRecoveringDraft(false);
    }
  }, [isRecoveringDraft, resolveAndClearRecoveryDraft, showToast]);

  /**
   * Pushes current state onto history stack before a committed mutation.
   */
  const pushHistory = useCallback(
    (currentDoc?: PageLayDocument) => {
      const snapshotSource = currentDoc ?? docRef.current;
      const snap = createSnapshot(snapshotSource);
      const nextPast = [...historyPastRef.current.slice(-39), snap];
      historyPastRef.current = nextPast;
      historyFutureRef.current = [];
      setHistoryPast(nextPast);
      setHistoryFuture([]);
      markDirty();
    },
    [markDirty]
  );

  const handleUndo = useCallback(() => {
    const past = historyPastRef.current;
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const currentSnapshot = createSnapshot(docRef.current);

    const nextPast = past.slice(0, -1);
    const nextFuture = [currentSnapshot, ...historyFutureRef.current];
    historyPastRef.current = nextPast;
    historyFutureRef.current = nextFuture;

    const nextDoc: PageLayDocument = {
      ...docRef.current,
      paperSize: previous.paperSize,
      orientation: previous.orientation,
      widthMm: previous.widthMm,
      heightMm: previous.heightMm,
      pages: previous.pages,
      updatedAt: new Date().toISOString(),
    };
    docRef.current = nextDoc;

    setHistoryPast(nextPast);
    setHistoryFuture(nextFuture);
    setDoc(nextDoc);
    setActivePageIndex((idx) => {
      const nextIdx = Math.min(idx, previous.pages.length - 1);
      const restoredPage = previous.pages[nextIdx] || previous.pages[0];
      const validIds = new Set((restoredPage?.objects ?? []).map((o) => o.id));
      setSelectedObjectId((prevId) => (prevId && validIds.has(prevId) ? prevId : null));
      setSelectedObjectIds((prevIds) => prevIds.filter((id) => validIds.has(id)));
      return nextIdx;
    });
    setSelectedGuideId(null);
    setCroppingImageId(null);
    setEditingTextId(null);
    markDirty();
  }, [markDirty]);

  const handleRedo = useCallback(() => {
    const future = historyFutureRef.current;
    if (future.length === 0) return;
    const next = future[0];
    const currentSnapshot = createSnapshot(docRef.current);

    const nextFuture = future.slice(1);
    const nextPast = [...historyPastRef.current, currentSnapshot];
    historyFutureRef.current = nextFuture;
    historyPastRef.current = nextPast;

    const nextDoc: PageLayDocument = {
      ...docRef.current,
      paperSize: next.paperSize,
      orientation: next.orientation,
      widthMm: next.widthMm,
      heightMm: next.heightMm,
      pages: next.pages,
      updatedAt: new Date().toISOString(),
    };
    docRef.current = nextDoc;

    setHistoryFuture(nextFuture);
    setHistoryPast(nextPast);
    setDoc(nextDoc);
    setActivePageIndex((idx) => {
      const nextIdx = Math.min(idx, next.pages.length - 1);
      const restoredPage = next.pages[nextIdx] || next.pages[0];
      const validIds = new Set((restoredPage?.objects ?? []).map((o) => o.id));
      setSelectedObjectId((prevId) => (prevId && validIds.has(prevId) ? prevId : null));
      setSelectedObjectIds((prevIds) => prevIds.filter((id) => validIds.has(id)));
      return nextIdx;
    });
    setSelectedGuideId(null);
    setCroppingImageId(null);
    setEditingTextId(null);
    markDirty();
  }, [markDirty]);

  const currentPage = doc.pages[activePageIndex] || doc.pages[0];
  const selectedObject =
    currentPage.objects.find((o) => o.id === selectedObjectId) || null;

  const hasDeletableObjectSelection =
    selectedObjectIds.length > 0
      ? currentPage.objects.some(
          (o) => selectedObjectIds.includes(o.id) && !o.locked
        )
      : Boolean(selectedObject && !selectedObject.locked);

  const hasDeletableGuideSelection =
    !hasDeletableObjectSelection &&
    !selectedObject &&
    selectedObjectIds.length === 0 &&
    Boolean(
      selectedGuideId &&
        !doc.lockGuides &&
        currentPage.guidelines.some((g) => g.id === selectedGuideId)
    );

  const canDeleteSelected =
    hasDeletableObjectSelection || hasDeletableGuideSelection;

  /**
   * Computes a zoom level and pan offset that fits and centers the currently selected object(s) within the viewport.
   */
  const fitSelectionToWorkspace = useCallback(() => {
    const el = workspaceRef.current;
    if (!el) return;

    const targets =
      selectedObjectIds.length > 0
        ? currentPage.objects.filter((o) => selectedObjectIds.includes(o.id))
        : selectedObject
        ? [selectedObject]
        : [];

    if (targets.length === 0) return;

    const bounds = getCombinedBoundsMm(targets);
    const viewportW = Math.max(120, el.clientWidth - RULER_THICKNESS_PX);
    const viewportH = Math.max(120, el.clientHeight - RULER_THICKNESS_PX);
    const paddingPx = el.clientWidth < 640 ? 48 : 96;

    const availW = Math.max(80, viewportW - paddingPx);
    const availH = Math.max(80, viewportH - paddingPx);

    const selPxWAt100 = Math.max(10, bounds.widthMm) * CSS_PX_PER_MM_AT_100;
    const selPxHAt100 = Math.max(10, bounds.heightMm) * CSS_PX_PER_MM_AT_100;

    const scaleX = availW / selPxWAt100;
    const scaleY = availH / selPxHAt100;
    const nextZoom = Number(
      Math.min(4.0, Math.max(0.05, Math.min(scaleX, scaleY))).toFixed(3)
    );

    const centerMmX = bounds.xMm + bounds.widthMm / 2;
    const centerMmY = bounds.yMm + bounds.heightMm / 2;

    const nextPanX = Math.round(
      viewportW / 2 - centerMmX * CSS_PX_PER_MM_AT_100 * nextZoom
    );
    const nextPanY = Math.round(
      viewportH / 2 - centerMmY * CSS_PX_PER_MM_AT_100 * nextZoom
    );

    setZoom(nextZoom);
    setPanX(nextPanX);
    setPanY(nextPanY);
  }, [selectedObjectIds, selectedObject, currentPage.objects]);

  /**
   * Adds a new object to the active page and optionally selects it.
   */
  const handleAddObject = useCallback(
    (newObj: PageObject, enterEditText = false, selectNewObject = true) => {
      pushHistory(docRef.current);
      const prev = docRef.current;
      const nextPages = prev.pages.map((p, idx) =>
        idx === activePageIndex ? { ...p, objects: [...p.objects, newObj] } : p
      );
      const nextDoc: PageLayDocument = {
        ...prev,
        pages: nextPages,
        updatedAt: new Date().toISOString(),
      };
      docRef.current = nextDoc;
      setDoc(nextDoc);
      if (selectNewObject) {
        setSelectedObjectId(newObj.id);
        setSelectedObjectIds([newObj.id]);
      }
      if (enterEditText && newObj.type === 'text') {
        setEditingTextId(newObj.id);
      }
    },
    [activePageIndex, pushHistory]
  );

  /**
   * Updates an object on the active page.
   */
  const handleUpdateObject = useCallback(
    (updatedObj: PageObject, commitHistory = true) => {
      if (commitHistory) {
        pushHistory(docRef.current);
      }
      const prev = docRef.current;
      const nextPages = prev.pages.map((p, idx) =>
        idx === activePageIndex
          ? {
              ...p,
              objects: p.objects.map((o) => (o.id === updatedObj.id ? updatedObj : o)),
            }
          : p
      );
      const nextDoc: PageLayDocument = {
        ...prev,
        pages: nextPages,
        updatedAt: new Date().toISOString(),
      };
      docRef.current = nextDoc;
      setDoc(nextDoc);
      markDirty();
    },
    [activePageIndex, pushHistory, markDirty]
  );

  /**
   * Updates multiple objects on the active page simultaneously.
   */
  const handleUpdateMultipleObjects = useCallback(
    (updatedList: PageObject[], commitHistory = true) => {
      if (commitHistory) {
        pushHistory(docRef.current);
      }
      const byId = new Map(updatedList.map((o) => [o.id, o]));
      const prev = docRef.current;
      const nextPages = prev.pages.map((p, idx) =>
        idx === activePageIndex
          ? {
              ...p,
              objects: p.objects.map((o) => byId.get(o.id) ?? o),
            }
          : p
      );
      const nextDoc: PageLayDocument = {
        ...prev,
        pages: nextPages,
        updatedAt: new Date().toISOString(),
      };
      docRef.current = nextDoc;
      setDoc(nextDoc);
      markDirty();
    },
    [activePageIndex, pushHistory, markDirty]
  );

  /**
   * Combines 2 or more selected objects on the active page into a single GroupObject entity.
   */
  const handleGroupObjects = useCallback(
    (explicitIds?: string[]) => {
      const targetIds = explicitIds && explicitIds.length >= 2 ? explicitIds : selectedObjectIds;
      const toGroup = currentPage.objects.filter((o) => targetIds.includes(o.id));
      if (toGroup.length < 2) {
        showToast('Select at least 2 objects to create a group.', 'error');
        return;
      }

      pushHistory(doc);
      const bounds = getCombinedBoundsMm(toGroup);
      const groupObj: GroupObject = {
        id: generateId('group'),
        type: 'group',
        name: `Group (${toGroup.length} items)`,
        xMm: bounds.xMm,
        yMm: bounds.yMm,
        widthMm: bounds.widthMm,
        heightMm: bounds.heightMm,
        rotationDeg: 0,
        opacity: 1,
        children: toGroup,
      };

      const targetIdSet = new Set(toGroup.map((o) => o.id));
      let insertIndex = -1;
      currentPage.objects.forEach((o, idx) => {
        if (targetIdSet.has(o.id)) {
          insertIndex = idx;
        }
      });

      const nextObjects: PageObject[] = [];
      currentPage.objects.forEach((o, idx) => {
        if (!targetIdSet.has(o.id)) {
          nextObjects.push(o);
        }
        if (idx === insertIndex) {
          nextObjects.push(groupObj);
        }
      });

      setDoc((prev) => ({
        ...prev,
        pages: prev.pages.map((p, idx) =>
          idx === activePageIndex ? { ...p, objects: nextObjects } : p
        ),
        updatedAt: new Date().toISOString(),
      }));
      setSelectedObjectId(groupObj.id);
      setSelectedObjectIds([groupObj.id]);
      setCroppingImageId(null);
      setEditingTextId(null);
      showToast(`Grouped ${toGroup.length} objects`);
    },
    [currentPage.objects, selectedObjectIds, doc, activePageIndex, pushHistory, showToast]
  );

  /**
   * Ungroups a GroupObject back into its individual constituent objects at their current canonical mm positions.
   */
  const handleUngroupObject = useCallback(
    (explicitGroupId?: string) => {
      const targetId = explicitGroupId ?? selectedObjectId;
      if (!targetId) return;
      const groupCandidate = currentPage.objects.find((o) => o.id === targetId);
      if (!groupCandidate || groupCandidate.type !== 'group') return;

      pushHistory(doc);
      const restoredChildren = groupCandidate.children.map((child) => ({
        ...child,
        opacity: Number((child.opacity * groupCandidate.opacity).toFixed(3)),
      }));

      const nextObjects: PageObject[] = [];
      currentPage.objects.forEach((o) => {
        if (o.id === groupCandidate.id) {
          nextObjects.push(...restoredChildren);
        } else {
          nextObjects.push(o);
        }
      });

      const restoredIds = restoredChildren.map((c) => c.id);
      setDoc((prev) => ({
        ...prev,
        pages: prev.pages.map((p, idx) =>
          idx === activePageIndex ? { ...p, objects: nextObjects } : p
        ),
        updatedAt: new Date().toISOString(),
      }));
      setSelectedObjectId(restoredIds[restoredIds.length - 1] ?? null);
      setSelectedObjectIds(restoredIds);
      showToast(`Ungrouped ${restoredChildren.length} objects`);
    },
    [selectedObjectId, currentPage.objects, doc, activePageIndex, pushHistory, showToast]
  );

  /**
   * Deletes an unlocked object by ID from the active page.
   */
  const handleDeleteObject = useCallback(
    (id: string) => {
      const prev = docRef.current;
      const targetPage = prev.pages[activePageIndex] || prev.pages[0];
      const targetObj = targetPage?.objects.find((o) => o.id === id);
      if (!targetObj) return;
      if (targetObj.locked) {
        showToast(
          `"${targetObj.name}" is locked. Unlock it first (Ctrl+L) to delete.`,
          'info'
        );
        return;
      }

      pushHistory(prev);
      const nextPages = prev.pages.map((p, idx) =>
        idx === activePageIndex
          ? { ...p, objects: p.objects.filter((o) => o.id !== id) }
          : p
      );
      const nextDoc: PageLayDocument = {
        ...prev,
        pages: nextPages,
        updatedAt: new Date().toISOString(),
      };
      docRef.current = nextDoc;
      setDoc(nextDoc);
      if (selectedObjectId === id) setSelectedObjectId(null);
      setSelectedObjectIds((prevIds) => prevIds.filter((item) => item !== id));
      if (croppingImageId === id) setCroppingImageId(null);
      if (editingTextId === id) setEditingTextId(null);
    },
    [
      activePageIndex,
      selectedObjectId,
      croppingImageId,
      editingTextId,
      pushHistory,
      showToast,
    ]
  );

  /**
   * Shared deletion callback for both the floating canvas Delete button and keyboard Delete/Backspace:
   * - Deletes a single selected unlocked object or multiple selected unlocked objects in one Undo operation.
   * - Respects locked objects and leaves them intact.
   * - If only a guideline is selected, deletes it when guides are unlocked.
   */
  const handleDeleteSelected = useCallback((): boolean => {
    const prev = docRef.current;
    const page = prev.pages[activePageIndex] || prev.pages[0];
    if (!page) return false;

    const selectedIdSet = new Set(
      selectedObjectIds.length > 0
        ? selectedObjectIds
        : selectedObjectId
        ? [selectedObjectId]
        : []
    );

    const selectedObjs = page.objects.filter((o) => selectedIdSet.has(o.id));
    if (selectedObjs.length > 0) {
      const unlockedToDelete = selectedObjs.filter((o) => !o.locked);
      const lockedRemaining = selectedObjs.filter((o) => o.locked);

      if (unlockedToDelete.length === 0) {
        showToast(
          selectedObjs.length === 1
            ? `"${selectedObjs[0].name}" is locked. Unlock it first (Ctrl+L) to delete.`
            : 'Selected objects are locked. Unlock them first (Ctrl+L) to delete.',
          'info'
        );
        return false;
      }

      if (unlockedToDelete.length === 1 && lockedRemaining.length === 0) {
        handleDeleteObject(unlockedToDelete[0].id);
        return true;
      }

      const deleteIdSet = new Set(unlockedToDelete.map((o) => o.id));
      pushHistory(prev);
      const nextPages = prev.pages.map((p, idx) =>
        idx === activePageIndex
          ? { ...p, objects: p.objects.filter((o) => !deleteIdSet.has(o.id)) }
          : p
      );
      const nextDoc: PageLayDocument = {
        ...prev,
        pages: nextPages,
        updatedAt: new Date().toISOString(),
      };
      docRef.current = nextDoc;
      setDoc(nextDoc);

      const remainingIds = lockedRemaining.map((o) => o.id);
      setSelectedObjectIds(remainingIds);
      setSelectedObjectId(remainingIds[remainingIds.length - 1] ?? null);
      if (croppingImageId && deleteIdSet.has(croppingImageId)) {
        setCroppingImageId(null);
      }
      if (editingTextId && deleteIdSet.has(editingTextId)) {
        setEditingTextId(null);
      }
      return true;
    }

    if (selectedGuideId && !prev.lockGuides) {
      const hasGuide = page.guidelines.some((g) => g.id === selectedGuideId);
      if (!hasGuide) return false;
      pushHistory(prev);
      const nextPages = prev.pages.map((p, idx) =>
        idx === activePageIndex
          ? {
              ...p,
              guidelines: p.guidelines.filter((g) => g.id !== selectedGuideId),
            }
          : p
      );
      const nextDoc: PageLayDocument = {
        ...prev,
        pages: nextPages,
        updatedAt: new Date().toISOString(),
      };
      docRef.current = nextDoc;
      setDoc(nextDoc);
      setSelectedGuideId(null);
      return true;
    }

    return false;
  }, [
    activePageIndex,
    selectedObjectIds,
    selectedObjectId,
    selectedGuideId,
    croppingImageId,
    editingTextId,
    handleDeleteObject,
    pushHistory,
    showToast,
  ]);

  /**
   * Dedicated bulk-selection callback used by CAD Window/Crossing marquee selection.
   * Updates selectedObjectIds/selectedObjectId together, clears stale active states,
   * and never marks the document dirty or creates an Undo entry.
   */
  const handleBulkSelectObjects = useCallback((ids: string[]) => {
    const validIdSet = new Set(
      (docRef.current.pages[activePageIndexRef.current]?.objects ?? []).map((o) => o.id)
    );
    const nextIds = Array.from(new Set(ids)).filter((id) => validIdSet.has(id));
    setSelectedGuideId(null);
    setCroppingImageId(null);
    setEditingTextId(null);
    setSelectedObjectIds(nextIds);
    setSelectedObjectId(nextIds[nextIds.length - 1] ?? null);
  }, []);

  /**
   * Duplicates an object on the active page.
   */
  const handleDuplicateObject = useCallback(
    (id: string) => {
      const target = currentPage.objects.find((o) => o.id === id);
      if (!target) return;
      const copy = cloneObject(target, Math.max(8, Math.round(doc.widthMm * 0.015)));
      handleAddObject(copy);
    },
    [currentPage.objects, doc.widthMm, handleAddObject]
  );

  /**
   * Brings object forward/front or sends backward/back.
   */
  const handleReorderObject = useCallback(
    (id: string, action: 'front' | 'forward' | 'backward' | 'back') => {
      const idx = currentPage.objects.findIndex((o) => o.id === id);
      if (idx === -1) return;
      pushHistory(doc);

      const list = [...currentPage.objects];
      const [item] = list.splice(idx, 1);
      if (action === 'front') {
        list.push(item);
      } else if (action === 'back') {
        list.unshift(item);
      } else if (action === 'forward') {
        list.splice(Math.min(list.length, idx + 1), 0, item);
      } else if (action === 'backward') {
        list.splice(Math.max(0, idx - 1), 0, item);
      }

      setDoc((prev) => ({
        ...prev,
        pages: prev.pages.map((p, pIdx) =>
          pIdx === activePageIndex ? { ...p, objects: list } : p
        ),
      }));
    },
    [currentPage.objects, activePageIndex, doc, pushHistory]
  );

  /**
   * Standard Save (`Ctrl/Cmd+S` or Save button):
   * - If `activeFileHandle` exists, overwrites the same `.lay` file in place via `createWritable()`
   *   without opening a Save As dialog or creating duplicate downloads.
   * - If the document has never been saved (or was opened without a writable handle), prompts once
   *   for a filename and location, retains the returned handle, and writes the `.lay` file.
   * - In environments where `FileSystemFileHandle` is unavailable, opens `SaveAsModal` for the
   *   download fallback.
   */
  const handleSaveDocument = useCallback(async (): Promise<SaveDocumentOutcome> => {
    if (isSavingRef.current) return 'cancelled';
    isSavingRef.current = true;
    setIsSavingInModal(true);
    try {
      if (isDirtyRef.current) {
        void flushRecoveryCheckpointNow();
      }
      const hadExistingHandle = Boolean(activeFileHandle);
      const res = await saveDocumentToExistingOrNewHandle(doc, activeFileHandle);

      if (res.status === 'cancelled') {
        return 'cancelled';
      }

      if (res.status === 'permission-denied') {
        showToast(
          `Write permission was denied for "${res.filename}". Use Save As... to choose a writable file location.`,
          'error'
        );
        return 'failed';
      }

      if (res.status === 'needs-fallback-modal') {
        setIsSaveAsModalOpen(true);
        return 'needs-fallback-modal';
      }

      if (res.status === 'saved-native') {
        const updatedDoc: PageLayDocument = {
          ...docRef.current,
          name: res.documentName,
          updatedAt: new Date().toISOString(),
        };
        docRef.current = updatedDoc;
        setActiveFileHandle(res.fileHandle);
        setDoc(updatedDoc);
        markClean(true);
        void persistCleanActiveDocumentCheckpoint(
          updatedDoc,
          activePageIndexRef.current,
          historyPastRef.current,
          historyFutureRef.current
        );
        void recordRecentAndSyncState({
          doc: updatedDoc,
          filename: res.filename,
          fileHandle: res.fileHandle,
          layBlob: res.layBlob ?? null,
          fileSizeBytes: res.layBlob?.size,
          action: 'saved',
        });
        setLastSavedAt(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
        if (hadExistingHandle) {
          showToast(`Saved changes to "${res.filename}"`);
        } else {
          showToast(`Saved "${res.filename}" (Original images preserved)`);
        }
        return 'saved-native';
      }
      return 'failed';
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Failed to save .lay file.',
        'error'
      );
      return 'failed';
    } finally {
      isSavingRef.current = false;
      setIsSavingInModal(false);
    }
  }, [
    doc,
    activeFileHandle,
    flushRecoveryCheckpointNow,
    markClean,
    persistCleanActiveDocumentCheckpoint,
    recordRecentAndSyncState,
    showToast,
  ]);

  /**
   * Save As (`Ctrl/Cmd+Shift+S` or Save As... button):
   * - Always allows the user to choose a new filename or location.
   * - Updates `activeFileHandle`, `doc.name`, and internal `.lay` manifest name only after the write completes.
   * - Preserves the previous document and file handle association if cancelled or failed.
   */
  const handleSaveAsDocument = useCallback(async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      if (isDirtyRef.current) {
        void flushRecoveryCheckpointNow();
      }
      const res = await saveDocumentAsWithNativePicker(doc, activeFileHandle);

      if (res.status === 'cancelled') {
        return;
      }

      if (res.status === 'permission-denied') {
        showToast(
          `Write permission was denied for "${res.filename}".`,
          'error'
        );
        return;
      }

      if (res.status === 'needs-fallback-modal') {
        setIsSaveAsModalOpen(true);
        return;
      }

      if (res.status === 'saved-native') {
        const updatedDoc: PageLayDocument = {
          ...docRef.current,
          name: res.documentName,
          updatedAt: new Date().toISOString(),
        };
        docRef.current = updatedDoc;
        setActiveFileHandle(res.fileHandle);
        setDoc(updatedDoc);
        markClean(true);
        void persistCleanActiveDocumentCheckpoint(
          updatedDoc,
          activePageIndexRef.current,
          historyPastRef.current,
          historyFutureRef.current
        );
        void recordRecentAndSyncState({
          doc: updatedDoc,
          filename: res.filename,
          fileHandle: res.fileHandle,
          layBlob: res.layBlob ?? null,
          fileSizeBytes: res.layBlob?.size,
          action: 'saved',
        });
        setLastSavedAt(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
        showToast(
          `Saved as "${res.filename}" — subsequent saves will update this file`
        );
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Failed to save .lay file.',
        'error'
      );
    } finally {
      isSavingRef.current = false;
    }
  }, [
    doc,
    activeFileHandle,
    flushRecoveryCheckpointNow,
    markClean,
    persistCleanActiveDocumentCheckpoint,
    recordRecentAndSyncState,
    showToast,
  ]);

  /**
   * Opens an existing `.lay` document using `showOpenFilePicker()` where supported,
   * retaining its `FileSystemFileHandle` for subsequent in-place saves.
   * Returns `true` if the caller should fall back to `<input type="file">`.
   */
  const handleTriggerOpenNativePicker = useCallback(
    async (targetRecentEntryId?: string): Promise<boolean> => {
      if (!canUseNativeOpenFilePickerSync()) {
        return true;
      }
      const openAttemptGen = ++documentSessionGenRef.current;
      try {
        const res = await openDocumentWithNativePicker();
        if (res.status === 'unsupported') {
          return true;
        }
        if (res.status === 'cancelled' || !res.doc) {
          return false;
        }
        // Guard against a newer document session having started while the native picker was open
        if (documentSessionGenRef.current !== openAttemptGen) {
          logDocumentLifecycle(
            'open-native-picker-ignored-stale-generation',
            res.doc,
            { openAttemptGen, currentGen: documentSessionGenRef.current }
          );
          return false;
        }
        const loaded = res.doc;
        hasUserReplacedOrEditedDocRef.current = true;
        docRef.current = loaded;
        activePageIndexRef.current = 0;
        setDoc(loaded);
        setActiveFileHandle(res.fileHandle ?? null);
        setActivePageIndex(0);
        setSelectedObjectId(null);
        setSelectedObjectIds([]);
        setSelectedGuideId(null);
        setCroppingImageId(null);
        setEditingTextId(null);
        setIsRecoveryModalOpen(false);
        setRecoveryDraftSummary(null);
        clearHistory();
        markClean(true);
        void persistCleanActiveDocumentCheckpoint(loaded, 0, [], []);
        void recordRecentAndSyncState({
          doc: loaded,
          filename: res.fileHandle?.name || `${loaded.name}.lay`,
          fileHandle: res.fileHandle ?? null,
          layBlob: res.layFile ?? null,
          fileSizeBytes: res.layFile?.size,
          action: 'opened',
          targetRecentEntryId,
        });
        setLastSavedAt(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
        logDocumentLifecycle('opened-lay-via-native-picker', loaded);
        setTimeout(() => {
          fitPageToWorkspace(loaded.widthMm, loaded.heightMm, 'page');
        }, 50);
        showToast(`Opened "${loaded.name}.lay"`);
        return false;
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Could not open .lay file.',
          'error'
        );
        return false;
      }
    },
    [
      clearHistory,
      fitPageToWorkspace,
      markClean,
      persistCleanActiveDocumentCheckpoint,
      recordRecentAndSyncState,
      showToast,
    ]
  );

  /**
   *Keyboard shortcuts (Undo, Redo, Save, Save As, Select All, Group, Ungroup, Lock/Unlock, Delete, Copy, Paste, Duplicate, Escape, Arrow Nudge).
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Do not intercept global editor shortcuts while a modal dialog is open
      if (
        isRecoveryModalOpen ||
        isNewModalOpen ||
        isSaveAsModalOpen ||
        isUnsavedModalOpen ||
        reopenRecentModalState.isOpen ||
        exportModalState.isOpen
      ) {
        if (e.key === 'Escape' && !isRecoveryModalOpen) {
          if (isUnsavedModalOpen && !isSavingRef.current) {
            setIsUnsavedModalOpen(false);
            setPendingReplacementAction(null);
            pendingReplacementRef.current = null;
          }
          if (isNewModalOpen) {
            setIsNewModalOpen(false);
            newModalAuthorisedRef.current = false;
          }
          if (isSaveAsModalOpen && !isSavingRef.current) {
            setIsSaveAsModalOpen(false);
            setPendingReplacementAction(null);
            pendingReplacementRef.current = null;
          }
          if (reopenRecentModalState.isOpen) {
            setReopenRecentModalState({
              isOpen: false,
              entry: null,
              reasonMessage: null,
              canOpenLocalCopy: false,
            });
          }
          setExportModalState((prev) => ({ ...prev, isOpen: false }));
        }
        return;
      }

      // When Help is open as a full-screen view on mobile/tablet (< 1024px), prevent canvas shortcuts
      if (isHelpOpen && typeof window !== 'undefined' && window.innerWidth < 1024) {
        const targetEl = e.target as HTMLElement | null;
        const isInputTarget =
          targetEl?.tagName === 'INPUT' ||
          targetEl?.tagName === 'TEXTAREA' ||
          targetEl?.tagName === 'SELECT';
        if (e.key === 'Escape' && !isInputTarget) {
          e.preventDefault();
          setIsHelpOpen(false);
        }
        return;
      }

      const keyLower = e.key.toLowerCase();
      const isSaveKey = keyLower === 's' || e.code === 'KeyS';

      // Save (Ctrl/Cmd + S) and Save As (Ctrl/Cmd + Shift + S) work even if a toolbar/sidebar input is focused
      if ((e.ctrlKey || e.metaKey) && !e.altKey && isSaveKey) {
        e.preventDefault();
        if (e.shiftKey) {
          void handleSaveAsDocument();
        } else {
          void handleSaveDocument();
        }
        return;
      }

      const isZKey = keyLower === 'z' || e.code === 'KeyZ';
      const isYKey = keyLower === 'y' || e.code === 'KeyY';

      // Allow native text-editing shortcuts when actively typing in an input, textarea, or select
      const targetEl = e.target as HTMLElement | null;
      const tag = targetEl?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        Boolean(targetEl?.isContentEditable)
      ) {
        if (e.key === 'Escape') {
          e.preventDefault();
          targetEl?.blur();
          setEditingTextId(null);
          return;
        }
        // If focus is in a numeric property input that has already been committed (no uncommitted draft),
        // allow Ctrl/Cmd+Z, Ctrl/Cmd+Y, and Ctrl/Cmd+Shift+Z to trigger document Undo/Redo directly.
        const isCleanNumericProp =
          targetEl?.getAttribute('data-numeric-property') === 'true' &&
          targetEl?.getAttribute('data-has-uncommitted-draft') === 'false';
        const isUndoRedoCombo =
          (e.ctrlKey || e.metaKey) && !e.altKey && (isZKey || isYKey);
        if (!(isCleanNumericProp && isUndoRedoCombo)) {
          return;
        }
      }

      // Undo (Ctrl/Cmd + Z) and Redo (Ctrl/Cmd + Shift + Z)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && isZKey) {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      // Redo (Ctrl/Cmd + Y)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && isYKey) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Select All objects on the active page (Ctrl/Cmd + A)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (keyLower === 'a' || e.code === 'KeyA')) {
        e.preventDefault();
        if (currentPage.objects.length === 0) return;
        const allIds = currentPage.objects.map((o) => o.id);
        setSelectedObjectIds(allIds);
        setSelectedObjectId(allIds[allIds.length - 1] ?? null);
        setSelectedGuideId(null);
        setCroppingImageId(null);
        setEditingTextId(null);
        setActiveTool('select');
        showToast(
          `Selected all ${allIds.length} object${allIds.length > 1 ? 's' : ''} on page`
        );
        return;
      }

      // Lock / Unlock selected objects (Ctrl/Cmd + L)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (keyLower === 'l' || e.code === 'KeyL')) {
        const targets =
          selectedObjectIds.length > 0
            ? currentPage.objects.filter((o) => selectedObjectIds.includes(o.id))
            : selectedObject
            ? [selectedObject]
            : [];
        if (targets.length === 0) return;
        e.preventDefault();
        const shouldLock = targets.some((o) => !o.locked);
        if (targets.length === 1) {
          handleUpdateObject({ ...targets[0], locked: shouldLock }, true);
          showToast(`${shouldLock ? 'Locked' : 'Unlocked'} "${targets[0].name}"`);
        } else {
          handleUpdateMultipleObjects(
            targets.map((o) => ({ ...o, locked: shouldLock })),
            true
          );
          showToast(
            `${shouldLock ? 'Locked' : 'Unlocked'} ${targets.length} selected objects`
          );
        }
        return;
      }

      // Group (Ctrl/Cmd + G) and Ungroup (Ctrl/Cmd + Shift + G)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (keyLower === 'g' || e.code === 'KeyG')) {
        e.preventDefault();
        if (e.shiftKey) {
          handleUngroupObject();
        } else if (selectedObjectIds.length >= 2) {
          handleGroupObjects(selectedObjectIds);
        }
        return;
      }

      // Cut (Ctrl/Cmd + X) and Paste (Ctrl/Cmd + V) are handled by the native window
      // `cut` and `paste` listeners below so editable text fields preserve native behaviour
      // and real system clipboard images always take priority over older internal copies.

      // Escape: cancel active text editing/cropping, reset tool to Select, or deselect active selection
      if (e.key === 'Escape') {
        if (editingTextId || croppingImageId) {
          setEditingTextId(null);
          setCroppingImageId(null);
          setActiveTool('select');
          return;
        }
        if (activeTool !== 'select') {
          setActiveTool('select');
          return;
        }
        if (selectedObjectId || selectedObjectIds.length > 0 || selectedGuideId) {
          setSelectedObjectId(null);
          setSelectedObjectIds([]);
          setSelectedGuideId(null);
        }
        return;
      }

      // Delete / Backspace: delete selected object(s) or selected guideline
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (
          selectedObjectIds.length > 0 ||
          selectedObject ||
          (selectedGuideId && !doc.lockGuides)
        ) {
          e.preventDefault();
          handleDeleteSelected();
        }
        return;
      }

      if (!selectedObject && selectedObjectIds.length === 0) return;

      // Copy selected object(s) (Ctrl/Cmd + C):
      // Do NOT call preventDefault() so the native browser `copy` event also fires and
      // tags the system clipboard with PageLay's copy marker (superseding any older screenshot).
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (keyLower === 'c' || e.code === 'KeyC')) {
        const targetIds =
          selectedObjectIds.length > 0
            ? new Set(selectedObjectIds)
            : selectedObject
            ? new Set([selectedObject.id])
            : new Set<string>();
        const targets = currentPage.objects.filter((o) => targetIds.has(o.id));
        if (targets.length > 0) {
          clipboardPayloadRef.current = createPageLayClipboardPayload(
            targets,
            docRef.current.assets,
            currentPage.id
          );
          lastKeydownCopyTimestampRef.current = Date.now();
          showToast(
            targets.length === 1
              ? `Copied "${targets[0].name}"`
              : `Copied ${targets.length} objects`
          );
        }
        return;
      }

      // Duplicate selected object (Ctrl/Cmd + D)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (keyLower === 'd' || e.code === 'KeyD')) {
        if (selectedObject) {
          e.preventDefault();
          handleDuplicateObject(selectedObject.id);
        }
        return;
      }

      // Arrow keys: nudge selected object(s) by 1 mm (or 10 mm with Shift)
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        const stepMm = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -stepMm : e.key === 'ArrowRight' ? stepMm : 0;
        const dy = e.key === 'ArrowUp' ? -stepMm : e.key === 'ArrowDown' ? stepMm : 0;

        if (selectedObjectIds.length > 1) {
          const targets = currentPage.objects.filter(
            (o) => selectedObjectIds.includes(o.id) && !o.locked
          );
          if (targets.length === 0) return;
          e.preventDefault();
          handleUpdateMultipleObjects(
            targets.map((o) => translatePageObjectMm(o, dx, dy)),
            true
          );
          return;
        }

        if (selectedObject && !selectedObject.locked) {
          e.preventDefault();
          handleUpdateObject(translatePageObjectMm(selectedObject, dx, dy), true);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    doc.widthMm,
    doc.lockGuides,
    activePageIndex,
    currentPage.id,
    currentPage.objects,
    selectedObject,
    selectedObjectIds,
    selectedObjectId,
    selectedGuideId,
    editingTextId,
    croppingImageId,
    activeTool,
    isRecoveryModalOpen,
    isNewModalOpen,
    isSaveAsModalOpen,
    isUnsavedModalOpen,
    reopenRecentModalState.isOpen,
    exportModalState.isOpen,
    isHelpOpen,
    pushHistory,
    handleUndo,
    handleRedo,
    handleSaveDocument,
    handleSaveAsDocument,
    handleGroupObjects,
    handleUngroupObject,
    handleDeleteObject,
    handleDeleteSelected,
    handleDuplicateObject,
    handleUpdateObject,
    handleUpdateMultipleObjects,
    showToast,
  ]);

  /**
   * Loads a `.lay` File object (from `<input type="file">`, drag-and-drop, or reselected recent file)
   * and replaces the active document only after archive parsing succeeds.
   */
  const openLayFileAndApply = useCallback(
    async (file: File, targetRecentEntryId?: string) => {
      // Claim a new document session generation immediately so any in-flight startup recovery cannot overwrite
      const openGen = ++documentSessionGenRef.current;
      hasUserReplacedOrEditedDocRef.current = true;
      logDocumentLifecycle('open-lay-file-started', docRef.current, {
        fileName: file.name,
        fileSize: file.size,
        openGen,
      });

      try {
        const loadedDoc = await loadDocumentFromLayFile(file);
        if (documentSessionGenRef.current !== openGen) {
          logDocumentLifecycle(
            'open-lay-file-ignored-stale-generation',
            loadedDoc,
            { openGen, currentGen: documentSessionGenRef.current }
          );
          return;
        }

        docRef.current = loadedDoc;
        activePageIndexRef.current = 0;
        setDoc(loadedDoc);
        // A File object from file input or drag-and-drop does not provide a writable FileSystemFileHandle
        setActiveFileHandle(null);
        setActivePageIndex(0);
        setSelectedObjectId(null);
        setSelectedObjectIds([]);
        setSelectedGuideId(null);
        setCroppingImageId(null);
        setEditingTextId(null);
        setIsRecoveryModalOpen(false);
        setRecoveryDraftSummary(null);
        clearHistory();
        markClean(true);
        // Persist the newly opened document as the active session document in IndexedDB so that if the
        // mobile browser or AI Studio preview remounts 2–3 seconds after returning from the file picker,
        // this opened document is seamlessly restored instead of reverting to a blank A0 layout.
        void persistCleanActiveDocumentCheckpoint(loadedDoc, 0, [], []);
        void recordRecentAndSyncState({
          doc: loadedDoc,
          filename: file.name || `${loadedDoc.name}.lay`,
          fileHandle: null,
          layBlob: file,
          fileSizeBytes: file.size,
          action: 'opened',
          targetRecentEntryId,
        });
        setLastSavedAt(null);
        logDocumentLifecycle('open-lay-file-applied', loadedDoc, { openGen });
        setTimeout(() => {
          fitPageToWorkspace(loadedDoc.widthMm, loadedDoc.heightMm, 'page');
        }, 50);
        showToast(
          `Opened "${loadedDoc.name}.lay" (choose a save location when saving changes)`
        );
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Failed to open .lay document.',
          'error'
        );
      }
    },
    [
      clearHistory,
      fitPageToWorkspace,
      markClean,
      persistCleanActiveDocumentCheckpoint,
      recordRecentAndSyncState,
      showToast,
    ]
  );

  /**
   * Explicitly opens the locally cached `.lay` Blob copy when the user clicks "Open Local Copy"
   * inside `ReopenRecentModal` (for example, after `NotFoundError` or `permission-denied` on a stored handle).
   */
  const handleOpenRecentCachedCopy = useCallback(
    async (entry: RecentDocumentEntry) => {
      setReopenRecentModalState({
        isOpen: false,
        entry: null,
        reasonMessage: null,
        canOpenLocalCopy: false,
      });

      const openAttemptGen = ++documentSessionGenRef.current;
      const cachedRes = await tryReopenRecentFromCachedBlob(entry);

      if (cachedRes.status === 'opened-cached') {
        if (documentSessionGenRef.current !== openAttemptGen) return;
        const loaded = cachedRes.doc;
        hasUserReplacedOrEditedDocRef.current = true;
        docRef.current = loaded;
        activePageIndexRef.current = 0;
        setDoc(loaded);
        // A cached copy is a local browser snapshot, not a live writable disk handle
        setActiveFileHandle(null);
        setActivePageIndex(0);
        setSelectedObjectId(null);
        setSelectedObjectIds([]);
        setSelectedGuideId(null);
        setCroppingImageId(null);
        setEditingTextId(null);
        setIsRecoveryModalOpen(false);
        setRecoveryDraftSummary(null);
        clearHistory();
        markClean(true);
        void persistCleanActiveDocumentCheckpoint(loaded, 0, [], []);
        void recordRecentAndSyncState({
          doc: loaded,
          filename: cachedRes.filename,
          fileHandle: null,
          layBlob: cachedRes.cachedBlob,
          fileSizeBytes: cachedRes.cachedBlob.size,
          action: 'opened',
          targetRecentEntryId: entry.id,
        });
        setLastSavedAt(null);
        logDocumentLifecycle('opened-recent-lay-via-cached-copy', loaded, {
          entryId: entry.id,
        });
        setTimeout(() => {
          fitPageToWorkspace(loaded.widthMm, loaded.heightMm, 'page');
        }, 50);
        showToast(
          `Opened local copy of "${cachedRes.filename}" — Save will ask you to choose a destination`
        );
        return;
      }

      setRecentDocuments(cachedRes.updatedEntries);
      showToast(cachedRes.message, 'error');
    },
    [
      clearHistory,
      fitPageToWorkspace,
      markClean,
      persistCleanActiveDocumentCheckpoint,
      recordRecentAndSyncState,
      showToast,
    ]
  );

  /**
   * Reopens a recent `.lay` document using the 3-tier priority:
   * 1. Stored `FileSystemFileHandle` (where available & accessible).
   * 2. Locally cached `.lay` Blob copy in IndexedDB (`pagelay_recent_files_v1`).
   * 3. Manual file reselection (`ReopenRecentModal`) only when neither is available or when
   *    `NotFoundError` / `permission-denied` occurred on a stored handle.
   * Never replaces or discards the current document if reopening fails or is cancelled.
   */
  const executeOpenRecentEntry = useCallback(
    async (entry: RecentDocumentEntry) => {
      const openAttemptGen = ++documentSessionGenRef.current;
      const reopenRes = await tryReopenRecentDocument(entry);

      if (reopenRes.status === 'opened-handle') {
        if (documentSessionGenRef.current !== openAttemptGen) {
          logDocumentLifecycle(
            'open-recent-handle-ignored-stale-generation',
            reopenRes.doc,
            { openAttemptGen, currentGen: documentSessionGenRef.current }
          );
          return;
        }
        const loaded = reopenRes.doc;
        hasUserReplacedOrEditedDocRef.current = true;
        docRef.current = loaded;
        activePageIndexRef.current = 0;
        setDoc(loaded);
        setActiveFileHandle(reopenRes.fileHandle);
        setActivePageIndex(0);
        setSelectedObjectId(null);
        setSelectedObjectIds([]);
        setSelectedGuideId(null);
        setCroppingImageId(null);
        setEditingTextId(null);
        setIsRecoveryModalOpen(false);
        setRecoveryDraftSummary(null);
        clearHistory();
        markClean(true);
        void persistCleanActiveDocumentCheckpoint(loaded, 0, [], []);
        void recordRecentAndSyncState({
          doc: loaded,
          filename: reopenRes.filename,
          fileHandle: reopenRes.fileHandle,
          layBlob: reopenRes.layBlob,
          fileSizeBytes: reopenRes.layBlob.size,
          action: 'opened',
          targetRecentEntryId: entry.id,
        });
        setLastSavedAt(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
        logDocumentLifecycle('opened-recent-lay-via-stored-handle', loaded, {
          entryId: entry.id,
        });
        setTimeout(() => {
          fitPageToWorkspace(loaded.widthMm, loaded.heightMm, 'page');
        }, 50);
        showToast(`Opened "${reopenRes.filename}"`);
        return;
      }

      if (reopenRes.status === 'opened-cached') {
        if (documentSessionGenRef.current !== openAttemptGen) {
          logDocumentLifecycle(
            'open-recent-cached-ignored-stale-generation',
            reopenRes.doc,
            { openAttemptGen, currentGen: documentSessionGenRef.current }
          );
          return;
        }
        const loaded = reopenRes.doc;
        hasUserReplacedOrEditedDocRef.current = true;
        docRef.current = loaded;
        activePageIndexRef.current = 0;
        setDoc(loaded);
        // A cached copy is a local snapshot; never silently overwrite another file on Save
        setActiveFileHandle(null);
        setActivePageIndex(0);
        setSelectedObjectId(null);
        setSelectedObjectIds([]);
        setSelectedGuideId(null);
        setCroppingImageId(null);
        setEditingTextId(null);
        setIsRecoveryModalOpen(false);
        setRecoveryDraftSummary(null);
        clearHistory();
        markClean(true);
        void persistCleanActiveDocumentCheckpoint(loaded, 0, [], []);
        void recordRecentAndSyncState({
          doc: loaded,
          filename: reopenRes.filename,
          fileHandle: null,
          layBlob: reopenRes.cachedBlob,
          fileSizeBytes: reopenRes.cachedBlob.size,
          action: 'opened',
          targetRecentEntryId: entry.id,
        });
        setLastSavedAt(null);
        logDocumentLifecycle('opened-recent-lay-via-cached-copy', loaded, {
          entryId: entry.id,
        });
        setTimeout(() => {
          fitPageToWorkspace(loaded.widthMm, loaded.heightMm, 'page');
        }, 50);
        showToast(
          `Opened local copy of "${reopenRes.filename}" — Save will ask you to choose a destination`
        );
        return;
      }

      if (reopenRes.status === 'not-found-removed') {
        setRecentDocuments(reopenRes.updatedEntries);
        showToast(reopenRes.message, 'error');
        return;
      }

      if (reopenRes.status === 'not-found-has-cache') {
        setRecentDocuments(reopenRes.updatedEntries);
        setReopenRecentModalState({
          isOpen: true,
          entry: reopenRes.updatedEntry,
          reasonMessage: reopenRes.message,
          canOpenLocalCopy: true,
        });
        return;
      }

      if (reopenRes.status === 'corrupt-file') {
        showToast(reopenRes.message, 'error');
        return;
      }

      // Neither a usable handle nor a cached copy is available (or handle permission was denied):
      if (reopenRes.updatedEntries) {
        setRecentDocuments(reopenRes.updatedEntries);
      }
      setReopenRecentModalState({
        isOpen: true,
        entry,
        reasonMessage: reopenRes.message,
        canOpenLocalCopy: reopenRes.hasCachedCopy,
      });
    },
    [
      clearHistory,
      fitPageToWorkspace,
      markClean,
      persistCleanActiveDocumentCheckpoint,
      recordRecentAndSyncState,
      showToast,
    ]
  );

  /**
   * Immediately loads the rich A0 Exhibition Stand Layout sample document.
   * Note: Does NOT add Sample A0 to Recent Documents until the user explicitly saves it as a `.lay` file.
   */
  const loadSampleDocumentImmediate = useCallback(async () => {
    const sampleGen = ++documentSessionGenRef.current;
    hasUserReplacedOrEditedDocRef.current = true;
    try {
      const sampleDoc = await createSampleExhibitionDocument();
      if (documentSessionGenRef.current !== sampleGen) return;

      docRef.current = sampleDoc;
      activePageIndexRef.current = 0;
      setDoc(sampleDoc);
      setActiveFileHandle(null);
      setActivePageIndex(0);
      setSelectedObjectId(null);
      setSelectedObjectIds([]);
      setSelectedGuideId(null);
      setCroppingImageId(null);
      setEditingTextId(null);
      setIsRecoveryModalOpen(false);
      setRecoveryDraftSummary(null);
      clearHistory();
      markClean(true);
      void persistCleanActiveDocumentCheckpoint(sampleDoc, 0, [], []);
      setLastSavedAt(null);
      logDocumentLifecycle('sample-document-loaded', sampleDoc, { sampleGen });
      setTimeout(() => {
        fitPageToWorkspace(sampleDoc.widthMm, sampleDoc.heightMm, 'page');
      }, 50);
      showToast('Loaded Sample A0 Exhibition Stand Layout (1189 × 841 mm)');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Failed to create sample document.',
        'error'
      );
    }
  }, [
    clearHistory,
    fitPageToWorkspace,
    markClean,
    persistCleanActiveDocumentCheckpoint,
    showToast,
  ]);

  /**
   * Executes a document-replacing action after unsaved changes have been saved or explicitly discarded.
   */
  const executeReplacementAction = useCallback(
    async (action: PendingReplacementAction) => {
      switch (action.type) {
        case 'open-new-modal': {
          newModalAuthorisedRef.current = true;
          setIsNewModalOpen(true);
          return;
        }
        case 'create-blank': {
          newModalAuthorisedRef.current = false;
          setIsNewModalOpen(false);
          ++documentSessionGenRef.current;
          hasUserReplacedOrEditedDocRef.current = true;
          const fresh = createNewDocument(
            action.name,
            action.paperSize,
            action.orientation,
            action.widthMm,
            action.heightMm
          );
          fresh.widthMm = action.widthMm;
          fresh.heightMm = action.heightMm;
          docRef.current = fresh;
          activePageIndexRef.current = 0;
          setDoc(fresh);
          setActiveFileHandle(null);
          setActivePageIndex(0);
          setSelectedObjectId(null);
          setSelectedObjectIds([]);
          setSelectedGuideId(null);
          setCroppingImageId(null);
          setEditingTextId(null);
          setIsRecoveryModalOpen(false);
          setRecoveryDraftSummary(null);
          clearHistory();
          markClean(true);
          void persistCleanActiveDocumentCheckpoint(fresh, 0, [], []);
          setLastSavedAt(null);
          logDocumentLifecycle('created-blank-document', fresh);
          setTimeout(() => {
            fitPageToWorkspace(action.widthMm, action.heightMm, 'page');
          }, 50);
          showToast(
            `Created ${action.paperSize} ${action.orientation} (${action.widthMm} × ${action.heightMm} mm)`
          );
          return;
        }
        case 'open-picker': {
          newModalAuthorisedRef.current = false;
          pendingReopenRecentEntryIdRef.current = undefined;
          // Synchronously check if native picker is usable in this frame before awaiting any promise
          // so `<input type="file">` is triggered directly inside the user's tap gesture on mobile.
          if (!canUseNativeOpenFilePickerSync()) {
            hiddenLayInputRef.current?.click();
            return;
          }
          const useFallbackInput = await handleTriggerOpenNativePicker();
          if (useFallbackInput) {
            hiddenLayInputRef.current?.click();
          }
          return;
        }
        case 'open-file': {
          newModalAuthorisedRef.current = false;
          await openLayFileAndApply(action.file);
          return;
        }
        case 'open-recent': {
          newModalAuthorisedRef.current = false;
          await executeOpenRecentEntry(action.entry);
          return;
        }
        case 'load-sample': {
          newModalAuthorisedRef.current = false;
          setIsNewModalOpen(false);
          await loadSampleDocumentImmediate();
          return;
        }
      }
    },
    [
      clearHistory,
      executeOpenRecentEntry,
      fitPageToWorkspace,
      handleTriggerOpenNativePicker,
      loadSampleDocumentImmediate,
      markClean,
      openLayFileAndApply,
      persistCleanActiveDocumentCheckpoint,
      showToast,
    ]
  );

  /**
   * Centralised guard for all actions that can replace the active document:
   * - New Document
   * - Open `.lay` Document (native picker, file input, or canvas drag-and-drop)
   * - Load Sample A0 (toolbar, empty-page bar, or inside New Document modal)
   */
  const requestDocumentReplacement = useCallback(
    (action: PendingReplacementAction) => {
      const currentlyDirty = isDirtyRef.current || isDirty;
      const alreadyAuthorisedFromNewModal =
        (action.type === 'create-blank' || action.type === 'load-sample') &&
        isNewModalOpen &&
        newModalAuthorisedRef.current;

      if (!currentlyDirty || alreadyAuthorisedFromNewModal) {
        void executeReplacementAction(action);
        return;
      }

      void flushRecoveryCheckpointNow();
      pendingReplacementRef.current = action;
      setPendingReplacementAction(action);
      setIsUnsavedModalOpen(true);
    },
    [
      isDirty,
      isNewModalOpen,
      executeReplacementAction,
      flushRecoveryCheckpointNow,
    ]
  );

  const handleLoadSampleDocument = useCallback(() => {
    requestDocumentReplacement({ type: 'load-sample' });
  }, [requestDocumentReplacement]);

  /**
   * Handles importing pages from a `.lay` file dropped onto (or selected from) the Pages sidebar:
   * - Appends all pages from the `.lay` file to the current document without replacing existing pages.
   * - Validates that physical paper dimensions (`widthMm` × `heightMm`) match the current document.
   * - Imports all referenced original image assets (`Uint8Array`) and resolves ID collisions safely.
   * - Records the entire multi-page import as a single undoable operation.
   */
  const handleImportPagesFromSidebar = useCallback(
    async (files: File[]) => {
      if (!files || files.length === 0) return;

      const layFile = files.find((f) => f.name.toLowerCase().endsWith('.lay'));
      if (!layFile) {
        showToast(
          'Only PageLay (.lay) files can be dropped onto the Pages panel to import pages.',
          'error'
        );
        return;
      }

      let sourceDoc: PageLayDocument;
      try {
        sourceDoc = await loadDocumentFromLayFile(layFile);
      } catch (err) {
        showToast(
          err instanceof Error
            ? err.message
            : 'Failed to read .lay document for page import.',
          'error'
        );
        return;
      }

      const currentDoc = docRef.current;
      const widthMismatch = Math.abs(sourceDoc.widthMm - currentDoc.widthMm) > 0.01;
      const heightMismatch = Math.abs(sourceDoc.heightMm - currentDoc.heightMm) > 0.01;

      if (widthMismatch || heightMismatch) {
        // Clean up temporary object URLs created while parsing the incompatible source document
        for (const asset of Object.values(sourceDoc.assets)) {
          try {
            URL.revokeObjectURL(asset.objectUrl);
          } catch {
            // Ignore URL revocation errors
          }
        }
        showToast(
          `Cannot import pages: "${sourceDoc.name}.lay" uses ${sourceDoc.paperSize} (${sourceDoc.widthMm} × ${sourceDoc.heightMm} mm), which does not match the current document (${currentDoc.paperSize}, ${currentDoc.widthMm} × ${currentDoc.heightMm} mm).`,
          'error'
        );
        return;
      }

      if (!sourceDoc.pages || sourceDoc.pages.length === 0) {
        showToast('The selected .lay document contains no pages to import.', 'error');
        return;
      }

      const { importedPages, mergedAssets } = prepareImportedPagesFromDocument(
        sourceDoc,
        currentDoc
      );

      // Single undoable operation for the entire page import
      pushHistory(currentDoc);

      const firstImportedPageIndex = currentDoc.pages.length;
      const nextDoc: PageLayDocument = {
        ...currentDoc,
        assets: mergedAssets,
        pages: [...currentDoc.pages, ...importedPages],
        updatedAt: new Date().toISOString(),
      };
      docRef.current = nextDoc;
      setDoc(nextDoc);
      setActivePageIndex(firstImportedPageIndex);
      setSelectedObjectId(null);
      setSelectedObjectIds([]);
      setSelectedGuideId(null);
      setCroppingImageId(null);
      setEditingTextId(null);
      markDirty();

      showToast(
        `Imported ${importedPages.length} page${
          importedPages.length > 1 ? 's' : ''
        } from "${sourceDoc.name}.lay"`
      );
    },
    [pushHistory, markDirty, showToast]
  );

  const getVisiblePageCenterMm = useCallback((): { x: number; y: number } => {
    const currentDoc = docRef.current;
    const el = workspaceRef.current;
    const { zoom: curZoom, panX: curPanX, panY: curPanY } =
      viewportViewRef.current;
    if (el && curZoom > 0) {
      const viewportW = Math.max(120, el.clientWidth - RULER_THICKNESS_PX);
      const viewportH = Math.max(120, el.clientHeight - RULER_THICKNESS_PX);
      const viewLeftMm = (0 - curPanX) / (CSS_PX_PER_MM_AT_100 * curZoom);
      const viewRightMm =
        (viewportW - curPanX) / (CSS_PX_PER_MM_AT_100 * curZoom);
      const viewTopMm = (0 - curPanY) / (CSS_PX_PER_MM_AT_100 * curZoom);
      const viewBottomMm =
        (viewportH - curPanY) / (CSS_PX_PER_MM_AT_100 * curZoom);
      const visLeft = Math.max(0, viewLeftMm);
      const visRight = Math.min(currentDoc.widthMm, viewRightMm);
      const visTop = Math.max(0, viewTopMm);
      const visBottom = Math.min(currentDoc.heightMm, viewBottomMm);
      if (visRight > visLeft + 1 && visBottom > visTop + 1) {
        return {
          x: (visLeft + visRight) / 2,
          y: (visTop + visBottom) / 2,
        };
      }
    }
    return {
      x: currentDoc.widthMm / 2,
      y: currentDoc.heightMm / 2,
    };
  }, []);

  /**
   * Handles importing one or more image files (from file picker, canvas drag-and-drop, or clipboard paste)
   * while preserving 100% original bytes and pixel dimensions.
   * Dropped `.lay` files on the canvas pass through the centralised unsaved-changes guard before replacing the document.
   */
  const handleFilesImported = useCallback(
    async (
      files: File[] | FileList,
      dropMm?: { x: number; y: number },
      options?: { source?: 'drop' | 'picker' | 'clipboard' }
    ) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      const layFile = fileArray.find((f) => f.name.toLowerCase().endsWith('.lay'));
      if (layFile) {
        requestDocumentReplacement({ type: 'open-file', file: layFile });
        return;
      }

      const initialDoc = docRef.current;
      const importedAssets: Record<string, (typeof initialDoc.assets)[string]> = {};
      const newImageObjects: ImageObject[] = [];

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        try {
          const asset = await importImageFileToAsset(file);
          importedAssets[asset.id] = asset;

          const aspect = asset.widthPx / Math.max(1, asset.heightPx);
          let placedW = formatMm(initialDoc.widthMm * 0.38, 1);
          let placedH = formatMm(placedW / aspect, 1);
          if (placedH > initialDoc.heightMm * 0.65) {
            placedH = formatMm(initialDoc.heightMm * 0.65, 1);
            placedW = formatMm(placedH * aspect, 1);
          }

          const baseX = dropMm
            ? Math.max(
                0,
                Math.min(initialDoc.widthMm - placedW, dropMm.x - placedW / 2)
              )
            : (initialDoc.widthMm - placedW) / 2;
          const baseY = dropMm
            ? Math.max(
                0,
                Math.min(initialDoc.heightMm - placedH, dropMm.y - placedH / 2)
              )
            : (initialDoc.heightMm - placedH) / 2;

          const offsetMm = i * 20;
          const imgObj: ImageObject = {
            id: generateId('image'),
            type: 'image',
            name: file.name.replace(/\.[^.]+$/, '') || 'Pasted Image',
            assetId: asset.id,
            xMm: formatMm(baseX + offsetMm, 1),
            yMm: formatMm(baseY + offsetMm, 1),
            widthMm: placedW,
            heightMm: placedH,
            rotationDeg: 0,
            opacity: 1,
            preserveAspectRatio: true,
            crop: { x: 0, y: 0, width: 1, height: 1 },
            strokeColor: 'transparent',
            strokeWidthMm: 0,
          };
          newImageObjects.push(imgObj);
        } catch (err) {
          showToast(
            err instanceof Error ? err.message : `Could not import "${file.name}"`,
            'error'
          );
        }
      }

      if (newImageObjects.length > 0) {
        const currentDoc = docRef.current;
        const targetIdx = activePageIndexRef.current;
        pushHistory(currentDoc);
        const nextDoc: PageLayDocument = {
          ...currentDoc,
          assets: { ...currentDoc.assets, ...importedAssets },
          pages: currentDoc.pages.map((p, idx) =>
            idx === targetIdx
              ? { ...p, objects: [...p.objects, ...newImageObjects] }
              : p
          ),
          updatedAt: new Date().toISOString(),
        };
        docRef.current = nextDoc;
        setDoc(nextDoc);
        const newIds = newImageObjects.map((o) => o.id);
        setSelectedObjectIds(newIds);
        setSelectedObjectId(newIds[newIds.length - 1]);
        setSelectedGuideId(null);
        setCroppingImageId(null);
        setEditingTextId(null);
        setActiveTool('select');
        markDirty();
        if (options?.source === 'clipboard') {
          showToast(
            newImageObjects.length === 1
              ? `Pasted "${newImageObjects[0].name}" (${importedAssets[newImageObjects[0].assetId].widthPx} × ${importedAssets[newImageObjects[0].assetId].heightPx} px)`
              : `Pasted ${newImageObjects.length} images (Original resolution preserved)`
          );
        } else {
          showToast(
            `Imported ${newImageObjects.length} image${
              newImageObjects.length > 1 ? 's' : ''
            } (Original resolution preserved)`
          );
        }
      }
    },
    [pushHistory, markDirty, requestDocumentReplacement, showToast]
  );

  // Native clipboard Copy / Cut / Paste listeners:
  // - System clipboard images (Snipping Tool, screenshots, Word, PowerPoint, browsers) take priority over internal copies.
  // - Supports single & multi-object/group internal PageLay copy/cut/paste with preserved assets across pages and documents.
  // - Never intercepts normal copy/cut/paste when typing inside inputs, text boxes, Help search, or modal fields.
  useEffect(() => {
    const isModalBlockingClipboard = () =>
      isRecoveryModalOpen ||
      isNewModalOpen ||
      isSaveAsModalOpen ||
      isUnsavedModalOpen ||
      reopenRecentModalState.isOpen ||
      exportModalState.isOpen ||
      (isHelpOpen && typeof window !== 'undefined' && window.innerWidth < 1024);

    const isEditableElement = (el: HTMLElement | null): boolean => {
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        Boolean(el.isContentEditable)
      );
    };

    const hasUserDomTextSelection = (): boolean => {
      const sel = window.getSelection?.();
      return Boolean(sel && !sel.isCollapsed && sel.toString().length > 0);
    };

    const writePageLayPayloadToClipboardEvent = (
      e: ClipboardEvent,
      payload: PageLayClipboardPayload
    ): boolean => {
      if (!e.clipboardData) {
        payload.wroteToSystemClipboard = false;
        return false;
      }
      try {
        e.preventDefault();
        e.clipboardData.setData('application/x-pagelay-clip', payload.clipId);
        e.clipboardData.setData(
          'text/html',
          `<span data-pagelay-clip="${payload.clipId}"></span>`
        );
        e.clipboardData.setData('text/plain', payload.plainTextSummary);
        payload.wroteToSystemClipboard = true;
        return true;
      } catch {
        payload.wroteToSystemClipboard = false;
        return false;
      }
    };

    const onCopy = (e: ClipboardEvent) => {
      if (isModalBlockingClipboard()) return;
      const targetEl = e.target as HTMLElement | null;
      const activeEl = document.activeElement as HTMLElement | null;
      if (isEditableElement(targetEl) || isEditableElement(activeEl)) return;
      if (hasUserDomTextSelection()) return;

      const curDoc = docRef.current;
      const curPage = curDoc.pages[activePageIndexRef.current] || curDoc.pages[0];
      if (!curPage) return;

      const idSet = new Set(
        selectedObjectIds.length > 0
          ? selectedObjectIds
          : selectedObjectId
          ? [selectedObjectId]
          : []
      );
      if (idSet.size === 0) return;

      const targets = curPage.objects.filter((o) => idSet.has(o.id));
      if (targets.length === 0) return;

      const justCopiedViaKeydown =
        Date.now() - lastKeydownCopyTimestampRef.current < 250 &&
        clipboardPayloadRef.current !== null;

      const payload =
        justCopiedViaKeydown && clipboardPayloadRef.current
          ? clipboardPayloadRef.current
          : createPageLayClipboardPayload(targets, curDoc.assets, curPage.id);

      clipboardPayloadRef.current = payload;
      writePageLayPayloadToClipboardEvent(e, payload);

      if (!justCopiedViaKeydown) {
        showToast(
          targets.length === 1
            ? `Copied "${targets[0].name}"`
            : `Copied ${targets.length} objects`
        );
      }
    };

    const onCut = (e: ClipboardEvent) => {
      if (isModalBlockingClipboard()) return;
      const targetEl = e.target as HTMLElement | null;
      const activeEl = document.activeElement as HTMLElement | null;
      if (isEditableElement(targetEl) || isEditableElement(activeEl)) return;
      if (editingTextId) return;
      if (hasUserDomTextSelection()) return;

      const curDoc = docRef.current;
      const targetIdx = curDoc.pages[activePageIndexRef.current]
        ? activePageIndexRef.current
        : 0;
      const curPage = curDoc.pages[targetIdx];
      if (!curPage) return;

      const idSet = new Set(
        selectedObjectIds.length > 0
          ? selectedObjectIds
          : selectedObjectId
          ? [selectedObjectId]
          : []
      );
      if (idSet.size === 0) return;

      const targets = curPage.objects.filter((o) => idSet.has(o.id));
      if (targets.length === 0) return;

      if (targets.some((o) => o.locked)) {
        e.preventDefault();
        showToast(
          targets.length === 1
            ? `"${targets[0].name}" is locked. Unlock it first (Ctrl+L) to cut.`
            : 'Selection includes locked objects. Unlock them first (Ctrl+L) to cut.',
          'info'
        );
        return;
      }

      let payload: PageLayClipboardPayload;
      try {
        payload = createPageLayClipboardPayload(
          targets,
          curDoc.assets,
          curPage.id
        );
        if (!writePageLayPayloadToClipboardEvent(e, payload)) {
          showToast(
            'Could not write cut selection to the clipboard. Nothing was removed.',
            'info'
          );
          return;
        }
      } catch {
        showToast(
          'Could not write cut selection to the clipboard. Nothing was removed.',
          'info'
        );
        return;
      }

      clipboardPayloadRef.current = payload;

      const cutIdSet = new Set(targets.map((o) => o.id));
      pushHistory(curDoc);
      const nextDoc: PageLayDocument = {
        ...curDoc,
        pages: curDoc.pages.map((p, idx) =>
          idx === targetIdx
            ? { ...p, objects: p.objects.filter((o) => !cutIdSet.has(o.id)) }
            : p
        ),
        updatedAt: new Date().toISOString(),
      };
      docRef.current = nextDoc;
      setDoc(nextDoc);

      setSelectedObjectIds([]);
      setSelectedObjectId(null);
      setSelectedGuideId(null);
      setCroppingImageId((prev) => (prev && cutIdSet.has(prev) ? null : prev));
      setEditingTextId((prev) => (prev && cutIdSet.has(prev) ? null : prev));
      markDirty();

      showToast(
        targets.length === 1
          ? `Cut "${targets[0].name}"`
          : `Cut ${targets.length} objects`
      );
    };

    const onPaste = (e: ClipboardEvent) => {
      if (isModalBlockingClipboard()) return;
      const targetEl = e.target as HTMLElement | null;
      const activeEl = document.activeElement as HTMLElement | null;
      if (isEditableElement(targetEl) || isEditableElement(activeEl)) return;

      e.preventDefault();
      const clipboardData = e.clipboardData;

      void (async () => {
        const inspection = await inspectSystemClipboardForPaste(
          clipboardData,
          clipboardPayloadRef.current
        );

        if (inspection.kind === 'images') {
          const centerMm = getVisiblePageCenterMm();
          await handleFilesImported(inspection.files, centerMm, {
            source: 'clipboard',
          });
          return;
        }

        if (inspection.kind === 'pagelay-internal') {
          const payload = clipboardPayloadRef.current;
          if (!payload || payload.objects.length === 0) return;

          const currentDoc = docRef.current;
          const targetIdx = activePageIndexRef.current;
          const { pastedObjects, mergedAssets, nextPasteCount } =
            prepareInternalPasteFromPayload(payload, currentDoc);

          clipboardPayloadRef.current = {
            ...payload,
            pasteCount: nextPasteCount,
          };

          pushHistory(currentDoc);
          const nextDoc: PageLayDocument = {
            ...currentDoc,
            assets: mergedAssets,
            pages: currentDoc.pages.map((p, idx) =>
              idx === targetIdx
                ? { ...p, objects: [...p.objects, ...pastedObjects] }
                : p
            ),
            updatedAt: new Date().toISOString(),
          };
          docRef.current = nextDoc;
          setDoc(nextDoc);

          const pastedIds = pastedObjects.map((o) => o.id);
          setSelectedObjectIds(pastedIds);
          setSelectedObjectId(pastedIds[pastedIds.length - 1] ?? null);
          setSelectedGuideId(null);
          setCroppingImageId(null);
          setEditingTextId(null);
          setActiveTool('select');
          markDirty();
          showToast(
            pastedObjects.length === 1
              ? `Pasted "${pastedObjects[0].name}"`
              : `Pasted ${pastedObjects.length} objects`
          );
          return;
        }

        if (inspection.kind === 'unsupported') {
          showToast(inspection.reason, 'info');
        }
      })();
    };

    window.addEventListener('copy', onCopy);
    window.addEventListener('cut', onCut);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('cut', onCut);
      window.removeEventListener('paste', onPaste);
    };
  }, [
    selectedObjectId,
    selectedObjectIds,
    editingTextId,
    isRecoveryModalOpen,
    isNewModalOpen,
    isSaveAsModalOpen,
    isUnsavedModalOpen,
    reopenRecentModalState.isOpen,
    exportModalState.isOpen,
    isHelpOpen,
    getVisiblePageCenterMm,
    handleFilesImported,
    pushHistory,
    markDirty,
    showToast,
  ]);

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
      className="relative w-full h-dvh flex flex-col bg-slate-100 text-slate-900 overflow-hidden overscroll-none select-none"
    >
      {/* Hidden Image File Picker for Empty-State Trigger */}
      <input
        ref={hiddenImageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          if (picked.length > 0) {
            void handleFilesImported(picked);
          }
          e.target.value = '';
        }}
      />
      {/* Hidden .lay File Picker for Fallback Open & Reselected Recent Open */}
      <input
        ref={hiddenLayInputRef}
        type="file"
        accept=".lay,application/zip,application/octet-stream"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const targetRecentId = pendingReopenRecentEntryIdRef.current;
          pendingReopenRecentEntryIdRef.current = undefined;
          if (file) {
            void openLayFileAndApply(file, targetRecentId);
          }
          e.target.value = '';
        }}
      />

      {/* TOP BAR */}
      <TopToolbar
        documentName={doc.name}
        onChangeDocumentName={(name) => {
          setDoc((prev) => ({ ...prev, name }));
          markDirty();
        }}
        activeTool={activeTool}
        onSelectTool={(t) => {
          setActiveTool(t);
          setCroppingImageId(null);
          setEditingTextId(null);
          if (t === 'pen' || t === 'freehand-highlighter' || t === 'eraser') {
            setSelectedObjectId(null);
            setSelectedObjectIds([]);
            setSelectedGuideId(null);
          }
        }}
        activeHighlightColor={activeHighlightColor}
        onSelectHighlightColor={setActiveHighlightColor}
        penColor={penColor}
        penWidthMm={penWidthMm}
        onChangePenColor={setPenColor}
        onChangePenWidthMm={setPenWidthMm}
        freehandHighlighterColor={freehandHighlighterColor}
        freehandHighlighterWidthMm={freehandHighlighterWidthMm}
        onChangeFreehandHighlighterColor={setFreehandHighlighterColor}
        onChangeFreehandHighlighterWidthMm={setFreehandHighlighterWidthMm}
        canUndo={historyPast.length > 0}
        canRedo={historyFuture.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onNewDocument={() => requestDocumentReplacement({ type: 'open-new-modal' })}
        onRequestOpenDocument={() => requestDocumentReplacement({ type: 'open-picker' })}
        onTriggerOpenNativePicker={() => handleTriggerOpenNativePicker()}
        onOpenLayFile={(file) => {
          requestDocumentReplacement({ type: 'open-file', file });
        }}
        recentDocuments={recentDocuments}
        onSelectRecentDocument={(entry) => {
          requestDocumentReplacement({ type: 'open-recent', entry });
        }}
        onRemoveRecentDocument={(entryId) => {
          void handleRemoveRecentDocument(entryId);
        }}
        onClearRecentDocuments={() => {
          void handleClearRecentDocuments();
        }}
        onSaveLayFile={() => {
          void handleSaveDocument();
        }}
        onSaveAsLayFile={() => {
          void handleSaveAsDocument();
        }}
        onLoadSampleDocument={handleLoadSampleDocument}
        onUploadImages={handleFilesImported}
        showGuides={doc.showGuides}
        lockGuides={doc.lockGuides}
        snapToGuides={doc.snapToGuides}
        snapToPageEdges={doc.snapToPageEdges}
        snapToObjects={doc.snapToObjects}
        angleSnapIncrementDeg={doc.angleSnapIncrementDeg ?? 15}
        precisionMode={Boolean(doc.precisionMode)}
        onToggleShowGuides={() => {
          setDoc((prev) => ({ ...prev, showGuides: !prev.showGuides }));
          markDirty();
        }}
        onToggleLockGuides={() => {
          setDoc((prev) => ({ ...prev, lockGuides: !prev.lockGuides }));
          markDirty();
        }}
        onToggleSnapToGuides={() => {
          setDoc((prev) => ({ ...prev, snapToGuides: !prev.snapToGuides }));
          markDirty();
        }}
        onToggleSnapToPageEdges={() => {
          setDoc((prev) => ({ ...prev, snapToPageEdges: !prev.snapToPageEdges }));
          markDirty();
        }}
        onToggleSnapToObjects={() => {
          setDoc((prev) => ({ ...prev, snapToObjects: !prev.snapToObjects }));
          markDirty();
        }}
        onChangeAngleSnapIncrement={(deg) => {
          const clamped = Math.max(1, Math.min(45, Math.round(deg || 15)));
          setDoc((prev) => ({ ...prev, angleSnapIncrementDeg: clamped }));
          markDirty();
        }}
        onTogglePrecisionMode={() => {
          setDoc((prev) => ({ ...prev, precisionMode: !prev.precisionMode }));
          markDirty();
        }}
        onClearGuides={() => {
          pushHistory(doc);
          setSelectedGuideId(null);
          setDoc((prev) => ({
            ...prev,
            pages: prev.pages.map((p, idx) =>
              idx === activePageIndex ? { ...p, guidelines: [] } : p
            ),
          }));
        }}
        onOpenExportModal={(tab) => setExportModalState({ isOpen: true, tab })}
        isPagesOpen={isPagesOpen}
        isPropertiesOpen={isPropertiesOpen}
        isHelpOpen={isHelpOpen}
        onTogglePages={() => {
          setIsPagesOpen((prev) => {
            const next = !prev;
            if (next && window.innerWidth < 1024) {
              setIsPropertiesOpen(false);
              setIsHelpOpen(false);
            }
            return next;
          });
        }}
        onToggleProperties={() => {
          setIsPropertiesOpen((prev) => {
            const next = !prev;
            if (next) {
              setIsHelpOpen(false);
              if (window.innerWidth < 1024) setIsPagesOpen(false);
            }
            return next;
          });
        }}
        onToggleHelp={() => {
          setIsHelpOpen((prev) => {
            const next = !prev;
            if (next) {
              setIsPropertiesOpen(false);
              if (window.innerWidth < 1024) setIsPagesOpen(false);
            }
            return next;
          });
        }}
        hasSelectedObject={Boolean(selectedObject)}
      />

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          className={`fixed bottom-11 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg text-xs font-medium border transition-all max-w-[90vw] truncate ${
            toastMessage.type === 'error'
              ? 'bg-rose-950 text-white border-rose-800'
              : 'bg-slate-900 text-white border-slate-700'
          }`}
        >
          {toastMessage.text}
        </div>
      )}

      {/* MAIN WORKSPACE CONTAINER */}
      <div className="relative flex-1 flex min-h-0 min-w-0 w-full overflow-hidden overscroll-none">
        {/* Mobile Backdrop when a drawer is open on <1024px */}
        {(isPagesOpen || isPropertiesOpen) && (
          <div
            className="lg:hidden absolute inset-0 bg-slate-900/35 z-30"
            onClick={() => {
              setIsPagesOpen(false);
              setIsPropertiesOpen(false);
            }}
          />
        )}

        {/* LEFT SIDEBAR — PAGES (Docked on lg+, slide-over drawer on mobile/tablet) */}
        {isPagesOpen && (
          <div
            data-sidebar="true"
            className="flex max-w-[85vw] shrink-0 touch-pan-y max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:shadow-2xl lg:relative"
          >
            <button
              type="button"
              onClick={() => setIsPagesOpen(false)}
              className="lg:hidden absolute top-2 right-2 z-50 p-1 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600"
              title="Close Pages Drawer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <PagesSidebar
              pages={doc.pages}
              activePageIndex={activePageIndex}
              widthMm={doc.widthMm}
              heightMm={doc.heightMm}
              assets={doc.assets}
              onSelectPage={(idx) => {
                setActivePageIndex(idx);
                setSelectedObjectId(null);
                setCroppingImageId(null);
                setEditingTextId(null);
                if (window.innerWidth < 1024) setIsPagesOpen(false);
              }}
              onAddPage={() => {
                pushHistory(doc);
                const newPage = createBlankPage(doc.pages.length + 1);
                setDoc((prev) => ({ ...prev, pages: [...prev.pages, newPage] }));
                setActivePageIndex(doc.pages.length);
                setSelectedObjectId(null);
              }}
              onDuplicatePage={(idx) => {
                pushHistory(doc);
                const target = doc.pages[idx];
                if (!target) return;
                const cloned = clonePage(target, doc.pages.length + 1);
                const nextPages = [...doc.pages];
                nextPages.splice(idx + 1, 0, cloned);
                setDoc((prev) => ({ ...prev, pages: nextPages }));
                setActivePageIndex(idx + 1);
              }}
              onDeletePage={(idx) => {
                if (doc.pages.length <= 1) return;
                pushHistory(doc);
                const nextPages = doc.pages.filter((_, i) => i !== idx);
                setDoc((prev) => ({ ...prev, pages: nextPages }));
                setActivePageIndex(Math.max(0, Math.min(activePageIndex, nextPages.length - 1)));
                setSelectedObjectId(null);
              }}
              onMovePage={(idx, direction) => {
                const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
                if (targetIdx < 0 || targetIdx >= doc.pages.length) return;
                pushHistory(doc);
                const nextPages = [...doc.pages];
                const [moved] = nextPages.splice(idx, 1);
                nextPages.splice(targetIdx, 0, moved);
                setDoc((prev) => ({ ...prev, pages: nextPages }));
                setActivePageIndex(targetIdx);
              }}
              onDropFilesOnPagesSidebar={(droppedFiles) => {
                void handleImportPagesFromSidebar(droppedFiles);
              }}
            />
          </div>
        )}

        {/* CENTRE — DOCUMENT WORKSPACE */}
        <EditorCanvas
          workspaceRef={workspaceRef}
          doc={doc}
          page={currentPage}
          zoom={zoom}
          panX={panX}
          panY={panY}
          activeTool={activeTool}
          activeHighlightColor={activeHighlightColor}
          penColor={penColor}
          penWidthMm={penWidthMm}
          freehandHighlighterColor={freehandHighlighterColor}
          freehandHighlighterWidthMm={freehandHighlighterWidthMm}
          selectedObjectId={selectedObjectId}
          selectedObjectIds={selectedObjectIds}
          selectedGuideId={selectedGuideId}
          croppingImageId={croppingImageId}
          editingTextId={editingTextId}
          onSelectObject={(id, additive = false) => {
            if (id === null) {
              setSelectedObjectId(null);
              setSelectedObjectIds([]);
              setCroppingImageId(null);
              setEditingTextId(null);
              return;
            }
            setSelectedGuideId(null);
            if (additive) {
              setSelectedObjectIds((prev) => {
                const base =
                  prev.length > 0
                    ? prev
                    : selectedObjectId
                    ? [selectedObjectId]
                    : [];
                const next = base.includes(id)
                  ? base.filter((item) => item !== id)
                  : [...base, id];
                setSelectedObjectId(next[next.length - 1] ?? null);
                return next;
              });
            } else {
              setSelectedObjectId(id);
              setSelectedObjectIds([id]);
            }
            if (id !== croppingImageId) setCroppingImageId(null);
            if (id !== editingTextId) setEditingTextId(null);
          }}
          onSelectObjects={handleBulkSelectObjects}
          onSelectGuide={(guideId) => setSelectedGuideId(guideId)}
          onSetCroppingImageId={setCroppingImageId}
          onSetEditingTextId={setEditingTextId}
          onSelectTool={setActiveTool}
          onPanChange={(nx, ny) => {
            setPanX(nx);
            setPanY(ny);
          }}
          onZoomChange={(nextZoom, focalClientX, focalClientY) => {
            if (
              focalClientX !== undefined &&
              focalClientY !== undefined &&
              workspaceRef.current
            ) {
              const rect = workspaceRef.current.getBoundingClientRect();
              const mouseX = focalClientX - rect.left - RULER_THICKNESS_PX;
              const mouseY = focalClientY - rect.top - RULER_THICKNESS_PX;
              const docX = (mouseX - panX) / zoom;
              const docY = (mouseY - panY) / zoom;
              setPanX(mouseX - docX * nextZoom);
              setPanY(mouseY - docY * nextZoom);
            }
            setZoom(Number(nextZoom.toFixed(3)));
          }}
          onFitToPage={() => fitPageToWorkspace(doc.widthMm, doc.heightMm, 'page')}
          cursorMm={cursorMm}
          onCursorMoveMm={setCursorMm}
          onAddObject={handleAddObject}
          onDeleteObject={handleDeleteObject}
          canDeleteSelected={canDeleteSelected}
          onDeleteSelected={handleDeleteSelected}
          onUpdateObject={handleUpdateObject}
          onUpdateMultipleObjects={handleUpdateMultipleObjects}
          onRecordHistorySnapshot={() => pushHistory(docRef.current)}
          onGroupSelected={() => handleGroupObjects(selectedObjectIds)}
          onUngroupSelected={(groupId) => handleUngroupObject(groupId)}
          onUpdateGuidelines={(nextGuides: Guideline[], commitHistory: boolean) => {
            if (commitHistory) pushHistory(docRef.current);
            setDoc((prev) => ({
              ...prev,
              pages: prev.pages.map((p, idx) =>
                idx === activePageIndex ? { ...p, guidelines: nextGuides } : p
              ),
              updatedAt: new Date().toISOString(),
            }));
            markDirty();
          }}
          onDropFiles={handleFilesImported}
          onLoadSampleDocument={handleLoadSampleDocument}
          onTriggerImageUpload={() => hiddenImageInputRef.current?.click()}
        />

        {/* RIGHT SIDEBAR — PROPERTIES (Docked on lg+, slide-over drawer on mobile/tablet) */}
        {isPropertiesOpen && (
          <div
            data-sidebar="true"
            className="flex max-w-[88vw] shrink-0 touch-pan-y max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:shadow-2xl lg:relative"
          >
            <button
              type="button"
              onClick={() => setIsPropertiesOpen(false)}
              className="lg:hidden absolute top-2 right-2 z-50 p-1 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600"
              title="Close Properties Drawer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <PropertiesPanel
              doc={doc}
              activePageIndex={activePageIndex}
              selectedObject={selectedObject}
              selectedObjectIds={selectedObjectIds}
              selectedGuideId={selectedGuideId}
              onSelectGuide={(guideId) => setSelectedGuideId(guideId)}
              onSelectObjectIds={(ids) => {
                setSelectedObjectIds(ids);
                setSelectedObjectId(ids[ids.length - 1] ?? null);
              }}
              onGroupObjects={(ids) => handleGroupObjects(ids)}
              onUngroupObject={(groupId) => handleUngroupObject(groupId)}
              onUpdateMultipleObjects={(objects, recordHistory = true) =>
                handleUpdateMultipleObjects(objects, recordHistory)
              }
              isCroppingImageId={croppingImageId}
              onStartCropImage={(id) => {
                setCroppingImageId(id);
                if (window.innerWidth < 1024) setIsPropertiesOpen(false);
              }}
              onUpdateObject={(updated, recordHistory = true) =>
                handleUpdateObject(updated, recordHistory)
              }
              onDeleteObject={(id) => {
                handleDeleteObject(id);
                if (window.innerWidth < 1024) setIsPropertiesOpen(false);
              }}
              onDuplicateObject={handleDuplicateObject}
              onReorderObject={handleReorderObject}
              onUpdateDocumentSize={(paperSize, orientation, widthMm, heightMm) => {
                pushHistory(doc);
                setDoc((prev) => ({
                  ...prev,
                  paperSize,
                  orientation,
                  widthMm,
                  heightMm,
                  updatedAt: new Date().toISOString(),
                }));
                setTimeout(() => {
                  fitPageToWorkspace(widthMm, heightMm, 'page');
                }, 30);
              }}
              onAddGuideline={(orientation, positionMm) => {
                pushHistory(doc);
                const g: Guideline = {
                  id: generateId('guide'),
                  orientation,
                  positionMm: formatMm(positionMm, 2),
                };
                setDoc((prev) => ({
                  ...prev,
                  showGuides: true,
                  pages: prev.pages.map((p, idx) =>
                    idx === activePageIndex
                      ? { ...p, guidelines: [...p.guidelines, g] }
                      : p
                  ),
                }));
                setSelectedGuideId(g.id);
              }}
              onUpdateGuideline={(guideId, nextPositionMm) => {
                pushHistory(doc);
                const clamped = formatMm(nextPositionMm, 2);
                setDoc((prev) => ({
                  ...prev,
                  pages: prev.pages.map((p, idx) =>
                    idx === activePageIndex
                      ? {
                          ...p,
                          guidelines: p.guidelines.map((g) =>
                            g.id === guideId ? { ...g, positionMm: clamped } : g
                          ),
                        }
                      : p
                  ),
                  updatedAt: new Date().toISOString(),
                }));
              }}
              onRemoveGuideline={(guideId) => {
                pushHistory(doc);
                if (selectedGuideId === guideId) setSelectedGuideId(null);
                setDoc((prev) => ({
                  ...prev,
                  pages: prev.pages.map((p, idx) =>
                    idx === activePageIndex
                      ? {
                          ...p,
                          guidelines: p.guidelines.filter((g) => g.id !== guideId),
                        }
                      : p
                  ),
                }));
              }}
              onAddMarginGuides={(marginMm) => {
                pushHistory(doc);
                const marginGuides: Guideline[] = [
                  { id: generateId('guide'), orientation: 'vertical', positionMm: marginMm },
                  {
                    id: generateId('guide'),
                    orientation: 'vertical',
                    positionMm: Math.max(0, doc.widthMm - marginMm),
                  },
                  {
                    id: generateId('guide'),
                    orientation: 'horizontal',
                    positionMm: marginMm,
                  },
                  {
                    id: generateId('guide'),
                    orientation: 'horizontal',
                    positionMm: Math.max(0, doc.heightMm - marginMm),
                  },
                ];
                setDoc((prev) => ({
                  ...prev,
                  showGuides: true,
                  pages: prev.pages.map((p, idx) =>
                    idx === activePageIndex
                      ? { ...p, guidelines: [...p.guidelines, ...marginGuides] }
                      : p
                  ),
                }));
              }}
            />
          </div>
        )}

        {/* RIGHT SIDEBAR — HELP & HOW TO (Docked on lg+ replacing Properties, full-screen in-app view on mobile/tablet) */}
        {isHelpOpen && <HelpPanel onClose={() => setIsHelpOpen(false)} />}
      </div>

      {/* BOTTOM STATUS BAR */}
      <StatusBar
        currentPageIndex={activePageIndex}
        pageCount={doc.pages.length}
        paperSize={doc.paperSize}
        orientation={doc.orientation}
        widthMm={doc.widthMm}
        heightMm={doc.heightMm}
        zoom={zoom}
        isDirty={isDirty}
        lastSavedAt={lastSavedAt}
        lastRecoveryCheckpointAt={lastRecoveryCheckpointAt}
        recoveryStorageWarning={recoveryStorageWarning}
        cursorMm={cursorMm}
        hasSelection={Boolean(selectedObject || selectedObjectIds.length > 0)}
        onZoomIn={() => setZoom((z) => Math.min(4.0, Number((z * 1.2).toFixed(2))))}
        onZoomOut={() => setZoom((z) => Math.max(0.05, Number((z / 1.2).toFixed(2))))}
        onSetZoom={(z) => setZoom(z)}
        onFitToPage={() => fitPageToWorkspace(doc.widthMm, doc.heightMm, 'page')}
        onFitToWidth={() => fitPageToWorkspace(doc.widthMm, doc.heightMm, 'width')}
        onFitSelection={fitSelectionToWorkspace}
      />

      {/* MODALS */}
      <RecoveryDraftModal
        isOpen={isRecoveryModalOpen}
        summary={recoveryDraftSummary}
        isBusy={isRecoveringDraft}
        onRecover={() => {
          void handleConfirmRecoverDraft();
        }}
        onDiscardRecovery={() => {
          void handleDiscardRecoveryDraft();
        }}
      />

      <NewDocumentModal
        isOpen={isNewModalOpen}
        onClose={() => {
          setIsNewModalOpen(false);
          newModalAuthorisedRef.current = false;
        }}
        onCreate={(name, paperSize, orientation, widthMm, heightMm) => {
          requestDocumentReplacement({
            type: 'create-blank',
            name,
            paperSize,
            orientation,
            widthMm,
            heightMm,
          });
        }}
        onLoadSample={() => {
          requestDocumentReplacement({ type: 'load-sample' });
        }}
      />

      <ExportModal
        isOpen={exportModalState.isOpen}
        initialTab={exportModalState.tab}
        doc={doc}
        activePageIndex={activePageIndex}
        onClose={() => setExportModalState((prev) => ({ ...prev, isOpen: false }))}
        onReplaceSystemFontsWithStandard={() => {
          pushHistory(doc);
          setDoc((prev) => ({
            ...prev,
            pages: prev.pages.map((p) => ({
              ...p,
              objects: p.objects.map((o) => {
                if (o.type !== 'text') return o;
                const def = AVAILABLE_FONTS.find((f) => f.id === o.fontFamily);
                if (def && def.pdfGuaranteed) return o;
                return {
                  ...o,
                  fontFamily: def?.pdfFallback || 'Helvetica',
                };
              }),
            })),
          }));
          showToast('Converted all text boxes to guaranteed PDF standard fonts.');
        }}
      />

      <UnsavedChangesModal
        isOpen={isUnsavedModalOpen}
        documentName={doc.name}
        isSaving={isSavingInModal}
        isNativeOverwriteSupported={
          Boolean(activeFileHandle) ||
          (typeof window !== 'undefined' &&
            typeof (window as unknown as { showSaveFilePicker?: unknown })
              .showSaveFilePicker === 'function')
        }
        onCancel={() => {
          if (isSavingRef.current) return;
          setIsUnsavedModalOpen(false);
          setPendingReplacementAction(null);
          pendingReplacementRef.current = null;
        }}
        onDiscardAndContinue={() => {
          if (isSavingRef.current) return;
          const pending = pendingReplacementRef.current;
          setIsUnsavedModalOpen(false);
          setPendingReplacementAction(null);
          pendingReplacementRef.current = null;
          // For actions that open a file chooser or recent file (which might be cancelled or fail),
          // keep the current document and its recovery draft intact until the replacement file is actually loaded.
          if (
            pending &&
            pending.type !== 'open-picker' &&
            pending.type !== 'open-recent' &&
            pending.type !== 'open-new-modal'
          ) {
            markClean();
            void resolveAndClearRecoveryDraft();
          }
          if (pending) {
            void executeReplacementAction(pending);
          }
        }}
        onSaveAndContinue={async () => {
          const outcome = await handleSaveDocument();
          if (outcome === 'saved-native') {
            const pending = pendingReplacementRef.current;
            setIsUnsavedModalOpen(false);
            setPendingReplacementAction(null);
            pendingReplacementRef.current = null;
            if (pending) {
              await executeReplacementAction(pending);
            }
          } else if (outcome === 'needs-fallback-modal') {
            // Keep pendingReplacementRef.current active while the user completes SaveAsModal
            setIsUnsavedModalOpen(false);
          } else {
            // Cancelled or failed save: preserve the current document and do NOT continue
            setIsUnsavedModalOpen(false);
            setPendingReplacementAction(null);
            pendingReplacementRef.current = null;
          }
        }}
      />

      <ReopenRecentModal
        isOpen={reopenRecentModalState.isOpen}
        entry={reopenRecentModalState.entry}
        reasonMessage={reopenRecentModalState.reasonMessage}
        canOpenLocalCopy={reopenRecentModalState.canOpenLocalCopy}
        onOpenLocalCopy={(targetEntry) => {
          void handleOpenRecentCachedCopy(targetEntry);
        }}
        onClose={() => {
          pendingReopenRecentEntryIdRef.current = undefined;
          setReopenRecentModalState({
            isOpen: false,
            entry: null,
            reasonMessage: null,
            canOpenLocalCopy: false,
          });
        }}
        onRemoveEntry={(entryId) => {
          void handleRemoveRecentDocument(entryId);
        }}
        onChooseFileToReopen={() => {
          const targetEntry = reopenRecentModalState.entry;
          const entryId = targetEntry?.id;
          setReopenRecentModalState({
            isOpen: false,
            entry: null,
            reasonMessage: null,
            canOpenLocalCopy: false,
          });
          // Trigger the file picker synchronously inside the user's click gesture on mobile / embedded preview
          if (!canUseNativeOpenFilePickerSync()) {
            pendingReopenRecentEntryIdRef.current = entryId;
            hiddenLayInputRef.current?.click();
            return;
          }
          void (async () => {
            const useFallback = await handleTriggerOpenNativePicker(entryId);
            if (useFallback) {
              pendingReopenRecentEntryIdRef.current = entryId;
              hiddenLayInputRef.current?.click();
            }
          })();
        }}
      />

      <SaveAsModal
        isOpen={isSaveAsModalOpen}
        currentName={doc.name}
        hasPendingReplacement={Boolean(pendingReplacementAction)}
        onClose={() => {
          setIsSaveAsModalOpen(false);
          setPendingReplacementAction(null);
          pendingReplacementRef.current = null;
        }}
        onAcknowledgeDownloadAndContinue={() => {
          const pending = pendingReplacementRef.current;
          setIsSaveAsModalOpen(false);
          setPendingReplacementAction(null);
          pendingReplacementRef.current = null;
          if (
            pending &&
            pending.type !== 'open-picker' &&
            pending.type !== 'open-recent' &&
            pending.type !== 'open-new-modal'
          ) {
            void resolveAndClearRecoveryDraft();
          }
          if (pending) {
            void executeReplacementAction(pending);
          }
        }}
        onConfirmSaveAs={async (newName): Promise<SaveAsOutcome> => {
          if (isSavingRef.current) return 'cancelled';
          isSavingRef.current = true;
          try {
            if (isDirtyRef.current) {
              void flushRecoveryCheckpointNow();
            }
            const res = await saveDocumentAsLayFileWithPicker(
              doc,
              newName,
              activeFileHandle
            );
            if (res.status === 'cancelled') {
              return 'cancelled';
            }
            if (res.status === 'permission-denied') {
              showToast(
                `Write permission was denied for "${res.filename}".`,
                'error'
              );
              return 'failed';
            }
            if (res.status === 'saved-native') {
              setActiveFileHandle(res.fileHandle);
            }
            const updatedDoc: PageLayDocument = {
              ...docRef.current,
              name: res.documentName,
              updatedAt: new Date().toISOString(),
            };
            docRef.current = updatedDoc;
            setDoc(updatedDoc);
            markClean(true);
            void persistCleanActiveDocumentCheckpoint(
              updatedDoc,
              activePageIndexRef.current,
              historyPastRef.current,
              historyFutureRef.current
            );
            void recordRecentAndSyncState({
              doc: updatedDoc,
              filename: res.filename,
              fileHandle: res.status === 'saved-native' ? res.fileHandle : null,
              layBlob: res.layBlob ?? null,
              fileSizeBytes: res.layBlob?.size,
              action:
                res.status === 'saved-native' ? 'saved' : 'saved-download',
            });
            setLastSavedAt(
              new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            );
            if (res.status === 'saved-native') {
              setIsSaveAsModalOpen(false);
              showToast(
                `Saved "${res.filename}" — subsequent saves will update this file`
              );
              const pending = pendingReplacementRef.current;
              setPendingReplacementAction(null);
              pendingReplacementRef.current = null;
              if (pending) {
                await executeReplacementAction(pending);
              }
              return 'saved-native';
            } else {
              showToast(
                `Downloaded "${res.filename}" (direct file overwrite is unavailable in this browser environment)`
              );
              if (!pendingReplacementRef.current) {
                setIsSaveAsModalOpen(false);
              }
              return 'download-initiated';
            }
          } catch (err) {
            showToast(
              err instanceof Error ? err.message : 'Failed to save .lay file.',
              'error'
            );
            return 'failed';
          } finally {
            isSavingRef.current = false;
          }
        }}
      />
    </div>
  );
}
