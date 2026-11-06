/**
 * @license
 * SPDX-License-Identifier: MIT
 *
 * PageLay — Responsive Bottom Status Bar
 */

import React from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  MoveHorizontal,
  Focus,
  CheckCircle2,
  CircleDot,
} from 'lucide-react';
import { Orientation, PaperFormat } from '../model/documentTypes';

interface StatusBarProps {
  currentPageIndex: number;
  pageCount: number;
  paperSize: PaperFormat;
  orientation: Orientation;
  widthMm: number;
  heightMm: number;
  zoom: number;
  isDirty: boolean;
  lastSavedAt: string | null;
  cursorMm: { x: number; y: number } | null;
  hasSelection: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSetZoom: (zoom: number) => void;
  onFitToPage: () => void;
  onFitToWidth: () => void;
  onFitSelection: () => void;
}

const ZOOM_PRESETS = [0.08, 0.15, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0];

export const StatusBar: React.FC<StatusBarProps> = ({
  currentPageIndex,
  pageCount,
  paperSize,
  orientation,
  widthMm,
  heightMm,
  zoom,
  isDirty,
  lastSavedAt,
  cursorMm,
  hasSelection,
  onZoomIn,
  onZoomOut,
  onSetZoom,
  onFitToPage,
  onFitToWidth,
  onFitSelection,
}) => {
  const zoomPercent = Math.round(zoom * 100);

  return (
    <footer className="h-8 bg-white border-t border-slate-200 px-2.5 sm:px-3 flex items-center justify-between gap-2 text-xs text-slate-600 select-none shrink-0 z-30 touch-scroll-x no-scrollbar">
      {/* Left: Page, Paper Size, Save Status */}
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <span className="font-medium text-slate-800 whitespace-nowrap">
          Page {currentPageIndex + 1}/{pageCount}
        </span>
        <span aria-hidden="true" className="text-slate-300">
          ·
        </span>
        <span className="font-mono text-[11px] whitespace-nowrap">
          {paperSize} ({widthMm} × {heightMm} mm)
        </span>
        <span aria-hidden="true" className="hidden sm:inline text-slate-300">
          ·
        </span>
        <span className="hidden sm:inline capitalize whitespace-nowrap">{orientation}</span>
        <span aria-hidden="true" className="hidden md:inline text-slate-300">
          ·
        </span>
        <div className="hidden md:flex items-center gap-1.5 whitespace-nowrap">
          {isDirty ? (
            <>
              <CircleDot className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="text-amber-700 font-medium">Unsaved</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="text-slate-600">
                {lastSavedAt ? `Saved (${lastSavedAt})` : 'Saved'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Centre: Live Millimetre Cursor Coordinates */}
      <div className="hidden lg:flex items-center gap-2 font-mono text-[11px] text-slate-500 shrink-0">
        {cursorMm ? (
          <span>
            X: {cursorMm.x.toFixed(1)} mm &nbsp; Y: {cursorMm.y.toFixed(1)} mm
          </span>
        ) : (
          <span>Units: millimetres (mm)</span>
        )}
      </div>

      {/* Right: Fit & Zoom Controls */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          disabled={!hasSelection}
          onClick={onFitSelection}
          className={`px-2 py-0.5 text-[11px] font-medium rounded border flex items-center gap-1 transition-colors whitespace-nowrap ${
            hasSelection
              ? 'text-blue-700 bg-blue-50/70 hover:bg-blue-100/80 border-blue-200'
              : 'text-slate-400 bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed'
          }`}
          title={
            hasSelection
              ? 'Zoom and center on the currently selected object(s)'
              : 'Select an object on the page to fit selection'
          }
        >
          <Focus className="w-3 h-3" />
          <span>Fit Selection</span>
        </button>

        <button
          type="button"
          onClick={onFitToPage}
          className="px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 rounded border border-slate-200 flex items-center gap-1 transition-colors whitespace-nowrap"
          title="Fit whole page in workspace"
        >
          <Maximize2 className="w-3 h-3" />
          <span>Fit Page</span>
        </button>
        <button
          type="button"
          onClick={onFitToWidth}
          className="hidden sm:flex px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 rounded border border-slate-200 items-center gap-1 transition-colors whitespace-nowrap"
          title="Fit page width in workspace"
        >
          <MoveHorizontal className="w-3 h-3" />
          <span>Fit Width</span>
        </button>

        <button
          type="button"
          onClick={onZoomOut}
          className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
          title="Zoom out"
          aria-label="Zoom out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        <select
          value={
            ZOOM_PRESETS.includes(Number(zoom.toFixed(2)))
              ? Number(zoom.toFixed(2))
              : 'custom'
          }
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) onSetZoom(val);
          }}
          className="bg-slate-50 border border-slate-200 rounded px-1 py-0.5 font-mono text-[11px] text-slate-800 focus:outline-none focus:border-blue-600"
          aria-label="Zoom percentage"
        >
          {!ZOOM_PRESETS.includes(Number(zoom.toFixed(2))) && (
            <option value="custom">{zoomPercent}%</option>
          )}
          {ZOOM_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {Math.round(preset * 100)}%
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onZoomIn}
          className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
          title="Zoom in"
          aria-label="Zoom in"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
      </div>
    </footer>
  );
};
