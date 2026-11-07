/**
 * @license
 * SPDX-License-Identifier: MIT
 *
 * PageLay — Context-Sensitive Right Properties Panel
 *
 * Displays strictly relevant controls in millimetres (mm) for the selected object,
 * or Document & Page Setup when no object is selected.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
  Crop,
  RotateCcw,
  Copy,
  Trash2,
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowUp,
  ArrowDown,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  Plus,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  ChevronDown,
  Crosshair,
  Group,
  Ungroup,
  CheckSquare,
  Square,
  Check,
  X,
} from 'lucide-react';
import {
  AVAILABLE_FONTS,
  FREEHAND_HIGHLIGHTER_PRESETS,
  Guideline,
  HIGHLIGHT_PRESETS,
  ImageAsset,
  Orientation,
  PageLayDocument,
  PageObject,
  PaperFormat,
  PEN_COLOR_PRESETS,
} from '../model/documentTypes';
import {
  calculateEffectiveDpi,
  formatBytes,
  formatMm,
  getCombinedBoundsMm,
  getLineLengthMm,
  ISO_PAPER_SIZES,
  resizeFreehandStrokeMm,
  resizeGroupObjectMm,
  rotateGroupObjectMm,
  syncLinearBoundingBox,
  translatePageObjectMm,
} from '../utils/units';

interface PropertiesPanelProps {
  doc: PageLayDocument;
  activePageIndex: number;
  selectedObject: PageObject | null;
  selectedObjectIds: string[];
  onSelectObjectIds: (ids: string[]) => void;
  onGroupObjects: (ids?: string[]) => void;
  onUngroupObject: (groupId?: string) => void;
  onUpdateMultipleObjects: (objects: PageObject[], recordHistory?: boolean) => void;
  isCroppingImageId: string | null;
  onStartCropImage: (id: string | null) => void;
  onUpdateObject: (updated: PageObject, recordHistory?: boolean) => void;
  onDeleteObject: (id: string) => void;
  onDuplicateObject: (id: string) => void;
  onReorderObject: (id: string, action: 'front' | 'forward' | 'backward' | 'back') => void;
  onUpdateDocumentSize: (
    paperSize: PaperFormat,
    orientation: Orientation,
    widthMm: number,
    heightMm: number
  ) => void;
  selectedGuideId: string | null;
  onSelectGuide: (guideId: string | null) => void;
  onAddGuideline: (orientation: 'horizontal' | 'vertical', positionMm: number) => void;
  onUpdateGuideline: (guideId: string, positionMm: number) => void;
  onRemoveGuideline: (guideId: string) => void;
  onAddMarginGuides: (marginMm: number) => void;
}

const QUICK_SWATCHES = [
  '#0F172A',
  '#DC2626',
  '#2563EB',
  '#16A34A',
  '#D97706',
  '#7C3AED',
  '#FFFFFF',
  '#FACC15',
];

interface NumericPropertyInputProps {
  value: number;
  onCommit: (nextValue: number) => void;
  min?: number;
  max?: number;
  precision?: number;
  allowNegative?: boolean;
  normalizeOnCommit?: (val: number) => number;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Controlled numeric property field that buffers keystrokes locally (including intermediate
 * decimal input such as "72." or "-") and commits a single undoable change on Enter or blur.
 * Pressing Escape cancels the edit and restores the original pre-edit value without recording history.
 */
