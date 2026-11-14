/**
 * @license
 * SPDX-License-Identifier: MIT
 *
 * PageLay — Interactive Document Workspace & Canvas Renderer
 *
 * Uses true zoom-invariant rendering: the page's internal coordinate system is laid out
 * at canonical 100% scale (1 mm = CSS_PX_PER_MM_AT_100 px) and scaled via GPU compositor
 * `transform: scale(zoom)`. This guarantees that text wrapping, font metrics, and vector
 * geometry are 100% identical at 7% mobile zoom, 25% laptop zoom, and 200% detail zoom.
 *
 * Full mouse + mobile touch support:
 * - 1-finger drag on workspace / Pan tool: slides & pans the canvas smoothly
 * - 2-finger pinch & drag: simultaneous pinch-to-zoom and pan on phones/tablets
 * - 1-finger drag on objects / handles / guidelines: moves, resizes, rotates, crops in mm
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  RotateCcw,
  Upload,
  LayoutGrid,
  ImagePlus,
  Hand,
  MousePointer,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Group,
  Ungroup,
  Trash2,
} from 'lucide-react';
import {
  ArrowObject,
  AVAILABLE_FONTS,
  DimensionObject,
  FreehandPointMm,
  FreehandStrokeObject,
  GroupObject,
  Guideline,
  HIGHLIGHT_PRESETS,
  ImageObject,
  LineObject,
  PageData,
  PageLayDocument,
  PageObject,
  ShapeObject,
  TextObject,
  ToolType,
} from '../model/documentTypes';
import { generateId } from '../model/documentFactory';
import {
  buildSmoothFreehandSvgPath,
  CSS_PX_PER_MM_AT_100,
  formatMm,
  getCombinedBoundsMm,
  getLineLengthMm,
  getObjectBoundsMm,
  isPointNearFreehandStrokeMm,
  ptToMm,
  resizeFreehandStrokeMm,
  resizeGroupObjectMm,
  rotateGroupObjectMm,
  syncFreehandBoundingBox,
  syncLinearBoundingBox,
  translatePageObjectMm,
} from '../utils/units';
import { RULER_THICKNESS_PX, Rulers } from './Rulers';

interface EditorCanvasProps {
  doc: PageLayDocument;
  page: PageData;
  zoom: number;
  panX: number;
  panY: number;
  activeTool: ToolType;
  activeHighlightColor: string;
  penColor: string;
  penWidthMm: number;
  freehandHighlighterColor: string;
  freehandHighlighterWidthMm: number;
  selectedObjectId: string | null;
  selectedObjectIds: string[];
  selectedGuideId: string | null;
  croppingImageId: string | null;
  editingTextId: string | null;
  onSelectObject: (id: string | null, additive?: boolean) => void;
  onSelectGuide: (guideId: string | null) => void;
  onSetCroppingImageId: (id: string | null) => void;
  onSetEditingTextId: (id: string | null) => void;
  onSelectTool: (tool: ToolType) => void;
  onPanChange: (panX: number, panY: number) => void;
  onZoomChange: (newZoom: number, focalClientX?: number, focalClientY?: number) => void;
  onFitToPage: () => void;
  cursorMm: { x: number; y: number } | null;
  onCursorMoveMm: (pos: { x: number; y: number } | null) => void;
  onAddObject: (obj: PageObject, enterEditText?: boolean, selectNewObject?: boolean) => void;
  onDeleteObject: (id: string) => void;
  canDeleteSelected: boolean;
  onDeleteSelected: () => void;
  onUpdateObject: (obj: PageObject, commitHistory: boolean) => void;
  onUpdateMultipleObjects: (objects: PageObject[], commitHistory: boolean) => void;
  onRecordHistorySnapshot: () => void;
  onGroupSelected: () => void;
  onUngroupSelected: (groupId: string) => void;
  onUpdateGuidelines: (guidelines: Guideline[], commitHistory: boolean) => void;
  onDropFiles: (files: File[] | FileList, dropMm?: { x: number; y: number }) => void;
  onLoadSampleDocument: () => void;
  onTriggerImageUpload: () => void;
  workspaceRef: React.RefObject<HTMLDivElement | null>;
}

type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

type InteractionState =
  | {
      mode: 'panning';
      startClientX: number;
      startClientY: number;
      initialPanX: number;
      initialPanY: number;
      movedDistancePx: number;
      clearSelectionOnTap: boolean;
    }
  | {
      mode: 'pinch-zoom';
      initialDistance: number;
      initialZoom: number;
      initialPanX: number;
      initialPanY: number;
      initialCenterClientX: number;
      initialCenterClientY: number;
    }
  | {
      mode: 'dragging-guide';
      guideId: string;
      orientation: 'horizontal' | 'vertical';
      positionMm: number;
      isNew: boolean;
    }
  | {
      mode: 'moving-object';
      objectId: string;
      startMmX: number;
      startMmY: number;
      initialObject: PageObject;
      hasMoved: boolean;
    }
  | {
      mode: 'moving-multi';
      startMmX: number;
      startMmY: number;
      initialObjects: PageObject[];
      hasMoved: boolean;
    }
  | {
      mode: 'resizing-object';
      objectId: string;
      handle: HandlePosition;
      startMmX: number;
      startMmY: number;
      initialObject: PageObject;
    }
  | {
      mode: 'rotating-object';
      objectId: string;
      centerMmX: number;
      centerMmY: number;
      initialObject: PageObject;
    }
  | {
      mode: 'dragging-endpoint';
      objectId: string;
      endpoint: 'p1' | 'p2';
      initialObject: LineObject | ArrowObject | DimensionObject;
      anchorMmX: number;
      anchorMmY: number;
      currentMmX: number;
      currentMmY: number;
      constrainedLengthMm: number;
      constrainedAngleDeg: number;
    }
  | {
      mode: 'cropping-image';
      objectId: string;
      handle: HandlePosition;
      startMmX: number;
      startMmY: number;
      initialObject: ImageObject;
    }
  | {
      mode: 'creating-object';
      tool: Exclude<
        ToolType,
        'select' | 'pan' | 'pen' | 'freehand-highlighter' | 'eraser'
      >;
      rawStartMmX: number;
      rawStartMmY: number;
      startMmX: number;
      startMmY: number;
      currentMmX: number;
      currentMmY: number;
      constrainedLengthMm: number;
      constrainedAngleDeg: number;
    }
  | {
      mode: 'drawing-freehand';
      strokeTool: 'pen' | 'highlighter';
      pointsMm: FreehandPointMm[];
      strokeColor: string;
      strokeWidthMm: number;
      opacity: number;
    }
  | {
      mode: 'erasing-freehand';
    };

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  doc,
  page,
  zoom,
  panX,
  panY,
  activeTool,
  activeHighlightColor,
  penColor,
  penWidthMm,
  freehandHighlighterColor,
  freehandHighlighterWidthMm,
  selectedObjectId,
  selectedObjectIds,
  selectedGuideId,
  croppingImageId,
  editingTextId,
  onSelectObject,
  onSelectGuide,
  onSetCroppingImageId,
  onSetEditingTextId,
  onSelectTool,
  onPanChange,
  onZoomChange,
  onFitToPage,
  cursorMm,
  onCursorMoveMm,
  onAddObject,
  onDeleteObject,
  canDeleteSelected,
  onDeleteSelected,
  onUpdateObject,
  onUpdateMultipleObjects,
  onRecordHistorySnapshot,
  onGroupSelected,
  onUngroupSelected,
  onUpdateGuidelines,
  onDropFiles,
  onLoadSampleDocument,
  onTriggerImageUpload,
  workspaceRef,
}) => {
  const [interaction, setInteractionState] = useState<InteractionState | null>(null);
  const interactionRef = useRef<InteractionState | null>(null);
  const hasRecordedDragHistoryRef = useRef<boolean>(false);
  const hasRecordedTextEditHistoryRef = useRef<boolean>(false);
  const activePointersRef = useRef<Map<number, { clientX: number; clientY: number }>>(
    new Map()
  );
  const isTouchPinchingRef = useRef<boolean>(false);
  const isAdjustingGuideOrRulerRef = useRef<boolean>(false);
  const lastObjectPointerDownTimeRef = useRef<number>(0);
  const isShiftPressedRef = useRef<boolean>(false);
  const lastPointerClientRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const processPointerMoveRef = useRef<
    (clientX: number, clientY: number, shiftKey?: boolean) => void
  >(() => {});

  // Synchronized refs so native touch event listeners always read fresh zoom & pan values
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panXRef = useRef(panX);
  panXRef.current = panX;
  const panYRef = useRef(panY);
  panYRef.current = panY;
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  const onPanChangeRef = useRef(onPanChange);
  onPanChangeRef.current = onPanChange;

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  /**
   * Blurs any focused toolbar/sidebar input, select, or button when the user clicks or drags
   * on the workspace canvas so global keyboard shortcuts (Ctrl+Z, Ctrl+Y, Delete, etc.) work immediately.
   */
  const blurExternalInputIfFocused = () => {
    if (typeof document === 'undefined') return;
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body || active === textareaRef.current) return;
    const tag = active.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      tag === 'BUTTON'
    ) {
      active.blur();
    }
  };

  /**
   * Records a single pre-drag history snapshot on the first frame that a continuous drag
   * actually mutates an object or guideline.
   */
  const recordDragHistoryOnce = () => {
    if (!hasRecordedDragHistoryRef.current) {
      hasRecordedDragHistoryRef.current = true;
      onRecordHistorySnapshot();
    }
  };

  const setInteraction = (next: InteractionState | null) => {
    if (next !== null && interactionRef.current === null) {
      hasRecordedDragHistoryRef.current = false;
      blurExternalInputIfFocused();
    } else if (next === null) {
      hasRecordedDragHistoryRef.current = false;
    }
    interactionRef.current = next;
    setInteractionState(next);
  };

  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeSnapLines, setActiveSnapLines] = useState<{
    verticalMm: number | null;
    horizontalMm: number | null;
  }>({ verticalMm: null, horizontalMm: null });

  // Base 100% scale factor (px per mm before CSS zoom transform)
  const basePxPerMm = CSS_PX_PER_MM_AT_100;
  // Effective screen px per mm at current zoom
  const screenPxPerMm = CSS_PX_PER_MM_AT_100 * zoom;
  // Inverse scale factor to keep selection handles and badges crisp at any zoom
  const invZoom = 1 / Math.max(0.05, zoom);

  useEffect(() => {
    hasRecordedTextEditHistoryRef.current = false;
    if (editingTextId && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [editingTextId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && !isShiftPressedRef.current) {
        isShiftPressedRef.current = true;
        if (interactionRef.current && lastPointerClientRef.current) {
          processPointerMoveRef.current(
            lastPointerClientRef.current.clientX,
            lastPointerClientRef.current.clientY,
            true
          );
        }
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space' && !isSpacePressed) {
        e.preventDefault();
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && isShiftPressedRef.current) {
        isShiftPressedRef.current = false;
        if (interactionRef.current && lastPointerClientRef.current) {
          processPointerMoveRef.current(
            lastPointerClientRef.current.clientX,
            lastPointerClientRef.current.clientY,
            false
          );
        }
      }
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isSpacePressed]);

  /**
   * Converts client (viewport) coordinates into canonical millimetre coordinates on the active page.
   */
  const clientToPageMm = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const localX = clientX - rect.left - RULER_THICKNESS_PX - panX;
    const localY = clientY - rect.top - RULER_THICKNESS_PX - panY;
    return {
      x: localX / screenPxPerMm,
      y: localY / screenPxPerMm,
    };
  };

  /**
   * Snaps a single millimetre coordinate against guidelines, page edges, and/or other objects' edges & centres.
   */
  const snapCoordinateMm = (
    valueMm: number,
    axis: 'x' | 'y',
    excludeObjectIds: string[] = []
  ): { snappedMm: number; snapLineMm: number | null; distanceMm: number } => {
    const thresholdMm = 6 / screenPxPerMm;
    const candidates: number[] = [];

    if (doc.snapToPageEdges) {
      if (axis === 'x') {
        candidates.push(0, doc.widthMm / 2, doc.widthMm);
      } else {
        candidates.push(0, doc.heightMm / 2, doc.heightMm);
      }
    }

    if (doc.snapToGuides && doc.showGuides) {
      for (const g of page.guidelines) {
        if (axis === 'x' && g.orientation === 'vertical') {
          candidates.push(g.positionMm);
        } else if (axis === 'y' && g.orientation === 'horizontal') {
          candidates.push(g.positionMm);
        }
      }
    }

    if (doc.snapToObjects) {
      for (const other of page.objects) {
        if (excludeObjectIds.includes(other.id)) continue;
        const bounds = getObjectBoundsMm(other);
        if (axis === 'x') {
          candidates.push(
            bounds.minX,
            (bounds.minX + bounds.maxX) / 2,
            bounds.maxX
          );
        } else {
          candidates.push(
            bounds.minY,
            (bounds.minY + bounds.maxY) / 2,
            bounds.maxY
          );
        }
      }
    }

    let bestDist = thresholdMm;
    let snapped = valueMm;
    let matchedLine: number | null = null;

    for (const c of candidates) {
      const dist = Math.abs(valueMm - c);
      if (dist <= bestDist) {
        bestDist = dist;
        snapped = c;
        matchedLine = formatMm(c, 2);
      }
    }

    return {
      snappedMm: formatMm(snapped, 2),
      snapLineMm: matchedLine,
      distanceMm: matchedLine !== null ? bestDist : Number.POSITIVE_INFINITY,
    };
  };

  /**
   * Snaps a bounding box (xMm, yMm, widthMm, heightMm) by testing left, center, and right edges
   * (and top, center, and bottom edges) and selecting the closest magnetic snap match.
   */
  const snapBoxPositionMm = (
    rawXMm: number,
    rawYMm: number,
    widthMm: number,
    heightMm: number,
    excludeObjectIds: string[] = []
  ) => {
    let finalX = rawXMm;
    let vSnap: number | null = null;

    const leftSnap = snapCoordinateMm(rawXMm, 'x', excludeObjectIds);
    const centerSnapX = snapCoordinateMm(rawXMm + widthMm / 2, 'x', excludeObjectIds);
    const rightSnap = snapCoordinateMm(rawXMm + widthMm, 'x', excludeObjectIds);

    const xCandidates = [
      {
        snap: leftSnap,
        computedX: leftSnap.snappedMm,
      },
      {
        snap: centerSnapX,
        computedX: centerSnapX.snappedMm - widthMm / 2,
      },
      {
        snap: rightSnap,
        computedX: rightSnap.snappedMm - widthMm,
      },
    ].filter((item) => item.snap.snapLineMm !== null);

    if (xCandidates.length > 0) {
      xCandidates.sort((a, b) => a.snap.distanceMm - b.snap.distanceMm);
      finalX = xCandidates[0].computedX;
      vSnap = xCandidates[0].snap.snapLineMm;
    }

    let finalY = rawYMm;
    let hSnap: number | null = null;

    const topSnap = snapCoordinateMm(rawYMm, 'y', excludeObjectIds);
    const centerSnapY = snapCoordinateMm(rawYMm + heightMm / 2, 'y', excludeObjectIds);
    const bottomSnap = snapCoordinateMm(rawYMm + heightMm, 'y', excludeObjectIds);

    const yCandidates = [
      {
        snap: topSnap,
        computedY: topSnap.snappedMm,
      },
      {
        snap: centerSnapY,
        computedY: centerSnapY.snappedMm - heightMm / 2,
      },
      {
        snap: bottomSnap,
        computedY: bottomSnap.snappedMm - heightMm,
      },
    ].filter((item) => item.snap.snapLineMm !== null);

    if (yCandidates.length > 0) {
      yCandidates.sort((a, b) => a.snap.distanceMm - b.snap.distanceMm);
      finalY = yCandidates[0].computedY;
      hSnap = yCandidates[0].snap.snapLineMm;
    }

    return {
      xMm: formatMm(finalX, 2),
      yMm: formatMm(finalY, 2),
      verticalSnapMm: vSnap,
      horizontalSnapMm: hSnap,
    };
  };

  /**
   * Explicitly verifies whether a pointer, mouse, or touch event originated from within
   * the top/left millimetre ruler containers, a guideline drag handle, a sidebar panel,
   * or a floating UI control.
   *
   * Checks:
   * 1. DOM target element and parent chain via `.closest(...)`
   * 2. Event `composedPath()` (if available) for shadow/retargeted nodes
   * 3. Live hit-testing via `document.elementFromPoint(clientX, clientY)`
   * 4. Physical ruler container bounds (`localX <= RULER_THICKNESS_PX || localY <= RULER_THICKNESS_PX`)
   */
  const RULER_OR_SIDEBAR_SELECTOR =
    '[data-ruler="true"], [data-ruler-container], #ruler-top, #ruler-left, #ruler-corner, [data-sidebar="true"], [data-guide-handle="true"], [data-allow-touch-scroll="true"], aside, header, footer';

  const isEventFromRulerOrSidebar = (
    target: EventTarget | null,
    clientX?: number,
    clientY?: number,
    nativeEvent?: Event
  ): boolean => {
    const targetEl =
      target instanceof Element
        ? target
        : target instanceof Node
        ? target.parentElement
        : null;

    if (targetEl && targetEl.closest(RULER_OR_SIDEBAR_SELECTOR)) {
      return true;
    }

    if (nativeEvent && typeof nativeEvent.composedPath === 'function') {
      const path = nativeEvent.composedPath();
      for (const node of path) {
        if (node instanceof Element && node.matches(RULER_OR_SIDEBAR_SELECTOR)) {
          return true;
        }
      }
    }

    if (
      typeof document !== 'undefined' &&
      clientX !== undefined &&
      clientY !== undefined
    ) {
      const hitEl = document.elementFromPoint(clientX, clientY);
      if (hitEl && hitEl.closest(RULER_OR_SIDEBAR_SELECTOR)) {
        return true;
      }
    }

    if (
      clientX !== undefined &&
      clientY !== undefined &&
      workspaceRef.current
    ) {
      const rect = workspaceRef.current.getBoundingClientRect();
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      if (localX <= RULER_THICKNESS_PX || localY <= RULER_THICKNESS_PX) {
        return true;
      }
    }
    return false;
  };

  /**
   * Starts dragging a new guideline from the top or left millimetre ruler.
   */
  const handleStartCreateGuide = (
    orientation: 'horizontal' | 'vertical',
    clientX: number,
    clientY: number,
    pointerId?: number
  ) => {
    isAdjustingGuideOrRulerRef.current = true;
    if (interactionRef.current?.mode === 'dragging-guide') return;

    if (pointerId !== undefined) {
      activePointersRef.current.set(pointerId, { clientX, clientY });
      try {
        workspaceRef.current?.setPointerCapture(pointerId);
      } catch {
        // Ignore if synthetic pointer cannot be captured
      }
    }

    const posMm = clientToPageMm(clientX, clientY);
    const initialMm = formatMm(orientation === 'vertical' ? posMm.x : posMm.y, 1);
    const newGuide: Guideline = {
      id: generateId('guide'),
      orientation,
      positionMm: initialMm,
    };
    setInteraction({
      mode: 'dragging-guide',
      guideId: newGuide.id,
      orientation,
      positionMm: initialMm,
      isNew: true,
    });
    recordDragHistoryOnce();
    onUpdateGuidelines([...page.guidelines, newGuide], false);
  };

  /**
   * Finds the top-most unlocked FreehandStrokeObject (`type === 'freehand'`) near `(ptXMm, ptYMm)`
   * and deletes it as a single undoable operation.
   * Strictly ignores all non-freehand objects (images, text, lines, arrows, dimensions, shapes, rectangular area highlights).
   */
  const eraseFreehandStrokeAtMm = (ptXMm: number, ptYMm: number): boolean => {
    const extraToleranceMm = Math.max(1.5, 8 / screenPxPerMm);
    const objects = page.objects;
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (obj.type !== 'freehand' || obj.locked) continue;
      if (isPointNearFreehandStrokeMm(ptXMm, ptYMm, obj, extraToleranceMm)) {
        onDeleteObject(obj.id);
        return true;
      }
    }
    return false;
  };

  /**
   * Unified pointer/touch start logic on workspace background.
   */
  const startWorkspaceInteraction = (
    clientX: number,
    clientY: number,
    isMiddleClick = false,
    target: EventTarget | null = null,
    nativeEvent?: Event,
    isAdditiveModifier = false,
    shiftKey = false
  ) => {
    if (
      isAdjustingGuideOrRulerRef.current ||
      interactionRef.current?.mode === 'dragging-guide' ||
      isEventFromRulerOrSidebar(target, clientX, clientY, nativeEvent)
    ) {
      return;
    }

    lastPointerClientRef.current = { clientX, clientY };
    isShiftPressedRef.current = shiftKey;

    if (editingTextId) {
      onSetEditingTextId(null);
    }
    if (croppingImageId) {
      onSetCroppingImageId(null);
    }

    // Middle-click or Spacebar always pans the canvas
    if (isMiddleClick || isSpacePressed || activeTool === 'pan' || activeTool === 'select') {
      setInteraction({
        mode: 'panning',
        startClientX: clientX,
        startClientY: clientY,
        initialPanX: panX,
        initialPanY: panY,
        movedDistancePx: 0,
        clearSelectionOnTap:
          activeTool === 'select' &&
          !isMiddleClick &&
          !isSpacePressed &&
          !isAdditiveModifier,
      });
      return;
    }

    const ptMm = clientToPageMm(clientX, clientY);

    // Freehand Pen & Freehand Highlighter: no magnetic snapping, angle snapping, or Precision Mode constraint
    if (activeTool === 'pen' || activeTool === 'freehand-highlighter') {
      const isHighlighter = activeTool === 'freehand-highlighter';
      setInteraction({
        mode: 'drawing-freehand',
        strokeTool: isHighlighter ? 'highlighter' : 'pen',
        pointsMm: [{ xMm: formatMm(ptMm.x, 2), yMm: formatMm(ptMm.y, 2) }],
        strokeColor: isHighlighter ? freehandHighlighterColor : penColor,
        strokeWidthMm: isHighlighter ? freehandHighlighterWidthMm : penWidthMm,
        opacity: isHighlighter ? 0.38 : 1,
      });
      return;
    }

    // Basic Eraser: erases only freehand Pen / Highlighter strokes on click/tap or drag
    if (activeTool === 'eraser') {
      eraseFreehandStrokeAtMm(ptMm.x, ptMm.y);
      setInteraction({ mode: 'erasing-freehand' });
      return;
    }

    const snappedX = snapCoordinateMm(ptMm.x, 'x').snappedMm;
    const snappedY = snapCoordinateMm(ptMm.y, 'y').snappedMm;

    const isLinearTool =
      activeTool === 'line' || activeTool === 'arrow' || activeTool === 'dimension';
    const isPrecisionActive = Boolean(shiftKey || doc.precisionMode);
    const startMmX =
      isLinearTool && isPrecisionActive ? Math.round(snappedX) : snappedX;
    const startMmY =
      isLinearTool && isPrecisionActive ? Math.round(snappedY) : snappedY;

    setInteraction({
      mode: 'creating-object',
      tool: activeTool,
      rawStartMmX: snappedX,
      rawStartMmY: snappedY,
      startMmX,
      startMmY,
      currentMmX: startMmX,
      currentMmY: startMmY,
      constrainedLengthMm: 0,
      constrainedAngleDeg: 0,
    });
  };

  /**
   * Capture-phase PointerDown on workspace:
   * Explicitly verifies the event target first so events originating from rulers,
   * guidelines, or sidebars are never added to canvas pan/pinch pointer tracking.
   */
  const handleWorkspacePointerDownCapture = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;

    if (isEventFromRulerOrSidebar(e.target, e.clientX, e.clientY, e.nativeEvent)) {
      isAdjustingGuideOrRulerRef.current = true;
      return;
    }

    activePointersRef.current.set(e.pointerId, {
      clientX: e.clientX,
      clientY: e.clientY,
    });
    if (
      activePointersRef.current.size >= 2 &&
      !isAdjustingGuideOrRulerRef.current &&
      interactionRef.current?.mode !== 'dragging-guide'
    ) {
      const pts = Array.from(activePointersRef.current.values());
      startPinchAndTwoFingerPan(
        pts[0].clientX,
        pts[0].clientY,
        pts[1].clientX,
        pts[1].clientY
      );
    }
  };

  /**
   * PointerDown on workspace: explicitly verifies the event target and ignores events
   * originating from within the ruler containers (left or top), guidelines, or sidebar areas
   * to prevent unintended document panning while adjusting guidelines.
   */
  const handleWorkspacePointerDown = (e: React.PointerEvent) => {
    if (isEventFromRulerOrSidebar(e.target, e.clientX, e.clientY, e.nativeEvent)) {
      isAdjustingGuideOrRulerRef.current = true;
      return;
    }
    if (
      isAdjustingGuideOrRulerRef.current ||
      interactionRef.current?.mode === 'dragging-guide'
    ) {
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;

    activePointersRef.current.set(e.pointerId, {
      clientX: e.clientX,
      clientY: e.clientY,
    });

    if (activePointersRef.current.size >= 2 || isTouchPinchingRef.current) {
      const pts = Array.from(activePointersRef.current.values());
      if (pts.length >= 2) {
        startPinchAndTwoFingerPan(
          pts[0].clientX,
          pts[0].clientY,
          pts[1].clientX,
          pts[1].clientY
        );
      }
      return;
    }

    if (interactionRef.current !== null) return;
    startWorkspaceInteraction(
      e.clientX,
      e.clientY,
      e.button === 1,
      e.target,
      e.nativeEvent,
      e.ctrlKey || e.metaKey || e.shiftKey,
      e.shiftKey
    );
  };

  const handleWorkspaceMouseDown = (e: React.MouseEvent) => {
    if (isEventFromRulerOrSidebar(e.target, e.clientX, e.clientY, e.nativeEvent)) {
      isAdjustingGuideOrRulerRef.current = true;
      return;
    }
    if (
      isAdjustingGuideOrRulerRef.current ||
      interactionRef.current !== null
    ) {
      return;
    }
    if (e.button !== 0 && e.button !== 1) return;
    startWorkspaceInteraction(
      e.clientX,
      e.clientY,
      e.button === 1,
      e.target,
      e.nativeEvent,
      e.ctrlKey || e.metaKey || e.shiftKey,
      e.shiftKey
    );
  };

  /**
   * Initializes a two-finger pinch-to-zoom and two-finger pan gesture.
   * If a 1-finger object drag was momentarily triggered milliseconds earlier
   * by the first finger touching down before the second finger landed, reverts that uncommitted
   * action so the user's two-finger gesture never accidentally moves page objects.
   */
  const startPinchAndTwoFingerPan = (clientX1: number, clientY1: number, clientX2: number, clientY2: number) => {
    if (
      isAdjustingGuideOrRulerRef.current ||
      interactionRef.current?.mode === 'dragging-guide'
    ) {
      return;
    }

    isTouchPinchingRef.current = true;
    setActiveSnapLines({ verticalMm: null, horizontalMm: null });

    const currentInteraction = interactionRef.current;
    if (currentInteraction) {
      if (
        currentInteraction.mode === 'moving-object' ||
        currentInteraction.mode === 'resizing-object' ||
        currentInteraction.mode === 'rotating-object' ||
        currentInteraction.mode === 'dragging-endpoint' ||
        currentInteraction.mode === 'cropping-image'
      ) {
        onUpdateObject(currentInteraction.initialObject, false);
      }
    }

    const dist = Math.hypot(clientX2 - clientX1, clientY2 - clientY1);
    const centerX = (clientX1 + clientX2) / 2;
    const centerY = (clientY1 + clientY2) / 2;

    setInteraction({
      mode: 'pinch-zoom',
      initialDistance: Math.max(10, dist),
      initialZoom: zoomRef.current,
      initialPanX: panXRef.current,
      initialPanY: panYRef.current,
      initialCenterClientX: centerX,
      initialCenterClientY: centerY,
    });
  };

  /**
   * Native touch event listeners on the EditorCanvas workspace container:
   * 1. Prevents browser-level viewport zoom and rubber-band overscroll.
   * 2. Directly detects two-finger 'pinch' gestures (e.touches.length === 2) when
   *    not interacting with a ruler/guideline, calculates Euclidean finger distance
   *    and scale ratio, and updates the zoom and focal pan state smoothly.
   */
  useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;

    const handleNativeTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-allow-touch-scroll="true"]')) {
        if (e.touches.length >= 2) {
          e.preventDefault();
        }
        return;
      }

      const firstTouch = e.touches[0];
      if (
        firstTouch &&
        isEventFromRulerOrSidebar(e.target, firstTouch.clientX, firstTouch.clientY, e)
      ) {
        isAdjustingGuideOrRulerRef.current = true;
        return;
      }

      if (
        e.touches.length >= 2 &&
        !isAdjustingGuideOrRulerRef.current &&
        interactionRef.current?.mode !== 'dragging-guide'
      ) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        startPinchAndTwoFingerPan(t1.clientX, t1.clientY, t2.clientX, t2.clientY);
      }
    };

    const handleNativeTouchMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-allow-touch-scroll="true"]')) {
        if (e.touches.length >= 2) {
          e.preventDefault();
        }
        return;
      }

      e.preventDefault();

      if (
        isAdjustingGuideOrRulerRef.current ||
        interactionRef.current?.mode === 'dragging-guide'
      ) {
        return;
      }

      if (e.touches.length >= 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        updatePinchZoomFromTwoPoints(t1.clientX, t1.clientY, t2.clientX, t2.clientY);
      }
    };

    const handleNativeTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        isTouchPinchingRef.current = false;
      }
      if (e.touches.length === 0) {
        isAdjustingGuideOrRulerRef.current = false;
      }
      if (interactionRef.current?.mode === 'pinch-zoom' && e.touches.length === 1) {
        const remainingTouch = e.touches[0];
        setInteraction({
          mode: 'panning',
          startClientX: remainingTouch.clientX,
          startClientY: remainingTouch.clientY,
          initialPanX: panXRef.current,
          initialPanY: panYRef.current,
          movedDistancePx: 10,
          clearSelectionOnTap: false,
        });
      } else if (e.touches.length === 0 && interactionRef.current?.mode === 'pinch-zoom') {
        activePointersRef.current.clear();
        setInteraction(null);
      }
    };

    el.addEventListener('touchstart', handleNativeTouchStart, { passive: false });
    el.addEventListener('touchmove', handleNativeTouchMove, { passive: false });
    el.addEventListener('touchend', handleNativeTouchEnd, { passive: false });
    el.addEventListener('touchcancel', handleNativeTouchEnd, { passive: false });
    return () => {
      el.removeEventListener('touchstart', handleNativeTouchStart);
      el.removeEventListener('touchmove', handleNativeTouchMove);
      el.removeEventListener('touchend', handleNativeTouchEnd);
      el.removeEventListener('touchcancel', handleNativeTouchEnd);
    };
  });

  /**
   * TouchStart on workspace: supports 2-finger pinch-to-zoom & two-finger pan, or 1-finger slide/create.
   * Explicitly ignores touches originating from rulers, guidelines, or sidebars.
   */
  const handleWorkspaceTouchStart = (e: React.TouchEvent) => {
    const firstTouch = e.touches[0];
    if (
      firstTouch &&
      isEventFromRulerOrSidebar(e.target, firstTouch.clientX, firstTouch.clientY, e.nativeEvent)
    ) {
      isAdjustingGuideOrRulerRef.current = true;
      return;
    }
    if (
      isAdjustingGuideOrRulerRef.current ||
      interactionRef.current?.mode === 'dragging-guide'
    ) {
      return;
    }

    if (e.touches.length >= 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      startPinchAndTwoFingerPan(t1.clientX, t1.clientY, t2.clientX, t2.clientY);
      return;
    }

    if (e.touches.length === 1) {
      isTouchPinchingRef.current = false;
      const t = e.touches[0];
      if (interactionRef.current !== null) return;
      startWorkspaceInteraction(t.clientX, t.clientY, false, e.target, e.nativeEvent);
    }
  };

  /**
   * Constrains a line/arrow/dimension endpoint in Precision Mode (or when Shift is held):
   * - Snaps radial physical length to whole 1 mm increments.
   * - Snaps angle to multiples of the configured angle increment (1°–45°) measured from the
   *   horizontal axis, always including exact horizontal (0°, 180°) and vertical (90°, 270°) axes.
   * - Computes the endpoint using trigonometry while retaining 4-decimal (0.0001 mm) precision
   *   so neither angle nor whole-mm length is distorted by independent coordinate rounding.
   */
  const constrainLineEndpointByAngleMm = (
    anchorXMm: number,
    anchorYMm: number,
    rawTargetXMm: number,
    rawTargetYMm: number,
    angleStepDeg: number
  ): { xMm: number; yMm: number; lengthMm: number; angleDeg: number } => {
    const dx = rawTargetXMm - anchorXMm;
    const dy = rawTargetYMm - anchorYMm;
    const rawLengthMm = Math.hypot(dx, dy);
    const snappedLengthMm = Math.round(rawLengthMm);
    if (snappedLengthMm < 1) {
      return {
        xMm: anchorXMm,
        yMm: anchorYMm,
        lengthMm: 0,
        angleDeg: 0,
      };
    }

    const step = Math.max(1, Math.min(45, Math.round(angleStepDeg || 15)));
    const rawAngleDeg = ((((Math.atan2(dy, dx) * 180) / Math.PI) % 360) + 360) % 360;

    // Candidate snap angles in [0, 360): multiples of step + symmetric horizontal offsets + cardinal axes
    const candidateAngles = new Set<number>([0, 90, 180, 270]);
    for (let a = 0; a < 360; a += step) {
      candidateAngles.add(a);
    }
    for (let offset = step; offset < 90; offset += step) {
      candidateAngles.add(offset);
      candidateAngles.add(180 - offset);
      candidateAngles.add(180 + offset);
      candidateAngles.add(360 - offset);
    }

    let bestAngleDeg = 0;
    let minAngularDiff = Infinity;
    candidateAngles.forEach((candidate) => {
      const diff = Math.abs(((rawAngleDeg - candidate + 540) % 360) - 180);
      if (diff < minAngularDiff) {
        minAngularDiff = diff;
        bestAngleDeg = candidate;
      }
    });

    const rad = (bestAngleDeg * Math.PI) / 180;
    const exactXMm = Number((anchorXMm + snappedLengthMm * Math.cos(rad)).toFixed(4));
    const exactYMm = Number((anchorYMm + snappedLengthMm * Math.sin(rad)).toFixed(4));

    return {
      xMm: exactXMm,
      yMm: exactYMm,
      lengthMm: snappedLengthMm,
      angleDeg: bestAngleDeg,
    };
  };

  /**
   * Unified coordinate move processor for both MouseMove and 1-finger TouchMove.
   */
  const processPointerMove = (clientX: number, clientY: number, shiftKey = false) => {
    lastPointerClientRef.current = { clientX, clientY };
    isShiftPressedRef.current = shiftKey;
    const isPrecisionActive = Boolean(shiftKey || doc.precisionMode);
    const angleStepDeg = Math.max(
      1,
      Math.min(45, Math.round(doc.angleSnapIncrementDeg || 15))
    );

    const ptMm = clientToPageMm(clientX, clientY);
    onCursorMoveMm({ x: formatMm(ptMm.x, 1), y: formatMm(ptMm.y, 1) });

    const currentInteraction = interactionRef.current ?? interaction;
    if (!currentInteraction) return;

    if (currentInteraction.mode === 'panning') {
      // Never allow document panning if a ruler or guideline interaction is active
      if (isAdjustingGuideOrRulerRef.current) {
        setInteraction(null);
        return;
      }
      const dx = clientX - currentInteraction.startClientX;
      const dy = clientY - currentInteraction.startClientY;
      const dist = Math.hypot(dx, dy);
      onPanChange(currentInteraction.initialPanX + dx, currentInteraction.initialPanY + dy);
      if (dist > 4 && currentInteraction.movedDistancePx <= 4) {
        setInteraction({ ...currentInteraction, movedDistancePx: dist });
      }
      return;
    }

    if (currentInteraction.mode === 'dragging-guide') {
      const rawCoord =
        currentInteraction.orientation === 'vertical' ? ptMm.x : ptMm.y;
      const nextPosMm = isPrecisionActive
        ? Math.round(rawCoord)
        : formatMm(rawCoord, 1);
      setInteraction({
        ...currentInteraction,
        positionMm: nextPosMm,
      });
      const exists = page.guidelines.some((g) => g.id === currentInteraction.guideId);
      const updated = exists
        ? page.guidelines.map((g) =>
            g.id === currentInteraction.guideId ? { ...g, positionMm: nextPosMm } : g
          )
        : [
            ...page.guidelines,
            {
              id: currentInteraction.guideId,
              orientation: currentInteraction.orientation,
              positionMm: nextPosMm,
            },
          ];
      recordDragHistoryOnce();
      onUpdateGuidelines(updated, false);
      return;
    }

    if (currentInteraction.mode === 'moving-multi') {
      const dxMm = ptMm.x - currentInteraction.startMmX;
      const dyMm = ptMm.y - currentInteraction.startMmY;
      const excludedIds = currentInteraction.initialObjects.map((o) => o.id);
      const initialBounds = getCombinedBoundsMm(currentInteraction.initialObjects);
      const snapped = snapBoxPositionMm(
        initialBounds.xMm + dxMm,
        initialBounds.yMm + dyMm,
        initialBounds.widthMm,
        initialBounds.heightMm,
        excludedIds
      );
      setActiveSnapLines({
        verticalMm: snapped.verticalSnapMm,
        horizontalMm: snapped.horizontalSnapMm,
      });
      const actualDx = snapped.xMm - initialBounds.xMm;
      const actualDy = snapped.yMm - initialBounds.yMm;
      if (Math.abs(actualDx) < 0.01 && Math.abs(actualDy) < 0.01 && !currentInteraction.hasMoved) {
        return;
      }
      recordDragHistoryOnce();
      const movedList = currentInteraction.initialObjects.map((initObj) =>
        initObj.locked ? initObj : translatePageObjectMm(initObj, actualDx, actualDy)
      );
      onUpdateMultipleObjects(movedList, false);
      if (!currentInteraction.hasMoved) {
        setInteraction({ ...currentInteraction, hasMoved: true });
      }
      return;
    }

    if (currentInteraction.mode === 'moving-object') {
      const dxMm = ptMm.x - currentInteraction.startMmX;
      const dyMm = ptMm.y - currentInteraction.startMmY;
      const init = !currentInteraction.hasMoved
        ? page.objects.find((o) => o.id === currentInteraction.objectId) ??
          currentInteraction.initialObject
        : currentInteraction.initialObject;

      if (init.locked) return;
      if (Math.abs(dxMm) < 0.01 && Math.abs(dyMm) < 0.01 && !currentInteraction.hasMoved) {
        return;
      }

      recordDragHistoryOnce();

      if (init.type === 'line' || init.type === 'arrow' || init.type === 'dimension') {
        const initBounds = getObjectBoundsMm(init);
        const snapped = snapBoxPositionMm(
          initBounds.minX + dxMm,
          initBounds.minY + dyMm,
          initBounds.widthMm,
          initBounds.heightMm,
          [init.id]
        );
        setActiveSnapLines({
          verticalMm: snapped.verticalSnapMm,
          horizontalMm: snapped.horizontalSnapMm,
        });
        const actualDx = snapped.xMm - initBounds.minX;
        const actualDy = snapped.yMm - initBounds.minY;
        const nextObj = syncLinearBoundingBox({
          ...init,
          x1Mm: formatMm(init.x1Mm + actualDx, 2),
          y1Mm: formatMm(init.y1Mm + actualDy, 2),
          x2Mm: formatMm(init.x2Mm + actualDx, 2),
          y2Mm: formatMm(init.y2Mm + actualDy, 2),
        });
        onUpdateObject(nextObj, false);
      } else if (init.type === 'group' || init.type === 'freehand') {
        const snapped = snapBoxPositionMm(
          init.xMm + dxMm,
          init.yMm + dyMm,
          init.widthMm,
          init.heightMm,
          [init.id]
        );
        setActiveSnapLines({
          verticalMm: snapped.verticalSnapMm,
          horizontalMm: snapped.horizontalSnapMm,
        });
        const actualDx = snapped.xMm - init.xMm;
        const actualDy = snapped.yMm - init.yMm;
        onUpdateObject(translatePageObjectMm(init, actualDx, actualDy), false);
      } else {
        const snapped = snapBoxPositionMm(
          init.xMm + dxMm,
          init.yMm + dyMm,
          init.widthMm,
          init.heightMm,
          [init.id]
        );
        setActiveSnapLines({
          verticalMm: snapped.verticalSnapMm,
          horizontalMm: snapped.horizontalSnapMm,
        });
        onUpdateObject(
          {
            ...init,
            xMm: snapped.xMm,
            yMm: snapped.yMm,
          },
          false
        );
      }
      if (!currentInteraction.hasMoved) {
        setInteraction({
          ...currentInteraction,
          initialObject: init,
          hasMoved: true,
        });
      }
      return;
    }

    if (currentInteraction.mode === 'dragging-endpoint') {
      const init = currentInteraction.initialObject;
      if (init.locked) return;

      const anchorX = currentInteraction.endpoint === 'p1' ? init.x2Mm : init.x1Mm;
      const anchorY = currentInteraction.endpoint === 'p1' ? init.y2Mm : init.y1Mm;

      recordDragHistoryOnce();

      if (isPrecisionActive) {
        // Angle and 1 mm length constraints take strict precedence over magnetic position snapping
        setActiveSnapLines({ verticalMm: null, horizontalMm: null });
        const constrained = constrainLineEndpointByAngleMm(
          anchorX,
          anchorY,
          ptMm.x,
          ptMm.y,
          angleStepDeg
        );
        const updated =
          currentInteraction.endpoint === 'p1'
            ? syncLinearBoundingBox({
                ...init,
                x1Mm: constrained.xMm,
                y1Mm: constrained.yMm,
              })
            : syncLinearBoundingBox({
                ...init,
                x2Mm: constrained.xMm,
                y2Mm: constrained.yMm,
              });
        setInteraction({
          ...currentInteraction,
          anchorMmX: anchorX,
          anchorMmY: anchorY,
          currentMmX: constrained.xMm,
          currentMmY: constrained.yMm,
          constrainedLengthMm: constrained.lengthMm,
          constrainedAngleDeg: constrained.angleDeg,
        });
        onUpdateObject(updated, false);
        return;
      }

      const snapX = snapCoordinateMm(ptMm.x, 'x', [init.id]);
      const snapY = snapCoordinateMm(ptMm.y, 'y', [init.id]);
      setActiveSnapLines({
        verticalMm: snapX.snapLineMm,
        horizontalMm: snapY.snapLineMm,
      });

      const freeLengthMm = formatMm(
        getLineLengthMm(anchorX, anchorY, snapX.snappedMm, snapY.snappedMm),
        1
      );
      const freeAngleDeg =
        freeLengthMm > 0
          ? formatMm(
              ((((Math.atan2(snapY.snappedMm - anchorY, snapX.snappedMm - anchorX) * 180) /
                Math.PI) %
                360) +
                360) %
                360,
              1
            )
          : 0;

      const updated =
        currentInteraction.endpoint === 'p1'
          ? syncLinearBoundingBox({
              ...init,
              x1Mm: snapX.snappedMm,
              y1Mm: snapY.snappedMm,
            })
          : syncLinearBoundingBox({
              ...init,
              x2Mm: snapX.snappedMm,
              y2Mm: snapY.snappedMm,
            });
      setInteraction({
        ...currentInteraction,
        anchorMmX: anchorX,
        anchorMmY: anchorY,
        currentMmX: snapX.snappedMm,
        currentMmY: snapY.snappedMm,
        constrainedLengthMm: freeLengthMm,
        constrainedAngleDeg: freeAngleDeg,
      });
      onUpdateObject(updated, false);
      return;
    }

    if (currentInteraction.mode === 'rotating-object') {
      const init = currentInteraction.initialObject;
      if (init.locked) return;
      const angleRad = Math.atan2(
        ptMm.y - currentInteraction.centerMmY,
        ptMm.x - currentInteraction.centerMmX
      );
      let deg = (angleRad * 180) / Math.PI + 90;
      deg = ((deg % 360) + 360) % 360;
      if (isPrecisionActive) {
        deg = (Math.round(deg / angleStepDeg) * angleStepDeg) % 360;
      } else {
        deg = Math.round(deg) % 360;
      }
      recordDragHistoryOnce();
      if (init.type === 'group') {
        onUpdateObject(rotateGroupObjectMm(init, deg), false);
      } else {
        onUpdateObject({ ...init, rotationDeg: deg }, false);
      }
      return;
    }

    if (currentInteraction.mode === 'resizing-object') {
      const init = currentInteraction.initialObject;
      if (init.locked) return;

      const dxMm = ptMm.x - currentInteraction.startMmX;
      const dyMm = ptMm.y - currentInteraction.startMmY;
      const h = currentInteraction.handle;

      let newX = init.xMm;
      let newY = init.yMm;
      let newW = init.widthMm;
      let newH = init.heightMm;

      let vSnap: number | null = null;
      let hSnap: number | null = null;

      if (h.includes('e')) {
        const rightEdge = snapCoordinateMm(init.xMm + init.widthMm + dxMm, 'x', [init.id]);
        newW = Math.max(2, rightEdge.snappedMm - init.xMm);
        vSnap = rightEdge.snapLineMm;
      }
      if (h.includes('s')) {
        const bottomEdge = snapCoordinateMm(init.yMm + init.heightMm + dyMm, 'y', [init.id]);
        newH = Math.max(2, bottomEdge.snappedMm - init.yMm);
        hSnap = bottomEdge.snapLineMm;
      }
      if (h.includes('w')) {
        const leftEdge = snapCoordinateMm(init.xMm + dxMm, 'x', [init.id]);
        const maxLeft = init.xMm + init.widthMm - 2;
        newX = Math.min(maxLeft, leftEdge.snappedMm);
        newW = init.xMm + init.widthMm - newX;
        vSnap = leftEdge.snapLineMm;
      }
      if (h.includes('n')) {
        const topEdge = snapCoordinateMm(init.yMm + dyMm, 'y', [init.id]);
        const maxTop = init.yMm + init.heightMm - 2;
        newY = Math.min(maxTop, topEdge.snappedMm);
        newH = init.yMm + init.heightMm - newY;
        hSnap = topEdge.snapLineMm;
      }

      setActiveSnapLines({
        verticalMm: vSnap,
        horizontalMm: hSnap,
      });

      const lockRatio =
        (init.type === 'image' && init.preserveAspectRatio) ||
        init.type === 'square' ||
        init.type === 'circle' ||
        shiftKey;

      const isCorner = h === 'nw' || h === 'ne' || h === 'se' || h === 'sw';
      if (lockRatio && (isCorner || init.type === 'square' || init.type === 'circle')) {
        const aspect = init.widthMm / Math.max(0.1, init.heightMm);
        newH = newW / aspect;
        if (h.includes('n')) {
          newY = init.yMm + init.heightMm - newH;
        }
      }

      recordDragHistoryOnce();
      if (init.type === 'group') {
        onUpdateObject(
          resizeGroupObjectMm(
            init,
            formatMm(newX, 2),
            formatMm(newY, 2),
            formatMm(newW, 2),
            formatMm(newH, 2)
          ),
          false
        );
      } else if (init.type === 'freehand') {
        onUpdateObject(
          resizeFreehandStrokeMm(
            init,
            formatMm(newX, 2),
            formatMm(newY, 2),
            formatMm(newW, 2),
            formatMm(newH, 2)
          ),
          false
        );
      } else {
        onUpdateObject(
          {
            ...init,
            xMm: formatMm(newX, 2),
            yMm: formatMm(newY, 2),
            widthMm: formatMm(newW, 2),
            heightMm: formatMm(newH, 2),
          },
          false
        );
      }
      return;
    }

    if (currentInteraction.mode === 'cropping-image') {
      const init = currentInteraction.initialObject;
      const dxMm = ptMm.x - currentInteraction.startMmX;
      const dyMm = ptMm.y - currentInteraction.startMmY;
      const h = currentInteraction.handle;

      const fullW = init.widthMm / Math.max(0.01, init.crop.width);
      const fullH = init.heightMm / Math.max(0.01, init.crop.height);
      const fullOriginX = init.xMm - init.crop.x * fullW;
      const fullOriginY = init.yMm - init.crop.y * fullH;

      let nextX = init.xMm;
      let nextY = init.yMm;
      let nextW = init.widthMm;
      let nextH = init.heightMm;

      if (h.includes('e')) {
        nextW = Math.min(fullOriginX + fullW - init.xMm, Math.max(5, init.widthMm + dxMm));
      }
      if (h.includes('s')) {
        nextH = Math.min(fullOriginY + fullH - init.yMm, Math.max(5, init.heightMm + dyMm));
      }
      if (h.includes('w')) {
        const candidateX = Math.max(
          fullOriginX,
          Math.min(init.xMm + init.widthMm - 5, init.xMm + dxMm)
        );
        nextW = init.xMm + init.widthMm - candidateX;
        nextX = candidateX;
      }
      if (h.includes('n')) {
        const candidateY = Math.max(
          fullOriginY,
          Math.min(init.yMm + init.heightMm - 5, init.yMm + dyMm)
        );
        nextH = init.yMm + init.heightMm - candidateY;
        nextY = candidateY;
      }

      const nextCrop = {
        x: Math.max(0, Math.min(0.95, (nextX - fullOriginX) / fullW)),
        y: Math.max(0, Math.min(0.95, (nextY - fullOriginY) / fullH)),
        width: Math.max(0.05, Math.min(1, nextW / fullW)),
        height: Math.max(0.05, Math.min(1, nextH / fullH)),
      };

      recordDragHistoryOnce();
      onUpdateObject(
        {
          ...init,
          xMm: formatMm(nextX, 2),
          yMm: formatMm(nextY, 2),
          widthMm: formatMm(nextW, 2),
          heightMm: formatMm(nextH, 2),
          crop: nextCrop,
        },
        false
      );
      return;
    }

    if (currentInteraction.mode === 'creating-object') {
      const isLinearTool =
        currentInteraction.tool === 'line' ||
        currentInteraction.tool === 'arrow' ||
        currentInteraction.tool === 'dimension';

      if (isLinearTool && isPrecisionActive) {
        // Snap start point to nearest whole 1 mm, snap length to 1 mm, and snap angle to configured increment
        setActiveSnapLines({ verticalMm: null, horizontalMm: null });
        const snappedStartX = Math.round(currentInteraction.rawStartMmX);
        const snappedStartY = Math.round(currentInteraction.rawStartMmY);
        const constrained = constrainLineEndpointByAngleMm(
          snappedStartX,
          snappedStartY,
          ptMm.x,
          ptMm.y,
          angleStepDeg
        );
        setInteraction({
          ...currentInteraction,
          startMmX: snappedStartX,
          startMmY: snappedStartY,
          currentMmX: constrained.xMm,
          currentMmY: constrained.yMm,
          constrainedLengthMm: constrained.lengthMm,
          constrainedAngleDeg: constrained.angleDeg,
        });
        return;
      }

      const activeStartX = currentInteraction.rawStartMmX;
      const activeStartY = currentInteraction.rawStartMmY;
      const snapX = snapCoordinateMm(ptMm.x, 'x');
      const snapY = snapCoordinateMm(ptMm.y, 'y');
      setActiveSnapLines({
        verticalMm: snapX.snapLineMm,
        horizontalMm: snapY.snapLineMm,
      });

      const freeLengthMm = isLinearTool
        ? formatMm(
            getLineLengthMm(activeStartX, activeStartY, snapX.snappedMm, snapY.snappedMm),
            1
          )
        : 0;
      const freeAngleDeg =
        isLinearTool && freeLengthMm > 0
          ? formatMm(
              ((((Math.atan2(
                snapY.snappedMm - activeStartY,
                snapX.snappedMm - activeStartX
              ) *
                180) /
                Math.PI) %
                360) +
                360) %
                360,
              1
            )
          : 0;

      setInteraction({
        ...currentInteraction,
        startMmX: activeStartX,
        startMmY: activeStartY,
        currentMmX: snapX.snappedMm,
        currentMmY: snapY.snappedMm,
        constrainedLengthMm: freeLengthMm,
        constrainedAngleDeg: freeAngleDeg,
      });
      return;
    }

    if (currentInteraction.mode === 'drawing-freehand') {
      const pts = currentInteraction.pointsMm;
      const lastPt = pts[pts.length - 1];
      const nextX = formatMm(ptMm.x, 2);
      const nextY = formatMm(ptMm.y, 2);
      const minStepMm = Math.min(0.4, 1.5 / Math.max(0.05, screenPxPerMm));
      if (!lastPt || Math.hypot(nextX - lastPt.xMm, nextY - lastPt.yMm) >= minStepMm) {
        setInteraction({
          ...currentInteraction,
          pointsMm: [...pts, { xMm: nextX, yMm: nextY }],
        });
      }
      return;
    }

    if (currentInteraction.mode === 'erasing-freehand') {
      eraseFreehandStrokeAtMm(ptMm.x, ptMm.y);
      return;
    }
  };
  processPointerMoveRef.current = processPointerMove;

  /**
   * Calculates the new zoom scale and focal-point pan offset from two active touch/pointer points.
   */
  const updatePinchZoomFromTwoPoints = (
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ) => {
    let current = interactionRef.current;
    if (current?.mode !== 'pinch-zoom') {
      startPinchAndTwoFingerPan(x1, y1, x2, y2);
      current = interactionRef.current;
      if (current?.mode !== 'pinch-zoom') return;
    }

    const dist = Math.max(10, Math.hypot(x2 - x1, y2 - y1));
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;

    const scaleRatio = dist / current.initialDistance;
    const nextZoom = Number(
      Math.min(4.0, Math.max(0.04, current.initialZoom * scaleRatio)).toFixed(4)
    );

    const rect = workspaceRef.current?.getBoundingClientRect();
    if (rect) {
      const initLocalX = current.initialCenterClientX - rect.left - RULER_THICKNESS_PX;
      const initLocalY = current.initialCenterClientY - rect.top - RULER_THICKNESS_PX;
      const currLocalX = centerX - rect.left - RULER_THICKNESS_PX;
      const currLocalY = centerY - rect.top - RULER_THICKNESS_PX;

      const docX = (initLocalX - current.initialPanX) / current.initialZoom;
      const docY = (initLocalY - current.initialPanY) / current.initialZoom;

      onZoomChangeRef.current(nextZoom);
      onPanChangeRef.current(
        Math.round(currLocalX - docX * nextZoom),
        Math.round(currLocalY - docY * nextZoom)
      );
    } else {
      onZoomChangeRef.current(nextZoom);
    }
  };

  const handleWorkspacePointerMove = (e: React.PointerEvent) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, {
        clientX: e.clientX,
        clientY: e.clientY,
      });
    }

    if (
      activePointersRef.current.size >= 2 &&
      !isAdjustingGuideOrRulerRef.current &&
      interactionRef.current?.mode !== 'dragging-guide'
    ) {
      const pts = Array.from(activePointersRef.current.values());
      updatePinchZoomFromTwoPoints(
        pts[0].clientX,
        pts[0].clientY,
        pts[1].clientX,
        pts[1].clientY
      );
      return;
    }

    if (isTouchPinchingRef.current && e.pointerType === 'touch') {
      return;
    }

    processPointerMove(e.clientX, e.clientY, e.shiftKey);
  };

  const handleWorkspacePointerUp = (e: React.PointerEvent) => {
    activePointersRef.current.delete(e.pointerId);
    try {
      if (workspaceRef.current?.hasPointerCapture(e.pointerId)) {
        workspaceRef.current.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore release errors
    }

    if (activePointersRef.current.size < 2) {
      isTouchPinchingRef.current = false;
    }

    if (interactionRef.current?.mode === 'pinch-zoom' && activePointersRef.current.size === 1) {
      const remaining = Array.from(activePointersRef.current.values())[0];
      setInteraction({
        mode: 'panning',
        startClientX: remaining.clientX,
        startClientY: remaining.clientY,
        initialPanX: panXRef.current,
        initialPanY: panYRef.current,
        movedDistancePx: 10,
        clearSelectionOnTap: false,
      });
      return;
    }

    if (activePointersRef.current.size === 0 && !isTouchPinchingRef.current) {
      finishWorkspaceInteraction();
    }
  };

  /**
   * Cancels an interrupted pointer or touch sequence cleanly without committing an incomplete freehand stroke.
   */
  const handleWorkspacePointerCancel = (e: React.PointerEvent) => {
    activePointersRef.current.delete(e.pointerId);
    try {
      if (workspaceRef.current?.hasPointerCapture(e.pointerId)) {
        workspaceRef.current.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore release errors
    }
    if (activePointersRef.current.size < 2) {
      isTouchPinchingRef.current = false;
    }
    if (
      interactionRef.current?.mode === 'drawing-freehand' ||
      interactionRef.current?.mode === 'erasing-freehand'
    ) {
      setInteraction(null);
      return;
    }
    if (activePointersRef.current.size === 0 && !isTouchPinchingRef.current) {
      finishWorkspaceInteraction();
    }
  };

  const handleWorkspaceMouseMove = (e: React.MouseEvent) => {
    processPointerMove(e.clientX, e.clientY, e.shiftKey);
  };

  /**
   * TouchMove on workspace: handles simultaneous two-finger panning & pinch-to-zoom,
   * automatically upgrading to 'pinch-zoom' if a second finger joined mid-gesture.
   */
  const handleWorkspaceTouchMove = (e: React.TouchEvent) => {
    if (
      e.touches.length >= 2 &&
      !isAdjustingGuideOrRulerRef.current &&
      interactionRef.current?.mode !== 'dragging-guide'
    ) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      updatePinchZoomFromTwoPoints(t1.clientX, t1.clientY, t2.clientX, t2.clientY);
      return;
    }

    if (e.touches.length === 1 && !isTouchPinchingRef.current) {
      const t = e.touches[0];
      processPointerMove(t.clientX, t.clientY, isShiftPressedRef.current);
    }
  };

  /**
   * TouchEnd / TouchCancel handler:
   * If the user lifts one finger from a 2-finger pinch/pan gesture (leaving 1 finger on the screen),
   * seamlessly transitions into 1-finger panning from that finger's current position without jumping.
   */
  const handleWorkspaceTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      isTouchPinchingRef.current = false;
    }

    if (interactionRef.current?.mode === 'pinch-zoom' && e.touches.length === 1) {
      const remainingTouch = e.touches[0];
      setInteraction({
        mode: 'panning',
        startClientX: remainingTouch.clientX,
        startClientY: remainingTouch.clientY,
        initialPanX: panXRef.current,
        initialPanY: panYRef.current,
        movedDistancePx: 10,
        clearSelectionOnTap: false,
      });
      return;
    }

    if (e.touches.length === 0) {
      activePointersRef.current.clear();
      finishWorkspaceInteraction();
    }
  };

  const handleWorkspaceTouchCancel = () => {
    isTouchPinchingRef.current = false;
    isAdjustingGuideOrRulerRef.current = false;
    activePointersRef.current.clear();
    if (
      interactionRef.current?.mode === 'drawing-freehand' ||
      interactionRef.current?.mode === 'erasing-freehand'
    ) {
      setInteraction(null);
      return;
    }
    finishWorkspaceInteraction();
  };

  /**
   * Computes canonical millimetre bounding box (xMm, yMm, widthMm, heightMm) for box-based
   * creation tools (`rectangle`, `square`, `ellipse`, `circle`, `triangle`, `highlight`, `text`).
   * Shared between the live WYSIWYG drag preview and final object creation on pointer release
   * so the previewed shape and created object have identical position and dimensions in all 4 drag quadrants.
   */
  const computeBoxCreationGeometryMm = (
    tool: Exclude<
      ToolType,
      'select' | 'pan' | 'pen' | 'freehand-highlighter' | 'eraser'
    >,
    startMmX: number,
    startMmY: number,
    currentMmX: number,
    currentMmY: number,
    applyClickDefault = false
  ): { xMm: number; yMm: number; widthMm: number; heightMm: number } => {
    const sheetScale = Math.max(0.35, doc.widthMm / 1189);
    const draggedW = Math.abs(currentMmX - startMmX);
    const draggedH = Math.abs(currentMmY - startMmY);
    const isTinyClick = draggedW < 5 && draggedH < 5;

    if (applyClickDefault && isTinyClick) {
      if (tool === 'text') {
        return {
          xMm: formatMm(Math.min(startMmX, currentMmX), 1),
          yMm: formatMm(Math.min(startMmY, currentMmY), 1),
          widthMm: formatMm(Math.round(180 * sheetScale), 1),
          heightMm: formatMm(Math.round(42 * sheetScale), 1),
        };
      }
      const defaultW = Math.round(120 * sheetScale);
      const defaultH =
        tool === 'square' || tool === 'circle'
          ? defaultW
          : Math.round(80 * sheetScale);
      return {
        xMm: formatMm(Math.min(startMmX, currentMmX), 1),
        yMm: formatMm(Math.min(startMmY, currentMmY), 1),
        widthMm: formatMm(defaultW, 1),
        heightMm: formatMm(defaultH, 1),
      };
    }

    if (tool === 'square' || tool === 'circle') {
      const sideMm = Math.max(draggedW, draggedH);
      const xMm = currentMmX < startMmX ? startMmX - sideMm : startMmX;
      const yMm = currentMmY < startMmY ? startMmY - sideMm : startMmY;
      return {
        xMm: formatMm(xMm, 1),
        yMm: formatMm(yMm, 1),
        widthMm: formatMm(sideMm, 1),
        heightMm: formatMm(sideMm, 1),
      };
    }

    return {
      xMm: formatMm(Math.min(startMmX, currentMmX), 1),
      yMm: formatMm(Math.min(startMmY, currentMmY), 1),
      widthMm: formatMm(draggedW, 1),
      heightMm: formatMm(draggedH, 1),
    };
  };

  /**
   * Finishes any active mouse or touch interaction and records history if appropriate.
   */
  const finishWorkspaceInteraction = () => {
    isAdjustingGuideOrRulerRef.current = false;
    setActiveSnapLines({ verticalMm: null, horizontalMm: null });

    const currentInteraction = interactionRef.current ?? interaction;
    if (!currentInteraction) return;

    if (currentInteraction.mode === 'panning') {
      if (currentInteraction.clearSelectionOnTap && currentInteraction.movedDistancePx <= 4) {
        onSelectObject(null);
        onSelectGuide(null);
      }
      setInteraction(null);
      return;
    }

    if (currentInteraction.mode === 'pinch-zoom') {
      setInteraction(null);
      return;
    }

    if (currentInteraction.mode === 'dragging-guide') {
      const posMm = currentInteraction.positionMm;
      const isOutOfBounds =
        currentInteraction.orientation === 'vertical'
          ? posMm < 0 || posMm > doc.widthMm
          : posMm < 0 || posMm > doc.heightMm;
      if (isOutOfBounds) {
        recordDragHistoryOnce();
        onUpdateGuidelines(
          page.guidelines.filter((item) => item.id !== currentInteraction.guideId),
          false
        );
      } else if (hasRecordedDragHistoryRef.current) {
        const exists = page.guidelines.some((g) => g.id === currentInteraction.guideId);
        const finalGuides = exists
          ? page.guidelines.map((g) =>
              g.id === currentInteraction.guideId ? { ...g, positionMm: posMm } : g
            )
          : [
              ...page.guidelines,
              {
                id: currentInteraction.guideId,
                orientation: currentInteraction.orientation,
                positionMm: posMm,
              },
            ];
        onUpdateGuidelines(finalGuides, false);
      }
      setInteraction(null);
      return;
    }

    if (
      currentInteraction.mode === 'moving-multi' ||
      currentInteraction.mode === 'moving-object' ||
      currentInteraction.mode === 'resizing-object' ||
      currentInteraction.mode === 'rotating-object' ||
      currentInteraction.mode === 'dragging-endpoint' ||
      currentInteraction.mode === 'cropping-image' ||
      currentInteraction.mode === 'erasing-freehand'
    ) {
      // Pre-drag history snapshot was already recorded on the first move frame via recordDragHistoryOnce()
      // and live coordinates were committed during processPointerMove.
      setInteraction(null);
      return;
    }

    if (currentInteraction.mode === 'drawing-freehand') {
      const { strokeTool, pointsMm, strokeColor, strokeWidthMm, opacity } =
        currentInteraction;
      setInteraction(null);

      if (pointsMm.length === 0) return;

      const normalizedPoints =
        pointsMm.length === 1
          ? [
              pointsMm[0],
              {
                xMm: formatMm(pointsMm[0].xMm + 0.1, 2),
                yMm: pointsMm[0].yMm,
              },
            ]
          : pointsMm;

      const strokeObj: FreehandStrokeObject = syncFreehandBoundingBox({
        id: generateId(strokeTool === 'highlighter' ? 'highlighter' : 'pen'),
        type: 'freehand',
        strokeTool,
        name: strokeTool === 'highlighter' ? 'Highlighter Stroke' : 'Pen Stroke',
        xMm: 0,
        yMm: 0,
        widthMm: 1,
        heightMm: 1,
        rotationDeg: 0,
        opacity,
        strokeColor,
        strokeWidthMm,
        pointsMm: normalizedPoints,
      });

      // Keep the Pen or Freehand Highlighter tool active and do not clutter with selection handles while drawing
      onAddObject(strokeObj, false, false);
      return;
    }

    if (currentInteraction.mode === 'creating-object') {
      const { tool, startMmX, startMmY, currentMmX, currentMmY } = currentInteraction;
      setInteraction(null);

      const sheetScale = Math.max(0.35, doc.widthMm / 1189);
      const isPrecisionActive = Boolean(isShiftPressedRef.current || doc.precisionMode);

      if (tool === 'line' || tool === 'arrow' || tool === 'dimension') {
        const dist = getLineLengthMm(startMmX, startMmY, currentMmX, currentMmY);
        const minDragThresholdMm = isPrecisionActive ? 1 : 3;
        const finalStartX = isPrecisionActive ? Math.round(startMmX) : startMmX;
        const finalStartY = isPrecisionActive ? Math.round(startMmY) : startMmY;
        const defaultLenMm = isPrecisionActive
          ? Math.round(120 * sheetScale)
          : formatMm(120 * sheetScale, 1);
        const endX =
          dist < minDragThresholdMm ? finalStartX + defaultLenMm : currentMmX;
        const endY = dist < minDragThresholdMm ? finalStartY : currentMmY;

        if (tool === 'line') {
          const lineObj: LineObject = syncLinearBoundingBox({
            id: generateId('line'),
            type: 'line',
            name: 'Line',
            xMm: 0,
            yMm: 0,
            widthMm: 0,
            heightMm: 0,
            x1Mm: finalStartX,
            y1Mm: finalStartY,
            x2Mm: endX,
            y2Mm: endY,
            rotationDeg: 0,
            opacity: 1,
            strokeColor: '#0F172A',
            strokeWidthMm: Number((1.5 * sheetScale).toFixed(1)),
            lineStyle: 'solid',
          });
          onAddObject(lineObj);
        } else if (tool === 'arrow') {
          const arrowObj: ArrowObject = syncLinearBoundingBox({
            id: generateId('arrow'),
            type: 'arrow',
            name: 'Arrow',
            xMm: 0,
            yMm: 0,
            widthMm: 0,
            heightMm: 0,
            x1Mm: finalStartX,
            y1Mm: finalStartY,
            x2Mm: endX,
            y2Mm: endY,
            rotationDeg: 0,
            opacity: 1,
            strokeColor: '#DC2626',
            strokeWidthMm: Number((2.0 * sheetScale).toFixed(1)),
            lineStyle: 'solid',
            arrowEnds: 'end',
            headSizeMm: Math.round(9 * sheetScale),
          });
          onAddObject(arrowObj);
        } else {
          const dimObj: DimensionObject = syncLinearBoundingBox({
            id: generateId('dimension'),
            type: 'dimension',
            name: 'Dimension',
            xMm: 0,
            yMm: 0,
            widthMm: 0,
            heightMm: 0,
            x1Mm: finalStartX,
            y1Mm: finalStartY,
            x2Mm: endX,
            y2Mm: endY,
            rotationDeg: 0,
            opacity: 1,
            strokeColor: '#DC2626',
            strokeWidthMm: Number((1.5 * sheetScale).toFixed(1)),
            headSizeMm: Math.round(7 * sheetScale),
            customLabel: '',
            fontSizePt: Math.round(24 * sheetScale),
            extensionHeightMm: Math.round(12 * sheetScale),
          });
          onAddObject(dimObj);
        }
        onSelectTool('select');
        return;
      }

      const box = computeBoxCreationGeometryMm(
        tool,
        startMmX,
        startMmY,
        currentMmX,
        currentMmY,
        true
      );

      if (tool === 'text') {
        const textObj: TextObject = {
          id: generateId('text'),
          type: 'text',
          name: 'Text Box',
          xMm: box.xMm,
          yMm: box.yMm,
          widthMm: box.widthMm,
          heightMm: box.heightMm,
          rotationDeg: 0,
          opacity: 1,
          text: 'POWER',
          fontFamily: 'Helvetica',
          fontSizePt: Math.max(14, Math.round(32 * sheetScale)),
          fontWeight: 'bold',
          fontStyle: 'normal',
          underline: false,
          color: '#DC2626',
          align: 'left',
          fillColor: 'transparent',
          strokeColor: 'transparent',
          strokeWidthMm: 0,
          paddingMm: 2,
        };
        onAddObject(textObj, true);
        onSelectTool('select');
        return;
      }

      if (tool === 'highlight') {
        const preset = HIGHLIGHT_PRESETS.find((p) => p.color === activeHighlightColor);
        const hlObj: ShapeObject = {
          id: generateId('highlight'),
          type: 'highlight',
          name: 'Highlight',
          xMm: box.xMm,
          yMm: box.yMm,
          widthMm: box.widthMm,
          heightMm: box.heightMm,
          rotationDeg: 0,
          opacity: preset ? preset.opacity : 0.35,
          fillColor: activeHighlightColor || '#FACC15',
          strokeColor: 'transparent',
          strokeWidthMm: 0,
          lineStyle: 'solid',
        };
        onAddObject(hlObj);
      } else {
        const shapeObj: ShapeObject = {
          id: generateId(tool),
          type: tool,
          name: tool.charAt(0).toUpperCase() + tool.slice(1),
          xMm: box.xMm,
          yMm: box.yMm,
          widthMm: box.widthMm,
          heightMm: box.heightMm,
          rotationDeg: 0,
          opacity: 1,
          fillColor: '#E0F2FE',
          strokeColor: '#0284C7',
          strokeWidthMm: Number((1.2 * sheetScale).toFixed(1)),
          lineStyle: 'solid',
        };
        onAddObject(shapeObj);
      }
      onSelectTool('select');
      return;
    }

    setInteraction(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    // When Ctrl is pressed (including Ctrl + Wheel and Ctrl + Shift + Wheel),
    // allow the browser's normal page/tab zoom without intercepting or preventing it.
    if (e.ctrlKey) {
      return;
    }

    // Only handle canvas navigation when the pointer event originates inside the workspace
    const targetEl = e.target as HTMLElement | null;
    if (
      !workspaceRef.current ||
      (targetEl && !workspaceRef.current.contains(targetEl)) ||
      targetEl?.closest(
        '[data-sidebar="true"], [role="dialog"], [role="menu"], [data-allow-touch-scroll="true"]'
      )
    ) {
      return;
    }

    // Shift + Wheel: Zoom PageLay's canvas in/out, centred around the mouse pointer.
    // Note: On Windows/macOS, holding Shift while turning a vertical mouse wheel may report the delta in deltaY or deltaX.
    if (e.shiftKey) {
      const zoomDelta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
      if (zoomDelta === 0) return;
      e.preventDefault();
      const factor = zoomDelta < 0 ? 1.12 : 0.89;
      const nextZoom = Math.min(4.0, Math.max(0.05, zoom * factor));
      onZoomChange(nextZoom, e.clientX, e.clientY);
      return;
    }

    // Alt + Wheel: Pan horizontally across the canvas.
    if (e.altKey) {
      const horizontalDelta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
      if (horizontalDelta === 0) return;
      e.preventDefault();
      onPanChange(panX - horizontalDelta, panY);
      return;
    }

    // Wheel alone (or 2D trackpad scroll): Pan vertically while keeping horizontal trackpad movement working.
    if (e.deltaX !== 0 || e.deltaY !== 0) {
      onPanChange(panX - e.deltaX, panY - e.deltaY);
    }
  };

  /**
   * Renders a single object inside the 100%-canonical-scale page layer.
   * Because the parent page container applies `transform: scale(zoom)`,
   * all internal layout is computed at `basePxPerMm` (100% scale), preventing
   * mobile browser minimum-font-size clamping and subpixel text distortion!
   */
  const renderObjectOnPage = (
    obj: PageObject,
    isInsideGroup = false
  ): React.ReactNode => {
    const isSelected =
      !isInsideGroup && (obj.id === selectedObjectId || selectedObjectIds.includes(obj.id));
    const isPrimarySelected =
      !isInsideGroup && obj.id === selectedObjectId && selectedObjectIds.length <= 1;
    const isCropping = !isInsideGroup && obj.type === 'image' && obj.id === croppingImageId;
    const isEditingText = !isInsideGroup && obj.type === 'text' && obj.id === editingTextId;

    // Handle size in 100%-page coordinates so it appears a constant 12px on screen
    const handleSizePagePx = Math.max(10, 12 * invZoom);
    const halfHandlePagePx = handleSizePagePx / 2;
    const borderRingPagePx = Math.max(1.5, 2 * invZoom);

    const startObjectSelectionAndMove = (
      clientX: number,
      clientY: number,
      isAdditiveModifier = false
    ) => {
      blurExternalInputIfFocused();
      if (isAdditiveModifier) {
        onSelectObject(obj.id, true);
        return;
      }

      if (selectedObjectIds.length >= 2 && selectedObjectIds.includes(obj.id)) {
        const ptMm = clientToPageMm(clientX, clientY);
        const selectedList = page.objects.filter((item) =>
          selectedObjectIds.includes(item.id)
        );
        setInteraction({
          mode: 'moving-multi',
          startMmX: ptMm.x,
          startMmY: ptMm.y,
          initialObjects: selectedList,
          hasMoved: false,
        });
        return;
      }

      onSelectObject(obj.id, false);
      if (isEditingText || isCropping) return;
      const ptMm = clientToPageMm(clientX, clientY);
      setInteraction({
        mode: 'moving-object',
        objectId: obj.id,
        startMmX: ptMm.x,
        startMmY: ptMm.y,
        initialObject: obj,
        hasMoved: false,
      });
    };

    // Group Object: Renders all grouped children in canonical page coordinates + synchronized bounding box
    if (obj.type === 'group') {
      const leftPx = obj.xMm * basePxPerMm;
      const topPx = obj.yMm * basePxPerMm;
      const widthPx = obj.widthMm * basePxPerMm;
      const heightPx = obj.heightMm * basePxPerMm;

      return (
        <React.Fragment key={obj.id}>
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ opacity: obj.opacity }}
          >
            {obj.children.map((child) => renderObjectOnPage(child, true))}
          </div>

          {!isInsideGroup && (
            <div
              onContextMenu={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  e.preventDefault();
                }
              }}
              onPointerDown={(e) => {
                const isMacCtrlClick =
                  e.pointerType === 'mouse' && e.ctrlKey && e.button === 2;
                if (
                  (e.pointerType === 'mouse' && e.button !== 0 && !isMacCtrlClick) ||
                  (e.pointerType === 'touch' && !e.isPrimary) ||
                  activePointersRef.current.size >= 2 ||
                  isTouchPinchingRef.current ||
                  activeTool !== 'select'
                ) {
                  return;
                }
                e.stopPropagation();
                lastObjectPointerDownTimeRef.current = performance.now();
                startObjectSelectionAndMove(
                  e.clientX,
                  e.clientY,
                  e.ctrlKey || e.metaKey || e.shiftKey
                );
              }}
              onMouseDown={(e) => {
                const isMacCtrlClick = e.ctrlKey && e.button === 2;
                if ((e.button !== 0 && !isMacCtrlClick) || activeTool !== 'select') return;
                e.stopPropagation();
                if (
                  interactionRef.current !== null ||
                  performance.now() - lastObjectPointerDownTimeRef.current < 150
                ) {
                  return;
                }
                startObjectSelectionAndMove(
                  e.clientX,
                  e.clientY,
                  e.ctrlKey || e.metaKey || e.shiftKey
                );
              }}
              onTouchStart={(e) => {
                if (
                  e.touches.length !== 1 ||
                  isTouchPinchingRef.current ||
                  activeTool !== 'select'
                ) {
                  return;
                }
                e.stopPropagation();
                if (interactionRef.current !== null) return;
                startObjectSelectionAndMove(
                  e.touches[0].clientX,
                  e.touches[0].clientY,
                  false
                );
              }}
              className={`absolute select-none ${
                activeTool === 'select' ? 'cursor-move' : 'pointer-events-none'
              }`}
              style={{
                left: leftPx,
                top: topPx,
                width: widthPx,
                height: heightPx,
                outline: isSelected
                  ? `${borderRingPagePx}px solid ${obj.locked ? '#F59E0B' : '#7C3AED'}`
                  : undefined,
              }}
            >
              {isPrimarySelected && (
                <div className="absolute inset-0 pointer-events-none">
                  {/* Floating Group Badge & Quick Ungroup Action */}
                  <div
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    className="absolute left-1/2 bg-violet-950 text-white rounded-lg shadow-lg px-2.5 py-1 flex items-center gap-2 pointer-events-auto whitespace-nowrap z-40 text-xs"
                    style={{
                      top: -38 * invZoom,
                      transform: `translateX(-50%) scale(${invZoom})`,
                      transformOrigin: 'bottom center',
                    }}
                  >
                    <Group className="w-3.5 h-3.5 text-violet-300" />
                    <span className="font-medium text-violet-200">
                      Group ({obj.children.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => onUngroupSelected(obj.id)}
                      className="px-2 py-0.5 bg-violet-600 hover:bg-violet-500 rounded font-medium flex items-center gap-1"
                    >
                      <Ungroup className="w-3 h-3" />
                      <span>Ungroup</span>
                    </button>
                  </div>

                  {/* Group Rotation Handle */}
                  {!obj.locked && (
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setInteraction({
                          mode: 'rotating-object',
                          objectId: obj.id,
                          centerMmX: obj.xMm + obj.widthMm / 2,
                          centerMmY: obj.yMm + obj.heightMm / 2,
                          initialObject: obj,
                        });
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        if (interactionRef.current !== null) return;
                        setInteraction({
                          mode: 'rotating-object',
                          objectId: obj.id,
                          centerMmX: obj.xMm + obj.widthMm / 2,
                          centerMmY: obj.yMm + obj.heightMm / 2,
                          initialObject: obj,
                        });
                      }}
                      onTouchStart={(e) => {
                        if (e.touches.length !== 1) return;
                        e.stopPropagation();
                        if (interactionRef.current !== null) return;
                        setInteraction({
                          mode: 'rotating-object',
                          objectId: obj.id,
                          centerMmX: obj.xMm + obj.widthMm / 2,
                          centerMmY: obj.yMm + obj.heightMm / 2,
                          initialObject: obj,
                        });
                      }}
                      className="absolute left-1/2 bg-white rounded-full cursor-rotate-handle pointer-events-auto shadow-sm"
                      style={{
                        top: -22 * invZoom,
                        marginLeft: -halfHandlePagePx,
                        width: handleSizePagePx,
                        height: handleSizePagePx,
                        border: `${borderRingPagePx}px solid #7C3AED`,
                      }}
                      title="Drag to rotate entire group"
                    />
                  )}

                  {/* 8 Group Resize Handles */}
                  {!obj.locked &&
                    (
                      [
                        { id: 'nw', x: 0, y: 0, cursor: 'cursor-nwse-resize' },
                        { id: 'n', x: 0.5, y: 0, cursor: 'cursor-ns-resize' },
                        { id: 'ne', x: 1, y: 0, cursor: 'cursor-nesw-resize' },
                        { id: 'e', x: 1, y: 0.5, cursor: 'cursor-ew-resize' },
                        { id: 'se', x: 1, y: 1, cursor: 'cursor-nwse-resize' },
                        { id: 's', x: 0.5, y: 1, cursor: 'cursor-ns-resize' },
                        { id: 'sw', x: 0, y: 1, cursor: 'cursor-nesw-resize' },
                        { id: 'w', x: 0, y: 0.5, cursor: 'cursor-ew-resize' },
                      ] as const
                    ).map((h) => {
                      const startGroupResize = (clientX: number, clientY: number) => {
                        const ptMm = clientToPageMm(clientX, clientY);
                        setInteraction({
                          mode: 'resizing-object',
                          objectId: obj.id,
                          handle: h.id,
                          startMmX: ptMm.x,
                          startMmY: ptMm.y,
                          initialObject: obj,
                        });
                      };

                      return (
                        <div
                          key={h.id}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            startGroupResize(e.clientX, e.clientY);
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            if (interactionRef.current !== null) return;
                            startGroupResize(e.clientX, e.clientY);
                          }}
                          onTouchStart={(e) => {
                            if (e.touches.length !== 1) return;
                            e.stopPropagation();
                            if (interactionRef.current !== null) return;
                            startGroupResize(
                              e.touches[0].clientX,
                              e.touches[0].clientY
                            );
                          }}
                          className={`absolute pointer-events-auto shadow-sm ${h.cursor}`}
                          style={{
                            left: h.x * widthPx - halfHandlePagePx,
                            top: h.y * heightPx - halfHandlePagePx,
                            width: handleSizePagePx,
                            height: handleSizePagePx,
                            backgroundColor: '#FFFFFF',
                            border: `${borderRingPagePx}px solid #7C3AED`,
                            borderRadius: 2 * invZoom,
                          }}
                        />
                      );
                    })}
                </div>
              )}
            </div>
          )}
        </React.Fragment>
      );
    }

    // Linear Objects: Line, Arrow, Dimension
    if (obj.type === 'line' || obj.type === 'arrow' || obj.type === 'dimension') {
      const x1Px = obj.x1Mm * basePxPerMm;
      const y1Px = obj.y1Mm * basePxPerMm;
      const x2Px = obj.x2Mm * basePxPerMm;
      const y2Px = obj.y2Mm * basePxPerMm;
      const strokePx = Math.max(1.5, obj.strokeWidthMm * basePxPerMm);
      const angleRad = Math.atan2(y2Px - y1Px, x2Px - x1Px);

      const dashArray =
        obj.type !== 'dimension' && obj.lineStyle === 'dashed'
          ? `${strokePx * 3.5},${strokePx * 2.2}`
          : obj.type !== 'dimension' && obj.lineStyle === 'dotted'
          ? `${strokePx * 1.1},${strokePx * 2.2}`
          : undefined;

      const headPx =
        obj.type === 'arrow' || obj.type === 'dimension'
          ? Math.max(6, (obj.headSizeMm || 8) * basePxPerMm)
          : 0;

      const makeArrowPoints = (tipX: number, tipY: number, dirRad: number) => {
        const spread = Math.PI / 6.5;
        const p1x = tipX - headPx * Math.cos(dirRad - spread);
        const p1y = tipY - headPx * Math.sin(dirRad - spread);
        const p2x = tipX - headPx * Math.cos(dirRad + spread);
        const p2y = tipY - headPx * Math.sin(dirRad + spread);
        return `${tipX},${tipY} ${p1x},${p1y} ${p2x},${p2y}`;
      };

      const hasStartArrow =
        (obj.type === 'arrow' && (obj.arrowEnds === 'start' || obj.arrowEnds === 'both')) ||
        obj.type === 'dimension';
      const hasEndArrow =
        (obj.type === 'arrow' && (obj.arrowEnds === 'end' || obj.arrowEnds === 'both')) ||
        obj.type === 'dimension';

      const startShorten = hasStartArrow ? headPx * 0.6 : 0;
      const endShorten = hasEndArrow ? headPx * 0.6 : 0;

      const lineStartX = x1Px + Math.cos(angleRad) * startShorten;
      const lineStartY = y1Px + Math.sin(angleRad) * startShorten;
      const lineEndX = x2Px - Math.cos(angleRad) * endShorten;
      const lineEndY = y2Px - Math.sin(angleRad) * endShorten;

      const distMm = Math.round(getLineLengthMm(obj.x1Mm, obj.y1Mm, obj.x2Mm, obj.y2Mm));
      const dimLabel =
        obj.type === 'dimension' ? obj.customLabel?.trim() || `${distMm} mm` : '';
      const dimFontSizePx =
        obj.type === 'dimension' ? ptToMm(obj.fontSizePt || 20) * basePxPerMm : 12;
      const extPx =
        obj.type === 'dimension' ? (obj.extensionHeightMm || 10) * basePxPerMm : 0;
      const perpX = -Math.sin(angleRad) * (extPx / 2);
      const perpY = Math.cos(angleRad) * (extPx / 2);

      return (
        <React.Fragment key={obj.id}>
          <svg
            className="absolute inset-0 overflow-visible pointer-events-none"
            style={{
              width: doc.widthMm * basePxPerMm,
              height: doc.heightMm * basePxPerMm,
              opacity: obj.opacity,
            }}
          >
            {/* Generous touch/mouse/pointer hit target (when not inside a group) */}
            {!isInsideGroup && (
              <line
                x1={x1Px}
                y1={y1Px}
                x2={x2Px}
                y2={y2Px}
                stroke="transparent"
                strokeWidth={Math.max(24 * invZoom, strokePx + 14 * invZoom)}
                className="pointer-events-auto cursor-move"
                onContextMenu={(e) => {
                  if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                  }
                }}
                onPointerDown={(e) => {
                  const isMacCtrlClick =
                    e.pointerType === 'mouse' && e.ctrlKey && e.button === 2;
                  if (
                    (e.pointerType === 'mouse' && e.button !== 0 && !isMacCtrlClick) ||
                    (e.pointerType === 'touch' && !e.isPrimary) ||
                    activePointersRef.current.size >= 2 ||
                    isTouchPinchingRef.current ||
                    activeTool !== 'select'
                  ) {
                    return;
                  }
                  e.stopPropagation();
                  lastObjectPointerDownTimeRef.current = performance.now();
                  startObjectSelectionAndMove(
                    e.clientX,
                    e.clientY,
                    e.ctrlKey || e.metaKey || e.shiftKey
                  );
                }}
                onMouseDown={(e) => {
                  const isMacCtrlClick = e.ctrlKey && e.button === 2;
                  if ((e.button !== 0 && !isMacCtrlClick) || activeTool !== 'select') return;
                  e.stopPropagation();
                  if (
                    interactionRef.current !== null ||
                    performance.now() - lastObjectPointerDownTimeRef.current < 150
                  ) {
                    return;
                  }
                  startObjectSelectionAndMove(
                    e.clientX,
                    e.clientY,
                    e.ctrlKey || e.metaKey || e.shiftKey
                  );
                }}
                onTouchStart={(e) => {
                  if (
                    e.touches.length !== 1 ||
                    isTouchPinchingRef.current ||
                    activeTool !== 'select'
                  ) {
                    return;
                  }
                  e.stopPropagation();
                  if (interactionRef.current !== null) return;
                  startObjectSelectionAndMove(
                    e.touches[0].clientX,
                    e.touches[0].clientY,
                    false
                  );
                }}
              />
            )}

            {obj.type === 'dimension' && (
              <>
                <line
                  x1={x1Px - perpX}
                  y1={y1Px - perpY}
                  x2={x1Px + perpX}
                  y2={y1Px + perpY}
                  stroke={obj.strokeColor || '#DC2626'}
                  strokeWidth={strokePx}
                />
                <line
                  x1={x2Px - perpX}
                  y1={y2Px - perpY}
                  x2={x2Px + perpX}
                  y2={y2Px + perpY}
                  stroke={obj.strokeColor || '#DC2626'}
                  strokeWidth={strokePx}
                />
              </>
            )}

            <line
              x1={lineStartX}
              y1={lineStartY}
              x2={lineEndX}
              y2={lineEndY}
              stroke={obj.strokeColor || '#DC2626'}
              strokeWidth={strokePx}
              strokeDasharray={dashArray}
              strokeLinecap={obj.type === 'line' ? 'round' : 'butt'}
            />

            {hasEndArrow && (
              <polygon
                points={makeArrowPoints(x2Px, y2Px, angleRad)}
                fill={obj.strokeColor || '#DC2626'}
              />
            )}
            {hasStartArrow && (
              <polygon
                points={makeArrowPoints(x1Px, y1Px, angleRad + Math.PI)}
                fill={obj.strokeColor || '#DC2626'}
              />
            )}

            {obj.type === 'dimension' && (
              <g
                transform={`translate(${(x1Px + x2Px) / 2}, ${(y1Px + y2Px) / 2}) rotate(${
                  (angleRad * 180) / Math.PI
                })`}
              >
                <rect
                  x={-(dimLabel.length * dimFontSizePx * 0.34)}
                  y={-dimFontSizePx * 1.25 - strokePx}
                  width={dimLabel.length * dimFontSizePx * 0.68}
                  height={dimFontSizePx * 1.2}
                  fill="rgba(255,255,255,0.92)"
                  rx={3}
                />
                <text
                  x={0}
                  y={-strokePx - dimFontSizePx * 0.25}
                  textAnchor="middle"
                  fill={obj.strokeColor || '#DC2626'}
                  fontSize={dimFontSizePx}
                  fontWeight="bold"
                  fontFamily="Helvetica, Arial, sans-serif"
                >
                  {dimLabel}
                </text>
              </g>
            )}
          </svg>

          {/* Draggable Endpoint Handles when selected */}
          {isSelected && !obj.locked && (
            <>
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  isShiftPressedRef.current = e.shiftKey;
                  const initLen = formatMm(
                    getLineLengthMm(obj.x2Mm, obj.y2Mm, obj.x1Mm, obj.y1Mm),
                    1
                  );
                  const initAngle = formatMm(
                    ((((Math.atan2(obj.y1Mm - obj.y2Mm, obj.x1Mm - obj.x2Mm) * 180) /
                      Math.PI) %
                      360) +
                      360) %
                      360,
                    1
                  );
                  setInteraction({
                    mode: 'dragging-endpoint',
                    objectId: obj.id,
                    endpoint: 'p1',
                    initialObject: obj,
                    anchorMmX: obj.x2Mm,
                    anchorMmY: obj.y2Mm,
                    currentMmX: obj.x1Mm,
                    currentMmY: obj.y1Mm,
                    constrainedLengthMm: initLen,
                    constrainedAngleDeg: initAngle,
                  });
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  if (interactionRef.current !== null) return;
                  isShiftPressedRef.current = e.shiftKey;
                  const initLen = formatMm(
                    getLineLengthMm(obj.x2Mm, obj.y2Mm, obj.x1Mm, obj.y1Mm),
                    1
                  );
                  const initAngle = formatMm(
                    ((((Math.atan2(obj.y1Mm - obj.y2Mm, obj.x1Mm - obj.x2Mm) * 180) /
                      Math.PI) %
                      360) +
                      360) %
                      360,
                    1
                  );
                  setInteraction({
                    mode: 'dragging-endpoint',
                    objectId: obj.id,
                    endpoint: 'p1',
                    initialObject: obj,
                    anchorMmX: obj.x2Mm,
                    anchorMmY: obj.y2Mm,
                    currentMmX: obj.x1Mm,
                    currentMmY: obj.y1Mm,
                    constrainedLengthMm: initLen,
                    constrainedAngleDeg: initAngle,
                  });
                }}
                onTouchStart={(e) => {
                  if (e.touches.length !== 1) return;
                  e.stopPropagation();
                  if (interactionRef.current !== null) return;
                  const initLen = formatMm(
                    getLineLengthMm(obj.x2Mm, obj.y2Mm, obj.x1Mm, obj.y1Mm),
                    1
                  );
                  const initAngle = formatMm(
                    ((((Math.atan2(obj.y1Mm - obj.y2Mm, obj.x1Mm - obj.x2Mm) * 180) /
                      Math.PI) %
                      360) +
                      360) %
                      360,
                    1
                  );
                  setInteraction({
                    mode: 'dragging-endpoint',
                    objectId: obj.id,
                    endpoint: 'p1',
                    initialObject: obj,
                    anchorMmX: obj.x2Mm,
                    anchorMmY: obj.y2Mm,
                    currentMmX: obj.x1Mm,
                    currentMmY: obj.y1Mm,
                    constrainedLengthMm: initLen,
                    constrainedAngleDeg: initAngle,
                  });
                }}
                className="absolute bg-white rounded-full shadow-xs cursor-crosshair z-30"
                style={{
                  left: x1Px - halfHandlePagePx,
                  top: y1Px - halfHandlePagePx,
                  width: handleSizePagePx,
                  height: handleSizePagePx,
                  border: `${borderRingPagePx}px solid #2563EB`,
                }}
                title={`Start endpoint (${formatMm(obj.x1Mm, 2)}, ${formatMm(obj.y1Mm, 2)} mm)`}
              />
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  isShiftPressedRef.current = e.shiftKey;
                  const initLen = formatMm(
                    getLineLengthMm(obj.x1Mm, obj.y1Mm, obj.x2Mm, obj.y2Mm),
                    1
                  );
                  const initAngle = formatMm(
                    ((((Math.atan2(obj.y2Mm - obj.y1Mm, obj.x2Mm - obj.x1Mm) * 180) /
                      Math.PI) %
                      360) +
                      360) %
                      360,
                    1
                  );
                  setInteraction({
                    mode: 'dragging-endpoint',
                    objectId: obj.id,
                    endpoint: 'p2',
                    initialObject: obj,
                    anchorMmX: obj.x1Mm,
                    anchorMmY: obj.y1Mm,
                    currentMmX: obj.x2Mm,
                    currentMmY: obj.y2Mm,
                    constrainedLengthMm: initLen,
                    constrainedAngleDeg: initAngle,
                  });
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  if (interactionRef.current !== null) return;
                  isShiftPressedRef.current = e.shiftKey;
                  const initLen = formatMm(
                    getLineLengthMm(obj.x1Mm, obj.y1Mm, obj.x2Mm, obj.y2Mm),
                    1
                  );
                  const initAngle = formatMm(
                    ((((Math.atan2(obj.y2Mm - obj.y1Mm, obj.x2Mm - obj.x1Mm) * 180) /
                      Math.PI) %
                      360) +
                      360) %
                      360,
                    1
                  );
                  setInteraction({
                    mode: 'dragging-endpoint',
                    objectId: obj.id,
                    endpoint: 'p2',
                    initialObject: obj,
                    anchorMmX: obj.x1Mm,
                    anchorMmY: obj.y1Mm,
                    currentMmX: obj.x2Mm,
                    currentMmY: obj.y2Mm,
                    constrainedLengthMm: initLen,
                    constrainedAngleDeg: initAngle,
                  });
                }}
                onTouchStart={(e) => {
                  if (e.touches.length !== 1) return;
                  e.stopPropagation();
                  if (interactionRef.current !== null) return;
                  const initLen = formatMm(
                    getLineLengthMm(obj.x1Mm, obj.y1Mm, obj.x2Mm, obj.y2Mm),
                    1
                  );
                  const initAngle = formatMm(
                    ((((Math.atan2(obj.y2Mm - obj.y1Mm, obj.x2Mm - obj.x1Mm) * 180) /
                      Math.PI) %
                      360) +
                      360) %
                      360,
                    1
                  );
                  setInteraction({
                    mode: 'dragging-endpoint',
                    objectId: obj.id,
                    endpoint: 'p2',
                    initialObject: obj,
                    anchorMmX: obj.x1Mm,
                    anchorMmY: obj.y1Mm,
                    currentMmX: obj.x2Mm,
                    currentMmY: obj.y2Mm,
                    constrainedLengthMm: initLen,
                    constrainedAngleDeg: initAngle,
                  });
                }}
                className="absolute bg-white rounded-full shadow-xs cursor-crosshair z-30"
                style={{
                  left: x2Px - halfHandlePagePx,
                  top: y2Px - halfHandlePagePx,
                  width: handleSizePagePx,
                  height: handleSizePagePx,
                  border: `${borderRingPagePx}px solid #2563EB`,
                }}
                title={`End endpoint (${formatMm(obj.x2Mm, 2)}, ${formatMm(obj.y2Mm, 2)} mm)`}
              />
            </>
          )}
        </React.Fragment>
      );
    }

    // Freehand Pen & Highlighter Stroke Objects
    if (obj.type === 'freehand') {
      const leftPx = obj.xMm * basePxPerMm;
      const topPx = obj.yMm * basePxPerMm;
      const widthPx = obj.widthMm * basePxPerMm;
      const heightPx = obj.heightMm * basePxPerMm;
      const strokePx = Math.max(1.2, obj.strokeWidthMm * basePxPerMm);

      const localPts = (obj.pointsMm || []).map((pt) => ({
        x: (pt.xMm - obj.xMm) * basePxPerMm,
        y: (pt.yMm - obj.yMm) * basePxPerMm,
      }));
      if (localPts.length === 1) {
        localPts.push({ x: localPts[0].x + 0.2, y: localPts[0].y });
      }
      const svgPathD = buildSmoothFreehandSvgPath(localPts);
      const hitStrokeWidthPx = Math.max(18 * invZoom, strokePx + 12 * invZoom);

      return (
        <div
          key={obj.id}
          onContextMenu={(e) => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
            }
          }}
          className="absolute select-none pointer-events-none"
          style={{
            left: leftPx,
            top: topPx,
            width: widthPx,
            height: heightPx,
            transform: `rotate(${obj.rotationDeg}deg)`,
            transformOrigin: 'center center',
          }}
        >
          <svg
            className="w-full h-full overflow-visible pointer-events-none"
            style={{ opacity: obj.opacity }}
          >
            {/* Interactive Hit Path for Select & Eraser Tools (Only along the stroke path, never blocking unrelated area) */}
            {!isInsideGroup && (activeTool === 'select' || activeTool === 'eraser') && (
              <path
                d={svgPathD}
                fill="none"
                stroke="transparent"
                strokeWidth={hitStrokeWidthPx}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={
                  activeTool === 'eraser'
                    ? 'pointer-events-auto cursor-pointer'
                    : 'pointer-events-auto cursor-move'
                }
                onPointerDown={(e) => {
                  const isMacCtrlClick =
                    e.pointerType === 'mouse' && e.ctrlKey && e.button === 2;
                  if (
                    (e.pointerType === 'mouse' && e.button !== 0 && !isMacCtrlClick) ||
                    (e.pointerType === 'touch' && !e.isPrimary) ||
                    activePointersRef.current.size >= 2 ||
                    isTouchPinchingRef.current
                  ) {
                    return;
                  }
                  if (activeTool === 'eraser') {
                    e.stopPropagation();
                    if (!obj.locked) {
                      onDeleteObject(obj.id);
                    }
                    setInteraction({ mode: 'erasing-freehand' });
                    return;
                  }
                  if (activeTool !== 'select') return;
                  e.stopPropagation();
                  lastObjectPointerDownTimeRef.current = performance.now();
                  startObjectSelectionAndMove(
                    e.clientX,
                    e.clientY,
                    e.ctrlKey || e.metaKey || e.shiftKey
                  );
                }}
                onMouseDown={(e) => {
                  const isMacCtrlClick = e.ctrlKey && e.button === 2;
                  if (e.button !== 0 && !isMacCtrlClick) return;
                  if (activeTool === 'eraser') {
                    e.stopPropagation();
                    if (interactionRef.current !== null) return;
                    if (!obj.locked) {
                      onDeleteObject(obj.id);
                    }
                    setInteraction({ mode: 'erasing-freehand' });
                    return;
                  }
                  if (activeTool !== 'select') return;
                  e.stopPropagation();
                  if (
                    interactionRef.current !== null ||
                    performance.now() - lastObjectPointerDownTimeRef.current < 150
                  ) {
                    return;
                  }
                  startObjectSelectionAndMove(
                    e.clientX,
                    e.clientY,
                    e.ctrlKey || e.metaKey || e.shiftKey
                  );
                }}
                onTouchStart={(e) => {
                  if (e.touches.length !== 1 || isTouchPinchingRef.current) return;
                  if (activeTool === 'eraser') {
                    e.stopPropagation();
                    if (interactionRef.current !== null) return;
                    if (!obj.locked) {
                      onDeleteObject(obj.id);
                    }
                    setInteraction({ mode: 'erasing-freehand' });
                    return;
                  }
                  if (activeTool !== 'select') return;
                  e.stopPropagation();
                  if (interactionRef.current !== null) return;
                  startObjectSelectionAndMove(
                    e.touches[0].clientX,
                    e.touches[0].clientY,
                    false
                  );
                }}
              />
            )}

            {/* Visible Smooth Vector Freehand Path (Single path so semi-transparent highlighter never self-darkens) */}
            <path
              d={svgPathD}
              fill="none"
              stroke={obj.strokeColor || '#0F172A'}
              strokeWidth={strokePx}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {/* Selection Frame, Rotation Handle & 8 Resize Handles */}
          {isSelected && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                outline: `${borderRingPagePx}px solid ${
                  obj.locked ? '#F59E0B' : '#2563EB'
                }`,
              }}
            >
              {!obj.locked && (
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setInteraction({
                      mode: 'rotating-object',
                      objectId: obj.id,
                      centerMmX: obj.xMm + obj.widthMm / 2,
                      centerMmY: obj.yMm + obj.heightMm / 2,
                      initialObject: obj,
                    });
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    if (interactionRef.current !== null) return;
                    setInteraction({
                      mode: 'rotating-object',
                      objectId: obj.id,
                      centerMmX: obj.xMm + obj.widthMm / 2,
                      centerMmY: obj.yMm + obj.heightMm / 2,
                      initialObject: obj,
                    });
                  }}
                  onTouchStart={(e) => {
                    if (e.touches.length !== 1) return;
                    e.stopPropagation();
                    if (interactionRef.current !== null) return;
                    setInteraction({
                      mode: 'rotating-object',
                      objectId: obj.id,
                      centerMmX: obj.xMm + obj.widthMm / 2,
                      centerMmY: obj.yMm + obj.heightMm / 2,
                      initialObject: obj,
                    });
                  }}
                  className="absolute left-1/2 bg-white rounded-full cursor-rotate-handle pointer-events-auto shadow-sm"
                  style={{
                    top: -24 * invZoom,
                    marginLeft: -halfHandlePagePx,
                    width: handleSizePagePx,
                    height: handleSizePagePx,
                    border: `${borderRingPagePx}px solid #2563EB`,
                  }}
                  title="Drag to rotate stroke"
                />
              )}

              {!obj.locked &&
                (
                  [
                    { id: 'nw', x: 0, y: 0, cursor: 'cursor-nwse-resize' },
                    { id: 'n', x: 0.5, y: 0, cursor: 'cursor-ns-resize' },
                    { id: 'ne', x: 1, y: 0, cursor: 'cursor-nesw-resize' },
                    { id: 'e', x: 1, y: 0.5, cursor: 'cursor-ew-resize' },
                    { id: 'se', x: 1, y: 1, cursor: 'cursor-nwse-resize' },
                    { id: 's', x: 0.5, y: 1, cursor: 'cursor-ns-resize' },
                    { id: 'sw', x: 0, y: 1, cursor: 'cursor-nesw-resize' },
                    { id: 'w', x: 0, y: 0.5, cursor: 'cursor-ew-resize' },
                  ] as const
                ).map((h) => {
                  const startStrokeResize = (clientX: number, clientY: number) => {
                    const ptMm = clientToPageMm(clientX, clientY);
                    setInteraction({
                      mode: 'resizing-object',
                      objectId: obj.id,
                      handle: h.id,
                      startMmX: ptMm.x,
                      startMmY: ptMm.y,
                      initialObject: obj,
                    });
                  };

                  return (
                    <div
                      key={h.id}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        startStrokeResize(e.clientX, e.clientY);
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        if (interactionRef.current !== null) return;
                        startStrokeResize(e.clientX, e.clientY);
                      }}
                      onTouchStart={(e) => {
                        if (e.touches.length !== 1) return;
                        e.stopPropagation();
                        if (interactionRef.current !== null) return;
                        startStrokeResize(
                          e.touches[0].clientX,
                          e.touches[0].clientY
                        );
                      }}
                      className={`absolute pointer-events-auto shadow-sm ${h.cursor}`}
                      style={{
                        left: h.x * widthPx - halfHandlePagePx,
                        top: h.y * heightPx - halfHandlePagePx,
                        width: handleSizePagePx,
                        height: handleSizePagePx,
                        backgroundColor: '#FFFFFF',
                        border: `${borderRingPagePx}px solid #2563EB`,
                        borderRadius: 2 * invZoom,
                      }}
                    />
                  );
                })}
            </div>
          )}
        </div>
      );
    }

    // Box Objects: Image, Text, Rectangle, Square, Ellipse, Circle, Triangle, Highlight
    const leftPx = obj.xMm * basePxPerMm;
    const topPx = obj.yMm * basePxPerMm;
    const widthPx = obj.widthMm * basePxPerMm;
    const heightPx = obj.heightMm * basePxPerMm;

    return (
      <div
        key={obj.id}
        onContextMenu={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
          }
        }}
        onPointerDown={(e) => {
          const isMacCtrlClick =
            e.pointerType === 'mouse' && e.ctrlKey && e.button === 2;
          if (
            isInsideGroup ||
            (e.pointerType === 'mouse' && e.button !== 0 && !isMacCtrlClick) ||
            (e.pointerType === 'touch' && !e.isPrimary) ||
            activePointersRef.current.size >= 2 ||
            isTouchPinchingRef.current ||
            activeTool !== 'select'
          ) {
            return;
          }
          e.stopPropagation();
          lastObjectPointerDownTimeRef.current = performance.now();
          startObjectSelectionAndMove(
            e.clientX,
            e.clientY,
            e.ctrlKey || e.metaKey || e.shiftKey
          );
        }}
        onMouseDown={(e) => {
          const isMacCtrlClick = e.ctrlKey && e.button === 2;
          if (
            isInsideGroup ||
            (e.button !== 0 && !isMacCtrlClick) ||
            activeTool !== 'select'
          ) {
            return;
          }
          e.stopPropagation();
          if (
            interactionRef.current !== null ||
            performance.now() - lastObjectPointerDownTimeRef.current < 150
          ) {
            return;
          }
          startObjectSelectionAndMove(
            e.clientX,
            e.clientY,
            e.ctrlKey || e.metaKey || e.shiftKey
          );
        }}
        onTouchStart={(e) => {
          if (
            isInsideGroup ||
            e.touches.length !== 1 ||
            isTouchPinchingRef.current ||
            activeTool !== 'select'
          ) {
            return;
          }
          e.stopPropagation();
          if (interactionRef.current !== null) return;
          startObjectSelectionAndMove(e.touches[0].clientX, e.touches[0].clientY, false);
        }}
        onDoubleClick={(e) => {
          if (isInsideGroup) return;
          e.stopPropagation();
          if (obj.type === 'text') {
            onSelectObject(obj.id, false);
            onSetEditingTextId(obj.id);
          } else if (obj.type === 'image') {
            onSelectObject(obj.id, false);
            onSetCroppingImageId(isCropping ? null : obj.id);
          }
        }}
        className={`absolute select-none ${
          !isInsideGroup && activeTool === 'select' ? 'cursor-move' : 'pointer-events-none'
        }`}
        style={{
          left: leftPx,
          top: topPx,
          width: widthPx,
          height: heightPx,
          transform: `rotate(${obj.rotationDeg}deg)`,
          transformOrigin: 'center center',
        }}
      >
        {/* Object Visual Content */}
        {obj.type === 'image' && (() => {
          const asset = doc.assets[obj.assetId];
          const crop = obj.crop || { x: 0, y: 0, width: 1, height: 1 };
          const fullW = widthPx / Math.max(0.01, crop.width);
          const fullH = heightPx / Math.max(0.01, crop.height);
          const offsetLeft = -crop.x * fullW;
          const offsetTop = -crop.y * fullH;

          return (
            <div className="relative w-full h-full" style={{ opacity: obj.opacity }}>
              {isCropping && asset && (
                <div
                  className="absolute pointer-events-none opacity-35"
                  style={{
                    left: offsetLeft,
                    top: offsetTop,
                    width: fullW,
                    height: fullH,
                    outline: `${borderRingPagePx}px dashed #3B82F6`,
                  }}
                >
                  <img
                    src={asset.objectUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-fill pointer-events-none"
                  />
                </div>
              )}

              <div
                className="relative w-full h-full overflow-hidden"
                style={{
                  border:
                    obj.strokeWidthMm > 0 && obj.strokeColor !== 'transparent'
                      ? `${Math.max(1, obj.strokeWidthMm * basePxPerMm)}px solid ${obj.strokeColor}`
                      : undefined,
                }}
              >
                {asset ? (
                  <img
                    src={asset.objectUrl}
                    alt={obj.name}
                    referrerPolicy="no-referrer"
                    draggable={false}
                    className="absolute max-w-none pointer-events-none select-none"
                    style={{
                      left: offsetLeft,
                      top: offsetTop,
                      width: fullW,
                      height: fullH,
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-slate-200 flex items-center justify-center text-xs text-slate-500">
                    Missing Image Asset
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {obj.type === 'text' && (() => {
          const fontDef = AVAILABLE_FONTS.find((f) => f.id === obj.fontFamily);
          const cssFamily = fontDef ? fontDef.cssFamily : obj.fontFamily;
          const fontSizePx = ptToMm(obj.fontSizePt) * basePxPerMm;
          const padPx = (obj.paddingMm ?? 2) * basePxPerMm;

          return (
            <div
              className="w-full h-full overflow-hidden"
              style={{
                opacity: obj.opacity,
                backgroundColor:
                  obj.fillColor && obj.fillColor !== 'transparent' ? obj.fillColor : undefined,
                border:
                  obj.strokeWidthMm > 0 && obj.strokeColor !== 'transparent'
                    ? `${Math.max(1, obj.strokeWidthMm * basePxPerMm)}px solid ${obj.strokeColor}`
                    : undefined,
                padding: padPx,
                WebkitTextSizeAdjust: 'none',
                textSizeAdjust: 'none',
              }}
            >
              {isEditingText ? (
                <textarea
                  ref={textareaRef}
                  data-allow-touch-scroll="true"
                  value={obj.text}
                  onChange={(e) => {
                    if (!hasRecordedTextEditHistoryRef.current) {
                      hasRecordedTextEditHistoryRef.current = true;
                      onRecordHistorySnapshot();
                    }
                    onUpdateObject({ ...obj, text: e.target.value }, false);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="w-full h-full bg-transparent resize-none focus:outline-none p-0 m-0 border-none touch-pan-y"
                  style={{
                    fontFamily: cssFamily,
                    fontSize: `${fontSizePx}px`,
                    lineHeight: 1.25,
                    fontWeight: obj.fontWeight,
                    fontStyle: obj.fontStyle,
                    textDecoration: obj.underline ? 'underline' : 'none',
                    color: obj.color,
                    textAlign: obj.align,
                  }}
                />
              ) : (
                <div
                  className="w-full h-full whitespace-pre-wrap break-words pointer-events-none"
                  style={{
                    fontFamily: cssFamily,
                    fontSize: `${fontSizePx}px`,
                    lineHeight: 1.25,
                    fontWeight: obj.fontWeight,
                    fontStyle: obj.fontStyle,
                    textDecoration: obj.underline ? 'underline' : 'none',
                    color: obj.color,
                    textAlign: obj.align,
                  }}
                >
                  {obj.text}
                </div>
              )}
            </div>
          );
        })()}

        {(obj.type === 'rectangle' ||
          obj.type === 'square' ||
          obj.type === 'ellipse' ||
          obj.type === 'circle' ||
          obj.type === 'triangle' ||
          obj.type === 'highlight') && (() => {
          const strokePx =
            obj.strokeWidthMm > 0 ? Math.max(1, obj.strokeWidthMm * basePxPerMm) : 0;
          const dashArray =
            obj.lineStyle === 'dashed'
              ? `${strokePx * 3.5},${strokePx * 2.2}`
              : obj.lineStyle === 'dotted'
              ? `${strokePx * 1.1},${strokePx * 2.2}`
              : undefined;

          return (
            <svg
              className="w-full h-full overflow-visible pointer-events-none"
              style={{ opacity: obj.opacity }}
            >
              {(obj.type === 'rectangle' || obj.type === 'square' || obj.type === 'highlight') && (
                <rect
                  x={strokePx / 2}
                  y={strokePx / 2}
                  width={Math.max(1, widthPx - strokePx)}
                  height={Math.max(1, heightPx - strokePx)}
                  fill={obj.fillColor === 'transparent' ? 'none' : obj.fillColor}
                  stroke={
                    strokePx > 0 && obj.strokeColor !== 'transparent' ? obj.strokeColor : 'none'
                  }
                  strokeWidth={strokePx}
                  strokeDasharray={dashArray}
                />
              )}
              {(obj.type === 'ellipse' || obj.type === 'circle') && (
                <ellipse
                  cx={widthPx / 2}
                  cy={heightPx / 2}
                  rx={Math.max(1, (widthPx - strokePx) / 2)}
                  ry={Math.max(1, (heightPx - strokePx) / 2)}
                  fill={obj.fillColor === 'transparent' ? 'none' : obj.fillColor}
                  stroke={
                    strokePx > 0 && obj.strokeColor !== 'transparent' ? obj.strokeColor : 'none'
                  }
                  strokeWidth={strokePx}
                  strokeDasharray={dashArray}
                />
              )}
              {obj.type === 'triangle' && (
                <polygon
                  points={`${widthPx / 2},${strokePx / 2} ${widthPx - strokePx / 2},${
                    heightPx - strokePx / 2
                  } ${strokePx / 2},${heightPx - strokePx / 2}`}
                  fill={obj.fillColor === 'transparent' ? 'none' : obj.fillColor}
                  stroke={
                    strokePx > 0 && obj.strokeColor !== 'transparent' ? obj.strokeColor : 'none'
                  }
                  strokeWidth={strokePx}
                  strokeDasharray={dashArray}
                />
              )}
            </svg>
          );
        })()}

        {/* Selection Frame & Inverse-Scaled Crisp Handles */}
        {isSelected && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              outline: `${borderRingPagePx}px solid ${
                isCropping ? '#F59E0B' : obj.locked ? '#F59E0B' : '#2563EB'
              }`,
            }}
          >
            {/* Floating Non-Destructive Crop Toolbar */}
            {isCropping && obj.type === 'image' && (
              <div
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className="absolute left-1/2 bg-slate-900 text-white rounded-lg shadow-lg px-2.5 py-1 flex items-center gap-2 pointer-events-auto whitespace-nowrap z-40 text-xs"
                style={{
                  top: -40 * invZoom,
                  transform: `translateX(-50%) scale(${invZoom})`,
                  transformOrigin: 'bottom center',
                }}
              >
                <span className="font-medium text-amber-300">Crop Mode</span>
                <button
                  type="button"
                  onClick={() => onSetCroppingImageId(null)}
                  className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 rounded font-medium flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  <span>Done</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateObject(
                      {
                        ...obj,
                        crop: { x: 0, y: 0, width: 1, height: 1 },
                      },
                      true
                    );
                  }}
                  className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>
            )}

            {/* Rotation Handle */}
            {!isCropping && !obj.locked && (
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setInteraction({
                    mode: 'rotating-object',
                    objectId: obj.id,
                    centerMmX: obj.xMm + obj.widthMm / 2,
                    centerMmY: obj.yMm + obj.heightMm / 2,
                    initialObject: obj,
                  });
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  if (interactionRef.current !== null) return;
                  setInteraction({
                    mode: 'rotating-object',
                    objectId: obj.id,
                    centerMmX: obj.xMm + obj.widthMm / 2,
                    centerMmY: obj.yMm + obj.heightMm / 2,
                    initialObject: obj,
                  });
                }}
                onTouchStart={(e) => {
                  if (e.touches.length !== 1) return;
                  e.stopPropagation();
                  if (interactionRef.current !== null) return;
                  setInteraction({
                    mode: 'rotating-object',
                    objectId: obj.id,
                    centerMmX: obj.xMm + obj.widthMm / 2,
                    centerMmY: obj.yMm + obj.heightMm / 2,
                    initialObject: obj,
                  });
                }}
                className="absolute left-1/2 bg-white rounded-full cursor-rotate-handle pointer-events-auto shadow-sm"
                style={{
                  top: -24 * invZoom,
                  marginLeft: -halfHandlePagePx,
                  width: handleSizePagePx,
                  height: handleSizePagePx,
                  border: `${borderRingPagePx}px solid #2563EB`,
                }}
                title="Drag to rotate object"
              />
            )}

            {/* 8 Resize or Crop Handles */}
            {!obj.locked &&
              (
                [
                  { id: 'nw', x: 0, y: 0, cursor: 'cursor-nwse-resize' },
                  { id: 'n', x: 0.5, y: 0, cursor: 'cursor-ns-resize' },
                  { id: 'ne', x: 1, y: 0, cursor: 'cursor-nesw-resize' },
                  { id: 'e', x: 1, y: 0.5, cursor: 'cursor-ew-resize' },
                  { id: 'se', x: 1, y: 1, cursor: 'cursor-nwse-resize' },
                  { id: 's', x: 0.5, y: 1, cursor: 'cursor-ns-resize' },
                  { id: 'sw', x: 0, y: 1, cursor: 'cursor-nesw-resize' },
                  { id: 'w', x: 0, y: 0.5, cursor: 'cursor-ew-resize' },
                ] as const
              ).map((h) => {
                const startHandleDrag = (clientX: number, clientY: number) => {
                  const ptMm = clientToPageMm(clientX, clientY);
                  if (isCropping && obj.type === 'image') {
                    setInteraction({
                      mode: 'cropping-image',
                      objectId: obj.id,
                      handle: h.id,
                      startMmX: ptMm.x,
                      startMmY: ptMm.y,
                      initialObject: obj,
                    });
                  } else {
                    setInteraction({
                      mode: 'resizing-object',
                      objectId: obj.id,
                      handle: h.id,
                      startMmX: ptMm.x,
                      startMmY: ptMm.y,
                      initialObject: obj,
                    });
                  }
                };

                return (
                  <div
                    key={h.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      startHandleDrag(e.clientX, e.clientY);
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (interactionRef.current !== null) return;
                      startHandleDrag(e.clientX, e.clientY);
                    }}
                    onTouchStart={(e) => {
                      if (e.touches.length !== 1) return;
                      e.stopPropagation();
                      if (interactionRef.current !== null) return;
                      startHandleDrag(e.touches[0].clientX, e.touches[0].clientY);
                    }}
                    className={`absolute pointer-events-auto shadow-sm ${h.cursor}`}
                    style={{
                      left: h.x * widthPx - halfHandlePagePx,
                      top: h.y * heightPx - halfHandlePagePx,
                      width: handleSizePagePx,
                      height: handleSizePagePx,
                      backgroundColor: isCropping ? '#F59E0B' : '#FFFFFF',
                      border: `${borderRingPagePx}px solid ${
                        isCropping ? '#FFFFFF' : '#2563EB'
                      }`,
                      borderRadius: 2 * invZoom,
                    }}
                  />
                );
              })}
          </div>
        )}
      </div>
    );
  };

  return (
    <main
      ref={workspaceRef}
      onPointerDownCapture={handleWorkspacePointerDownCapture}
      onPointerDown={handleWorkspacePointerDown}
      onPointerMove={handleWorkspacePointerMove}
      onPointerUp={handleWorkspacePointerUp}
      onPointerCancel={handleWorkspacePointerCancel}
      onMouseDown={handleWorkspaceMouseDown}
      onMouseMove={handleWorkspaceMouseMove}
      onMouseUp={finishWorkspaceInteraction}
      onMouseLeave={() => {
        onCursorMoveMm(null);
      }}
      onTouchStart={handleWorkspaceTouchStart}
      onTouchMove={handleWorkspaceTouchMove}
      onTouchEnd={handleWorkspaceTouchEnd}
      onTouchCancel={handleWorkspaceTouchCancel}
      onWheel={handleWheel}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'copy';
        }
        if (!isDragOver) {
          setIsDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const related = e.relatedTarget as Node | null;
        if (!related || !e.currentTarget.contains(related)) {
          setIsDragOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const droppedFiles = Array.from(e.dataTransfer?.files ?? []);
        if (droppedFiles.length > 0) {
          const dropMm = clientToPageMm(e.clientX, e.clientY);
          onDropFiles(droppedFiles, dropMm);
        }
      }}
      data-workspace-canvas="true"
      className={`workspace-canvas relative flex-1 bg-slate-200/85 overflow-hidden overscroll-none touch-none select-none ${
        interaction?.mode === 'rotating-object'
          ? 'cursor-rotate-handle'
          : isSpacePressed || activeTool === 'pan' || interaction?.mode === 'panning'
          ? 'cursor-grab active:cursor-grabbing'
          : activeTool === 'eraser'
          ? 'cursor-cell'
          : activeTool !== 'select'
          ? 'cursor-crosshair'
          : 'cursor-default'
      }`}
    >
      {/* Horizontal and Vertical Millimetre Rulers */}
      <Rulers
        zoom={zoom}
        panX={panX}
        panY={panY}
        pageWidthMm={doc.widthMm}
        pageHeightMm={doc.heightMm}
        cursorMm={cursorMm}
        lockGuides={doc.lockGuides}
        onStartCreateGuide={handleStartCreateGuide}
      />

      {/* Drag-and-Drop Overlay */}
      {isDragOver && (
        <div className="absolute inset-4 z-50 bg-blue-600/15 border-2 border-dashed border-blue-600 rounded-xl flex items-center justify-center pointer-events-none">
          <div className="bg-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 text-xs sm:text-sm font-semibold text-blue-950">
            <Upload className="w-5 h-5 text-blue-600 shrink-0" />
            <span>Drop .lay document to Open, or drop JPEG, PNG, WebP images to place on page</span>
          </div>
        </div>
      )}

      {/* Viewport Canvas Offset Container */}
      <div
        className="workspace-canvas absolute inset-0 overflow-hidden overscroll-none touch-none"
        style={{
          left: RULER_THICKNESS_PX,
          top: RULER_THICKNESS_PX,
          backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          backgroundPosition: `${panX}px ${panY}px`,
        }}
      >
        {/* Full-Workspace Active Dragging Guideline Line & Floating Readout Pill */}
        {interaction?.mode === 'dragging-guide' && (() => {
          const isVert = interaction.orientation === 'vertical';
          const screenCoordPx = isVert
            ? panX + interaction.positionMm * screenPxPerMm
            : panY + interaction.positionMm * screenPxPerMm;
          const inBounds = isVert
            ? interaction.positionMm >= 0 && interaction.positionMm <= doc.widthMm
            : interaction.positionMm >= 0 && interaction.positionMm <= doc.heightMm;

          return (
            <>
              {isVert ? (
                <div
                  className={`absolute top-0 bottom-0 pointer-events-none z-40 ${
                    inBounds ? 'bg-cyan-500' : 'bg-rose-500/80'
                  }`}
                  style={{ left: screenCoordPx, width: 2 }}
                />
              ) : (
                <div
                  className={`absolute left-0 right-0 pointer-events-none z-40 ${
                    inBounds ? 'bg-cyan-500' : 'bg-rose-500/80'
                  }`}
                  style={{ top: screenCoordPx, height: 2 }}
                />
              )}
              <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-full shadow-lg text-xs font-mono font-semibold flex items-center gap-2 pointer-events-none whitespace-nowrap bg-slate-900 text-white border border-slate-700">
                <span className="text-cyan-400">
                  {isVert ? 'Vertical Guide X:' : 'Horizontal Guide Y:'}
                </span>
                <span>{formatMm(interaction.positionMm, 1)} mm</span>
                {(isShiftPressedRef.current || doc.precisionMode) && (
                  <span className="text-[10px] font-sans text-teal-300">
                    (1 mm snap)
                  </span>
                )}
                {!inBounds && (
                  <span className="text-[10px] font-sans text-rose-300">
                    (Outside page — release to remove)
                  </span>
                )}
              </div>
            </>
          );
        })()}

        {/* Live Line / Arrow / Dimension Drawing & Endpoint Readout Pill */}
        {((interaction?.mode === 'creating-object' &&
          (interaction.tool === 'line' ||
            interaction.tool === 'arrow' ||
            interaction.tool === 'dimension')) ||
          interaction?.mode === 'dragging-endpoint') && (() => {
          const isPrecisionActive = Boolean(
            isShiftPressedRef.current || doc.precisionMode
          );
          const startX =
            interaction.mode === 'creating-object'
              ? interaction.startMmX
              : interaction.anchorMmX;
          const startY =
            interaction.mode === 'creating-object'
              ? interaction.startMmY
              : interaction.anchorMmY;
          const displayX = isPrecisionActive
            ? Math.round(startX)
            : formatMm(startX, 1);
          const displayY = isPrecisionActive
            ? Math.round(startY)
            : formatMm(startY, 1);
          const displayLength = isPrecisionActive
            ? Math.round(interaction.constrainedLengthMm)
            : formatMm(interaction.constrainedLengthMm, 1);
          const displayAngle = isPrecisionActive
            ? Math.round(interaction.constrainedAngleDeg)
            : formatMm(interaction.constrainedAngleDeg, 1);

          return (
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-full shadow-lg text-xs font-mono font-semibold flex items-center gap-2 pointer-events-none whitespace-nowrap bg-slate-900 text-white border border-slate-700">
              <span>
                <span className="text-slate-400">X:</span> {displayX} mm
              </span>
              <span className="text-slate-600">|</span>
              <span>
                <span className="text-slate-400">Y:</span> {displayY} mm
              </span>
              <span className="text-slate-600">|</span>
              <span>
                <span className="text-emerald-400">Length:</span> {displayLength} mm
              </span>
              <span className="text-slate-600">|</span>
              <span>
                <span className="text-cyan-400">Angle:</span> {displayAngle}°
              </span>
            </div>
          );
        })()}

        {/* Physical Document Page Surface (Rendered at 100% canonical CSS scale & GPU-transformed by zoom) */}
        <div
          className="absolute bg-white shadow-md"
          style={{
            left: panX,
            top: panY,
            width: doc.widthMm * basePxPerMm,
            height: doc.heightMm * basePxPerMm,
            transform: `scale(${zoom})`,
            transformOrigin: '0 0',
            outline: `${Math.max(1, invZoom)}px solid #CBD5E1`,
          }}
        >
          {/* Physical Page Top-Left Label Badge (Moves with the page so panning is always visually obvious) */}
          <div
            className="absolute left-0 pointer-events-none select-none flex items-center gap-1.5 text-[10px] font-mono text-slate-500 whitespace-nowrap"
            style={{
              top: -20 * invZoom,
              transform: `scale(${invZoom})`,
              transformOrigin: 'bottom left',
            }}
          >
            <span className="font-semibold text-slate-700">{page.name}</span>
            <span>·</span>
            <span>
              {doc.paperSize} {doc.orientation} ({doc.widthMm} × {doc.heightMm} mm)
            </span>
          </div>

          {/* Non-Interactive Subtle Watermark When Page is Empty (Moves with page & never blocks touch/pan/draw) */}
          {page.objects.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none p-8 text-center">
              <div
                className="text-slate-300 font-bold tracking-tight"
                style={{ fontSize: Math.max(24, doc.widthMm * 0.08) }}
              >
                {doc.paperSize} {doc.orientation.toUpperCase()}
              </div>
              <div
                className="text-slate-300 font-mono mt-2"
                style={{ fontSize: Math.max(14, doc.widthMm * 0.035) }}
              >
                {doc.widthMm} × {doc.heightMm} mm
              </div>
            </div>
          )}

          {/* Render All Page Objects in Z-Order */}
          {page.objects.map((obj) => renderObjectOnPage(obj))}

          {/* Multi-Selection Enclosing Frame & Floating Group Action Bar */}
          {selectedObjectIds.length >= 2 && (() => {
            const multiObjects = page.objects.filter((o) =>
              selectedObjectIds.includes(o.id)
            );
            if (multiObjects.length < 2) return null;
            const bounds = getCombinedBoundsMm(multiObjects);
            return (
              <div
                className="absolute pointer-events-none z-30"
                style={{
                  left: bounds.xMm * basePxPerMm,
                  top: bounds.yMm * basePxPerMm,
                  width: bounds.widthMm * basePxPerMm,
                  height: bounds.heightMm * basePxPerMm,
                  outline: `${Math.max(1.5, 2 * invZoom)}px dashed #7C3AED`,
                }}
              >
                <div
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="absolute left-1/2 bg-violet-950 text-white rounded-lg shadow-lg px-2.5 py-1 flex items-center gap-2 pointer-events-auto whitespace-nowrap z-40 text-xs"
                  style={{
                    top: -38 * invZoom,
                    transform: `translateX(-50%) scale(${invZoom})`,
                    transformOrigin: 'bottom center',
                  }}
                >
                  <span className="font-medium text-violet-200">
                    {multiObjects.length} Selected
                  </span>
                  <button
                    type="button"
                    onClick={onGroupSelected}
                    className="px-2 py-0.5 bg-violet-600 hover:bg-violet-500 rounded font-medium flex items-center gap-1"
                  >
                    <Group className="w-3 h-3" />
                    <span>Group</span>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Live In-Progress Freehand Pen / Highlighter Stroke Preview */}
          {interaction?.mode === 'drawing-freehand' && (() => {
            const pts = interaction.pointsMm.map((pt) => ({
              x: pt.xMm * basePxPerMm,
              y: pt.yMm * basePxPerMm,
            }));
            if (pts.length === 1) {
              pts.push({ x: pts[0].x + 0.2, y: pts[0].y });
            }
            const d = buildSmoothFreehandSvgPath(pts);
            return (
              <svg
                className="absolute inset-0 overflow-visible pointer-events-none z-40"
                style={{
                  width: doc.widthMm * basePxPerMm,
                  height: doc.heightMm * basePxPerMm,
                  opacity: interaction.opacity,
                }}
              >
                <path
                  d={d}
                  fill="none"
                  stroke={interaction.strokeColor}
                  strokeWidth={Math.max(1.2, interaction.strokeWidthMm * basePxPerMm)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            );
          })()}

          {/* Interactive WYSIWYG Creation Preview */}
          {interaction?.mode === 'creating-object' && (() => {
            const { tool, startMmX, startMmY, currentMmX, currentMmY } = interaction;
            if (tool === 'line' || tool === 'arrow' || tool === 'dimension') {
              return (
                <svg className="absolute inset-0 overflow-visible pointer-events-none z-40">
                  <line
                    x1={startMmX * basePxPerMm}
                    y1={startMmY * basePxPerMm}
                    x2={currentMmX * basePxPerMm}
                    y2={currentMmY * basePxPerMm}
                    stroke="#DC2626"
                    strokeWidth={2 * invZoom}
                    strokeDasharray={`${4 * invZoom},${4 * invZoom}`}
                  />
                </svg>
              );
            }

            const box = computeBoxCreationGeometryMm(
              tool,
              startMmX,
              startMmY,
              currentMmX,
              currentMmY,
              false
            );
            const leftPx = box.xMm * basePxPerMm;
            const topPx = box.yMm * basePxPerMm;
            const widthPx = box.widthMm * basePxPerMm;
            const heightPx = box.heightMm * basePxPerMm;

            if (widthPx < 0.5 && heightPx < 0.5) {
              return null;
            }

            if (tool === 'text') {
              return (
                <div
                  className="absolute bg-blue-500/10 pointer-events-none z-40"
                  style={{
                    left: leftPx,
                    top: topPx,
                    width: widthPx,
                    height: heightPx,
                    border: `${2 * invZoom}px dashed #2563EB`,
                  }}
                />
              );
            }

            const sheetScale = Math.max(0.35, doc.widthMm / 1189);
            const strokeWidthMm =
              tool === 'highlight' ? 0 : Number((1.2 * sheetScale).toFixed(1));
            const strokePx =
              strokeWidthMm > 0 ? Math.max(1, strokeWidthMm * basePxPerMm) : 0;
            const highlightPreset =
              tool === 'highlight'
                ? HIGHLIGHT_PRESETS.find((p) => p.color === activeHighlightColor)
                : undefined;
            const previewOpacity =
              tool === 'highlight'
                ? highlightPreset
                  ? highlightPreset.opacity
                  : 0.35
                : 1;
            const previewFill =
              tool === 'highlight'
                ? activeHighlightColor || '#FACC15'
                : '#E0F2FE';
            const previewStroke = tool === 'highlight' ? 'none' : '#0284C7';

            return (
              <div
                className="absolute pointer-events-none z-40"
                style={{
                  left: leftPx,
                  top: topPx,
                  width: widthPx,
                  height: heightPx,
                  outline: `${Math.max(1, 1.4 * invZoom)}px dashed rgba(37, 99, 235, 0.55)`,
                }}
              >
                <svg
                  className="w-full h-full overflow-visible pointer-events-none"
                  style={{ opacity: previewOpacity }}
                >
                  {(tool === 'rectangle' || tool === 'square' || tool === 'highlight') && (
                    <rect
                      x={strokePx / 2}
                      y={strokePx / 2}
                      width={Math.max(1, widthPx - strokePx)}
                      height={Math.max(1, heightPx - strokePx)}
                      fill={previewFill}
                      stroke={previewStroke}
                      strokeWidth={strokePx}
                    />
                  )}
                  {(tool === 'ellipse' || tool === 'circle') && (
                    <ellipse
                      cx={widthPx / 2}
                      cy={heightPx / 2}
                      rx={Math.max(1, (widthPx - strokePx) / 2)}
                      ry={Math.max(1, (heightPx - strokePx) / 2)}
                      fill={previewFill}
                      stroke={previewStroke}
                      strokeWidth={strokePx}
                    />
                  )}
                  {tool === 'triangle' && (
                    <polygon
                      points={`${widthPx / 2},${strokePx / 2} ${widthPx - strokePx / 2},${
                        heightPx - strokePx / 2
                      } ${strokePx / 2},${heightPx - strokePx / 2}`}
                      fill={previewFill}
                      stroke={previewStroke}
                      strokeWidth={strokePx}
                    />
                  )}
                </svg>
              </div>
            );
          })()}

          {/* Magnetic Snap Alignment Indicator Lines */}
          {activeSnapLines.verticalMm !== null && (
            <div
              className="absolute top-0 bottom-0 bg-rose-500 pointer-events-none z-40"
              style={{
                left: activeSnapLines.verticalMm * basePxPerMm,
                width: Math.max(1, 1.5 * invZoom),
              }}
            />
          )}
          {activeSnapLines.horizontalMm !== null && (
            <div
              className="absolute left-0 right-0 bg-rose-500 pointer-events-none z-40"
              style={{
                top: activeSnapLines.horizontalMm * basePxPerMm,
                height: Math.max(1, 1.5 * invZoom),
              }}
            />
          )}

          {/* Non-Printing Millimetre Guidelines */}
          {doc.showGuides &&
            page.guidelines.map((g) => {
              const isVertical = g.orientation === 'vertical';
              const posPx = g.positionMm * basePxPerMm;
              const isDraggingThis =
                interaction?.mode === 'dragging-guide' && interaction.guideId === g.id;
              const isSelectedGuide = selectedGuideId === g.id;
              // Generous 24px screen-equivalent hit area so fingers can easily grab guidelines on mobile
              const hitThickness = Math.max(14, 24 * invZoom);
              const lineThickness = Math.max(
                1,
                (isSelectedGuide || isDraggingThis ? 2.2 : 1.4) * invZoom
              );

              return isVertical ? (
                <div
                  key={g.id}
                  data-guide-handle="true"
                  onPointerDown={(e) => {
                    if (e.pointerType === 'mouse' && e.button !== 0) return;
                    e.stopPropagation();
                    onSelectGuide(g.id);
                    onSelectObject(null);
                    if (doc.lockGuides) return;
                    isShiftPressedRef.current = e.shiftKey;
                    isAdjustingGuideOrRulerRef.current = true;
                    activePointersRef.current.set(e.pointerId, {
                      clientX: e.clientX,
                      clientY: e.clientY,
                    });
                    try {
                      workspaceRef.current?.setPointerCapture(e.pointerId);
                    } catch {
                      // Ignore
                    }
                    setInteraction({
                      mode: 'dragging-guide',
                      guideId: g.id,
                      orientation: 'vertical',
                      positionMm: g.positionMm,
                      isNew: false,
                    });
                  }}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    onSelectGuide(g.id);
                    onSelectObject(null);
                    if (doc.lockGuides) return;
                    isShiftPressedRef.current = e.shiftKey;
                    isAdjustingGuideOrRulerRef.current = true;
                    if (interactionRef.current !== null) return;
                    setInteraction({
                      mode: 'dragging-guide',
                      guideId: g.id,
                      orientation: 'vertical',
                      positionMm: g.positionMm,
                      isNew: false,
                    });
                  }}
                  onTouchStart={(e) => {
                    if (e.touches.length !== 1) return;
                    e.stopPropagation();
                    onSelectGuide(g.id);
                    onSelectObject(null);
                    if (doc.lockGuides) return;
                    isAdjustingGuideOrRulerRef.current = true;
                    if (interactionRef.current !== null) return;
                    setInteraction({
                      mode: 'dragging-guide',
                      guideId: g.id,
                      orientation: 'vertical',
                      positionMm: g.positionMm,
                      isNew: false,
                    });
                  }}
                  className={`absolute top-0 bottom-0 z-30 group flex justify-center touch-none ${
                    doc.lockGuides ? 'cursor-pointer' : 'cursor-ew-resize'
                  }`}
                  style={{
                    left: posPx - hitThickness / 2,
                    width: hitThickness,
                  }}
                  title={`Vertical guideline — X: ${formatMm(g.positionMm, 1)} mm`}
                >
                  <div
                    className={`h-full ${
                      isSelectedGuide
                        ? 'bg-cyan-600'
                        : 'bg-cyan-500/85 group-hover:bg-cyan-600'
                    }`}
                    style={{ width: lineThickness }}
                  />
                  <span
                    className={`absolute top-2 left-3 px-1.5 py-0.5 rounded bg-cyan-600 text-white font-mono text-[10px] shadow-sm pointer-events-none whitespace-nowrap ${
                      isDraggingThis || isSelectedGuide
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100'
                    }`}
                    style={{
                      transform: `scale(${invZoom})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    X: {formatMm(g.positionMm, 1)} mm
                  </span>
                </div>
              ) : (
                <div
                  key={g.id}
                  data-guide-handle="true"
                  onPointerDown={(e) => {
                    if (e.pointerType === 'mouse' && e.button !== 0) return;
                    e.stopPropagation();
                    onSelectGuide(g.id);
                    onSelectObject(null);
                    if (doc.lockGuides) return;
                    isShiftPressedRef.current = e.shiftKey;
                    isAdjustingGuideOrRulerRef.current = true;
                    activePointersRef.current.set(e.pointerId, {
                      clientX: e.clientX,
                      clientY: e.clientY,
                    });
                    try {
                      workspaceRef.current?.setPointerCapture(e.pointerId);
                    } catch {
                      // Ignore
                    }
                    setInteraction({
                      mode: 'dragging-guide',
                      guideId: g.id,
                      orientation: 'horizontal',
                      positionMm: g.positionMm,
                      isNew: false,
                    });
                  }}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    onSelectGuide(g.id);
                    onSelectObject(null);
                    if (doc.lockGuides) return;
                    isShiftPressedRef.current = e.shiftKey;
                    isAdjustingGuideOrRulerRef.current = true;
                    if (interactionRef.current !== null) return;
                    setInteraction({
                      mode: 'dragging-guide',
                      guideId: g.id,
                      orientation: 'horizontal',
                      positionMm: g.positionMm,
                      isNew: false,
                    });
                  }}
                  onTouchStart={(e) => {
                    if (e.touches.length !== 1) return;
                    e.stopPropagation();
                    onSelectGuide(g.id);
                    onSelectObject(null);
                    if (doc.lockGuides) return;
                    isAdjustingGuideOrRulerRef.current = true;
                    if (interactionRef.current !== null) return;
                    setInteraction({
                      mode: 'dragging-guide',
                      guideId: g.id,
                      orientation: 'horizontal',
                      positionMm: g.positionMm,
                      isNew: false,
                    });
                  }}
                  className={`absolute left-0 right-0 z-30 group flex items-center touch-none ${
                    doc.lockGuides ? 'cursor-pointer' : 'cursor-ns-resize'
                  }`}
                  style={{
                    top: posPx - hitThickness / 2,
                    height: hitThickness,
                  }}
                  title={`Horizontal guideline — Y: ${formatMm(g.positionMm, 1)} mm`}
                >
                  <div
                    className={`w-full ${
                      isSelectedGuide
                        ? 'bg-cyan-600'
                        : 'bg-cyan-500/85 group-hover:bg-cyan-600'
                    }`}
                    style={{ height: lineThickness }}
                  />
                  <span
                    className={`absolute left-2 top-3 px-1.5 py-0.5 rounded bg-cyan-600 text-white font-mono text-[10px] shadow-sm pointer-events-none whitespace-nowrap ${
                      isDraggingThis || isSelectedGuide
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100'
                    }`}
                    style={{
                      transform: `scale(${invZoom})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    Y: {formatMm(g.positionMm, 1)} mm
                  </span>
                </div>
              );
            })}
        </div>

        {/* Compact Top Floating Empty-Page Quick Actions Bar (Never blocks canvas center touch/pan/draw) */}
        {page.objects.length === 0 && !interaction && (
          <div
            data-allow-touch-scroll="true"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="absolute top-2.5 left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-16px)] bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-md flex items-center gap-2 whitespace-nowrap touch-manipulation"
          >
            <button
              type="button"
              onClick={onTriggerImageUpload}
              className="px-2.5 py-1 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <ImagePlus className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Import Images</span>
            </button>
            <button
              type="button"
              onClick={onLoadSampleDocument}
              className="px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
              <span>Load Sample A0</span>
            </button>
          </div>
        )}

        {/* Floating Quick Pan / Zoom / Fit Pill on Canvas for Mobile & Desktop */}
        <div
          data-allow-touch-scroll="true"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="absolute bottom-3 right-3 z-30 flex items-center gap-1 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-lg shadow-md p-1 touch-manipulation"
        >
          <button
            type="button"
            onClick={() => onSelectTool(activeTool === 'pan' ? 'select' : 'pan')}
            className={`px-2 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors ${
              activeTool === 'pan'
                ? 'bg-blue-600 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
            title="Toggle Hand Pan / Slide Mode"
          >
            {activeTool === 'pan' ? (
              <>
                <Hand className="w-3.5 h-3.5" />
                <span>Slide ON</span>
              </>
            ) : (
              <>
                <MousePointer className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Select / Slide</span>
              </>
            )}
          </button>

          <div className="w-px h-4 bg-slate-200" />

          <button
            type="button"
            onClick={() => onZoomChange(Math.max(0.05, Number((zoom / 1.25).toFixed(3))))}
            className="p-1.5 text-slate-700 hover:bg-slate-100 rounded"
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onFitToPage}
            className="px-2 py-1 text-[11px] font-mono font-semibold text-slate-800 hover:bg-slate-100 rounded flex items-center gap-1"
            title="Fit Page to Screen"
          >
            <Maximize2 className="w-3 h-3 text-blue-600" />
            <span>{Math.round(zoom * 100)}%</span>
          </button>

          <button
            type="button"
            onClick={() => onZoomChange(Math.min(4.0, Number((zoom * 1.25).toFixed(3))))}
            className="p-1.5 text-slate-700 hover:bg-slate-100 rounded"
            title="Zoom In"
            aria-label="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {canDeleteSelected && (
            <>
              <div className="w-px h-5 bg-slate-200 mx-0.5" />
              <button
                type="button"
                onClick={onDeleteSelected}
                className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-md text-rose-600 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200/80 flex items-center justify-center transition-colors shrink-0"
                title="Delete selected (Del)"
                aria-label="Delete selected"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
};
