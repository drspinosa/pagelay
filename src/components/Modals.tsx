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
} from 'lucide-react';
import { Orientation, PageLayDocument, PaperFormat } from '../model/documentTypes';
import { getPaperDimensionsMm, ISO_PAPER_SIZES } from '../utils/units';
import {
  exportDocumentToPdfFile,
  findSystemFontWarnings,
} from '../services/pdfExportService';
import { exportPageToImageFile } from '../services/imageExportService';

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
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-lg max-h-[90dvh] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Create New PageLay Document</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Document Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              ISO A-Series Paper Size
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['A0', 'A1', 'A2', 'A3', 'A4', 'Custom'] as const).map((fmt) => {
                const isSelected = paperSize === fmt;
                const spec = fmt !== 'Custom' ? ISO_PAPER_SIZES[fmt] : null;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => handleSelectFormat(fmt, orientation)}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
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

          <div className="grid grid-cols-2 gap-3">
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
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg flex items-center justify-between gap-3">
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
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shrink-0 flex items-center gap-1.5"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Load Sample A0</span>
            </button>
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
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
