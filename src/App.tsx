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
} from './model/documentFactory';
import {
  CSS_PX_PER_MM_AT_100,
  formatMm,
  getCombinedBoundsMm,
  syncLinearBoundingBox,
  translatePageObjectMm,
} from './utils/units';
import {
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
import { StatusBar } from './components/StatusBar';
import { RULER_THICKNESS_PX } from './components/Rulers';
import { ExportModal, NewDocumentModal, SaveAsModal } from './components/Modals';

interface HistorySnapshot {
  paperSize: PaperFormat;
  orientation: Orientation;
  widthMm: number;
  heightMm: number;
  pages: PageData[];
}

function createSnapshot(doc: PageLayDocument): HistorySnapshot {
  return {
    paperSize: doc.paperSize,
    orientation: doc.orientation,
    widthMm: doc.widthMm,
    heightMm: doc.heightMm,
    pages: JSON.parse(JSON.stringify(doc.pages)),
  };
}

export default function App() {
  // Default document: A0 landscape, 1189 mm wide × 841 mm high
  const [doc, setDoc] = useState<PageLayDocument>(() =>
    createNewDocument('Untitled A0 Layout', 'A0', 'landscape')
  );
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

  // Synchronized refs to avoid stale closures during rapid Undo/Redo or drag commits
  const docRef = useRef<PageLayDocument>(doc);
  docRef.current = doc;
  const historyPastRef = useRef<HistorySnapshot[]>(historyPast);
  historyPastRef.current = historyPast;
  const historyFutureRef = useRef<HistorySnapshot[]>(historyFuture);
  historyFutureRef.current = historyFuture;

  // Clipboard for Copy / Paste
  const [clipboardObject, setClipboardObject] = useState<PageObject | null>(null);

  // Modals & Notifications
  const [isNewModalOpen, setIsNewModalOpen] = useState<boolean>(false);
  const [isSaveAsModalOpen, setIsSaveAsModalOpen] = useState<boolean>(false);
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

  // Keep browser document.title synchronized with the internal PageLay document name
  useEffect(() => {
    const cleanTitle = (doc.name || 'Untitled Document').trim();
    document.title = `${cleanTitle} — PageLay`;
  }, [doc.name]);

  const showToast = useCallback((text: string, type: 'info' | 'error' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  }, []);

  /**
   * Computes a zoom level and pan offset that fits the physical document page inside the central workspace.
   */
  const fitPageToWorkspace = useCallback(
    (
      targetWidthMm = doc.widthMm,
      targetHeightMm = doc.heightMm,
      mode: 'page' | 'width' = 'page'
    ) => {
      const el = workspaceRef.current;
      if (!el) return;
      const paddingPx = el.clientWidth < 640 ? 24 : 56;
      const availW = Math.max(120, el.clientWidth - RULER_THICKNESS_PX - paddingPx);
      const availH = Math.max(120, el.clientHeight - RULER_THICKNESS_PX - paddingPx);

      const pagePxWAt100 = targetWidthMm * CSS_PX_PER_MM_AT_100;
      const pagePxHAt100 = targetHeightMm * CSS_PX_PER_MM_AT_100;

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
    [doc.widthMm, doc.heightMm]
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

  /**
   * Pushes current state onto history stack before a committed mutation.
   */
  const pushHistory = useCallback((currentDoc?: PageLayDocument) => {
    const snapshotSource = currentDoc ?? docRef.current;
    const snap = createSnapshot(snapshotSource);
    const nextPast = [...historyPastRef.current.slice(-39), snap];
    historyPastRef.current = nextPast;
    historyFutureRef.current = [];
    setHistoryPast(nextPast);
    setHistoryFuture([]);
    setIsDirty(true);
  }, []);

  /**
   * Synchronously clears both undo and redo history stacks and refs (used only when creating or opening a new document).
   */
  const clearHistory = useCallback(() => {
    historyPastRef.current = [];
    historyFutureRef.current = [];
    setHistoryPast([]);
    setHistoryFuture([]);
  }, []);

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
    setIsDirty(true);
  }, []);

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
    setIsDirty(true);
  }, []);

  const currentPage = doc.pages[activePageIndex] || doc.pages[0];
  const selectedObject =
    currentPage.objects.find((o) => o.id === selectedObjectId) || null;

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
      setIsDirty(true);
    },
    [activePageIndex, pushHistory]
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
      setIsDirty(true);
    },
    [activePageIndex, pushHistory]
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
   * Deletes an object by ID from the active page.
   */
  const handleDeleteObject = useCallback(
    (id: string) => {
      pushHistory(docRef.current);
      const prev = docRef.current;
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
    [activePageIndex, selectedObjectId, croppingImageId, editingTextId, pushHistory]
  );

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
  const handleSaveDocument = useCallback(async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      const hadExistingHandle = Boolean(activeFileHandle);
      const res = await saveDocumentToExistingOrNewHandle(doc, activeFileHandle);

      if (res.status === 'cancelled') {
        return;
      }

      if (res.status === 'permission-denied') {
        showToast(
          `Write permission was denied for "${res.filename}". Use Save As... to choose a writable file location.`,
          'error'
        );
        return;
      }

      if (res.status === 'needs-fallback-modal') {
        setIsSaveAsModalOpen(true);
        return;
      }

      if (res.status === 'saved-native') {
        setActiveFileHandle(res.fileHandle);
        setDoc((prev) => ({
          ...prev,
          name: res.documentName,
          updatedAt: new Date().toISOString(),
        }));
        setIsDirty(false);
        setLastSavedAt(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
        if (hadExistingHandle) {
          showToast(`Saved changes to "${res.filename}"`);
        } else {
          showToast(`Saved "${res.filename}" (Original images preserved)`);
        }
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Failed to save .lay file.',
        'error'
      );
    } finally {
      isSavingRef.current = false;
    }
  }, [doc, activeFileHandle, showToast]);

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
        setActiveFileHandle(res.fileHandle);
        setDoc((prev) => ({
          ...prev,
          name: res.documentName,
          updatedAt: new Date().toISOString(),
        }));
        setIsDirty(false);
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
  }, [doc, activeFileHandle, showToast]);

  /**
   * Opens an existing `.lay` document using `showOpenFilePicker()` where supported,
   * retaining its `FileSystemFileHandle` for subsequent in-place saves.
   * Returns `true` if the caller should fall back to `<input type="file">`.
   */
  const handleTriggerOpenNativePicker = useCallback(async (): Promise<boolean> => {
    try {
      const res = await openDocumentWithNativePicker();
      if (res.status === 'unsupported') {
        return true;
      }
      if (res.status === 'cancelled' || !res.doc) {
        return false;
      }
      const loaded = res.doc;
      setDoc(loaded);
      setActiveFileHandle(res.fileHandle ?? null);
      setActivePageIndex(0);
      setSelectedObjectId(null);
      setSelectedObjectIds([]);
      setSelectedGuideId(null);
      setCroppingImageId(null);
      setEditingTextId(null);
      clearHistory();
      setIsDirty(false);
      setLastSavedAt(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
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
  }, [clearHistory, fitPageToWorkspace, showToast]);

  /**
   * Keyboard shortcuts (Undo, Redo, Save, Save As, Select All, Group, Ungroup, Lock/Unlock, Delete, Copy, Paste, Duplicate, Escape, Arrow Nudge).
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Do not intercept global editor shortcuts while a modal dialog is open
      if (isNewModalOpen || isSaveAsModalOpen || exportModalState.isOpen) {
        if (e.key === 'Escape') {
          setIsNewModalOpen(false);
          setIsSaveAsModalOpen(false);
          setExportModalState((prev) => ({ ...prev, isOpen: false }));
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

      // Paste copied object (Ctrl/Cmd + V) — works even when no object is currently selected
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (keyLower === 'v' || e.code === 'KeyV')) {
        if (clipboardObject) {
          e.preventDefault();
          const pasted = cloneObject(
            clipboardObject,
            Math.max(8, Math.round(doc.widthMm * 0.015))
          );
          handleAddObject(pasted);
        }
        return;
      }

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
        if (selectedObjectIds.length > 1) {
          e.preventDefault();
          const idSet = new Set(selectedObjectIds);
          pushHistory(docRef.current);
          setDoc((prev) => ({
            ...prev,
            pages: prev.pages.map((p, idx) =>
              idx === activePageIndex
                ? { ...p, objects: p.objects.filter((o) => !idSet.has(o.id)) }
                : p
            ),
            updatedAt: new Date().toISOString(),
          }));
          setSelectedObjectId(null);
          setSelectedObjectIds([]);
          setCroppingImageId(null);
          setEditingTextId(null);
          return;
        }
        if (selectedObject) {
          e.preventDefault();
          handleDeleteObject(selectedObject.id);
          return;
        }
        if (selectedGuideId && !doc.lockGuides) {
          e.preventDefault();
          pushHistory(docRef.current);
          setDoc((prev) => ({
            ...prev,
            pages: prev.pages.map((p, idx) =>
              idx === activePageIndex
                ? {
                    ...p,
                    guidelines: p.guidelines.filter((g) => g.id !== selectedGuideId),
                  }
                : p
            ),
            updatedAt: new Date().toISOString(),
          }));
          setSelectedGuideId(null);
          return;
        }
        return;
      }

      if (!selectedObject && selectedObjectIds.length === 0) return;

      // Copy selected object (Ctrl/Cmd + C)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (keyLower === 'c' || e.code === 'KeyC')) {
        if (selectedObject) {
          e.preventDefault();
          setClipboardObject(selectedObject);
          showToast(`Copied "${selectedObject.name}"`);
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
    currentPage.objects,
    selectedObject,
    selectedObjectIds,
    selectedObjectId,
    selectedGuideId,
    editingTextId,
    croppingImageId,
    activeTool,
    clipboardObject,
    isNewModalOpen,
    isSaveAsModalOpen,
    exportModalState.isOpen,
    pushHistory,
    handleUndo,
    handleRedo,
    handleSaveDocument,
    handleSaveAsDocument,
    handleGroupObjects,
    handleUngroupObject,
    handleDeleteObject,
    handleDuplicateObject,
    handleAddObject,
    handleUpdateObject,
    handleUpdateMultipleObjects,
    showToast,
  ]);

  /**
   * Handles importing one or more image files (or a dropped .lay file) while preserving 100% original bytes.
   */
  const handleFilesImported = useCallback(
    async (files: FileList, dropMm?: { x: number; y: number }) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      const layFile = fileArray.find((f) => f.name.toLowerCase().endsWith('.lay'));
      if (layFile) {
        try {
          const loadedDoc = await loadDocumentFromLayFile(layFile);
          setDoc(loadedDoc);
          // A dropped File object does not provide a writable FileSystemFileHandle
          setActiveFileHandle(null);
          setActivePageIndex(0);
          setSelectedObjectId(null);
          setSelectedObjectIds([]);
          setSelectedGuideId(null);
          clearHistory();
          setIsDirty(false);
          setLastSavedAt(null);
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
        return;
      }

      pushHistory(doc);

      const newAssets = { ...doc.assets };
      const newImageObjects: ImageObject[] = [];

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        try {
          const asset = await importImageFileToAsset(file);
          newAssets[asset.id] = asset;

          const aspect = asset.widthPx / Math.max(1, asset.heightPx);
          let placedW = formatMm(doc.widthMm * 0.38, 1);
          let placedH = formatMm(placedW / aspect, 1);
          if (placedH > doc.heightMm * 0.65) {
            placedH = formatMm(doc.heightMm * 0.65, 1);
            placedW = formatMm(placedH * aspect, 1);
          }

          const baseX = dropMm
            ? Math.max(0, Math.min(doc.widthMm - placedW, dropMm.x - placedW / 2))
            : (doc.widthMm - placedW) / 2;
          const baseY = dropMm
            ? Math.max(0, Math.min(doc.heightMm - placedH, dropMm.y - placedH / 2))
            : (doc.heightMm - placedH) / 2;

          const offsetMm = i * 20;
          const imgObj: ImageObject = {
            id: generateId('image'),
            type: 'image',
            name: file.name.replace(/\.[^.]+$/, ''),
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
        setDoc((prev) => ({
          ...prev,
          assets: newAssets,
          pages: prev.pages.map((p, idx) =>
            idx === activePageIndex
              ? { ...p, objects: [...p.objects, ...newImageObjects] }
              : p
          ),
          updatedAt: new Date().toISOString(),
        }));
        setSelectedObjectId(newImageObjects[newImageObjects.length - 1].id);
        setActiveTool('select');
        showToast(
          `Imported ${newImageObjects.length} image${
            newImageObjects.length > 1 ? 's' : ''
          } (Original resolution preserved)`
        );
      }
    },
    [doc, activePageIndex, pushHistory, fitPageToWorkspace, showToast]
  );

  /**
   * Loads the rich A0 Exhibition Stand Layout sample with 3 high-res renders, red arrows & dimensions.
   */
  const handleLoadSampleDocument = useCallback(async () => {
    try {
      const sampleDoc = await createSampleExhibitionDocument();
      setDoc(sampleDoc);
      setActiveFileHandle(null);
      setActivePageIndex(0);
      setSelectedObjectId(null);
      setSelectedObjectIds([]);
      setSelectedGuideId(null);
      setCroppingImageId(null);
      setEditingTextId(null);
      clearHistory();
      setIsDirty(false);
      setLastSavedAt(null);
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
  }, [clearHistory, fitPageToWorkspace, showToast]);

  return (
    <div className="relative w-full h-dvh flex flex-col bg-slate-100 text-slate-900 overflow-hidden overscroll-none select-none">
      {/* Hidden Image File Picker for Empty-State Trigger */}
      <input
        ref={hiddenImageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFilesImported(e.target.files);
          }
          e.target.value = '';
        }}
      />

      {/* TOP BAR */}
      <TopToolbar
        documentName={doc.name}
        onChangeDocumentName={(name) => {
          setDoc((prev) => ({ ...prev, name }));
          setIsDirty(true);
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
        onNewDocument={() => setIsNewModalOpen(true)}
        onTriggerOpenNativePicker={handleTriggerOpenNativePicker}
        onOpenLayFile={async (file) => {
          try {
            const loaded = await loadDocumentFromLayFile(file);
            setDoc(loaded);
            // Opening via fallback <input type="file"> does not grant a writable FileSystemFileHandle
            setActiveFileHandle(null);
            setActivePageIndex(0);
            setSelectedObjectId(null);
            setSelectedObjectIds([]);
            setSelectedGuideId(null);
            clearHistory();
            setIsDirty(false);
            setLastSavedAt(null);
            setTimeout(() => {
              fitPageToWorkspace(loaded.widthMm, loaded.heightMm, 'page');
            }, 50);
            showToast(
              `Opened "${loaded.name}.lay" (choose a save location when saving changes)`
            );
          } catch (err) {
            showToast(
              err instanceof Error ? err.message : 'Could not open .lay file.',
              'error'
            );
          }
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
        onToggleShowGuides={() =>
          setDoc((prev) => ({ ...prev, showGuides: !prev.showGuides }))
        }
        onToggleLockGuides={() =>
          setDoc((prev) => ({ ...prev, lockGuides: !prev.lockGuides }))
        }
        onToggleSnapToGuides={() =>
          setDoc((prev) => ({ ...prev, snapToGuides: !prev.snapToGuides }))
        }
        onToggleSnapToPageEdges={() =>
          setDoc((prev) => ({ ...prev, snapToPageEdges: !prev.snapToPageEdges }))
        }
        onToggleSnapToObjects={() =>
          setDoc((prev) => ({ ...prev, snapToObjects: !prev.snapToObjects }))
        }
        onChangeAngleSnapIncrement={(deg) => {
          const clamped = Math.max(1, Math.min(45, Math.round(deg || 15)));
          setDoc((prev) => ({ ...prev, angleSnapIncrementDeg: clamped }));
          setIsDirty(true);
        }}
        onTogglePrecisionMode={() => {
          setDoc((prev) => ({ ...prev, precisionMode: !prev.precisionMode }));
          setIsDirty(true);
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
        onTogglePages={() => {
          setIsPagesOpen((prev) => {
            const next = !prev;
            if (next && window.innerWidth < 1024) setIsPropertiesOpen(false);
            return next;
          });
        }}
        onToggleProperties={() => {
          setIsPropertiesOpen((prev) => {
            const next = !prev;
            if (next && window.innerWidth < 1024) setIsPagesOpen(false);
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
            setIsDirty(true);
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
      <NewDocumentModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onCreate={(name, paperSize, orientation, widthMm, heightMm) => {
          const fresh = createNewDocument(name, paperSize, orientation, widthMm, heightMm);
          fresh.widthMm = widthMm;
          fresh.heightMm = heightMm;
          setDoc(fresh);
          setActiveFileHandle(null);
          setActivePageIndex(0);
          setSelectedObjectId(null);
          setSelectedObjectIds([]);
          setSelectedGuideId(null);
          setCroppingImageId(null);
          setEditingTextId(null);
          clearHistory();
          setIsDirty(false);
          setLastSavedAt(null);
          setTimeout(() => {
            fitPageToWorkspace(widthMm, heightMm, 'page');
          }, 50);
          showToast(`Created ${paperSize} ${orientation} (${widthMm} × ${heightMm} mm)`);
        }}
        onLoadSample={handleLoadSampleDocument}
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

      <SaveAsModal
        isOpen={isSaveAsModalOpen}
        currentName={doc.name}
        onClose={() => setIsSaveAsModalOpen(false)}
        onConfirmSaveAs={async (newName) => {
          if (isSavingRef.current) return;
          isSavingRef.current = true;
          try {
            const res = await saveDocumentAsLayFileWithPicker(
              doc,
              newName,
              activeFileHandle
            );
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
            if (res.status === 'saved-native') {
              setActiveFileHandle(res.fileHandle);
            }
            setDoc((prev) => ({
              ...prev,
              name: res.documentName,
              updatedAt: new Date().toISOString(),
            }));
            setIsDirty(false);
            setLastSavedAt(
              new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            );
            setIsSaveAsModalOpen(false);
            if (res.status === 'saved-native') {
              showToast(
                `Saved "${res.filename}" — subsequent saves will update this file`
              );
            } else {
              showToast(
                `Downloaded "${res.filename}" (direct file overwrite is unavailable in this browser environment)`
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
        }}
      />
    </div>
  );
}
