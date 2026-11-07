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

import React, { useEffect, useRef, useState } from 'react';
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
} from 'lucide-react';
import { HIGHLIGHT_PRESETS, ToolType } from '../model/documentTypes';

interface TopToolbarProps {
  documentName: string;
  onChangeDocumentName: (name: string) => void;
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  activeHighlightColor: string;
  onSelectHighlightColor: (color: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onNewDocument: () => void;
  onOpenLayFile: (file: File) => void;
  onTriggerOpenNativePicker?: () => Promise<boolean>;
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

const ANGLE_SNAP_PRESETS = [1, 5, 10, 15, 30, 45] as const;

export const TopToolbar: React.FC<TopToolbarProps> = ({
  documentName,
  onChangeDocumentName,
  activeTool,
  onSelectTool,
  activeHighlightColor,
  onSelectHighlightColor,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onNewDocument,
  onOpenLayFile,
  onTriggerOpenNativePicker,
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

  const [openMenu, setOpenMenu] = useState<
    'file' | 'shape' | 'highlight' | 'guides' | null
  >(null);
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

  const toggleMenu = (menu: 'file' | 'shape' | 'highlight' | 'guides') => {
    setOpenMenu((prev) => (prev === menu ? null : menu));
  };

  const closeAllMenus = () => setOpenMenu(null);

  const isShapeTool =
    activeTool === 'rectangle' ||
    activeTool === 'square' ||
    activeTool === 'ellipse' ||
    activeTool === 'circle' ||
    activeTool === 'triangle';

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

      {/* Backdrop for closing dropdown menus on tap outside */}
      {openMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={closeAllMenus}
          onTouchStart={closeAllMenus}
        />
      )}

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
      <div className="h-10 w-full max-w-full px-1.5 sm:px-3 bg-slate-50/90 flex items-center gap-1 touch-scroll-x no-scrollbar">
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

        {/* Shapes Button + Menu Trigger */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => {
              closeAllMenus();
              onSelectTool(isShapeTool ? activeTool : 'rectangle');
            }}
            className={`px-2.5 py-1 text-xs font-medium rounded-l flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              isShapeTool
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            {activeTool === 'ellipse' || activeTool === 'circle' ? (
              <Circle className="w-3.5 h-3.5" />
            ) : activeTool === 'triangle' ? (
              <Triangle className="w-3.5 h-3.5" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            <span className="capitalize">{isShapeTool ? activeTool : 'Rectangle'}</span>
          </button>
          <button
            type="button"
            onClick={() => toggleMenu('shape')}
            className={`px-1 py-1 text-xs rounded-r border-l transition-colors ${
              isShapeTool
                ? 'bg-blue-700 text-white border-blue-500'
                : 'text-slate-600 hover:bg-white border-slate-200'
            }`}
            aria-label="Choose shape type"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Highlight Button + Swatch Trigger */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => {
              closeAllMenus();
              onSelectTool('highlight');
            }}
            className={`px-2.5 py-1 text-xs font-medium rounded-l flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTool === 'highlight'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            <Highlighter className="w-3.5 h-3.5" />
            <span>Highlight</span>
            <span
              className="w-2.5 h-2.5 rounded-sm border border-black/20"
              style={{ backgroundColor: activeHighlightColor }}
            />
          </button>
          <button
            type="button"
            onClick={() => toggleMenu('highlight')}
            className={`px-1 py-1 text-xs rounded-r border-l transition-colors ${
              activeTool === 'highlight'
                ? 'bg-blue-700 text-white border-blue-500'
                : 'text-slate-600 hover:bg-white border-slate-200'
            }`}
            aria-label="Highlight colour presets"
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
              ? 'bg-blue-50 text-blue-700 border border-blue-200/80 shadow-2xs'
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
          type="button"
          onClick={() => toggleMenu('guides')}
          className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 border ${
            precisionMode
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs'
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

      {/* Floating Dropdown Menus (Positioned safely inside viewport bounds) */}
      {openMenu === 'file' && (
        <div className="absolute left-2 top-11 w-56 max-w-[calc(100vw-16px)] bg-white border border-slate-200 rounded-lg shadow-xl py-1.5 z-50 text-xs">
          <div className="px-3 py-1 text-[11px] font-semibold text-slate-400">
            Document Actions
          </div>
          <button
            type="button"
            onClick={() => {
              closeAllMenus();
              onNewDocument();
            }}
            className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 text-slate-700"
          >
            <FilePlus2 className="w-4 h-4 text-slate-600" />
            <span>New Document...</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              closeAllMenus();
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
            <FolderOpen className="w-4 h-4 text-slate-600" />
            <span>Open .lay Document...</span>
          </button>
          <button
            type="button"
            onClick={() => {
              closeAllMenus();
              onSaveLayFile();
            }}
            className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 text-slate-800 font-medium"
          >
            <Save className="w-4 h-4 text-slate-700" />
            <span>Save Editable .lay File</span>
          </button>
          <button
            type="button"
            onClick={() => {
              closeAllMenus();
              onSaveAsLayFile();
            }}
            className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 text-slate-700"
          >
            <Save className="w-4 h-4 text-slate-500" />
            <span>Save As...</span>
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button
            type="button"
            onClick={() => {
              closeAllMenus();
              onLoadSampleDocument();
            }}
            className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-blue-50 text-blue-700 font-medium"
          >
            <LayoutGrid className="w-4 h-4 text-blue-600" />
            <span>Load Sample A0 Stand Layout</span>
          </button>
        </div>
      )}

      {openMenu === 'shape' && (
        <div className="absolute left-2 sm:left-64 top-21 w-44 max-w-[calc(100vw-16px)] bg-white border border-slate-200 rounded-lg shadow-xl py-1 z-50">
          {(
            [
              { id: 'rectangle', label: 'Rectangle', icon: Square },
              { id: 'square', label: 'Square (1:1)', icon: Square },
              { id: 'ellipse', label: 'Ellipse', icon: Circle },
              { id: 'circle', label: 'Circle (1:1)', icon: Circle },
              { id: 'triangle', label: 'Triangle', icon: Triangle },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTool(item.id);
                  closeAllMenus();
                }}
                className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-slate-100 ${
                  activeTool === item.id
                    ? 'font-semibold text-blue-600 bg-blue-50/50'
                    : 'text-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {openMenu === 'highlight' && (
        <div className="absolute left-2 sm:left-80 top-21 w-48 max-w-[calc(100vw-16px)] bg-white border border-slate-200 rounded-lg shadow-xl p-2 z-50">
          <div className="text-[11px] font-medium text-slate-500 mb-1.5 px-1">
            Highlight Colour
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
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2 sm:right-24 top-21 w-72 max-w-[calc(100vw-16px)] max-h-[calc(100dvh-92px)] touch-scroll-y bg-white border border-slate-200 rounded-lg shadow-xl py-1.5 z-50 text-xs"
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
    </header>
  );
};
