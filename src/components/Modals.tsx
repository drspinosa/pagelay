/**
 * @license
 * SPDX-License-Identifier: MIT
 *
 * PageLay — New Document & Export Modals
 *
 * Includes:
 * 1. New Document Modal (ISO A0–A4 & Custom mm dimensions, Portrait/Landscape, or Sample A0 Layout)
 * 2. Export Modal:
 *    - Print-Ready PDF Export (with System Font Substitution Warning & 1-click font replacement)
 *    - High-Resolution PNG / JPG Page Export (72 / 150 / 300 DPI)
 */

import React, { useState } from 'react';
import {
  X,
  FileText,
  Image as ImageIcon,
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  LayoutGrid,
  Save,
  RotateCcw,
  Trash2,
  FolderOpen,
  Clock,
} from 'lucide-react';
import { Orientation, PageLayDocument, PaperFormat } from '../model/documentTypes';
import { getPaperDimensionsMm, ISO_PAPER_SIZES } from '../utils/units';
import {
  exportDocumentToPdfFile,
  findSystemFontWarnings,
} from '../services/pdfExportService';
import { exportPageToImageFile } from '../services/imageExportService';
import { RecoveryDraftSummary } from '../services/recoveryDraftService';
import {
  formatRecentTimestamp,
  RecentDocumentEntry,
} from '../services/recentFilesService';

function isMobileOrCoarseDevice(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.innerWidth < 768) return true;
  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  ) {
    return true;
  }
  return false;
}

function useVisualViewportCssVars(isOpen: boolean): void {
  React.useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const root = document.documentElement;

    const syncViewportVars = () => {
      const vv = window.visualViewport;
      if (vv && vv.height > 80) {
        root.style.setProperty('--vv-height', `${Math.round(vv.height)}px`);
        root.style.setProperty(
          '--vv-offset-top',
          `${Math.max(0, Math.round(vv.offsetTop))}px`
        );
      } else {
        root.style.setProperty('--vv-height', `${window.innerHeight}px`);
        root.style.setProperty('--vv-offset-top', '0px');
      }
    };

    syncViewportVars();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', syncViewportVars);
    vv?.addEventListener('scroll', syncViewportVars);
    window.addEventListener('resize', syncViewportVars);
    window.addEventListener('orientationchange', syncViewportVars);

    return () => {
      vv?.removeEventListener('resize', syncViewportVars);
      vv?.removeEventListener('scroll', syncViewportVars);
      window.removeEventListener('resize', syncViewportVars);
      window.removeEventListener('orientationchange', syncViewportVars);
      root.style.setProperty('--vv-height', '100dvh');
      root.style.setProperty('--vv-offset-top', '0px');
    };
  }, [isOpen]);
}

interface NewDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (
    name: string,
    paperSize: PaperFormat,
    orientation: Orientation,
    widthMm: number,
    heightMm: number
  ) => void;
  onLoadSample: () => void;
}

