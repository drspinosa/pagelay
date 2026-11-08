/**
 * @license
 * SPDX-License-Identifier: MIT
 *
 * PageLay — Responsive Top Application Toolbar
 *
 * Adapts cleanly to both desktop viewports and mobile phone touchscreens:
 * - Row 1: Fits within 320px+ mobile viewports without horizontal overflow by grouping
 *   file operations into a compact "File" menu on phones while keeping inline buttons on desktop.
 * - Row 2 (Tool Strip): Horizontally scrollable with native touch-scroll-x on narrow screens.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FilePlus2,
  FolderOpen,
  Save,
  Undo2,
  Redo2,
  MousePointer,
  Hand,
  ImagePlus,
  Type,
  Minus,
  MoveUpRight,
  Ruler,
  Square,
  Circle,
  Triangle,
  Highlighter,
  PenTool,
  Eraser,
  Download,
  ChevronDown,
  LayoutGrid,
  Grid,
  Lock,
  Unlock,
  Magnet,
  Eye,
  EyeOff,
  PanelLeft,
  SlidersHorizontal,
  FolderClosed,
  Compass,
  Crosshair,
  Clock,
  X,
  Trash2,
  ChevronRight,
} from 'lucide-react';
import {
  FREEHAND_HIGHLIGHTER_PRESETS,
  HIGHLIGHT_PRESETS,
  PEN_COLOR_PRESETS,
  ToolType,
} from '../model/documentTypes';
import {
  formatRecentTimestamp,
  getRecentEntryAvailabilityStatus,
  RecentDocumentEntry,
} from '../services/recentFilesService';

interface TopToolbarProps {
  documentName: string;
  onChangeDocumentName: (name: string) => void;
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  activeHighlightColor: string;
  onSelectHighlightColor: (color: string) => void;
  penColor: string;
  penWidthMm: number;
  onChangePenColor: (color: string) => void;
  onChangePenWidthMm: (widthMm: number) => void;
  freehandHighlighterColor: string;
  freehandHighlighterWidthMm: number;
  onChangeFreehandHighlighterColor: (color: string) => void;
  onChangeFreehandHighlighterWidthMm: (widthMm: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onNewDocument: () => void;
  onRequestOpenDocument?: () => void;
  onOpenLayFile: (file: File) => void;
  onTriggerOpenNativePicker?: () => Promise<boolean>;
  recentDocuments: RecentDocumentEntry[];
  onSelectRecentDocument: (entry: RecentDocumentEntry) => void;
  onRemoveRecentDocument: (entryId: string) => void;
  onClearRecentDocuments: () => void;
  onSaveLayFile: () => void;
  onSaveAsLayFile: () => void;
  onLoadSampleDocument: () => void;
  onUploadImages: (files: FileList) => void;
  showGuides: boolean;
  lockGuides: boolean;
  snapToGuides: boolean;
  snapToPageEdges: boolean;
  snapToObjects: boolean;
  angleSnapIncrementDeg: number;
  precisionMode: boolean;
  onToggleShowGuides: () => void;
  onToggleLockGuides: () => void;
  onToggleSnapToGuides: () => void;
  onToggleSnapToPageEdges: () => void;
  onToggleSnapToObjects: () => void;
  onChangeAngleSnapIncrement: (deg: number) => void;
  onTogglePrecisionMode: () => void;
  onClearGuides: () => void;
  onOpenExportModal: (defaultTab: 'pdf' | 'image') => void;
  isPagesOpen: boolean;
  isPropertiesOpen: boolean;
  onTogglePages: () => void;
  onToggleProperties: () => void;
  hasSelectedObject: boolean;
}

type DropdownMenuType =
  | 'file'
  | 'recent'
  | 'shape'
  | 'highlight'
  | 'pen'
  | 'freehand-highlighter'
  | 'guides';

type ShapeToolType = 'rectangle' | 'square' | 'ellipse' | 'circle' | 'triangle';

const ANGLE_SNAP_PRESETS = [1, 5, 10, 15, 30, 45] as const;

const EXPECTED_MENU_WIDTH: Record<DropdownMenuType, number> = {
  file: 280,
  recent: 304,
  pen: 256,
  'freehand-highlighter': 256,
  shape: 184,
  highlight: 196,
  guides: 288,
};

const SHAPE_MENU_ITEMS: ReadonlyArray<{
  id: ShapeToolType;
  buttonLabel: string;
  menuLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'rectangle', buttonLabel: 'Rectangle', menuLabel: 'Rectangle', icon: Square },
  { id: 'square', buttonLabel: 'Square', menuLabel: 'Square (1:1)', icon: Square },
  { id: 'ellipse', buttonLabel: 'Ellipse', menuLabel: 'Ellipse', icon: Circle },
  { id: 'circle', buttonLabel: 'Circle', menuLabel: 'Circle (1:1)', icon: Circle },
  { id: 'triangle', buttonLabel: 'Triangle', menuLabel: 'Triangle', icon: Triangle },
];

export const TopToolbar: React.FC<TopToolbarProps> = ({
  documentName,
  onChangeDocumentName,
  activeTool,
  onSelectTool,
  activeHighlightColor,
  onSelectHighlightColor,
  penColor,
  penWidthMm,
  onChangePenColor,
  onChangePenWidthMm,
  freehandHighlighterColor,
  freehandHighlighterWidthMm,
  onChangeFreehandHighlighterColor,
  onChangeFreehandHighlighterWidthMm,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onNewDocument,
  onRequestOpenDocument,
  onOpenLayFile,
  onTriggerOpenNativePicker,
  recentDocuments,
  onSelectRecentDocument,
  onRemoveRecentDocument,
  onClearRecentDocuments,
  onSaveLayFile,
  onSaveAsLayFile,
  onLoadSampleDocument,
  onUploadImages,
  showGuides,
  lockGuides,
  snapToGuides,
  snapToPageEdges,
  snapToObjects,
  angleSnapIncrementDeg,
  precisionMode,
  onToggleShowGuides,
  onToggleLockGuides,
  onToggleSnapToGuides,
  onToggleSnapToPageEdges,
  onToggleSnapToObjects,
  onChangeAngleSnapIncrement,
  onTogglePrecisionMode,
  onClearGuides,
  onOpenExportModal,
  isPagesOpen,
  isPropertiesOpen,
  onTogglePages,
  onToggleProperties,
  hasSelectedObject,
}) => {
  const layInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const toolStripRef = useRef<HTMLDivElement>(null);
  const menuPopoverRef = useRef<HTMLDivElement>(null);

  // Trigger refs for each dropdown menu so popovers position directly below their button
  const fileTriggerRef = useRef<HTMLButtonElement>(null);
  const recentTriggerRef = useRef<HTMLButtonElement>(null);
  const penTriggerRef = useRef<HTMLDivElement>(null);
  const freehandHighlighterTriggerRef = useRef<HTMLDivElement>(null);
  const shapeTriggerRef = useRef<HTMLDivElement>(null);
  const highlightTriggerRef = useRef<HTMLDivElement>(null);
  const guidesTriggerRef = useRef<HTMLButtonElement>(null);

  const [openMenu, setOpenMenu] = useState<DropdownMenuType | null>(null);
  const [isMobileRecentExpanded, setIsMobileRecentExpanded] =
    useState<boolean>(false);
  const [isConfirmingClearRecent, setIsConfirmingClearRecent] =
    useState<boolean>(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    maxHeight: number;
  }>({ top: 84, left: 12, maxHeight: 480 });

  // Remember the last selected shape even after the editor returns to Select post-drawing
  const [lastSelectedShape, setLastSelectedShape] =
    useState<ShapeToolType>('rectangle');

  useEffect(() => {
    if (
      activeTool === 'rectangle' ||
      activeTool === 'square' ||
      activeTool === 'ellipse' ||
      activeTool === 'circle' ||
      activeTool === 'triangle'
    ) {
      setLastSelectedShape(activeTool);
    }
  }, [activeTool]);

  const [angleInputText, setAngleInputText] = useState<string>(
    String(angleSnapIncrementDeg)
  );

  useEffect(() => {
    setAngleInputText(String(angleSnapIncrementDeg));
  }, [angleSnapIncrementDeg]);

  const commitAngleInput = (raw: string) => {
    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed)) {
      setAngleInputText(String(angleSnapIncrementDeg));
      return;
    }
    const parsed = parseInt(trimmed, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 45) {
      setAngleInputText(String(angleSnapIncrementDeg));
      return;
    }
    onChangeAngleSnapIncrement(parsed);
    setAngleInputText(String(parsed));
  };

  const getTriggerElement = useCallback(
    (menu: DropdownMenuType): HTMLElement | null => {
      switch (menu) {
        case 'file':
          return fileTriggerRef.current;
        case 'recent':
          return recentTriggerRef.current;
        case 'pen':
          return penTriggerRef.current;
        case 'freehand-highlighter':
          return freehandHighlighterTriggerRef.current;
        case 'shape':
          return shapeTriggerRef.current;
        case 'highlight':
          return highlightTriggerRef.current;
        case 'guides':
          return guidesTriggerRef.current;
      }
    },
    []
  );

  const computeMenuCoords = useCallback(
    (menu: DropdownMenuType) => {
      const triggerEl = getTriggerElement(menu);
      if (!triggerEl || typeof window === 'undefined') {
        return { top: 84, left: 12, maxHeight: 480 };
      }
      const rect = triggerEl.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const margin = 8;

      const measuredW =
        menuPopoverRef.current?.offsetWidth || EXPECTED_MENU_WIDTH[menu];
      const effectiveW = Math.min(measuredW, viewportW - margin * 2);

      let left = rect.left;
      if (left + effectiveW > viewportW - margin) {
        left = viewportW - effectiveW - margin;
      }
      if (left < margin) {
        left = margin;
      }

      const top = Math.max(margin, Math.round(rect.bottom + 6));
      const maxHeight = Math.max(160, Math.round(viewportH - top - margin));

      return {
        top,
        left: Math.round(left),
        maxHeight,
      };
    },
    [getTriggerElement]
  );

  const toggleMenu = useCallback(
    (menu: DropdownMenuType) => {
      setIsConfirmingClearRecent(false);
      setOpenMenu((prev) => {
        if (prev === menu) return null;
        setMenuPosition(computeMenuCoords(menu));
        return menu;
      });
    },
    [computeMenuCoords]
  );

  const openSpecificMenu = useCallback(
    (menu: DropdownMenuType) => {
      setIsConfirmingClearRecent(false);
      setMenuPosition(computeMenuCoords(menu));
      setOpenMenu(menu);
    },
    [computeMenuCoords]
  );

  const closeAllMenus = useCallback(() => {
    setIsConfirmingClearRecent(false);
    setOpenMenu(null);
  }, []);

  // Keep open dropdown anchored beneath its trigger button on resize and horizontal toolbar scroll
  useLayoutEffect(() => {
    if (!openMenu) return;

    const updatePosition = () => {
      setMenuPosition(computeMenuCoords(openMenu));
    };

    updatePosition();

    const stripEl = toolStripRef.current;
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    stripEl?.addEventListener('scroll', updatePosition, { passive: true });

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      stripEl?.removeEventListener('scroll', updatePosition);
    };
  }, [openMenu, computeMenuCoords]);

  // Close open dropdown menu when clicking/tapping outside or pressing Escape (without deactivating the chosen tool)
  useEffect(() => {
    if (!openMenu) return;

    const handleOutsidePointerDown = (e: PointerEvent | MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (menuPopoverRef.current?.contains(target)) return;
      const triggerEl = getTriggerElement(openMenu);
      if (triggerEl?.contains(target)) return;
      setOpenMenu(null);
    };

    const handleKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        setOpenMenu(null);
      }
    };

    window.addEventListener('pointerdown', handleOutsidePointerDown, true);
    window.addEventListener('mousedown', handleOutsidePointerDown, true);
    window.addEventListener('keydown', handleKeyDownCapture, true);

    return () => {
      window.removeEventListener('pointerdown', handleOutsidePointerDown, true);
      window.removeEventListener('mousedown', handleOutsidePointerDown, true);
      window.removeEventListener('keydown', handleKeyDownCapture, true);
    };
  }, [openMenu, getTriggerElement]);

  const isShapeTool =
    activeTool === 'rectangle' ||
    activeTool === 'square' ||
    activeTool === 'ellipse' ||
    activeTool === 'circle' ||
    activeTool === 'triangle';

  const currentShapeMeta =
    SHAPE_MENU_ITEMS.find((item) => item.id === lastSelectedShape) ??
    SHAPE_MENU_ITEMS[0];
  const CurrentShapeIcon = currentShapeMeta.icon;

  const displayedRecentDocs = recentDocuments.slice(0, 10);

  const renderRecentDocumentsList = (isMobileInline: boolean) => {
    if (displayedRecentDocs.length === 0) {
      return (
        <div
          className={`px-3 py-3 text-center text-[11px] text-slate-400 ${
            isMobileInline ? 'bg-slate-50/80 border-y border-slate-100' : ''
          }`}
        >
          No recent documents yet.
        </div>
      );
    }

    return (
      <div
        className={
          isMobileInline
            ? 'bg-slate-50/80 border-y border-slate-100 py-1'
            : 'py-0.5'
        }
      >
        <div
          data-allow-touch-scroll="true"
          className={
            isMobileInline
              ? 'max-h-52 overflow-y-auto overscroll-contain touch-pan-y divide-y divide-slate-100'
              : 'max-h-72 overflow-y-auto overscroll-contain touch-pan-y divide-y divide-slate-100'
          }
        >
          {displayedRecentDocs.map((entry) => {
            const timeLabel = formatRecentTimestamp(entry.lastAccessedAtMs);
            const availability = getRecentEntryAvailabilityStatus(entry);
            return (
              <div
                key={entry.id}
                className="flex items-stretch justify-between hover:bg-slate-100/90 transition-colors group"
              >
                <button
                  type="button"
                  onClick={() => {
                    closeAllMenus();
                    onSelectRecentDocument(entry);
                  }}
                  className="flex-1 min-w-0 px-3 py-2 text-left flex flex-col gap-0.5"
                  title={`${entry.filename} — ${availability.label} (${availability.description})`}
                >
                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                    <span className="font-mono font-semibold text-xs text-slate-800 truncate">
                      {entry.filename}
                    </span>
                    <span
                      className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none border ${
                        availability.status === 'open-directly'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                          : availability.status === 'local-copy'
                          ? 'bg-blue-50 text-blue-700 border-blue-200/80'
                          : 'bg-amber-50 text-amber-700 border-amber-200/80'
                      }`}
                    >
                      {availability.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 truncate">
                    {timeLabel && <span>{timeLabel}</span>}
                    {entry.paperSize && (
                      <>
                        <span>·</span>
                        <span className="font-mono">{entry.paperSize}</span>
                      </>
                    )}
                  </div>
                </button>

                {/* Separated Remove button so selecting a document never triggers Remove accidentally */}
                <div className="flex items-center pr-1.5 pl-1 border-l border-slate-100 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveRecentDocument(entry.id);
                    }}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                    title={`Remove "${entry.filename}" from recent documents`}
                    aria-label={`Remove ${entry.filename} from recent documents`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer: Clear Recent History with 2-step confirmation to prevent accidental taps */}
        <div className="px-2.5 pt-1.5 pb-1 border-t border-slate-200/80 flex items-center justify-between gap-2">
          {isConfirmingClearRecent ? (
            <div className="w-full flex items-center justify-between gap-1.5">
              <span className="text-[10px] font-semibold text-rose-700 truncate">
                Clear recent list?
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsConfirmingClearRecent(false);
                  }}
                  className="px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-200 rounded"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsConfirmingClearRecent(false);
                    onClearRecentDocuments();
                  }}
                  className="px-2 py-1 text-[10px] font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded"
                >
                  Clear All
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsConfirmingClearRecent(true);
              }}
              className="w-full px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-rose-700 hover:bg-rose-50/70 rounded flex items-center justify-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear Recent History</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  const dropdownPortalContent = openMenu ? (
    <>
      {/* For non-drawing menus (File, Recent, Guides & Snap), provide a click-outside backdrop so dismissing never triggers canvas actions */}
      {(openMenu === 'file' || openMenu === 'recent' || openMenu === 'guides') && (
        <div
          className="fixed inset-0 z-40"
          onClick={closeAllMenus}
          onTouchStart={closeAllMenus}
        />
      )}

      {openMenu === 'file' && (
        <div
          ref={menuPopoverRef}
          role="menu"
          data-allow-touch-scroll="true"
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            maxHeight: menuPosition.maxHeight,
          }}
          className="fixed w-68 max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain touch-pan-y bg-white border border-slate-200 rounded-lg shadow-xl py-1.5 z-50 text-xs"
        >
          <div className="px-3 py-1 text-[11px] font-semibold text-slate-400">
            Document Actions
          </div>
          {/* 1. New Document */}
          <button
            type="button"
            onClick={() => {
              closeAllMenus();
              onNewDocument();
            }}
            className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 text-slate-700"
          >
            <FilePlus2 className="w-4 h-4 text-slate-600 shrink-0" />
            <span>New Document...</span>
          </button>

          {/* 2. Open .lay Document */}
          <button
            type="button"
            onClick={async () => {
              closeAllMenus();
              if (onRequestOpenDocument) {
                onRequestOpenDocument();
                return;
              }
              if (onTriggerOpenNativePicker) {
                const useFallbackInput = await onTriggerOpenNativePicker();
                if (useFallbackInput) {
                  layInputRef.current?.click();
                }
              } else {
                layInputRef.current?.click();
              }
            }}
            className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 text-slate-700"
          >
            <FolderOpen className="w-4 h-4 text-slate-600 shrink-0" />
            <span>Open .lay Document...</span>
          </button>

          {/* 3. Open Recent (Expands inline inside the mobile File menu) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsConfirmingClearRecent(false);
              setIsMobileRecentExpanded((prev) => !prev);
            }}
            className="w-full px-3 py-2 text-left flex items-center justify-between gap-2 hover:bg-slate-100 text-slate-700"
            aria-expanded={isMobileRecentExpanded}
          >
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-slate-600 shrink-0" />
              <span>Open Recent</span>
            </div>
            <div className="flex items-center gap-1.5">
              {displayedRecentDocs.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono text-[10px] font-semibold leading-none">
                  {displayedRecentDocs.length}
                </span>
              )}
              {isMobileRecentExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              )}
            </div>
          </button>

          {isMobileRecentExpanded && renderRecentDocumentsList(true)}

          {/* 4. Save */}
          <button
            type="button"
            onClick={() => {
              closeAllMenus();
              onSaveLayFile();
            }}
            className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 text-slate-800 font-medium"
          >
            <Save className="w-4 h-4 text-slate-700 shrink-0" />
            <span>Save Editable .lay File</span>
          </button>

          {/* 5. Save As */}
          <button
            type="button"
            onClick={() => {
              closeAllMenus();
              onSaveAsLayFile();
            }}
            className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 text-slate-700"
          >
            <Save className="w-4 h-4 text-slate-500 shrink-0" />
            <span>Save As...</span>
          </button>

          <div className="my-1 border-t border-slate-100" />

          {/* 6. Sample A0 */}
          <button
            type="button"
            onClick={() => {
              closeAllMenus();
              onLoadSampleDocument();
            }}
            className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-blue-50 text-blue-700 font-medium"
          >
            <LayoutGrid className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Load Sample A0 Stand Layout</span>
          </button>
        </div>
      )}

      {/* Desktop Open Recent Dropdown Popover */}
      {openMenu === 'recent' && (
        <div
          ref={menuPopoverRef}
          role="menu"
          data-allow-touch-scroll="true"
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            maxHeight: menuPosition.maxHeight,
          }}
          className="fixed w-76 max-w-[calc(100vw-16px)] overflow-hidden bg-white border border-slate-200 rounded-lg shadow-xl py-1.5 z-50 text-xs"
        >
          <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-700">
              Open Recent (.lay)
            </span>
            <span className="font-mono text-[10px] text-slate-400">
              {displayedRecentDocs.length} / 10
            </span>
          </div>
          {renderRecentDocumentsList(false)}
        </div>
      )}

      {/* Windows Snipping Tool-Style Pen Settings Popover */}
      {openMenu === 'pen' && (
        <div
          ref={menuPopoverRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            maxHeight: menuPosition.maxHeight,
          }}
          className="fixed w-64 max-w-[calc(100vw-16px)] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl p-3 z-50 text-xs space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-700">
              Pen Colour & Thickness
            </span>
            <span className="font-mono text-[11px] font-semibold text-blue-600">
              {penWidthMm.toFixed(1)} mm
            </span>
          </div>

          {/* Live Curved Stroke Preview */}
          <div
            className="w-full h-12 rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden"
            style={{
              backgroundColor:
                penColor.toUpperCase() === '#FFFFFF' ? '#1E293B' : '#F8FAFC',
            }}
          >
            <svg width="210" height="36" viewBox="0 0 210 36" className="overflow-visible">
              <path
                d="M 16 24 Q 62 6, 105 18 T 194 14"
                fill="none"
                stroke={penColor}
                strokeWidth={Math.max(1.5, Math.min(22, penWidthMm * 3.8))}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* 12 Preset Colour Circles (2 rows of 6) */}
          <div className="grid grid-cols-6 gap-2 justify-items-center py-0.5">
            {PEN_COLOR_PRESETS.map((preset) => {
              const isSelected =
                penColor.toUpperCase() === preset.color.toUpperCase();
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    onChangePenColor(preset.color);
                    onSelectTool('pen');
                  }}
                  className={`w-7 h-7 rounded-full border transition-transform ${
                    isSelected
                      ? 'ring-2 ring-blue-600 ring-offset-2 scale-110 border-slate-400'
                      : 'border-slate-300 hover:scale-105'
                  }`}
                  style={{ backgroundColor: preset.color }}
                  title={preset.name}
                  aria-label={`Pen colour ${preset.name}`}
                />
              );
            })}
          </div>

          {/* Thickness Slider (0.3 mm to 5.0 mm) */}
          <div className="space-y-1 pt-1 border-t border-slate-100">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Size</span>
              <span className="font-mono text-slate-700">
                {penWidthMm.toFixed(1)} mm
              </span>
            </div>
            <input
              type="range"
              min={0.3}
              max={5.0}
              step={0.1}
              value={penWidthMm}
              onChange={(e) => {
                onChangePenWidthMm(Number(parseFloat(e.target.value).toFixed(1)));
                if (activeTool !== 'pen') onSelectTool('pen');
              }}
              className="w-full accent-blue-600 cursor-pointer"
              aria-label="Pen stroke thickness in millimetres"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span>0.3 mm</span>
              <span>0.8 mm</span>
              <span>5.0 mm</span>
            </div>
          </div>
        </div>
      )}

      {/* Windows Snipping Tool-Style Freehand Highlighter Settings Popover */}
      {openMenu === 'freehand-highlighter' && (
        <div
          ref={menuPopoverRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            maxHeight: menuPosition.maxHeight,
          }}
          className="fixed w-64 max-w-[calc(100vw-16px)] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl p-3 z-50 text-xs space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-700">
              Highlighter Colour & Size
            </span>
            <span className="font-mono text-[11px] font-semibold text-blue-600">
              {freehandHighlighterWidthMm.toFixed(1)} mm
            </span>
          </div>

          {/* Live Translucent Stroke Preview */}
          <div className="relative w-full h-12 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden">
            <span className="text-[11px] font-mono font-semibold text-slate-500 select-none tracking-wider">
              SAMPLE PLAN NOTE
            </span>
            <svg
              width="210"
              height="36"
              viewBox="0 0 210 36"
              className="absolute inset-0 w-full h-full overflow-visible"
            >
              <path
                d="M 20 22 Q 70 12, 110 18 T 190 16"
                fill="none"
                stroke={freehandHighlighterColor}
                strokeWidth={Math.max(6, Math.min(28, freehandHighlighterWidthMm * 1.5))}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.38}
              />
            </svg>
          </div>

          {/* 6 Fluorescent Highlighter Colour Circles */}
          <div className="grid grid-cols-6 gap-2 justify-items-center py-0.5">
            {FREEHAND_HIGHLIGHTER_PRESETS.map((preset) => {
              const isSelected =
                freehandHighlighterColor.toUpperCase() ===
                preset.color.toUpperCase();
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    onChangeFreehandHighlighterColor(preset.color);
                    onSelectTool('freehand-highlighter');
                  }}
                  className={`w-7 h-7 rounded-full border transition-transform ${
                    isSelected
                      ? 'ring-2 ring-blue-600 ring-offset-2 scale-110 border-slate-400'
                      : 'border-slate-300 hover:scale-105'
                  }`}
                  style={{ backgroundColor: preset.color }}
                  title={preset.name}
                  aria-label={`Highlighter colour ${preset.name}`}
                />
              );
            })}
          </div>

          {/* Thickness Slider (2 mm to 20 mm) */}
          <div className="space-y-1 pt-1 border-t border-slate-100">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Size</span>
              <span className="font-mono text-slate-700">
                {freehandHighlighterWidthMm.toFixed(1)} mm
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={20}
              step={0.5}
              value={freehandHighlighterWidthMm}
              onChange={(e) => {
                onChangeFreehandHighlighterWidthMm(
                  Number(parseFloat(e.target.value).toFixed(1))
                );
                if (activeTool !== 'freehand-highlighter') {
                  onSelectTool('freehand-highlighter');
                }
              }}
              className="w-full accent-blue-600 cursor-pointer"
              aria-label="Highlighter stroke thickness in millimetres"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span>2 mm</span>
              <span>6 mm</span>
              <span>20 mm</span>
            </div>
          </div>
        </div>
      )}

      {openMenu === 'shape' && (
        <div
          ref={menuPopoverRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            maxHeight: menuPosition.maxHeight,
          }}
          className="fixed w-44 max-w-[calc(100vw-16px)] overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl py-1 z-50"
        >
          {SHAPE_MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            const isCurrent =
              activeTool === item.id ||
              (!isShapeTool && lastSelectedShape === item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setLastSelectedShape(item.id);
                  onSelectTool(item.id);
                  closeAllMenus();
                }}
                className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-slate-100 ${
                  isCurrent
                    ? 'font-semibold text-blue-600 bg-blue-50/50'
                    : 'text-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.menuLabel}</span>
              </button>
            );
          })}
        </div>
      )}

      {openMenu === 'highlight' && (
        <div
          ref={menuPopoverRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            maxHeight: menuPosition.maxHeight,
          }}
          className="fixed w-48 max-w-[calc(100vw-16px)] overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl p-2 z-50"
        >
          <div className="text-[11px] font-medium text-slate-500 mb-1.5 px-1">
            Area Highlight Colour
          </div>
          <div className="grid grid-cols-2 gap-1">
            {HIGHLIGHT_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => {
                  onSelectHighlightColor(preset.color);
                  onSelectTool('highlight');
                  closeAllMenus();
                }}
                className={`px-2 py-1.5 text-xs rounded flex items-center gap-2 border ${
                  activeHighlightColor === preset.color
                    ? 'border-blue-600 bg-blue-50/40 font-medium text-slate-900'
                    : 'border-transparent hover:bg-slate-100 text-slate-700'
                }`}
              >
                <span
                  className="w-3.5 h-3.5 rounded-sm border border-black/15 shrink-0"
                  style={{ backgroundColor: preset.color }}
                />
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {openMenu === 'guides' && (
        <div
          ref={menuPopoverRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            maxHeight: menuPosition.maxHeight,
          }}
          className="fixed w-72 max-w-[calc(100vw-16px)] touch-scroll-y bg-white border border-slate-200 rounded-lg shadow-xl py-1.5 z-50 text-xs"
        >
          {/* GROUP 1: MAGNETIC SNAPPING */}
          <div className="px-3 py-1 text-[11px] font-semibold text-slate-400">
            Magnetic Snapping
          </div>

          <button
            type="button"
            onClick={onToggleSnapToGuides}
            className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-100 text-slate-700"
          >
            <span className="flex items-center gap-2">
              <Magnet
                className={`w-3.5 h-3.5 ${
                  snapToGuides ? 'text-blue-600' : 'text-slate-400'
                }`}
              />
              <span>Snap to Guidelines</span>
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              {snapToGuides ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleSnapToPageEdges}
            className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-100 text-slate-700"
          >
            <span className="flex items-center gap-2">
              <Magnet
                className={`w-3.5 h-3.5 ${
                  snapToPageEdges ? 'text-blue-600' : 'text-slate-400'
                }`}
              />
              <span>Snap to Page Edges</span>
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              {snapToPageEdges ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleSnapToObjects}
            className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-100 text-slate-700"
          >
            <span className="flex items-center gap-2">
              <Magnet
                className={`w-3.5 h-3.5 ${
                  snapToObjects ? 'text-blue-600' : 'text-slate-400'
                }`}
              />
              <span>Snap to Objects</span>
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              {snapToObjects ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* GROUP 2: ANGLE SNAPPING */}
          <div className="my-1.5 border-t border-slate-100" />
          <div className="px-3 py-1 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-blue-600" />
                <span>Angle Snapping</span>
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={45}
                  step={1}
                  value={angleInputText}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAngleInputText(val);
                    if (/^\d+$/.test(val.trim())) {
                      const num = parseInt(val.trim(), 10);
                      if (num >= 1 && num <= 45) {
                        onChangeAngleSnapIncrement(num);
                      }
                    }
                  }}
                  onBlur={() => commitAngleInput(angleInputText)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitAngleInput(angleInputText);
                      (e.target as HTMLInputElement).blur();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setAngleInputText(String(angleSnapIncrementDeg));
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="w-12 px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded font-mono text-xs text-right text-slate-800 focus:outline-none focus:border-blue-600"
                  title="Enter whole-number angle increment between 1° and 45°"
                  aria-label="Angle snap increment in degrees"
                />
                <span className="text-[11px] font-mono text-slate-500">°</span>
              </div>
            </div>

            <div className="grid grid-cols-6 gap-1">
              {ANGLE_SNAP_PRESETS.map((preset) => {
                const isActive = angleSnapIncrementDeg === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      onChangeAngleSnapIncrement(preset);
                      setAngleInputText(String(preset));
                    }}
                    className={`py-1 rounded font-mono text-[11px] font-medium border transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {preset}°
                  </button>
                );
              })}
            </div>

            <div className="text-[10px] text-slate-500 flex items-center justify-between">
              <span>Keyboard: Hold Shift</span>
              <span className="font-mono text-slate-600">
                1°–45° (Current: {angleSnapIncrementDeg}°)
              </span>
            </div>
          </div>

          {/* GROUP 3: PRECISION */}
          <div className="my-1.5 border-t border-slate-100" />
          <div className="px-3 py-1 text-[11px] font-semibold text-slate-400">
            Precision
          </div>

          <button
            type="button"
            onClick={onTogglePrecisionMode}
            className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-100 text-slate-700"
          >
            <span className="flex items-center gap-2">
              <Crosshair
                className={`w-3.5 h-3.5 ${
                  precisionMode ? 'text-emerald-600' : 'text-slate-400'
                }`}
              />
              <span>Precision Mode (Touch)</span>
            </span>
            <span
              className={`font-mono text-[11px] font-semibold ${
                precisionMode ? 'text-emerald-600' : 'text-slate-500'
              }`}
            >
              {precisionMode ? 'ON' : 'OFF'}
            </span>
          </button>

          <div className="px-3 py-1 space-y-0.5 text-[10px] text-slate-500">
            <div>Guide movement: Shift = 1 mm</div>
            <div>Line / Arrow / Dimension: Shift = 1 mm start & length + angle snap</div>
            <div>Exact guide positions available in Properties</div>
          </div>

          {/* RULERS & GUIDELINES VISIBILITY / LOCK */}
          <div className="my-1.5 border-t border-slate-100" />
          <div className="px-3 py-1 text-[11px] font-semibold text-slate-400">
            Rulers & Millimetre Guidelines
          </div>
          <button
            type="button"
            onClick={onToggleShowGuides}
            className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-100 text-slate-700"
          >
            <span className="flex items-center gap-2">
              {showGuides ? (
                <Eye className="w-3.5 h-3.5 text-cyan-600" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>Show Guidelines</span>
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              {showGuides ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleLockGuides}
            className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-100 text-slate-700"
          >
            <span className="flex items-center gap-2">
              {lockGuides ? (
                <Lock className="w-3.5 h-3.5 text-amber-600" />
              ) : (
                <Unlock className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>Lock Guidelines</span>
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              {lockGuides ? 'LOCKED' : 'OFF'}
            </span>
          </button>

          <div className="my-1 border-t border-slate-100" />
          <button
            type="button"
            onClick={() => {
              onClearGuides();
              closeAllMenus();
            }}
            className="w-full px-3 py-1.5 text-left text-rose-600 hover:bg-rose-50"
          >
            Clear Page Guidelines
          </button>
        </div>
      )}
    </>
  ) : null;

  return (
    <header className="w-full max-w-full bg-white border-b border-slate-200 select-none shrink-0 z-40 relative">
      {/* Hidden File Pickers */}
      <input
        ref={layInputRef}
        type="file"
        accept=".lay,application/zip,application/octet-stream"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onOpenLayFile(file);
          e.target.value = '';
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onUploadImages(e.target.files);
          }
          e.target.value = '';
        }}
      />

      {/* Top Row: Brand, Document Name, File Actions, History, Sidebar Toggles & Export */}
      <div className="h-11 w-full max-w-full px-1.5 sm:px-3 flex items-center justify-between gap-1 sm:gap-1.5 border-b border-slate-100 overflow-hidden">
        {/* Left: Pages Drawer Toggle + Brand + File Menu (Mobile) + Document Name */}
        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={onTogglePages}
            className={`p-1.5 rounded border text-xs flex items-center gap-1 transition-colors shrink-0 ${
              isPagesOpen
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
            title="Toggle Pages Panel"
            aria-label="Toggle Pages Panel"
          >
            <PanelLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px] font-medium">Pages</span>
          </button>

          <div className="flex items-center gap-1.5 pr-1 sm:pr-1.5 border-r border-slate-200 shrink-0">
            <div className="w-6 h-6 rounded bg-slate-900 text-white flex items-center justify-center font-bold text-[11px] tracking-tight">
              PL
            </div>
            <span className="hidden lg:inline font-bold text-sm tracking-tight text-slate-900 whitespace-nowrap">
              PageLay
            </span>
          </div>

          {/* Mobile Compact File Menu Button (< 768px) */}
          <button
            ref={fileTriggerRef}
            type="button"
            onClick={() => toggleMenu('file')}
            className={`md:hidden px-2 py-1 rounded border text-xs font-medium flex items-center gap-1 shrink-0 transition-colors ${
              openMenu === 'file'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
            title="File Menu (New, Open, Save .lay, Sample A0)"
          >
            <FolderClosed className="w-3.5 h-3.5" />
            <span>File</span>
            <ChevronDown className="w-3 h-3 opacity-70" />
          </button>

          {/* Editable Document Name */}
          <input
            type="text"
            value={documentName}
            onChange={(e) => onChangeDocumentName(e.target.value)}
            className="flex-1 min-w-[64px] max-w-[140px] sm:max-w-[200px] px-2 py-0.5 text-xs font-medium text-slate-800 bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200 focus:border-blue-600 rounded focus:outline-none truncate"
            title="Document Name (saved as .lay)"
            aria-label="Document Name"
          />

          {/* Desktop Inline File Operations (md+) */}
          <div className="hidden md:flex items-center gap-1 pl-1 border-l border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => {
                closeAllMenus();
                onNewDocument();
              }}
              className="px-2 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded flex items-center gap-1 transition-colors whitespace-nowrap"
              title="New Document"
            >
              <FilePlus2 className="w-3.5 h-3.5 text-slate-600" />
              <span>New</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                closeAllMenus();
                if (onRequestOpenDocument) {
                  onRequestOpenDocument();
                  return;
                }
                if (onTriggerOpenNativePicker) {
                  const useFallbackInput = await onTriggerOpenNativePicker();
                  if (useFallbackInput) {
                    layInputRef.current?.click();
                  }
                } else {
                  layInputRef.current?.click();
                }
              }}
              className="px-2 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded flex items-center gap-1 transition-colors whitespace-nowrap"
              title="Open .lay Document"
            >
              <FolderOpen className="w-3.5 h-3.5 text-slate-600" />
              <span>Open</span>
            </button>

            <button
              ref={recentTriggerRef}
              type="button"
              onClick={() => toggleMenu('recent')}
              className={`px-2 py-1 text-xs font-medium rounded flex items-center gap-1 transition-colors whitespace-nowrap ${
                openMenu === 'recent'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
              }`}
              title="Open Recent .lay Documents"
              aria-expanded={openMenu === 'recent'}
            >
              <Clock
                className={`w-3.5 h-3.5 ${
                  openMenu === 'recent' ? 'text-white' : 'text-slate-600'
                }`}
              />
              <span>Recent</span>
              {displayedRecentDocs.length > 0 && (
                <span
                  className={`px-1 py-0.2 rounded font-mono text-[10px] leading-tight ${
                    openMenu === 'recent'
                      ? 'bg-slate-700 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {displayedRecentDocs.length}
                </span>
              )}
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>

            <button
              type="button"
              onClick={() => {
                closeAllMenus();
                onSaveLayFile();
              }}
              className="px-2 py-1 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded flex items-center gap-1 transition-colors whitespace-nowrap"
              title="Save Editable .lay File (Ctrl+S)"
            >
              <Save className="w-3.5 h-3.5 text-slate-700" />
              <span>Save</span>
            </button>

            <button
              type="button"
              onClick={() => {
                closeAllMenus();
                onSaveAsLayFile();
              }}
              className="px-2 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded flex items-center gap-1 transition-colors whitespace-nowrap"
              title="Save Document As New .lay File (Ctrl+Shift+S)"
            >
              <span>Save As...</span>
            </button>

            <button
              type="button"
              onClick={() => {
                closeAllMenus();
                onLoadSampleDocument();
              }}
              className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded flex items-center gap-1 transition-colors whitespace-nowrap"
              title="Load Sample A0 Exhibition Stand Layout"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Sample A0</span>
            </button>
          </div>
        </div>

        {/* Right: Undo/Redo + Properties Toggle + Export */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            className="p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-35 disabled:pointer-events-none rounded transition-colors"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            className="p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-35 disabled:pointer-events-none rounded transition-colors"
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleProperties}
            className={`p-1.5 sm:px-2 sm:py-1 rounded border text-xs flex items-center gap-1 transition-colors ${
              isPropertiesOpen
                ? 'bg-slate-900 text-white border-slate-900'
                : hasSelectedObject
                ? 'bg-blue-50 text-blue-700 border-blue-300 font-semibold'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
            title="Toggle Properties & Setup Panel"
            aria-label="Toggle Properties Panel"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px]">Properties</span>
          </button>

          <button
            type="button"
            onClick={() => {
              closeAllMenus();
              onOpenExportModal('pdf');
            }}
            className="px-2 sm:px-2.5 py-1 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded flex items-center gap-1 transition-colors whitespace-nowrap"
            title="Export Print-Ready PDF or High-Res PNG/JPG"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Second Row: Horizontally Scrollable Editing & Drawing Tools Strip */}
      <div
        ref={toolStripRef}
        className="h-10 w-full max-w-full px-1.5 sm:px-3 bg-slate-50/90 flex items-center gap-1 touch-scroll-x no-scrollbar"
      >
        <button
          type="button"
          onClick={() => {
            closeAllMenus();
            onSelectTool('select');
          }}
          className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            activeTool === 'select'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-700 hover:bg-white border border-transparent hover:border-slate-200'
          }`}
        >
          <MousePointer className="w-3.5 h-3.5" />
          <span>Select</span>
        </button>

        <button
          type="button"
          onClick={() => {
            closeAllMenus();
            onSelectTool('pan');
          }}
          className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            activeTool === 'pan'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-700 hover:bg-white border border-transparent hover:border-slate-200'
          }`}
        >
          <Hand className="w-3.5 h-3.5" />
          <span>Slide / Pan</span>
        </button>

        <div className="w-px h-4 bg-slate-300 mx-0.5 shrink-0" />

        <button
          type="button"
          onClick={() => {
            closeAllMenus();
            imageInputRef.current?.click();
          }}
          className="px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-white rounded flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <ImagePlus className="w-3.5 h-3.5 text-blue-600" />
          <span>Image</span>
        </button>

        <button
          type="button"
          onClick={() => {
            closeAllMenus();
            onSelectTool('text');
          }}
          className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            activeTool === 'text'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-700 hover:bg-white'
          }`}
        >
          <Type className="w-3.5 h-3.5" />
          <span>Text</span>
        </button>

        <button
          type="button"
          onClick={() => {
            closeAllMenus();
            onSelectTool('line');
          }}
          className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            activeTool === 'line'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-700 hover:bg-white'
          }`}
        >
          <Minus className="w-3.5 h-3.5" />
          <span>Line</span>
        </button>

        <button
          type="button"
          onClick={() => {
            closeAllMenus();
            onSelectTool('arrow');
          }}
          className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            activeTool === 'arrow'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-700 hover:bg-white'
          }`}
        >
          <MoveUpRight className="w-3.5 h-3.5" />
          <span>Arrow</span>
        </button>

        <button
          type="button"
          onClick={() => {
            closeAllMenus();
            onSelectTool('dimension');
          }}
          className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            activeTool === 'dimension'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-700 hover:bg-white'
          }`}
        >
          <Ruler className="w-3.5 h-3.5" />
          <span>Dimension</span>
        </button>

        {/* Freehand Pen Button + Settings Popover Trigger (Opens settings & activates Pen on first click) */}
        <div ref={penTriggerRef} className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => {
              if (activeTool !== 'pen') {
                onSelectTool('pen');
                openSpecificMenu('pen');
              } else {
                toggleMenu('pen');
              }
            }}
            className={`px-2.5 py-1 text-xs font-medium rounded-l flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTool === 'pen'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-700 hover:bg-white'
            }`}
            title="Freehand Pen — Activates Pen and opens colour & thickness settings"
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>Pen</span>
            <span
              className="w-2.5 h-2.5 rounded-full border border-black/25 shrink-0"
              style={{ backgroundColor: penColor }}
            />
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeTool !== 'pen') {
                onSelectTool('pen');
                openSpecificMenu('pen');
              } else {
                toggleMenu('pen');
              }
            }}
            className={`px-1 py-1 text-xs rounded-r border-l transition-colors ${
              activeTool === 'pen'
                ? 'bg-blue-700 text-white border-blue-500'
                : 'text-slate-600 hover:bg-white border-slate-200'
            }`}
            title="Pen colour & stroke thickness"
            aria-label="Pen colour and stroke thickness"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Freehand Highlighter Button + Settings Popover Trigger (Opens settings & activates Highlighter on first click) */}
        <div
          ref={freehandHighlighterTriggerRef}
          className="flex items-center shrink-0"
        >
          <button
            type="button"
            onClick={() => {
              if (activeTool !== 'freehand-highlighter') {
                onSelectTool('freehand-highlighter');
                openSpecificMenu('freehand-highlighter');
              } else {
                toggleMenu('freehand-highlighter');
              }
            }}
            className={`px-2.5 py-1 text-xs font-medium rounded-l flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTool === 'freehand-highlighter'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-700 hover:bg-white'
            }`}
            title="Freehand Highlighter — Activates Highlighter and opens colour & thickness settings"
          >
            <Highlighter className="w-3.5 h-3.5" />
            <span>Highlighter</span>
            <span
              className="w-2.5 h-2.5 rounded-sm border border-black/20 shrink-0"
              style={{ backgroundColor: freehandHighlighterColor }}
            />
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeTool !== 'freehand-highlighter') {
                onSelectTool('freehand-highlighter');
                openSpecificMenu('freehand-highlighter');
              } else {
                toggleMenu('freehand-highlighter');
              }
            }}
            className={`px-1 py-1 text-xs rounded-r border-l transition-colors ${
              activeTool === 'freehand-highlighter'
                ? 'bg-blue-700 text-white border-blue-500'
                : 'text-slate-600 hover:bg-white border-slate-200'
            }`}
            title="Highlighter colour & stroke thickness"
            aria-label="Highlighter colour and stroke thickness"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Basic Eraser Button (Erases only Freehand Pen & Highlighter strokes) */}
        <button
          type="button"
          onClick={() => {
            closeAllMenus();
            onSelectTool('eraser');
          }}
          className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            activeTool === 'eraser'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-700 hover:bg-white'
          }`}
          title="Eraser — Click or drag across freehand Pen or Highlighter strokes to remove them"
        >
          <Eraser className="w-3.5 h-3.5" />
          <span>Eraser</span>
        </button>

        {/* Shapes Button + Menu Trigger (Remembers last selected shape & opens menu on first click) */}
        <div ref={shapeTriggerRef} className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => {
              if (!isShapeTool) {
                onSelectTool(lastSelectedShape);
              }
              toggleMenu('shape');
            }}
            className={`px-2.5 py-1 text-xs font-medium rounded-l flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              isShapeTool
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-700 hover:bg-white'
            }`}
            title={`Shapes (${currentShapeMeta.buttonLabel}) — Click to choose Rectangle, Square, Ellipse, Circle or Triangle`}
          >
            <CurrentShapeIcon className="w-3.5 h-3.5" />
            <span>{currentShapeMeta.buttonLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!isShapeTool) {
                onSelectTool(lastSelectedShape);
              }
              toggleMenu('shape');
            }}
            className={`px-1 py-1 text-xs rounded-r border-l transition-colors ${
              isShapeTool
                ? 'bg-blue-700 text-white border-blue-500'
                : 'text-slate-600 hover:bg-white border-slate-200'
            }`}
            title="Choose shape type"
            aria-label="Choose shape type"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Rectangular Area Highlight Button + Swatch Trigger (Opens colour presets & activates on first click) */}
        <div ref={highlightTriggerRef} className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => {
              if (activeTool !== 'highlight') {
                onSelectTool('highlight');
                openSpecificMenu('highlight');
              } else {
                toggleMenu('highlight');
              }
            }}
            className={`px-2.5 py-1 text-xs font-medium rounded-l flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTool === 'highlight'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-700 hover:bg-white'
            }`}
            title="Area Highlight — Draw a translucent rectangular highlight box"
          >
            <Square className="w-3.5 h-3.5" />
            <span>Area Highlight</span>
            <span
              className="w-2.5 h-2.5 rounded-sm border border-black/20"
              style={{ backgroundColor: activeHighlightColor }}
            />
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeTool !== 'highlight') {
                onSelectTool('highlight');
                openSpecificMenu('highlight');
              } else {
                toggleMenu('highlight');
              }
            }}
            className={`px-1 py-1 text-xs rounded-r border-l transition-colors ${
              activeTool === 'highlight'
                ? 'bg-blue-700 text-white border-blue-500'
                : 'text-slate-600 hover:bg-white border-slate-200'
            }`}
            title="Area Highlight colour presets"
            aria-label="Area Highlight colour presets"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="w-px h-4 bg-slate-300 mx-0.5 shrink-0" />

        {/* Quick Snap to Objects Toggle Button */}
        <button
          type="button"
          onClick={onToggleSnapToObjects}
          className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            snapToObjects
              ? 'bg-blue-50 text-blue-700 border border-blue-200/80 shadow-sm'
              : 'text-slate-600 hover:bg-white border border-transparent'
          }`}
          title="Toggle magnetic snapping to other objects' edges and centres"
        >
          <Magnet
            className={`w-3.5 h-3.5 ${
              snapToObjects ? 'text-blue-600' : 'text-slate-400'
            }`}
          />
          <span>Snap Objects</span>
        </button>

        {/* Guides & Snap Button */}
        <button
          ref={guidesTriggerRef}
          type="button"
          onClick={() => toggleMenu('guides')}
          className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 border ${
            precisionMode
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-sm'
              : 'text-slate-700 hover:bg-white border-transparent'
          }`}
          title={
            precisionMode
              ? `Guides & Snap — Precision Mode ON (1 mm guides & ${angleSnapIncrementDeg}° angle snap)`
              : `Guides & Snap (Angle snap: ${angleSnapIncrementDeg}°)`
          }
        >
          <Grid className="w-3.5 h-3.5 text-cyan-600" />
          <span>Guides & Snap</span>
          {precisionMode && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-mono text-[10px] font-semibold leading-none">
              Precision
            </span>
          )}
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>
      </div>

      {/* Render Anchored Dropdown Popovers via Portal so they are never clipped by toolbar overflow */}
      {dropdownPortalContent && typeof document !== 'undefined'
        ? createPortal(dropdownPortalContent, document.body)
        : dropdownPortalContent}
    </header>
  );
};