const NumericPropertyInput: React.FC<NumericPropertyInputProps> = ({
  value,
  onCommit,
  min,
  max,
  precision = 2,
  allowNegative = true,
  normalizeOnCommit,
  disabled = false,
  className = '',
  ariaLabel,
}) => {
  const normalizedPropValue = useMemo(
    () => formatMm(value, precision),
    [value, precision]
  );

  const [draftText, setDraftText] = useState<string>(() => String(normalizedPropValue));
  const originalValueRef = useRef<number>(normalizedPropValue);
  const cancelledByEscapeRef = useRef<boolean>(false);

  // Sync displayed text whenever the canonical property value changes externally (Undo/Redo, drag, selection change)
  useEffect(() => {
    originalValueRef.current = normalizedPropValue;
    setDraftText(String(normalizedPropValue));
  }, [normalizedPropValue]);

  const commitDraftValue = (rawText: string) => {
    const trimmed = rawText.trim();
    const numericPattern = allowNegative
      ? /^[+-]?(?:\d+\.?\d*|\.\d+)$/
      : /^\+?(?:\d+\.?\d*|\.\d+)$/;

    if (!numericPattern.test(trimmed)) {
      // Incomplete or invalid input: restore original value without modifying geometry or history
      setDraftText(String(originalValueRef.current));
      return;
    }

    let parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setDraftText(String(originalValueRef.current));
      return;
    }

    if (!allowNegative && parsed < 0) {
      parsed = 0;
    }
    if (min !== undefined && parsed < min) {
      parsed = min;
    }
    if (max !== undefined && parsed > max) {
      parsed = max;
    }

    let finalValue = formatMm(parsed, precision);
    if (normalizeOnCommit) {
      finalValue = formatMm(normalizeOnCommit(finalValue), precision);
    }

    if (Math.abs(finalValue - originalValueRef.current) < 1e-6) {
      // Value did not change: normalize text display and do not record history
      setDraftText(String(originalValueRef.current));
      return;
    }

    originalValueRef.current = finalValue;
    setDraftText(String(finalValue));
    onCommit(finalValue);
  };

  const hasUncommittedDraft = draftText.trim() !== String(originalValueRef.current);

  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      value={draftText}
      aria-label={ariaLabel}
      data-numeric-property="true"
      data-has-uncommitted-draft={hasUncommittedDraft ? 'true' : 'false'}
      onFocus={() => {
        cancelledByEscapeRef.current = false;
        originalValueRef.current = normalizedPropValue;
        setDraftText(String(normalizedPropValue));
      }}
      onChange={(e) => {
        setDraftText(e.target.value);
      }}
      onBlur={(e) => {
        if (cancelledByEscapeRef.current) {
          cancelledByEscapeRef.current = false;
          setDraftText(String(originalValueRef.current));
          return;
        }
        commitDraftValue(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          commitDraftValue(e.currentTarget.value);
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancelledByEscapeRef.current = true;
          setDraftText(String(originalValueRef.current));
          e.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
};

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  doc,
  activePageIndex,
  selectedObject,
  selectedObjectIds,
  onSelectObjectIds,
  onGroupObjects,
  onUngroupObject,
  onUpdateMultipleObjects,
  isCroppingImageId,
  onStartCropImage,
  onUpdateObject,
  onDeleteObject,
  onDuplicateObject,
  onReorderObject,
  onUpdateDocumentSize,
  selectedGuideId,
  onSelectGuide,
  onAddGuideline,
  onUpdateGuideline,
  onRemoveGuideline,
  onAddMarginGuides,
}) => {
  const [newGuideOrientation, setNewGuideOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const [newGuidePosMm, setNewGuidePosMm] = useState<string>('50');
  const [newGuideError, setNewGuideError] = useState<string | null>(null);
  const [editingGuideId, setEditingGuideId] = useState<string | null>(null);
  const [editingGuideText, setEditingGuideText] = useState<string>('');
  const [guideEditError, setGuideEditError] = useState<string | null>(null);
  const [isAlignMenuOpen, setIsAlignMenuOpen] = useState<boolean>(false);
  const hasRecordedTextFieldHistoryRef = useRef<boolean>(false);

  const activePage = doc.pages[activePageIndex];
  const pageObjects = activePage ? activePage.objects : [];

  // Sync inline editor when a guideline is selected on the canvas
  useEffect(() => {
    if (!selectedGuideId || !activePage) return;
    const found = activePage.guidelines.find((g) => g.id === selectedGuideId);
    if (found) {
      setEditingGuideId(found.id);
      setEditingGuideText(String(formatMm(found.positionMm, 2)));
      setGuideEditError(null);
    }
  }, [selectedGuideId, activePage]);

  const startEditingGuide = (guide: Guideline) => {
    onSelectGuide(guide.id);
    setEditingGuideId(guide.id);
    setEditingGuideText(String(formatMm(guide.positionMm, 2)));
    setGuideEditError(null);
  };

  const cancelEditingGuide = () => {
    setEditingGuideId(null);
    setGuideEditError(null);
  };

  const commitEditingGuide = (guide: Guideline) => {
    const trimmed = editingGuideText.trim();
    const maxMm = guide.orientation === 'vertical' ? doc.widthMm : doc.heightMm;
    const axisLabel = guide.orientation === 'vertical' ? 'X' : 'Y';

    if (trimmed === '' || !/^-?\d+(\.\d+)?$/.test(trimmed)) {
      setGuideEditError(`Enter a valid numeric ${axisLabel} position in mm.`);
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > maxMm) {
      setGuideEditError(
        `${axisLabel} must be within page bounds (0 to ${formatMm(maxMm, 1)} mm).`
      );
      return;
    }

    onUpdateGuideline(guide.id, formatMm(parsed, 2));
    setEditingGuideId(null);
    setGuideEditError(null);
  };

  const handleCreateGuidelineFromInput = () => {
    const trimmed = newGuidePosMm.trim();
    const maxMm = newGuideOrientation === 'vertical' ? doc.widthMm : doc.heightMm;
    const axisLabel = newGuideOrientation === 'vertical' ? 'X' : 'Y';

    if (trimmed === '' || !/^-?\d+(\.\d+)?$/.test(trimmed)) {
      setNewGuideError(`Enter a valid numeric ${axisLabel} position in mm.`);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > maxMm) {
      setNewGuideError(
        `${axisLabel} must be within page bounds (0 to ${formatMm(maxMm, 1)} mm).`
      );
      return;
    }
    setNewGuideError(null);
    onAddGuideline(newGuideOrientation, formatMm(parsed, 2));
  };

  const toggleObjectInSelection = (objId: string) => {
    if (selectedObjectIds.includes(objId)) {
      onSelectObjectIds(selectedObjectIds.filter((id) => id !== objId));
    } else {
      onSelectObjectIds([...selectedObjectIds, objId]);
    }
  };

  // Multi-selection mode (2 or more objects selected on the active page)
  const selectedObjectsList = pageObjects.filter((o) =>
    selectedObjectIds.includes(o.id)
  );

  if (selectedObjectsList.length >= 2) {
    const combinedBounds = getCombinedBoundsMm(selectedObjectsList);

    const handleAlignMultipleToPage = (
      alignment:
        | 'left'
        | 'center-h'
        | 'right'
        | 'top'
        | 'center-v'
        | 'bottom'
        | 'center-both'
    ) => {
      let dx = 0;
      let dy = 0;

      if (alignment === 'left') {
        dx = -combinedBounds.xMm;
      } else if (alignment === 'center-h') {
        dx = (doc.widthMm - combinedBounds.widthMm) / 2 - combinedBounds.xMm;
      } else if (alignment === 'right') {
        dx = doc.widthMm - combinedBounds.widthMm - combinedBounds.xMm;
      } else if (alignment === 'top') {
        dy = -combinedBounds.yMm;
      } else if (alignment === 'center-v') {
        dy = (doc.heightMm - combinedBounds.heightMm) / 2 - combinedBounds.yMm;
      } else if (alignment === 'bottom') {
        dy = doc.heightMm - combinedBounds.heightMm - combinedBounds.yMm;
      } else if (alignment === 'center-both') {
        dx = (doc.widthMm - combinedBounds.widthMm) / 2 - combinedBounds.xMm;
        dy = (doc.heightMm - combinedBounds.heightMm) / 2 - combinedBounds.yMm;
      }

      const moved = selectedObjectsList.map((obj) =>
        obj.locked ? obj : translatePageObjectMm(obj, dx, dy)
      );
      onUpdateMultipleObjects(moved, true);
    };

    return (
      <aside
        data-sidebar="true"
        className="w-72 h-full bg-white border-l border-slate-200 flex flex-col overflow-hidden touch-pan-y select-none shrink-0 z-20"
      >
        <div className="h-9 px-3.5 max-lg:pr-9 border-b border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs font-semibold text-slate-800">
            Multiple Selection ({selectedObjectsList.length})
          </span>
          <button
            type="button"
            onClick={() => onSelectObjectIds([])}
            className="text-[11px] text-slate-500 hover:text-slate-800"
          >
            Clear
          </button>
        </div>

        <div data-allow-touch-scroll="true" className="flex-1 touch-scroll-y p-3.5 space-y-4 text-xs">
          {/* Primary Group Button */}
          <div className="p-3 bg-violet-50/70 border border-violet-200 rounded-lg space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-violet-950 flex items-center gap-1.5">
                <Group className="w-3.5 h-3.5 text-violet-700" />
                <span>Combine Into Group</span>
              </span>
              <span className="text-[10px] font-mono text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded">
                {selectedObjectsList.length} objects
              </span>
            </div>
            <p className="text-[11px] text-violet-800/90 leading-relaxed">
              Combines the selected objects into a single group entity for synchronized movement, resizing, rotation, and alignment.
            </p>
            <button
              type="button"
              onClick={() => onGroupObjects(selectedObjectIds)}
              className="w-full py-2 px-3 bg-violet-600 hover:bg-violet-500 text-white rounded-md font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
            >
              <Group className="w-3.5 h-3.5" />
              <span>Group Objects ({selectedObjectsList.length})</span>
            </button>
          </div>

          {/* Combined Selection Align to Page */}
          <div className="border-t border-slate-200 pt-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-700">
                Align Selection to Page
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {formatMm(combinedBounds.widthMm, 1)} × {formatMm(combinedBounds.heightMm, 1)} mm
              </span>
            </div>
            <div className="grid grid-cols-6 gap-1">
              <button
                type="button"
                onClick={() => handleAlignMultipleToPage('left')}
                className="py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 flex flex-col items-center justify-center gap-0.5"
                title="Align Selection Left Edge (0 mm)"
              >
                <AlignStartVertical className="w-3.5 h-3.5" />
                <span className="text-[9px] font-medium leading-none">Left</span>
              </button>
              <button
                type="button"
                onClick={() => handleAlignMultipleToPage('center-h')}
                className="py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 flex flex-col items-center justify-center gap-0.5"
                title="Align Selection Horizontal Center"
              >
                <AlignCenterVertical className="w-3.5 h-3.5" />
                <span className="text-[9px] font-medium leading-none">Center H</span>
              </button>
              <button
                type="button"
                onClick={() => handleAlignMultipleToPage('right')}
                className="py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 flex flex-col items-center justify-center gap-0.5"
                title="Align Selection Right Edge"
              >
                <AlignEndVertical className="w-3.5 h-3.5" />
                <span className="text-[9px] font-medium leading-none">Right</span>
              </button>
              <button
                type="button"
                onClick={() => handleAlignMultipleToPage('top')}
                className="py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 flex flex-col items-center justify-center gap-0.5"
                title="Align Selection Top Edge (0 mm)"
              >
                <AlignStartHorizontal className="w-3.5 h-3.5" />
                <span className="text-[9px] font-medium leading-none">Top</span>
              </button>
              <button
                type="button"
                onClick={() => handleAlignMultipleToPage('center-v')}
                className="py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 flex flex-col items-center justify-center gap-0.5"
                title="Align Selection Vertical Center"
              >
                <AlignCenterHorizontal className="w-3.5 h-3.5" />
                <span className="text-[9px] font-medium leading-none">Center V</span>
              </button>
              <button
                type="button"
                onClick={() => handleAlignMultipleToPage('bottom')}
                className="py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 flex flex-col items-center justify-center gap-0.5"
                title="Align Selection Bottom Edge"
              >
                <AlignEndHorizontal className="w-3.5 h-3.5" />
                <span className="text-[9px] font-medium leading-none">Bottom</span>
              </button>
            </div>
          </div>

          {/* Checklist of Page Objects */}
          <div className="border-t border-slate-200 pt-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">Page Objects</span>
              <button
                type="button"
                onClick={() => onSelectObjectIds(pageObjects.map((o) => o.id))}
                className="text-[11px] text-blue-600 hover:underline"
              >
                Select All
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded divide-y divide-slate-100">
              {pageObjects.map((obj) => {
                const checked = selectedObjectIds.includes(obj.id);
                return (
                  <button
                    key={obj.id}
                    type="button"
                    onClick={() => toggleObjectInSelection(obj.id)}
                    className={`w-full px-2.5 py-1.5 flex items-center justify-between text-left text-[11px] transition-colors ${
                      checked ? 'bg-violet-50/80 text-violet-950 font-medium' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      {checked ? (
                        <CheckSquare className="w-3.5 h-3.5 text-violet-600 shrink-0" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span className="truncate">{obj.name}</span>
                    </span>
                    <span className="text-[10px] font-mono uppercase text-slate-400 shrink-0 ml-2">
                      {obj.type}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </aside>
    );
  }

  // When nothing is selected, show clean Document & Page Setup + Page Objects Multi-Select / Group
  if (!selectedObject) {
    return (
      <aside
        data-sidebar="true"
        className="w-72 h-full bg-white border-l border-slate-200 flex flex-col overflow-hidden touch-pan-y select-none shrink-0 z-20"
      >
        <div className="h-9 px-3.5 max-lg:pr-9 border-b border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs font-semibold text-slate-800">Document & Page Setup</span>
          <span className="text-[11px] font-mono text-slate-400">mm</span>
        </div>

        <div data-allow-touch-scroll="true" className="flex-1 touch-scroll-y p-3.5 space-y-5 text-xs">
          {/* Paper Format & Orientation */}
          <div className="space-y-3">
            <div className="font-semibold text-slate-700">Physical Paper Size</div>

            <div>
              <label className="block text-[11px] text-slate-500 mb-1">ISO Format</label>
              <select
                value={doc.paperSize}
                onChange={(e) => {
                  const fmt = e.target.value as PaperFormat;
                  if (fmt === 'Custom') {
                    onUpdateDocumentSize('Custom', doc.orientation, doc.widthMm, doc.heightMm);
                  } else {
                    const spec = ISO_PAPER_SIZES[fmt];
                    const w = doc.orientation === 'landscape' ? spec.longMm : spec.shortMm;
                    const h = doc.orientation === 'landscape' ? spec.shortMm : spec.longMm;
                    onUpdateDocumentSize(fmt, doc.orientation, w, h);
                  }
                }}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
              >
                {Object.values(ISO_PAPER_SIZES).map((spec) => (
                  <option key={spec.format} value={spec.format}>
                    {spec.description}
                  </option>
                ))}
                <option value="Custom">Custom Dimensions (mm)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Orientation</label>
              <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded">
                <button
                  type="button"
                  onClick={() => {
                    const maxSide = Math.max(doc.widthMm, doc.heightMm);
                    const minSide = Math.min(doc.widthMm, doc.heightMm);
                    onUpdateDocumentSize(doc.paperSize, 'landscape', maxSide, minSide);
                  }}
                  className={`py-1 rounded text-xs font-medium transition-colors ${
                    doc.orientation === 'landscape'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Landscape
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const maxSide = Math.max(doc.widthMm, doc.heightMm);
                    const minSide = Math.min(doc.widthMm, doc.heightMm);
                    onUpdateDocumentSize(doc.paperSize, 'portrait', minSide, maxSide);
                  }}
                  className={`py-1 rounded text-xs font-medium transition-colors ${
                    doc.orientation === 'portrait'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Portrait
                </button>
              </div>
            </div>

            {/* Canonical Millimetre Width & Height */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Width (mm)</label>
                <NumericPropertyInput
                  min={20}
                  max={5000}
                  precision={2}
                  allowNegative={false}
                  value={doc.widthMm}
                  onCommit={(val) => {
                    const nextOrientation = val >= doc.heightMm ? 'landscape' : 'portrait';
                    onUpdateDocumentSize('Custom', nextOrientation, val, doc.heightMm);
                  }}
                  ariaLabel="Document width in millimetres"
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Height (mm)</label>
                <NumericPropertyInput
                  min={20}
                  max={5000}
                  precision={2}
                  allowNegative={false}
                  value={doc.heightMm}
                  onCommit={(val) => {
                    const nextOrientation = doc.widthMm >= val ? 'landscape' : 'portrait';
                    onUpdateDocumentSize('Custom', nextOrientation, doc.widthMm, val);
                  }}
                  ariaLabel="Document height in millimetres"
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">Page Guidelines (mm)</span>
              <span className="text-[11px] text-slate-400">Not printed</span>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Drag from the rulers (hold <strong>Shift</strong> for 1 mm steps), add a new guide, or click any existing guide below to edit its exact X/Y position.
            </p>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <select
                  value={newGuideOrientation}
                  onChange={(e) => {
                    setNewGuideOrientation(e.target.value as 'vertical' | 'horizontal');
                    setNewGuideError(null);
                  }}
                  className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700"
                >
                  <option value="vertical">Vertical (X)</option>
                  <option value="horizontal">Horizontal (Y)</option>
                </select>
                <input
                  type="text"
                  inputMode="decimal"
                  value={newGuidePosMm}
                  onChange={(e) => {
                    setNewGuidePosMm(e.target.value);
                    if (newGuideError) setNewGuideError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateGuidelineFromInput();
                    }
                  }}
                  className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-blue-600"
                  placeholder="mm"
                  aria-label="New guideline position in millimetres"
                />
                <button
                  type="button"
                  onClick={handleCreateGuidelineFromInput}
                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-medium flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add</span>
                </button>
              </div>
              {newGuideError && (
                <div className="text-[10px] text-rose-600 font-medium">
                  {newGuideError}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onAddMarginGuides(20)}
                className="flex-1 py-1 px-2 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
              >
                + 20 mm Margins
              </button>
              <button
                type="button"
                onClick={() => onAddMarginGuides(40)}
                className="flex-1 py-1 px-2 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
              >
                + 40 mm Margins
              </button>
            </div>

            {guideEditError && (
              <div className="p-2 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-700">
                {guideEditError}
              </div>
            )}

            {activePage && activePage.guidelines.length > 0 && (
              <div className="max-h-52 overflow-y-auto border border-slate-200 rounded divide-y divide-slate-100">
                {activePage.guidelines.map((g: Guideline) => {
                  const isEditingThis = editingGuideId === g.id;
                  const isSelectedThis = selectedGuideId === g.id;
                  const axisLabel = g.orientation === 'vertical' ? 'X' : 'Y';
                  const typeLabel =
                    g.orientation === 'vertical' ? 'Vertical guide' : 'Horizontal guide';

                  return (
                    <div
                      key={g.id}
                      onClick={() => {
                        if (!isEditingThis) {
                          startEditingGuide(g);
                        }
                      }}
                      className={`px-2.5 py-1.5 flex items-center justify-between gap-1.5 text-[11px] transition-colors ${
                        isSelectedThis || isEditingThis
                          ? 'bg-cyan-50/70'
                          : 'hover:bg-slate-50 cursor-pointer'
                      }`}
                    >
                      {isEditingThis ? (
                        <div
                          className="flex items-center gap-1 flex-1 min-w-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-slate-600 font-medium whitespace-nowrap">
                            {typeLabel} — {axisLabel}:
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            autoFocus
                            value={editingGuideText}
                            onChange={(e) => {
                              setEditingGuideText(e.target.value);
                              if (guideEditError) setGuideEditError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitEditingGuide(g);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelEditingGuide();
                              }
                            }}
                            className="w-16 px-1.5 py-0.5 bg-white border border-cyan-500 rounded font-mono text-xs text-slate-900 focus:outline-none"
                            aria-label={`${typeLabel} ${axisLabel} position in mm`}
                          />
                          <span className="font-mono text-[10px] text-slate-500">mm</span>
                          <button
                            type="button"
                            onClick={() => commitEditingGuide(g)}
                            className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded"
                            title="Apply position (Enter)"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditingGuide}
                            className="p-0.5 text-slate-400 hover:text-slate-700 rounded"
                            title="Cancel edit (Escape)"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditingGuide(g);
                          }}
                          className="text-left flex-1 min-w-0 truncate text-slate-700 hover:text-cyan-800"
                          title="Click to edit exact millimetre position"
                        >
                          <span>{typeLabel} — </span>
                          <span className="font-mono">
                            {axisLabel}: <strong>{formatMm(g.positionMm, 2)} mm</strong>
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (editingGuideId === g.id) cancelEditingGuide();
                          onRemoveGuideline(g.id);
                        }}
                        className="text-slate-400 hover:text-rose-600 shrink-0"
                        title="Remove guideline"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Page Objects & Multi-Object Grouping */}
          {pageObjects.length > 0 && (
            <div className="border-t border-slate-200 pt-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Group className="w-3.5 h-3.5 text-violet-600" />
                  <span>Page Objects & Grouping</span>
                </span>
                {pageObjects.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => onGroupObjects(pageObjects.map((o) => o.id))}
                    className="text-[11px] font-medium text-violet-700 hover:underline"
                  >
                    Group All ({pageObjects.length})
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Hold <strong>Ctrl + Click</strong> (or <strong>⌘ + Click</strong> on Mac) on the canvas—or check two or more objects below—to select multiple objects.
              </p>
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded divide-y divide-slate-100">
                {pageObjects.map((obj) => {
                  const isChecked = selectedObjectIds.includes(obj.id);
                  return (
                    <div
                      key={obj.id}
                      className="px-2.5 py-1.5 flex items-center justify-between text-[11px] hover:bg-slate-50"
                    >
                      <button
                        type="button"
                        onClick={() => toggleObjectInSelection(obj.id)}
                        className="flex items-center gap-2 truncate text-left flex-1 text-slate-700"
                      >
                        {isChecked ? (
                          <CheckSquare className="w-3.5 h-3.5 text-violet-600 shrink-0" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate">{obj.name}</span>
                      </button>
                      {obj.type === 'group' ? (
                        <button
                          type="button"
                          onClick={() => onUngroupObject(obj.id)}
                          className="ml-2 px-1.5 py-0.5 bg-violet-100 hover:bg-violet-200 text-violet-800 rounded text-[10px] font-medium flex items-center gap-1 shrink-0"
                        >
                          <Ungroup className="w-2.5 h-2.5" />
                          <span>Ungroup</span>
                        </button>
                      ) : (
                        <span className="text-[10px] font-mono uppercase text-slate-400 shrink-0 ml-2">
                          {obj.type}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border-t border-slate-200 pt-4 text-[11px] text-slate-500 space-y-1.5">
            <div className="font-semibold text-slate-700">Selection Tip</div>
            <p>
              Click any object to edit its millimetre geometry, or hold <strong>Ctrl / ⌘ + Click</strong> to select multiple objects at once.
            </p>
          </div>
        </div>
      </aside>
    );
  }

  // Context-Sensitive Object Inspector
  const isLinear =
    selectedObject.type === 'line' ||
    selectedObject.type === 'arrow' ||
    selectedObject.type === 'dimension';

  const asset: ImageAsset | undefined =
    selectedObject.type === 'image' ? doc.assets[selectedObject.assetId] : undefined;

  const dpiStats =
    selectedObject.type === 'image' && asset
      ? calculateEffectiveDpi(
          asset.widthPx,
          asset.heightPx,
          selectedObject.crop,
          selectedObject.widthMm,
          selectedObject.heightMm
        )
      : null;

  const isCroppingThis =
    selectedObject.type === 'image' && isCroppingImageId === selectedObject.id;

  const selectedFontDef =
    selectedObject.type === 'text'
      ? AVAILABLE_FONTS.find((f) => f.id === selectedObject.fontFamily)
      : null;

  const handleAlignToPage = (
    alignment:
      | 'left'
      | 'center-h'
      | 'right'
      | 'top'
      | 'center-v'
      | 'bottom'
      | 'center-both'
  ) => {
    if (selectedObject.locked) return;

    if (
      selectedObject.type === 'line' ||
      selectedObject.type === 'arrow' ||
      selectedObject.type === 'dimension'
    ) {
      const minX = Math.min(selectedObject.x1Mm, selectedObject.x2Mm);
      const maxX = Math.max(selectedObject.x1Mm, selectedObject.x2Mm);
      const spanW = maxX - minX;

      const minY = Math.min(selectedObject.y1Mm, selectedObject.y2Mm);
      const maxY = Math.max(selectedObject.y1Mm, selectedObject.y2Mm);
      const spanH = maxY - minY;

      let dx = 0;
      let dy = 0;

      if (alignment === 'left') {
        dx = -minX;
      } else if (alignment === 'center-h') {
        dx = (doc.widthMm - spanW) / 2 - minX;
      } else if (alignment === 'right') {
        dx = doc.widthMm - spanW - minX;
      } else if (alignment === 'top') {
        dy = -minY;
      } else if (alignment === 'center-v') {
        dy = (doc.heightMm - spanH) / 2 - minY;
      } else if (alignment === 'bottom') {
        dy = doc.heightMm - spanH - minY;
      } else if (alignment === 'center-both') {
        dx = (doc.widthMm - spanW) / 2 - minX;
        dy = (doc.heightMm - spanH) / 2 - minY;
      }

      onUpdateObject(
        syncLinearBoundingBox({
          ...selectedObject,
          x1Mm: formatMm(selectedObject.x1Mm + dx, 2),
          y1Mm: formatMm(selectedObject.y1Mm + dy, 2),
          x2Mm: formatMm(selectedObject.x2Mm + dx, 2),
          y2Mm: formatMm(selectedObject.y2Mm + dy, 2),
        }),
        true
      );
    } else if (selectedObject.type === 'group' || selectedObject.type === 'freehand') {
      let nextX = selectedObject.xMm;
      let nextY = selectedObject.yMm;

      if (alignment === 'left') {
        nextX = 0;
      } else if (alignment === 'center-h') {
        nextX = formatMm((doc.widthMm - selectedObject.widthMm) / 2, 2);
      } else if (alignment === 'right') {
        nextX = formatMm(doc.widthMm - selectedObject.widthMm, 2);
      } else if (alignment === 'top') {
        nextY = 0;
      } else if (alignment === 'center-v') {
        nextY = formatMm((doc.heightMm - selectedObject.heightMm) / 2, 2);
      } else if (alignment === 'bottom') {
        nextY = formatMm(doc.heightMm - selectedObject.heightMm, 2);
      } else if (alignment === 'center-both') {
        nextX = formatMm((doc.widthMm - selectedObject.widthMm) / 2, 2);
        nextY = formatMm((doc.heightMm - selectedObject.heightMm) / 2, 2);
      }

      const dx = nextX - selectedObject.xMm;
      const dy = nextY - selectedObject.yMm;
      onUpdateObject(translatePageObjectMm(selectedObject, dx, dy), true);
    } else {
      let nextX = selectedObject.xMm;
      let nextY = selectedObject.yMm;

      if (alignment === 'left') {
        nextX = 0;
      } else if (alignment === 'center-h') {
        nextX = formatMm((doc.widthMm - selectedObject.widthMm) / 2, 2);
      } else if (alignment === 'right') {
        nextX = formatMm(doc.widthMm - selectedObject.widthMm, 2);
      } else if (alignment === 'top') {
        nextY = 0;
      } else if (alignment === 'center-v') {
        nextY = formatMm((doc.heightMm - selectedObject.heightMm) / 2, 2);
      } else if (alignment === 'bottom') {
        nextY = formatMm(doc.heightMm - selectedObject.heightMm, 2);
      } else if (alignment === 'center-both') {
        nextX = formatMm((doc.widthMm - selectedObject.widthMm) / 2, 2);
        nextY = formatMm((doc.heightMm - selectedObject.heightMm) / 2, 2);
      }

      onUpdateObject(
        {
          ...selectedObject,
          xMm: nextX,
          yMm: nextY,
        },
        true
      );
    }

    setIsAlignMenuOpen(false);
  };

  return (
    <aside
      data-sidebar="true"
      className="w-72 h-full bg-white border-l border-slate-200 flex flex-col overflow-hidden touch-pan-y select-none shrink-0 z-20 relative"
    >
      {/* Header: Object Type & Layer/Quick Actions */}
      <div className="h-9 px-3.5 max-lg:pr-9 border-b border-slate-200 flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold text-slate-800 capitalize truncate">
          {selectedObject.type} Properties
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              onUpdateObject({
                ...selectedObject,
                locked: !selectedObject.locked,
              })
            }
            className={`p-1 rounded ${
              selectedObject.locked
                ? 'text-amber-600 bg-amber-50'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
            title={
              selectedObject.locked
                ? 'Unlock object (Ctrl+L)'
                : 'Lock object position (Ctrl+L)'
            }
          >
            {selectedObject.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onDuplicateObject(selectedObject.id)}
            className="p-1 text-slate-600 hover:bg-slate-100 rounded"
            title="Duplicate (Ctrl+D)"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDeleteObject(selectedObject.id)}
            className="p-1 text-rose-600 hover:bg-rose-50 rounded"
            title="Delete (Del)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div data-allow-touch-scroll="true" className="flex-1 touch-scroll-y p-3.5 space-y-4 text-xs">
        {/* Object Name, Z-Order & Align Menu */}
        <div className="space-y-2">
          <input
            type="text"
            value={selectedObject.name}
            onFocus={() => {
              hasRecordedTextFieldHistoryRef.current = false;
            }}
            onBlur={() => {
              hasRecordedTextFieldHistoryRef.current = false;
            }}
            onChange={(e) => {
              const shouldRecord = !hasRecordedTextFieldHistoryRef.current;
              hasRecordedTextFieldHistoryRef.current = true;
              onUpdateObject({ ...selectedObject, name: e.target.value }, shouldRecord);
            }}
            className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
            placeholder="Object Label"
          />

          <div className="grid grid-cols-4 gap-1 pt-0.5">
            <button
              type="button"
              onClick={() => onReorderObject(selectedObject.id, 'front')}
              className="py-1 px-1.5 bg-slate-100 hover:bg-slate-200 rounded text-[11px] font-medium text-slate-700 flex items-center justify-center gap-1"
              title="Bring to Front"
            >
              <ArrowUpToLine className="w-3 h-3" />
              <span>Front</span>
            </button>
            <button
              type="button"
              onClick={() => onReorderObject(selectedObject.id, 'forward')}
              className="py-1 px-1.5 bg-slate-100 hover:bg-slate-200 rounded text-[11px] font-medium text-slate-700 flex items-center justify-center gap-1"
              title="Bring Forward"
            >
              <ArrowUp className="w-3 h-3" />
              <span>Up</span>
            </button>
            <button
              type="button"
              onClick={() => onReorderObject(selectedObject.id, 'backward')}
              className="py-1 px-1.5 bg-slate-100 hover:bg-slate-200 rounded text-[11px] font-medium text-slate-700 flex items-center justify-center gap-1"
              title="Send Backward"
            >
              <ArrowDown className="w-3 h-3" />
              <span>Down</span>
            </button>
            <button
              type="button"
              onClick={() => onReorderObject(selectedObject.id, 'back')}
              className="py-1 px-1.5 bg-slate-100 hover:bg-slate-200 rounded text-[11px] font-medium text-slate-700 flex items-center justify-center gap-1"
              title="Send to Back"
            >
              <ArrowDownToLine className="w-3 h-3" />
              <span>Back</span>
            </button>
          </div>

          {/* ALIGN MENU & QUICK ALIGNMENT BAR */}
          <div className="pt-1 space-y-1.5 relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-700">Align to Page</span>

              <button
                type="button"
                disabled={Boolean(selectedObject.locked)}
                onClick={() => setIsAlignMenuOpen((prev) => !prev)}
                className={`px-2 py-1 rounded border text-[11px] font-medium flex items-center gap-1 transition-colors disabled:opacity-40 disabled:pointer-events-none ${
                  isAlignMenuOpen
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
                title="Open Align to Page Menu"
              >
                <AlignCenterVertical className="w-3 h-3" />
                <span>Align</span>
                <ChevronDown className="w-3 h-3 opacity-70" />
              </button>
            </div>

            {/* Dropdown Menu for Align */}
            {isAlignMenuOpen && !selectedObject.locked && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setIsAlignMenuOpen(false)}
                />
                <div className="absolute right-0 top-7 w-full bg-white border border-slate-200 rounded-lg shadow-xl py-1.5 z-40 text-xs">
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Horizontal (Width: {doc.widthMm} mm)
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAlignToPage('left')}
                    className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-100 text-slate-700"
                  >
                    <span className="flex items-center gap-2">
                      <AlignStartVertical className="w-3.5 h-3.5 text-blue-600" />
                      <span>Align Left Edge</span>
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">0 mm</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAlignToPage('center-h')}
                    className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-100 text-slate-700"
                  >
                    <span className="flex items-center gap-2">
                      <AlignCenterVertical className="w-3.5 h-3.5 text-blue-600" />
                      <span>Align Horizontal Center</span>
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {formatMm(doc.widthMm / 2, 1)} mm
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAlignToPage('right')}
                    className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-100 text-slate-700"
                  >
                    <span className="flex items-center gap-2">
                      <AlignEndVertical className="w-3.5 h-3.5 text-blue-600" />
                      <span>Align Right Edge</span>
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {doc.widthMm} mm
                    </span>
                  </button>

                  <div className="my-1 border-t border-slate-100" />
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Vertical (Height: {doc.heightMm} mm)
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAlignToPage('top')}
                    className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-100 text-slate-700"
                  >
                    <span className="flex items-center gap-2">
                      <AlignStartHorizontal className="w-3.5 h-3.5 text-blue-600" />
                      <span>Align Top Edge</span>
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">0 mm</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAlignToPage('center-v')}
                    className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-100 text-slate-700"
                  >
                    <span className="flex items-center gap-2">
                      <AlignCenterHorizontal className="w-3.5 h-3.5 text-blue-600" />
                      <span>Align Vertical Center</span>
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {formatMm(doc.heightMm / 2, 1)} mm
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAlignToPage('bottom')}
                    className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-100 text-slate-700"
                  >
                    <span className="flex items-center gap-2">
                      <AlignEndHorizontal className="w-3.5 h-3.5 text-blue-600" />
                      <span>Align Bottom Edge</span>
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {doc.heightMm} mm
                    </span>
                  </button>

                  <div className="my-1 border-t border-slate-100" />
                  <button
                    type="button"
                    onClick={() => handleAlignToPage('center-both')}
                    className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-blue-50 text-blue-700 font-medium"
                  >
                    <span className="flex items-center gap-2">
                      <Crosshair className="w-3.5 h-3.5 text-blue-600" />
                      <span>Center on Page (Both Axes)</span>
                    </span>
                  </button>
                </div>
              </>
            )}

            {/* 6-Button Direct Page Alignment Bar */}
            <div className="grid grid-cols-6 gap-1">
              <button
                type="button"
                disabled={Boolean(selectedObject.locked)}
                onClick={() => handleAlignToPage('left')}
                className="py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none rounded text-slate-700 flex flex-col items-center justify-center gap-0.5 transition-colors"
                title="Align Left Edge (0 mm)"
              >
                <AlignStartVertical className="w-3.5 h-3.5" />
                <span className="text-[9px] font-medium leading-none">Left</span>
              </button>
              <button
                type="button"
                disabled={Boolean(selectedObject.locked)}
                onClick={() => handleAlignToPage('center-h')}
                className="py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none rounded text-slate-700 flex flex-col items-center justify-center gap-0.5 transition-colors"
                title="Align Horizontal Center"
              >
                <AlignCenterVertical className="w-3.5 h-3.5" />
                <span className="text-[9px] font-medium leading-none">Center H</span>
              </button>
              <button
                type="button"
                disabled={Boolean(selectedObject.locked)}
                onClick={() => handleAlignToPage('right')}
                className="py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none rounded text-slate-700 flex flex-col items-center justify-center gap-0.5 transition-colors"
                title="Align Right Edge"
              >
                <AlignEndVertical className="w-3.5 h-3.5" />
                <span className="text-[9px] font-medium leading-none">Right</span>
              </button>
              <button
                type="button"
                disabled={Boolean(selectedObject.locked)}
                onClick={() => handleAlignToPage('top')}
                className="py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none rounded text-slate-700 flex flex-col items-center justify-center gap-0.5 transition-colors"
                title="Align Top Edge (0 mm)"
              >
                <AlignStartHorizontal className="w-3.5 h-3.5" />
                <span className="text-[9px] font-medium leading-none">Top</span>
              </button>
              <button
                type="button"
                disabled={Boolean(selectedObject.locked)}
                onClick={() => handleAlignToPage('center-v')}
                className="py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none rounded text-slate-700 flex flex-col items-center justify-center gap-0.5 transition-colors"
                title="Align Vertical Center"
              >
                <AlignCenterHorizontal className="w-3.5 h-3.5" />
                <span className="text-[9px] font-medium leading-none">Center V</span>
              </button>
              <button
                type="button"
                disabled={Boolean(selectedObject.locked)}
                onClick={() => handleAlignToPage('bottom')}
                className="py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none rounded text-slate-700 flex flex-col items-center justify-center gap-0.5 transition-colors"
                title="Align Bottom Edge"
              >
                <AlignEndHorizontal className="w-3.5 h-3.5" />
                <span className="text-[9px] font-medium leading-none">Bottom</span>
              </button>
            </div>
          </div>

          {/* GROUP / UNGROUP ACTIONS IN OBJECT INSPECTOR */}
          <div className="pt-1 space-y-1.5">
            {selectedObject.type === 'group' ? (
              <div className="p-2.5 bg-violet-50/80 border border-violet-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-violet-950 flex items-center gap-1.5">
                    <Group className="w-3.5 h-3.5 text-violet-700" />
                    <span>Group Entity ({selectedObject.children.length} items)</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onUngroupObject(selectedObject.id)}
                  className="w-full py-1.5 px-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                >
                  <Ungroup className="w-3.5 h-3.5" />
                  <span>Ungroup Objects ({selectedObject.children.length})</span>
                </button>
              </div>
            ) : (
              pageObjects.length >= 2 && (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                      <Group className="w-3.5 h-3.5 text-violet-600" />
                      <span>Group with Other Objects</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onGroupObjects(pageObjects.map((o) => o.id))}
                      className="text-[10px] font-medium text-violet-700 hover:underline"
                    >
                      Group All ({pageObjects.length})
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Tip: Hold <strong>Ctrl / ⌘ + Click</strong> on the canvas or check items below to select multiple objects.
                  </p>
                  <div className="max-h-28 overflow-y-auto border border-slate-200 bg-white rounded divide-y divide-slate-100">
                    {pageObjects
                      .filter((o) => o.id !== selectedObject.id)
                      .map((other) => {
                        const isChecked = selectedObjectIds.includes(other.id);
                        return (
                          <button
                            key={other.id}
                            type="button"
                            onClick={() => {
                              const base = selectedObjectIds.includes(selectedObject.id)
                                ? selectedObjectIds
                                : [selectedObject.id];
                              if (base.includes(other.id)) {
                                onSelectObjectIds(base.filter((id) => id !== other.id));
                              } else {
                                onSelectObjectIds([...base, other.id]);
                              }
                            }}
                            className="w-full px-2 py-1 flex items-center justify-between text-left text-[11px] hover:bg-violet-50/60 text-slate-700"
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              {isChecked ? (
                                <CheckSquare className="w-3 h-3 text-violet-600 shrink-0" />
                              ) : (
                                <Square className="w-3 h-3 text-slate-400 shrink-0" />
                              )}
                              <span className="truncate">+ {other.name}</span>
                            </span>
                            <span className="text-[9px] font-mono uppercase text-slate-400 ml-1.5 shrink-0">
                              {other.type}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        {/* GEOMETRY IN MILLIMETRES (mm) */}
        <div className="border-t border-slate-200 pt-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700">Geometry (mm)</span>
            <span className="text-[10px] font-mono text-slate-400">1:1 Physical</span>
          </div>

          {!isLinear ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">X Position (mm)</label>
                  <NumericPropertyInput
                    precision={2}
                    allowNegative={true}
                    disabled={Boolean(selectedObject.locked)}
                    value={formatMm(selectedObject.xMm, 2)}
                    onCommit={(val) => {
                      if (
                        selectedObject.type === 'group' ||
                        selectedObject.type === 'freehand'
                      ) {
                        onUpdateObject(
                          translatePageObjectMm(
                            selectedObject,
                            val - selectedObject.xMm,
                            0
                          ),
                          true
                        );
                      } else {
                        onUpdateObject({ ...selectedObject, xMm: val }, true);
                      }
                    }}
                    ariaLabel="X Position in millimetres"
                    className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-blue-600 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">Y Position (mm)</label>
                  <NumericPropertyInput
                    precision={2}
                    allowNegative={true}
                    disabled={Boolean(selectedObject.locked)}
                    value={formatMm(selectedObject.yMm, 2)}
                    onCommit={(val) => {
                      if (
                        selectedObject.type === 'group' ||
                        selectedObject.type === 'freehand'
                      ) {
                        onUpdateObject(
                          translatePageObjectMm(
                            selectedObject,
                            0,
                            val - selectedObject.yMm
                          ),
                          true
                        );
                      } else {
                        onUpdateObject({ ...selectedObject, yMm: val }, true);
                      }
                    }}
                    ariaLabel="Y Position in millimetres"
                    className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-blue-600 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">Width (mm)</label>
                  <NumericPropertyInput
                    min={1}
                    precision={2}
                    allowNegative={false}
                    disabled={Boolean(selectedObject.locked)}
                    value={formatMm(selectedObject.widthMm, 2)}
                    onCommit={(val) => {
                      if (selectedObject.type === 'group') {
                        onUpdateObject(
                          resizeGroupObjectMm(
                            selectedObject,
                            selectedObject.xMm,
                            selectedObject.yMm,
                            val,
                            selectedObject.heightMm
                          ),
                          true
                        );
                      } else if (selectedObject.type === 'freehand') {
                        onUpdateObject(
                          resizeFreehandStrokeMm(
                            selectedObject,
                            selectedObject.xMm,
                            selectedObject.yMm,
                            val,
                            selectedObject.heightMm
                          ),
                          true
                        );
                      } else if (
                        selectedObject.type === 'image' &&
                        selectedObject.preserveAspectRatio
                      ) {
                        const ratio =
                          selectedObject.heightMm / Math.max(0.1, selectedObject.widthMm);
                        onUpdateObject(
                          {
                            ...selectedObject,
                            widthMm: val,
                            heightMm: formatMm(val * ratio, 2),
                          },
                          true
                        );
                      } else if (
                        selectedObject.type === 'square' ||
                        selectedObject.type === 'circle'
                      ) {
                        onUpdateObject(
                          {
                            ...selectedObject,
                            widthMm: val,
                            heightMm: val,
                          },
                          true
                        );
                      } else {
                        onUpdateObject({ ...selectedObject, widthMm: val }, true);
                      }
                    }}
                    ariaLabel="Width in millimetres"
                    className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-blue-600 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">Height (mm)</label>
                  <NumericPropertyInput
                    min={1}
                    precision={2}
                    allowNegative={false}
                    disabled={Boolean(selectedObject.locked)}
                    value={formatMm(selectedObject.heightMm, 2)}
                    onCommit={(val) => {
                      if (selectedObject.type === 'group') {
                        onUpdateObject(
                          resizeGroupObjectMm(
                            selectedObject,
                            selectedObject.xMm,
                            selectedObject.yMm,
                            selectedObject.widthMm,
                            val
                          ),
                          true
                        );
                      } else if (selectedObject.type === 'freehand') {
                        onUpdateObject(
                          resizeFreehandStrokeMm(
                            selectedObject,
                            selectedObject.xMm,
                            selectedObject.yMm,
                            selectedObject.widthMm,
                            val
                          ),
                          true
                        );
                      } else if (
                        selectedObject.type === 'image' &&
                        selectedObject.preserveAspectRatio
                      ) {
                        const ratio =
                          selectedObject.widthMm / Math.max(0.1, selectedObject.heightMm);
                        onUpdateObject(
                          {
                            ...selectedObject,
                            heightMm: val,
                            widthMm: formatMm(val * ratio, 2),
                          },
                          true
                        );
                      } else if (
                        selectedObject.type === 'square' ||
                        selectedObject.type === 'circle'
                      ) {
                        onUpdateObject(
                          {
                            ...selectedObject,
                            widthMm: val,
                            heightMm: val,
                          },
                          true
                        );
                      } else {
                        onUpdateObject({ ...selectedObject, heightMm: val }, true);
                      }
                    }}
                    ariaLabel="Height in millimetres"
                    className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-blue-600 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">Rotation (°)</label>
                  <NumericPropertyInput
                    precision={1}
                    allowNegative={true}
                    disabled={Boolean(selectedObject.locked)}
                    value={formatMm(selectedObject.rotationDeg, 1)}
                    normalizeOnCommit={(val) => ((val % 360) + 360) % 360}
                    onCommit={(norm) => {
                      if (selectedObject.type === 'group') {
                        onUpdateObject(rotateGroupObjectMm(selectedObject, norm), true);
                      } else {
                        onUpdateObject(
                          {
                            ...selectedObject,
                            rotationDeg: norm,
                          },
                          true
                        );
                      }
                    }}
                    ariaLabel="Rotation in degrees"
                    className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-blue-600 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">Opacity (%)</label>
                  <NumericPropertyInput
                    min={5}
                    max={100}
                    precision={0}
                    allowNegative={false}
                    value={Math.round(selectedObject.opacity * 100)}
                    onCommit={(pct) => {
                      onUpdateObject({ ...selectedObject, opacity: pct / 100 }, true);
                    }}
                    ariaLabel="Opacity percentage"
                    className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>
            </>
          ) : (
            /* Linear Endpoints (Line, Arrow, Dimension) */
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">Start X1 (mm)</label>
                  <NumericPropertyInput
                    precision={2}
                    allowNegative={true}
                    disabled={Boolean(selectedObject.locked)}
                    value={formatMm(selectedObject.x1Mm, 2)}
                    onCommit={(val) => {
                      onUpdateObject(syncLinearBoundingBox({ ...selectedObject, x1Mm: val }), true);
                    }}
                    ariaLabel="Start X1 coordinate in millimetres"
                    className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-blue-600 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">Start Y1 (mm)</label>
                  <NumericPropertyInput
                    precision={2}
                    allowNegative={true}
                    disabled={Boolean(selectedObject.locked)}
                    value={formatMm(selectedObject.y1Mm, 2)}
                    onCommit={(val) => {
                      onUpdateObject(syncLinearBoundingBox({ ...selectedObject, y1Mm: val }), true);
                    }}
                    ariaLabel="Start Y1 coordinate in millimetres"
                    className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-blue-600 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">End X2 (mm)</label>
                  <NumericPropertyInput
                    precision={2}
                    allowNegative={true}
                    disabled={Boolean(selectedObject.locked)}
                    value={formatMm(selectedObject.x2Mm, 2)}
                    onCommit={(val) => {
                      onUpdateObject(syncLinearBoundingBox({ ...selectedObject, x2Mm: val }), true);
                    }}
                    ariaLabel="End X2 coordinate in millimetres"
                    className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-blue-600 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">End Y2 (mm)</label>
                  <NumericPropertyInput
                    precision={2}
                    allowNegative={true}
                    disabled={Boolean(selectedObject.locked)}
                    value={formatMm(selectedObject.y2Mm, 2)}
                    onCommit={(val) => {
                      onUpdateObject(syncLinearBoundingBox({ ...selectedObject, y2Mm: val }), true);
                    }}
                    ariaLabel="End Y2 coordinate in millimetres"
                    className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-blue-600 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 rounded border border-slate-200 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500">Length:</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {formatMm(
                      getLineLengthMm(
                        selectedObject.x1Mm,
                        selectedObject.y1Mm,
                        selectedObject.x2Mm,
                        selectedObject.y2Mm
                      ),
                      1
                    )}{' '}
                    mm
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500">Angle:</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {formatMm(
                      (((Math.atan2(
                        selectedObject.y2Mm - selectedObject.y1Mm,
                        selectedObject.x2Mm - selectedObject.x1Mm
                      ) *
                        180) /
                        Math.PI) %
                        360 +
                        360) %
                        360,
                      1
                    )}
                    °
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* IMAGE RESOLUTION & NON-DESTRUCTIVE CROP CONTROLS */}
        {selectedObject.type === 'image' && (
          <div className="border-t border-slate-200 pt-3.5 space-y-3">
            <div className="font-semibold text-slate-700">Image Resolution & Crop</div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedObject.preserveAspectRatio}
                onChange={(e) =>
                  onUpdateObject({
                    ...selectedObject,
                    preserveAspectRatio: e.target.checked,
                  })
                }
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-700">Preserve aspect ratio</span>
            </label>

            {/* Non-destructive Crop Controls */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onStartCropImage(isCroppingThis ? null : selectedObject.id)
                }
                className={`flex-1 py-1.5 px-2.5 rounded text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors ${
                  isCroppingThis
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                }`}
              >
                <Crop className="w-3.5 h-3.5" />
                <span>{isCroppingThis ? 'Done Cropping' : 'Crop Image'}</span>
              </button>

              {(selectedObject.crop.x > 0 ||
                selectedObject.crop.y > 0 ||
                selectedObject.crop.width < 1 ||
                selectedObject.crop.height < 1) && (
                <button
                  type="button"
                  onClick={() => {
                    if (asset) {
                      const fullAspect = asset.widthPx / Math.max(1, asset.heightPx);
                      onUpdateObject({
                        ...selectedObject,
                        crop: { x: 0, y: 0, width: 1, height: 1 },
                        heightMm: selectedObject.preserveAspectRatio
                          ? formatMm(selectedObject.widthMm / fullAspect, 2)
                          : selectedObject.heightMm,
                      });
                    }
                  }}
                  className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-200 flex items-center gap-1"
                  title="Reset non-destructive crop to full original image"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {/* Original Asset & Effective DPI Inspector */}
            {asset && dpiStats && (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Original Pixels:</span>
                  <span className="font-mono font-medium text-slate-800">
                    {asset.widthPx} × {asset.heightPx} px
                  </span>
                </div>
                {(selectedObject.crop.width < 0.999 || selectedObject.crop.height < 0.999) && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Active Crop Region:</span>
                    <span className="font-mono font-medium text-blue-700">
                      {dpiStats.croppedWidthPx} × {dpiStats.croppedHeightPx} px
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Placed Physical Size:</span>
                  <span className="font-mono font-medium text-slate-800">
                    {formatMm(selectedObject.widthMm)} × {formatMm(selectedObject.heightMm)} mm
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Original File Size:</span>
                  <span className="font-mono text-slate-700">
                    {formatBytes(asset.fileSizeBytes)} (Untouched)
                  </span>
                </div>
                <div className="pt-1 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-600">Effective Print DPI:</span>
                  <span
                    className={`font-mono font-bold text-xs ${
                      dpiStats.effectiveDpi < 100
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    {dpiStats.effectiveDpi} DPI
                  </span>
                </div>

                {dpiStats.effectiveDpi < 100 ? (
                  <div className="mt-1.5 p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800 flex items-start gap-1.5 leading-snug">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      Low effective resolution ({dpiStats.effectiveDpi} DPI) at this placed size. Original image bytes remain uncompressed.
                    </span>
                  </div>
                ) : (
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Print-ready resolution at placed size</span>
                  </div>
                )}
              </div>
            )}

            {/* Optional Image Frame Outline */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Border Colour</label>
                <input
                  type="color"
                  value={
                    selectedObject.strokeColor && selectedObject.strokeColor !== 'transparent'
                      ? selectedObject.strokeColor
                      : '#94A3B8'
                  }
                  onChange={(e) =>
                    onUpdateObject({ ...selectedObject, strokeColor: e.target.value })
                  }
                  className="w-full h-7 rounded border border-slate-200 cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Border (mm)</label>
                <NumericPropertyInput
                  min={0}
                  max={20}
                  precision={2}
                  allowNegative={false}
                  value={selectedObject.strokeWidthMm}
                  onCommit={(val) =>
                    onUpdateObject(
                      {
                        ...selectedObject,
                        strokeWidthMm: val,
                      },
                      true
                    )
                  }
                  ariaLabel="Image border thickness in millimetres"
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
          </div>
        )}

        {/* TEXT TYPOGRAPHY & BOX STYLING */}
        {selectedObject.type === 'text' && (
          <div className="border-t border-slate-200 pt-3.5 space-y-3">
            <div className="font-semibold text-slate-700">Typography & Text Content</div>

            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Text Content</label>
              <textarea
                rows={3}
                value={selectedObject.text}
                onFocus={() => {
                  hasRecordedTextFieldHistoryRef.current = false;
                }}
                onBlur={() => {
                  hasRecordedTextFieldHistoryRef.current = false;
                }}
                onChange={(e) => {
                  const shouldRecord = !hasRecordedTextFieldHistoryRef.current;
                  hasRecordedTextFieldHistoryRef.current = true;
                  onUpdateObject({ ...selectedObject, text: e.target.value }, shouldRecord);
                }}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:border-blue-600"
                placeholder="Enter text..."
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Font Family</label>
              <select
                value={selectedObject.fontFamily}
                onChange={(e) =>
                  onUpdateObject({ ...selectedObject, fontFamily: e.target.value }, true)
                }
                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800"
              >
                <optgroup label="Guaranteed PDF Standard Fonts">
                  {AVAILABLE_FONTS.filter((f) => f.pdfGuaranteed).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Local System Fonts (Warned on PDF Export)">
                  {AVAILABLE_FONTS.filter((f) => !f.pdfGuaranteed).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
              </select>

              {selectedFontDef && !selectedFontDef.pdfGuaranteed && (
                <div className="mt-1.5 p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800 space-y-1">
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      System font <strong>{selectedObject.fontFamily}</strong> cannot be embedded directly into PDF files and will map to <strong>{selectedFontDef.pdfFallback}</strong> on PDF export.
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Font Size (pt)</label>
                <NumericPropertyInput
                  min={6}
                  max={400}
                  precision={1}
                  allowNegative={false}
                  value={selectedObject.fontSizePt}
                  onCommit={(val) =>
                    onUpdateObject(
                      {
                        ...selectedObject,
                        fontSizePt: val,
                      },
                      true
                    )
                  }
                  ariaLabel="Font size in points"
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Text Colour</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={selectedObject.color || '#0F172A'}
                    onChange={(e) =>
                      onUpdateObject({ ...selectedObject, color: e.target.value })
                    }
                    className="w-8 h-7 rounded border border-slate-200 cursor-pointer shrink-0"
                  />
                  <input
                    type="text"
                    value={selectedObject.color}
                    onChange={(e) =>
                      onUpdateObject({ ...selectedObject, color: e.target.value })
                    }
                    className="w-full px-1.5 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-[11px]"
                  />
                </div>
              </div>
            </div>

            {/* Quick Colour Swatches for Red/Black/Blue Technical Annotations */}
            <div className="flex items-center gap-1.5">
              {QUICK_SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => onUpdateObject({ ...selectedObject, color: swatch })}
                  className="w-5 h-5 rounded-sm border border-slate-300"
                  style={{ backgroundColor: swatch }}
                  title={`Set text colour ${swatch}`}
                />
              ))}
            </div>

            {/* Style & Alignment Toggles */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center bg-slate-100 p-0.5 rounded border border-slate-200">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateObject({
                      ...selectedObject,
                      fontWeight: selectedObject.fontWeight === 'bold' ? 'normal' : 'bold',
                    })
                  }
                  className={`p-1.5 rounded ${
                    selectedObject.fontWeight === 'bold'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                  title="Bold"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateObject({
                      ...selectedObject,
                      fontStyle: selectedObject.fontStyle === 'italic' ? 'normal' : 'italic',
                    })
                  }
                  className={`p-1.5 rounded ${
                    selectedObject.fontStyle === 'italic'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                  title="Italic"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateObject({
                      ...selectedObject,
                      underline: !selectedObject.underline,
                    })
                  }
                  className={`p-1.5 rounded ${
                    selectedObject.underline
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                  title="Underline"
                >
                  <Underline className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center bg-slate-100 p-0.5 rounded border border-slate-200">
                <button
                  type="button"
                  onClick={() => onUpdateObject({ ...selectedObject, align: 'left' })}
                  className={`p-1.5 rounded ${
                    selectedObject.align === 'left'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                  title="Align Left"
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateObject({ ...selectedObject, align: 'center' })}
                  className={`p-1.5 rounded ${
                    selectedObject.align === 'center'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                  title="Align Centre"
                >
                  <AlignCenter className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateObject({ ...selectedObject, align: 'right' })}
                  className={`p-1.5 rounded ${
                    selectedObject.align === 'right'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                  title="Align Right"
                >
                  <AlignRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Text Box Background & Border */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] text-slate-500">Box Fill</label>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateObject({
                        ...selectedObject,
                        fillColor:
                          selectedObject.fillColor === 'transparent' ? '#FFFFFF' : 'transparent',
                      })
                    }
                    className="text-[10px] text-blue-600 hover:underline"
                  >
                    {selectedObject.fillColor === 'transparent' ? 'Add Fill' : 'Clear'}
                  </button>
                </div>
                {selectedObject.fillColor !== 'transparent' ? (
                  <input
                    type="color"
                    value={selectedObject.fillColor}
                    onChange={(e) =>
                      onUpdateObject({ ...selectedObject, fillColor: e.target.value })
                    }
                    className="w-full h-7 rounded border border-slate-200 cursor-pointer"
                  />
                ) : (
                  <div className="h-7 rounded border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400">
                    Transparent
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Box Border (mm)</label>
                <div className="flex items-center gap-1">
                  <input
                    type="color"
                    value={
                      selectedObject.strokeColor !== 'transparent'
                        ? selectedObject.strokeColor
                        : '#DC2626'
                    }
                    onChange={(e) =>
                      onUpdateObject({
                        ...selectedObject,
                        strokeColor: e.target.value,
                        strokeWidthMm: Math.max(0.4, selectedObject.strokeWidthMm),
                      })
                    }
                    className="w-7 h-7 rounded border border-slate-200 cursor-pointer shrink-0"
                  />
                  <NumericPropertyInput
                    min={0}
                    max={10}
                    precision={2}
                    allowNegative={false}
                    value={selectedObject.strokeWidthMm}
                    onCommit={(w) => {
                      onUpdateObject(
                        {
                          ...selectedObject,
                          strokeWidthMm: w,
                          strokeColor:
                            w > 0 && selectedObject.strokeColor === 'transparent'
                              ? '#0F172A'
                              : selectedObject.strokeColor,
                        },
                        true
                      );
                    }}
                    ariaLabel="Text box border thickness in millimetres"
                    className="w-full px-1.5 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* LINE, ARROW & DIMENSION STYLING */}
        {isLinear && (
          <div className="border-t border-slate-200 pt-3.5 space-y-3">
            <div className="font-semibold text-slate-700 capitalize">
              {selectedObject.type} Appearance
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Colour</label>
                <input
                  type="color"
                  value={selectedObject.strokeColor || '#DC2626'}
                  onChange={(e) =>
                    onUpdateObject({ ...selectedObject, strokeColor: e.target.value })
                  }
                  className="w-full h-7 rounded border border-slate-200 cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Thickness (mm)</label>
                <NumericPropertyInput
                  min={0.2}
                  max={25}
                  precision={2}
                  allowNegative={false}
                  value={selectedObject.strokeWidthMm}
                  onCommit={(val) =>
                    onUpdateObject(
                      {
                        ...selectedObject,
                        strokeWidthMm: val,
                      },
                      true
                    )
                  }
                  ariaLabel="Line thickness in millimetres"
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {QUICK_SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => onUpdateObject({ ...selectedObject, strokeColor: swatch })}
                  className="w-5 h-5 rounded-sm border border-slate-300"
                  style={{ backgroundColor: swatch }}
                />
              ))}
            </div>

            {(selectedObject.type === 'line' || selectedObject.type === 'arrow') && (
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Line Pattern</label>
                <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded">
                  {(['solid', 'dashed', 'dotted'] as const).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() =>
                        onUpdateObject({ ...selectedObject, lineStyle: style })
                      }
                      className={`py-1 rounded text-xs capitalize ${
                        selectedObject.lineStyle === style
                          ? 'bg-white text-slate-900 font-medium shadow-sm'
                          : 'text-slate-600'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedObject.type === 'arrow' && (
              <>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Arrowheads</label>
                  <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded">
                    {(
                      [
                        { id: 'end', label: 'Single →' },
                        { id: 'both', label: 'Double ↔' },
                        { id: 'start', label: '← Start' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          onUpdateObject({ ...selectedObject, arrowEnds: opt.id })
                        }
                        className={`py-1 rounded text-[11px] ${
                          selectedObject.arrowEnds === opt.id
                            ? 'bg-white text-slate-900 font-medium shadow-sm'
                            : 'text-slate-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Arrowhead Size (mm)
                  </label>
                  <NumericPropertyInput
                    min={2}
                    max={50}
                    precision={2}
                    allowNegative={false}
                    value={selectedObject.headSizeMm}
                    onCommit={(val) =>
                      onUpdateObject(
                        {
                          ...selectedObject,
                          headSizeMm: val,
                        },
                        true
                      )
                    }
                    ariaLabel="Arrowhead size in millimetres"
                    className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs focus:outline-none focus:border-blue-600"
                  />
                </div>
              </>
            )}

            {selectedObject.type === 'dimension' && (
              <>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Dimension Text Override (Leave blank for live mm)
                  </label>
                  <input
                    type="text"
                    value={selectedObject.customLabel}
                    onFocus={() => {
                      hasRecordedTextFieldHistoryRef.current = false;
                    }}
                    onBlur={() => {
                      hasRecordedTextFieldHistoryRef.current = false;
                    }}
                    onChange={(e) => {
                      const shouldRecord = !hasRecordedTextFieldHistoryRef.current;
                      hasRecordedTextFieldHistoryRef.current = true;
                      onUpdateObject(
                        { ...selectedObject, customLabel: e.target.value },
                        shouldRecord
                      );
                    }}
                    placeholder={`${Math.round(
                      getLineLengthMm(
                        selectedObject.x1Mm,
                        selectedObject.y1Mm,
                        selectedObject.x2Mm,
                        selectedObject.y2Mm
                      )
                    )} mm`}
                    className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Text Size (pt)</label>
                    <NumericPropertyInput
                      min={8}
                      max={120}
                      precision={1}
                      allowNegative={false}
                      value={selectedObject.fontSizePt}
                      onCommit={(val) =>
                        onUpdateObject(
                          {
                            ...selectedObject,
                            fontSizePt: val,
                          },
                          true
                        )
                      }
                      ariaLabel="Dimension text size in points"
                      className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      Witness Tick (mm)
                    </label>
                    <NumericPropertyInput
                      min={2}
                      max={60}
                      precision={2}
                      allowNegative={false}
                      value={selectedObject.extensionHeightMm}
                      onCommit={(val) =>
                        onUpdateObject(
                          {
                            ...selectedObject,
                            extensionHeightMm: val,
                          },
                          true
                        )
                      }
                      ariaLabel="Witness tick height in millimetres"
                      className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* SHAPE & HIGHLIGHT FILL / OUTLINE STYLING */}
        {(selectedObject.type === 'rectangle' ||
          selectedObject.type === 'square' ||
          selectedObject.type === 'ellipse' ||
          selectedObject.type === 'circle' ||
          selectedObject.type === 'triangle' ||
          selectedObject.type === 'highlight') && (
          <div className="border-t border-slate-200 pt-3.5 space-y-3">
            <div className="font-semibold text-slate-700 capitalize">
              {selectedObject.type === 'highlight' ? 'Highlight Colour & Transparency' : 'Fill & Outline'}
            </div>

            {selectedObject.type === 'highlight' && (
              <div className="grid grid-cols-2 gap-1.5">
                {HIGHLIGHT_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() =>
                      onUpdateObject({
                        ...selectedObject,
                        fillColor: preset.color,
                        opacity: preset.opacity,
                      })
                    }
                    className={`px-2 py-1.5 rounded border text-xs flex items-center gap-2 ${
                      selectedObject.fillColor.toUpperCase() === preset.color
                        ? 'border-blue-600 bg-blue-50/40 font-medium'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-sm border border-black/20"
                      style={{ backgroundColor: preset.color }}
                    />
                    <span>{preset.name}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] text-slate-500">Fill Colour</label>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateObject({
                        ...selectedObject,
                        fillColor:
                          selectedObject.fillColor === 'transparent' ? '#E2E8F0' : 'transparent',
                      })
                    }
                    className="text-[10px] text-blue-600 hover:underline"
                  >
                    {selectedObject.fillColor === 'transparent' ? 'Add Fill' : 'No Fill'}
                  </button>
                </div>
                {selectedObject.fillColor !== 'transparent' ? (
                  <input
                    type="color"
                    value={selectedObject.fillColor}
                    onChange={(e) =>
                      onUpdateObject({ ...selectedObject, fillColor: e.target.value })
                    }
                    className="w-full h-7 rounded border border-slate-200 cursor-pointer"
                  />
                ) : (
                  <div className="h-7 rounded border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400">
                    Transparent
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Outline Colour</label>
                <input
                  type="color"
                  value={
                    selectedObject.strokeColor && selectedObject.strokeColor !== 'transparent'
                      ? selectedObject.strokeColor
                      : '#0F172A'
                  }
                  onChange={(e) =>
                    onUpdateObject({
                      ...selectedObject,
                      strokeColor: e.target.value,
                      strokeWidthMm: Math.max(0.4, selectedObject.strokeWidthMm),
                    })
                  }
                  className="w-full h-7 rounded border border-slate-200 cursor-pointer"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">
                  Outline Thickness (mm)
                </label>
                <NumericPropertyInput
                  min={0}
                  max={25}
                  precision={2}
                  allowNegative={false}
                  value={selectedObject.strokeWidthMm}
                  onCommit={(val) =>
                    onUpdateObject(
                      {
                        ...selectedObject,
                        strokeWidthMm: val,
                      },
                      true
                    )
                  }
                  ariaLabel="Shape outline thickness in millimetres"
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Outline Style</label>
                <select
                  value={selectedObject.lineStyle}
                  onChange={(e) =>
                    onUpdateObject({
                      ...selectedObject,
                      lineStyle: e.target.value as 'solid' | 'dashed' | 'dotted',
                    })
                  }
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs"
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
              </div>
            </div>
          </div>
        )}
        {/* FREEHAND PEN / HIGHLIGHTER STROKE STYLING */}
        {selectedObject.type === 'freehand' && (
          <div className="border-t border-slate-200 pt-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">
                {selectedObject.strokeTool === 'highlighter'
                  ? 'Highlighter Stroke'
                  : 'Pen Stroke'}{' '}
                Appearance
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {selectedObject.pointsMm.length} pts
              </span>
            </div>

            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">
                Preset Colours
              </label>
              <div className="grid grid-cols-6 gap-1.5">
                {(selectedObject.strokeTool === 'highlighter'
                  ? FREEHAND_HIGHLIGHTER_PRESETS
                  : PEN_COLOR_PRESETS
                ).map((preset) => {
                  const isActive =
                    selectedObject.strokeColor.toUpperCase() ===
                    preset.color.toUpperCase();
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() =>
                        onUpdateObject(
                          {
                            ...selectedObject,
                            strokeColor: preset.color,
                          },
                          true
                        )
                      }
                      className={`w-7 h-7 rounded-full border transition-transform flex items-center justify-center ${
                        isActive
                          ? 'ring-2 ring-blue-600 ring-offset-1 scale-105 border-slate-400'
                          : 'border-slate-300 hover:scale-105'
                      }`}
                      style={{ backgroundColor: preset.color }}
                      title={preset.name}
                    />
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">
                  Stroke Colour
                </label>
                <input
                  type="color"
                  value={selectedObject.strokeColor || '#0F172A'}
                  onChange={(e) =>
                    onUpdateObject(
                      { ...selectedObject, strokeColor: e.target.value },
                      true
                    )
                  }
                  className="w-full h-7 rounded border border-slate-200 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-1">
                  Thickness (mm)
                </label>
                <NumericPropertyInput
                  min={0.2}
                  max={30}
                  precision={2}
                  allowNegative={false}
                  value={selectedObject.strokeWidthMm}
                  onCommit={(val) =>
                    onUpdateObject(
                      {
                        ...selectedObject,
                        strokeWidthMm: val,
                      },
                      true
                    )
                  }
                  ariaLabel="Freehand stroke thickness in millimetres"
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-xs focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
          </div>
        )}

        {/* GROUP CONTENTS INSPECTOR */}
        {selectedObject.type === 'group' && (
          <div className="border-t border-slate-200 pt-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">
                Grouped Objects ({selectedObject.children.length})
              </span>
              <button
                type="button"
                onClick={() => onUngroupObject(selectedObject.id)}
                className="text-[11px] font-medium text-violet-700 hover:underline flex items-center gap-1"
              >
                <Ungroup className="w-3 h-3" />
                <span>Ungroup</span>
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded divide-y divide-slate-100">
              {selectedObject.children.map((child) => (
                <div
                  key={child.id}
                  className="px-2.5 py-1.5 flex items-center justify-between text-[11px] text-slate-700"
                >
                  <span className="truncate font-medium">{child.name}</span>
                  <span className="text-[10px] font-mono uppercase text-slate-400 shrink-0 ml-2">
                    {child.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