export const NewDocumentModal: React.FC<NewDocumentModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  onLoadSample,
}) => {
  const [name, setName] = useState('Untitled Exhibition Sheet');
  const [paperSize, setPaperSize] = useState<PaperFormat>('A0');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [widthMm, setWidthMm] = useState(1189);
  const [heightMm, setHeightMm] = useState(841);

  useVisualViewportCssVars(isOpen);

  if (!isOpen) return null;

  const handleSelectFormat = (fmt: PaperFormat, orient: Orientation) => {
    setPaperSize(fmt);
    setOrientation(orient);
    if (fmt !== 'Custom') {
      const dims = getPaperDimensionsMm(fmt, orient);
      setWidthMm(dims.widthMm);
      setHeightMm(dims.heightMm);
    }
  };

  return (
    <div className="fixed inset-x-0 z-50 modal-viewport-overlay bg-slate-900/50 flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-lg modal-viewport-card flex flex-col overflow-hidden">
        <div className="px-4 py-2.5 sm:px-5 sm:py-3.5 border-b border-slate-200 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-bold text-slate-900">Create New PageLay Document</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          data-allow-touch-scroll="true"
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-3.5 sm:p-5 space-y-3 sm:space-y-4 text-xs"
        >
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Document Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              ISO A-Series Paper Size
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2">
              {(['A0', 'A1', 'A2', 'A3', 'A4', 'Custom'] as const).map((fmt) => {
                const isSelected = paperSize === fmt;
                const spec = fmt !== 'Custom' ? ISO_PAPER_SIZES[fmt] : null;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => handleSelectFormat(fmt, orientation)}
                    className={`p-2 sm:p-2.5 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                    }`}
                  >
                    <div className="font-bold text-slate-900">{fmt}</div>
                    <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                      {spec
                        ? orientation === 'landscape'
                          ? `${spec.longMm} × ${spec.shortMm} mm`
                          : `${spec.shortMm} × ${spec.longMm} mm`
                        : 'Custom mm'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Orientation</label>
              <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => handleSelectFormat(paperSize, 'landscape')}
                  className={`py-1.5 rounded text-xs font-medium ${
                    orientation === 'landscape'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  Landscape
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectFormat(paperSize, 'portrait')}
                  className={`py-1.5 rounded text-xs font-medium ${
                    orientation === 'portrait'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  Portrait
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Width (mm)</label>
                <input
                  type="number"
                  min={20}
                  max={5000}
                  value={widthMm}
                  onChange={(e) => {
                    const val = Math.max(20, Number(e.target.value) || 210);
                    setPaperSize('Custom');
                    setWidthMm(val);
                    setOrientation(val >= heightMm ? 'landscape' : 'portrait');
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Height (mm)</label>
                <input
                  type="number"
                  min={20}
                  max={5000}
                  value={heightMm}
                  onChange={(e) => {
                    const val = Math.max(20, Number(e.target.value) || 297);
                    setPaperSize('Custom');
                    setHeightMm(val);
                    setOrientation(widthMm >= val ? 'landscape' : 'portrait');
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* Quick Sample Loader Callout */}
          <div className="p-2.5 sm:p-3 bg-blue-50/70 border border-blue-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
            <div>
              <div className="font-semibold text-blue-950">
                Want to test with an A0 Exhibition Stand Layout?
              </div>
              <div className="text-[11px] text-blue-800 mt-0.5">
                Loads 3 high-res architectural renders, red electrical arrows, "POWER", "320 mm" & "800 mm" annotations.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onLoadSample();
                onClose();
              }}
              className="w-full sm:w-auto px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shrink-0 flex items-center justify-center gap-1.5"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Load Sample A0</span>
            </button>
          </div>
        </div>

        <div className="px-4 py-2.5 sm:px-5 sm:py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onCreate(
                name.trim() || 'Untitled Document',
                paperSize,
                orientation,
                widthMm,
                heightMm
              );
              onClose();
            }}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
          >
            Create Blank Document
          </button>
        </div>
      </div>
    </div>
  );
};

interface ExportModalProps {
  isOpen: boolean;
  initialTab: 'pdf' | 'image';
  doc: PageLayDocument;
  activePageIndex: number;
  onClose: () => void;
  onReplaceSystemFontsWithStandard: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  initialTab,
  doc,
  activePageIndex,
  onClose,
  onReplaceSystemFontsWithStandard,
}) => {
  const [tab, setTab] = useState<'pdf' | 'image'>(initialTab);
  const [selectedPageIdx, setSelectedPageIdx] = useState(activePageIndex);
  const [imageFormat, setImageFormat] = useState<'png' | 'jpeg'>('png');
  const [imageDpi, setImageDpi] = useState<number>(150);
  const [jpegQuality, setJpegQuality] = useState<number>(0.92);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  React.useEffect(() => {
    setTab(initialTab);
    setSelectedPageIdx(activePageIndex);
    setExportMessage(null);
  }, [initialTab, activePageIndex, isOpen]);

  if (!isOpen) return null;

  const fontWarnings = findSystemFontWarnings(doc);
  const assetCount = Object.keys(doc.assets).length;

  const rawWidthPx = Math.round((doc.widthMm * imageDpi) / 25.4);
  const rawHeightPx = Math.round((doc.heightMm * imageDpi) / 25.4);
  const maxSide = Math.max(rawWidthPx, rawHeightPx);
  const scaleClamp = maxSide > 8192 ? 8192 / maxSide : 1;
  const finalWidthPx = Math.round(rawWidthPx * scaleClamp);
  const finalHeightPx = Math.round(rawHeightPx * scaleClamp);

  const handleExportPdf = async () => {
    setIsExporting(true);
    setExportMessage(null);
    try {
      await exportDocumentToPdfFile(doc);
      setExportMessage(
        `Exported print-ready PDF (${doc.widthMm} × ${doc.heightMm} mm, ${doc.pages.length} page${
          doc.pages.length > 1 ? 's' : ''
        }).`
      );
    } catch (err) {
      setExportMessage(
        err instanceof Error ? err.message : 'Failed to generate PDF document.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportImage = async () => {
    setIsExporting(true);
    setExportMessage(null);
    try {
      const page = doc.pages[selectedPageIdx] || doc.pages[0];
      const res = await exportPageToImageFile(doc, page, selectedPageIdx, {
        format: imageFormat,
        dpi: imageDpi,
        jpegQuality,
      });
      setExportMessage(
        `Exported ${page.name} as ${imageFormat.toUpperCase()} (${res.widthPx} × ${res.heightPx} px @ ${res.effectiveDpi} DPI).`
      );
    } catch (err) {
      setExportMessage(
        err instanceof Error ? err.message : 'Failed to export page image.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Export Document</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-5 pt-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setTab('pdf');
              setExportMessage(null);
            }}
            className={`px-3.5 py-2 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
              tab === 'pdf'
                ? 'border-blue-600 text-blue-600 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Print-Ready PDF (All Pages)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('image');
              setExportMessage(null);
            }}
            className={`px-3.5 py-2 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
              tab === 'image'
                ? 'border-blue-600 text-blue-600 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>PNG / JPG Image (Single Page)</span>
          </button>
        </div>

        {tab === 'pdf' ? (
          <div className="p-5 space-y-4 text-xs">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Physical Dimensions:</span>
                <span className="font-mono font-semibold text-slate-900">
                  {doc.paperSize} {doc.orientation} ({doc.widthMm} × {doc.heightMm} mm)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Pages Included:</span>
                <span className="font-mono font-medium text-slate-800">
                  {doc.pages.length} {doc.pages.length === 1 ? 'page' : 'pages'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Original Image Assets:</span>
                <span className="font-mono font-medium text-slate-800">
                  {assetCount} embedded at 100% original resolution
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Guidelines & Rulers:</span>
                <span className="text-emerald-700 font-medium">Excluded from print output</span>
              </div>
            </div>

            {/* Font Fidelity Check */}
            {fontWarnings.length > 0 ? (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg space-y-2.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-semibold text-amber-900">
                      System Font Substitution Notice ({fontWarnings.length}{' '}
                      {fontWarnings.length === 1 ? 'text box' : 'text boxes'})
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Browsers cannot extract raw operating-system font files into a standalone PDF. The following items will use their guaranteed PDF Standard equivalent:
                    </p>
                  </div>
                </div>

                <div className="max-h-28 overflow-y-auto bg-white/80 rounded border border-amber-200 divide-y divide-amber-100 px-2.5 py-1">
                  {fontWarnings.map((w) => (
                    <div
                      key={w.objectId}
                      className="py-1 flex items-center justify-between text-[11px]"
                    >
                      <span className="font-medium text-slate-800 truncate">
                        {w.pageName}: {w.objectName}
                      </span>
                      <span className="font-mono text-amber-900 shrink-0">
                        {w.requestedFont} → <strong>{w.replacementFont}</strong>
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={onReplaceSystemFontsWithStandard}
                  className="w-full py-1.5 px-3 bg-amber-100 hover:bg-amber-200 text-amber-950 font-medium rounded text-xs transition-colors"
                >
                  Switch Document Text Boxes to Guaranteed PDF Fonts Now
                </button>
              </div>
            ) : (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  All text objects use guaranteed embeddable PDF standard fonts. Vector shapes, lines, arrows, and untouched image streams are ready for print.
                </span>
              </div>
            )}

            {exportMessage && (
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded text-blue-900 font-medium">
                {exportMessage}
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                Close
              </button>
              <button
                type="button"
                disabled={isExporting}
                onClick={handleExportPdf}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg flex items-center gap-1.5"
              >
                {isExporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>
                  {fontWarnings.length > 0
                    ? 'Export PDF with Font Replacement'
                    : 'Download Print-Ready PDF'}
                </span>
              </button>
            </div>
          </div>
        ) : (
          /* PNG / JPG Page Image Export Tab */
          <div className="p-5 space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Page</label>
                <select
                  value={selectedPageIdx}
                  onChange={(e) => setSelectedPageIdx(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  {doc.pages.map((p, idx) => (
                    <option key={p.id} value={idx}>
                      Page {idx + 1}: {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Image Format</label>
                <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setImageFormat('png')}
                    className={`py-1 rounded text-xs font-medium ${
                      imageFormat === 'png'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600'
                    }`}
                  >
                    PNG (Lossless)
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageFormat('jpeg')}
                    className={`py-1 rounded text-xs font-medium ${
                      imageFormat === 'jpeg'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600'
                    }`}
                  >
                    JPG
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Target Print DPI</label>
                <select
                  value={imageDpi}
                  onChange={(e) => setImageDpi(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs"
                >
                  <option value={72}>72 DPI (Screen / Proof)</option>
                  <option value={150}>150 DPI (Large Format A0/A1 Print)</option>
                  <option value={300}>300 DPI (High-Res Fine Print)</option>
                </select>
              </div>

              {imageFormat === 'jpeg' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    JPEG Quality ({Math.round(jpegQuality * 100)}%)
                  </label>
                  <input
                    type="range"
                    min={0.7}
                    max={1.0}
                    step={0.02}
                    value={jpegQuality}
                    onChange={(e) => setJpegQuality(parseFloat(e.target.value))}
                    className="w-full mt-2"
                  />
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Output Pixel Resolution:</span>
                <span className="font-mono font-semibold text-slate-900">
                  {finalWidthPx} × {finalHeightPx} px
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Source Rendering:</span>
                <span className="text-slate-800 font-medium">
                  Full-resolution assets (Independent of editor zoom)
                </span>
              </div>
            </div>

            {exportMessage && (
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded text-blue-900 font-medium">
                {exportMessage}
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                Close
              </button>
              <button
                type="button"
                disabled={isExporting}
                onClick={handleExportImage}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg flex items-center gap-1.5"
              >
                {isExporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>Export {imageFormat.toUpperCase()}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export type SaveAsOutcome =
  | 'saved-native'
  | 'download-initiated'
  | 'cancelled'
  | 'failed';

interface SaveAsModalProps {
  isOpen: boolean;
  currentName: string;
  hasPendingReplacement?: boolean;
  onClose: () => void;
  onConfirmSaveAs: (newName: string) => Promise<SaveAsOutcome | void> | void;
  onAcknowledgeDownloadAndContinue?: () => void;
}

export const SaveAsModal: React.FC<SaveAsModalProps> = ({
  isOpen,
  currentName,
  hasPendingReplacement = false,
  onClose,
  onConfirmSaveAs,
  onAcknowledgeDownloadAndContinue,
}) => {
  const [nameInput, setNameInput] = useState(currentName);
  const [isSaving, setIsSaving] = useState(false);
  const [downloadedFilename, setDownloadedFilename] = useState<string | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const blurTimeoutRef = React.useRef<number | null>(null);

  useVisualViewportCssVars(isOpen);

  React.useEffect(() => {
    if (isOpen) {
      setNameInput(currentName);
      setIsSaving(false);
      setDownloadedFilename(null);
      setIsInputFocused(false);
      // On desktop, automatically focus and select the filename field.
      // On mobile/touch devices, avoid opening the on-screen keyboard until the user taps the field.
      if (!isMobileOrCoarseDevice()) {
        const timer = window.setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 20);
        return () => window.clearTimeout(timer);
      }
    }
    return () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
        blurTimeoutRef.current = null;
      }
    };
  }, [isOpen, currentName]);

  if (!isOpen) return null;

  const cleanPreviewName =
    nameInput
      .trim()
      .replace(/\.lay$/i, '')
      .trim() || 'Untitled Document';

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSaving) return;
    if (downloadedFilename && hasPendingReplacement) {
      onAcknowledgeDownloadAndContinue?.();
      return;
    }
    const trimmed = nameInput
      .trim()
      .replace(/\.lay$/i, '')
      .trim();
    if (!trimmed) return;
    setIsSaving(true);
    try {
      const outcome = await onConfirmSaveAs(trimmed);
      if (hasPendingReplacement && outcome === 'download-initiated') {
        setDownloadedFilename(`${trimmed}.lay`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-x-0 z-50 modal-viewport-overlay bg-slate-900/50 flex items-start sm:items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className={`bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md modal-viewport-card ${
          isInputFocused
            ? 'max-sm:max-h-[min(56dvh,calc(var(--vv-height,100dvh)-16px))]'
            : ''
        } flex flex-col overflow-hidden`}
      >
        <div className="px-4 py-2.5 sm:px-5 sm:py-3.5 border-b border-slate-200 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-bold text-slate-900 truncate pr-2">
            {downloadedFilename
              ? 'Confirm Downloaded .lay Copy'
              : 'Save Document As (.lay)'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded shrink-0"
            aria-label="Cancel Save As"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          data-allow-touch-scroll="true"
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-3.5 sm:p-5 space-y-2.5 sm:space-y-3.5 text-xs"
        >
          {downloadedFilename ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2.5 text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold">
                  Download initiated for <span className="font-mono">{downloadedFilename}</span>
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  Because this browser downloads a copy rather than overwriting the original file directly on disk, please confirm that your <span className="font-mono">.lay</span> download was saved before replacing the current document.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label
                  htmlFor="save-as-doc-name"
                  className="block font-semibold text-slate-700 mb-1"
                >
                  Document Name
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="save-as-doc-name"
                    ref={inputRef}
                    type="text"
                    value={nameInput}
                    onFocus={() => {
                      if (blurTimeoutRef.current !== null) {
                        window.clearTimeout(blurTimeoutRef.current);
                        blurTimeoutRef.current = null;
                      }
                      setIsInputFocused(true);
                    }}
                    onBlur={() => {
                      if (blurTimeoutRef.current !== null) {
                        window.clearTimeout(blurTimeoutRef.current);
                      }
                      blurTimeoutRef.current = window.setTimeout(() => {
                        blurTimeoutRef.current = null;
                        setIsInputFocused(false);
                      }, 180);
                    }}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        onClose();
                      }
                    }}
                    placeholder="Enter document name"
                    className="flex-1 min-w-0 px-3 py-1.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                  <span className="px-2.5 py-1.5 sm:py-2 bg-slate-100 border border-slate-200 rounded-lg font-mono text-xs text-slate-600 select-none shrink-0">
                    .lay
                  </span>
                </div>
              </div>

              <div className="p-2.5 sm:p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 shrink-0">Exported File:</span>
                  <span className="font-mono font-semibold text-slate-900 truncate max-w-[220px]">
                    {cleanPreviewName}.lay
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 shrink-0">Internal Manifest Title:</span>
                  <span className="font-mono font-medium text-slate-800 truncate max-w-[220px]">
                    {cleanPreviewName}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 text-[11px] text-slate-500 leading-relaxed">
                <p>
                  Updates the document title in PageLay and inside the saved{' '}
                  <span className="font-mono">.lay</span> archive so both stay in sync.
                </p>
                <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                  Direct file overwrite is unavailable in this browser or embedded environment. Saving will download a new <span className="font-mono">.lay</span> file copy rather than overwriting an existing file on disk.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="px-4 py-2.5 sm:px-5 sm:py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded-lg"
          >
            {downloadedFilename ? 'Keep Current Document' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={
              isSaving ||
              (!downloadedFilename && !nameInput.trim().replace(/\.lay$/i, '').trim())
            }
            className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 rounded-lg flex items-center gap-1.5"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : downloadedFilename ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>
              {downloadedFilename ? 'Confirm Saved & Continue' : 'Save .lay'}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
};

interface UnsavedChangesModalProps {
  isOpen: boolean;
  documentName: string;
  isSaving: boolean;
  isNativeOverwriteSupported: boolean;
  onSaveAndContinue: () => void;
  onDiscardAndContinue: () => void;
  onCancel: () => void;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  isOpen,
  documentName,
  isSaving,
  isNativeOverwriteSupported,
  onSaveAndContinue,
  onDiscardAndContinue,
  onCancel,
}) => {
  if (!isOpen) return null;

  const displayDocName = (documentName || 'Untitled Document').trim();

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-changes-title"
    >
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <h2 id="unsaved-changes-title" className="text-sm font-bold text-slate-900">
              Save changes before continuing?
            </h2>
          </div>
          <button
            type="button"
            disabled={isSaving}
            onClick={onCancel}
            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-40 rounded"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 text-xs text-slate-700 leading-relaxed">
          <p>
            You have unsaved changes to{' '}
            <span className="font-semibold text-slate-900">
              {displayDocName}
            </span>
            . Continuing without saving will discard those changes.
          </p>

          {!isNativeOverwriteSupported && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 leading-relaxed">
              Note: Direct file overwrite is unavailable in this browser environment. Choosing{' '}
              <span className="font-semibold">Save</span> will download a{' '}
              <span className="font-mono">.lay</span> copy rather than overwriting the original file on disk, and ask you to confirm before replacing the current document.
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={onCancel}
            className="px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-40 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={onDiscardAndContinue}
            className="px-3.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:opacity-40 rounded-lg"
          >
            Don&apos;t Save
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={onSaveAndContinue}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg flex items-center gap-1.5"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Save</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface RecoveryDraftModalProps {
  isOpen: boolean;
  summary: RecoveryDraftSummary | null;
  isBusy: boolean;
  onRecover: () => void;
  onDiscardRecovery: () => void;
}

function formatRecoveryTimestamp(savedAtMs: number, savedAtIso: string): string {
  const date = new Date(Number.isFinite(savedAtMs) ? savedAtMs : savedAtIso);
  if (Number.isNaN(date.getTime())) {
    return savedAtIso || 'Recent session';
  }
  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const timeStr = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  if (isSameDay) {
    return `Today at ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${dateStr} at ${timeStr}`;
}

export const RecoveryDraftModal: React.FC<RecoveryDraftModalProps> = ({
  isOpen,
  summary,
  isBusy,
  onRecover,
  onDiscardRecovery,
}) => {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setConfirmingDiscard(false);
    }
  }, [isOpen, summary?.documentId, summary?.revision]);

  if (!isOpen || !summary) return null;

  const formattedTime = formatRecoveryTimestamp(
    summary.savedAtMs,
    summary.savedAtIso
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-draft-title"
    >
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md max-h-[calc(100dvh-16px)] sm:max-h-[90dvh] flex flex-col overflow-hidden">
        <div className="px-4 py-2.5 sm:px-5 sm:py-3.5 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-blue-600 shrink-0" />
            <h2 id="recovery-draft-title" className="text-sm font-bold text-slate-900">
              Continue editing your document?
            </h2>
          </div>
        </div>

        <div
          data-allow-touch-scroll="true"
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-3.5 sm:p-5 space-y-3 text-xs text-slate-700 leading-relaxed"
        >
          <p>
            PageLay found a locally saved working draft of{' '}
            <span className="font-semibold text-slate-900">
              {summary.documentName}
            </span>
            . You can continue where you left off.
          </p>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 shrink-0">Document Name:</span>
              <span className="font-semibold text-slate-900 truncate">
                {summary.documentName}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 shrink-0">Last Recovery Time:</span>
              <span className="font-mono font-medium text-slate-800">
                {formattedTime}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 shrink-0">Layout &amp; Contents:</span>
              <span className="font-mono text-[11px] text-slate-700 text-right">
                {summary.paperSize} ({summary.widthMm} × {summary.heightMm} mm) ·{' '}
                {summary.pageCount} page{summary.pageCount !== 1 ? 's' : ''}
                {summary.assetCount > 0
                  ? ` · ${summary.assetCount} original image${
                      summary.assetCount !== 1 ? 's' : ''
                    }`
                  : ''}
              </span>
            </div>
            {summary.undoCount > 0 && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 shrink-0">Editing History:</span>
                <span className="font-mono text-[11px] text-slate-700">
                  {summary.undoCount} undo step{summary.undoCount !== 1 ? 's' : ''} preserved
                  {summary.redoCount > 0 ? ` (${summary.redoCount} redo)` : ''}
                </span>
              </div>
            )}
          </div>

          {confirmingDiscard ? (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg space-y-1.5 text-rose-900">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>Permanently discard this working draft?</span>
              </div>
              <p className="text-[11px] text-rose-800 leading-relaxed">
                This will permanently remove the local recovery draft of{' '}
                <span className="font-semibold">{summary.documentName}</span> and its unsaved changes from this browser.
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              This is an automatic local browser draft, not a saved{' '}
              <span className="font-mono">.lay</span> file on disk. Continuing restores your pages, Undo/Redo history, and original full-resolution images as an{' '}
              <span className="font-semibold text-amber-700">Unsaved</span> document so you can use{' '}
              <span className="font-semibold text-slate-700">Save</span> or{' '}
              <span className="font-semibold text-slate-700">Save As</span> when ready.
            </p>
          )}
        </div>

        <div className="px-4 py-2.5 sm:px-5 sm:py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2 shrink-0">
          {confirmingDiscard ? (
            <>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setConfirmingDiscard(false)}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-40 rounded-lg"
              >
                Keep Draft
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={onDiscardRecovery}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg flex items-center gap-1.5"
              >
                {isBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Permanently Discard</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setConfirmingDiscard(true)}
                className="px-3.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:opacity-40 rounded-lg flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Discard Draft</span>
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={onRecover}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg flex items-center gap-1.5"
              >
                {isBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5" />
                )}
                <span>Continue Editing</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface ReopenRecentModalProps {
  isOpen: boolean;
  entry: RecentDocumentEntry | null;
  reasonMessage: string | null;
  canOpenLocalCopy?: boolean;
  onOpenLocalCopy?: (entry: RecentDocumentEntry) => void;
  onChooseFileToReopen: () => void;
  onRemoveEntry: (entryId: string) => void;
  onClose: () => void;
}

export const ReopenRecentModal: React.FC<ReopenRecentModalProps> = ({
  isOpen,
  entry,
  reasonMessage,
  canOpenLocalCopy = false,
  onOpenLocalCopy,
  onChooseFileToReopen,
  onRemoveEntry,
  onClose,
}) => {
  if (!isOpen || !entry) return null;

  const timeLabel = formatRecentTimestamp(entry.lastAccessedAtMs);
  const showLocalCopyOption = Boolean(
    (canOpenLocalCopy || entry.hasCachedBlob) && onOpenLocalCopy
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-3 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reopen-recent-title"
    >
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md max-h-[calc(100dvh-16px)] sm:max-h-[90dvh] flex flex-col overflow-hidden">
        <div className="px-4 py-2.5 sm:px-5 sm:py-3.5 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="w-4 h-4 text-blue-600 shrink-0" />
            <h2
              id="reopen-recent-title"
              className="text-sm font-bold text-slate-900 truncate"
            >
              Reopen Recent Document
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          data-allow-touch-scroll="true"
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-3.5 sm:p-5 space-y-3 text-xs text-slate-700 leading-relaxed"
        >
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 shrink-0">Filename:</span>
              <span className="font-mono font-semibold text-slate-900 truncate">
                {entry.filename}
              </span>
            </div>
            {timeLabel && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 shrink-0">Last Used:</span>
                <span className="font-mono text-[11px] text-slate-700">
                  {timeLabel}
                </span>
              </div>
            )}
            {entry.paperSize && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 shrink-0">Paper Format:</span>
                <span className="font-mono text-[11px] text-slate-700">
                  {entry.paperSize}
                  {entry.orientation ? ` (${entry.orientation})` : ''}
                  {entry.pageCount
                    ? ` · ${entry.pageCount} page${
                        entry.pageCount !== 1 ? 's' : ''
                      }`
                    : ''}
                </span>
              </div>
            )}
          </div>

          <p className="text-slate-600">
            {reasonMessage ||
              `Select "${entry.filename}" from your device to reopen it.`}
          </p>

          {showLocalCopyOption && (
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-900 leading-relaxed">
              <strong>Local copy available:</strong> Opening the cached browser snapshot restores all pages and full-resolution images. Saving later will ask you to choose a destination rather than overwriting another file automatically.
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 sm:px-5 sm:py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onRemoveEntry(entry.id)}
            className="px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg flex items-center gap-1"
            title="Remove this record from Recent Documents"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove Entry</span>
          </button>

          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onChooseFileToReopen}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 ${
                showLocalCopyOption
                  ? 'text-slate-800 bg-white border border-slate-300 hover:bg-slate-100'
                  : 'text-white bg-slate-900 hover:bg-slate-800'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Choose File to Reopen</span>
            </button>
            {showLocalCopyOption && onOpenLocalCopy && (
              <button
                type="button"
                onClick={() => onOpenLocalCopy(entry)}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Open Local Copy</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

