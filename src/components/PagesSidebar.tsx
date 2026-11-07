/**
 * @license
 * SPDX-License-Identifier: MIT
 *
 * PageLay — Left Sidebar (Pages & Thumbnails)
 *
 * Allows the user to:
 * - Select a page
 * - Add a page
 * - Delete a page
 * - Duplicate a page
 * - Reorder pages (Move Up / Move Down)
 * Clearly indicates the active page and renders a miniature proportional preview.
 */

import React, { useRef, useState } from 'react';
import { Plus, Copy, Trash2, ArrowUp, ArrowDown, FolderInput } from 'lucide-react';
import { ImageAsset, PageData } from '../model/documentTypes';
import { buildSmoothFreehandSvgPath, flattenPageObjects } from '../utils/units';

interface PagesSidebarProps {
  pages: PageData[];
  activePageIndex: number;
  widthMm: number;
  heightMm: number;
  assets: Record<string, ImageAsset>;
  onSelectPage: (index: number) => void;
  onAddPage: () => void;
  onDuplicatePage: (index: number) => void;
  onDeletePage: (index: number) => void;
  onMovePage: (index: number, direction: 'up' | 'down') => void;
  onDropFilesOnPagesSidebar: (files: File[]) => void;
}

export const PagesSidebar: React.FC<PagesSidebarProps> = ({
  pages,
  activePageIndex,
  widthMm,
  heightMm,
  assets,
  onSelectPage,
  onAddPage,
  onDuplicatePage,
  onDeletePage,
  onMovePage,
  onDropFilesOnPagesSidebar,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthRef = useRef(0);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const aspectRatio = widthMm / Math.max(1, heightMm);
  const thumbMaxWidth = 148;
  const thumbMaxHeight = 112;

  let thumbW = thumbMaxWidth;
  let thumbH = thumbW / aspectRatio;
  if (thumbH > thumbMaxHeight) {
    thumbH = thumbMaxHeight;
    thumbW = thumbH * aspectRatio;
  }

  return (
    <aside
      data-sidebar="true"
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepthRef.current += 1;
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
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        const related = e.relatedTarget as Node | null;
        if (dragDepthRef.current === 0 || (related && !e.currentTarget.contains(related))) {
          dragDepthRef.current = 0;
          setIsDragOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepthRef.current = 0;
        setIsDragOver(false);
        const droppedFiles = Array.from(e.dataTransfer?.files ?? []);
        if (droppedFiles.length > 0) {
          onDropFilesOnPagesSidebar(droppedFiles);
        }
      }}
      className="relative w-52 h-full bg-white border-r border-slate-200 flex flex-col overflow-hidden touch-pan-y select-none shrink-0 z-20"
    >
      {/* Hidden File Picker for Import Pages */}
      <input
        ref={importInputRef}
        type="file"
        accept=".lay,application/zip,application/octet-stream"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) {
            onDropFilesOnPagesSidebar(files);
          }
          e.target.value = '';
        }}
      />

      {/* Visual Drop Overlay for Importing Pages */}
      {isDragOver && (
        <div className="absolute inset-2 z-50 bg-blue-600/12 border-2 border-dashed border-blue-600 rounded-xl flex items-center justify-center p-3 pointer-events-none">
          <div className="bg-white/95 backdrop-blur-xs px-3 py-2.5 rounded-lg shadow-md border border-blue-200 flex flex-col items-center text-center gap-1">
            <FolderInput className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-xs font-bold text-blue-950">
              Drop to Import Pages
            </span>
            <span className="text-[10px] text-slate-600 leading-tight">
              Appends pages from .lay file to current document
            </span>
          </div>
        </div>
      )}

      {/* Sidebar Header */}
      <div className="h-9 px-2.5 max-lg:pr-8 border-b border-slate-200 flex items-center justify-between gap-1 shrink-0">
        <span className="text-xs font-semibold text-slate-700 truncate">
          Pages ({pages.length})
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="px-1.5 py-1 text-[10px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded flex items-center gap-1 transition-colors"
            title="Import Pages from another .lay Document"
          >
            <FolderInput className="w-3 h-3 text-slate-600" />
            <span>Import</span>
          </button>
          <button
            type="button"
            onClick={onAddPage}
            className="px-1.5 py-1 text-[10px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded flex items-center gap-0.5 transition-colors"
            title="Add New Blank Page"
          >
            <Plus className="w-3 h-3" />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* Scrollable Page Thumbnail List */}
      <div data-allow-touch-scroll="true" className="flex-1 touch-scroll-y p-3 space-y-3">
        {pages.map((page, idx) => {
          const isActive = idx === activePageIndex;
          const scaleX = thumbW / widthMm;
          const scaleY = thumbH / heightMm;

          return (
            <div
              key={page.id}
              onClick={() => onSelectPage(idx)}
              className={`group rounded-lg p-2 border transition-all cursor-pointer ${
                isActive
                  ? 'border-blue-600 bg-blue-50/40 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 bg-slate-50/60'
              }`}
            >
              {/* Page Number & Reorder/Duplicate/Delete Actions */}
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`text-[11px] font-medium truncate ${
                    isActive ? 'text-blue-700 font-semibold' : 'text-slate-700'
                  }`}
                >
                  {idx + 1}. {page.name}
                </span>

                <div
                  className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => onMovePage(idx, 'up')}
                    className="p-0.5 text-slate-500 hover:text-slate-900 disabled:opacity-25 rounded"
                    title="Move page up"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === pages.length - 1}
                    onClick={() => onMovePage(idx, 'down')}
                    className="p-0.5 text-slate-500 hover:text-slate-900 disabled:opacity-25 rounded"
                    title="Move page down"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDuplicatePage(idx)}
                    className="p-0.5 text-slate-500 hover:text-slate-900 rounded"
                    title="Duplicate page"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={pages.length <= 1}
                    onClick={() => onDeletePage(idx)}
                    className="p-0.5 text-slate-500 hover:text-rose-600 disabled:opacity-25 rounded"
                    title="Delete page"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Miniature Proportional Page Preview */}
              <div className="flex items-center justify-center py-1">
                <div
                  className={`relative bg-white overflow-hidden shadow-sm ${
                    isActive ? 'ring-2 ring-blue-600' : 'border border-slate-300'
                  }`}
                  style={{ width: thumbW, height: thumbH }}
                >
                  {flattenPageObjects(page.objects).map((obj) => {
                    const left = obj.xMm * scaleX;
                    const top = obj.yMm * scaleY;
                    const w = Math.max(2, obj.widthMm * scaleX);
                    const h = Math.max(2, obj.heightMm * scaleY);

                    if (obj.type === 'image') {
                      const asset = assets[obj.assetId];
                      return (
                        <div
                          key={obj.id}
                          className="absolute overflow-hidden bg-slate-200"
                          style={{
                            left,
                            top,
                            width: w,
                            height: h,
                            transform: `rotate(${obj.rotationDeg}deg)`,
                            opacity: obj.opacity,
                          }}
                        >
                          {asset && (
                            <img
                              src={asset.objectUrl}
                              alt=""
                              className="w-full h-full object-cover pointer-events-none"
                            />
                          )}
                        </div>
                      );
                    }

                    if (obj.type === 'line' || obj.type === 'arrow' || obj.type === 'dimension') {
                      return (
                        <svg
                          key={obj.id}
                          className="absolute inset-0 pointer-events-none"
                          width={thumbW}
                          height={thumbH}
                        >
                          <line
                            x1={obj.x1Mm * scaleX}
                            y1={obj.y1Mm * scaleY}
                            x2={obj.x2Mm * scaleX}
                            y2={obj.y2Mm * scaleY}
                            stroke={obj.strokeColor || '#DC2626'}
                            strokeWidth={Math.max(1, obj.strokeWidthMm * scaleX)}
                          />
                        </svg>
                      );
                    }

                    if (obj.type === 'freehand') {
                      const localPts = (obj.pointsMm || []).map((pt) => ({
                        x: (pt.xMm - obj.xMm) * scaleX,
                        y: (pt.yMm - obj.yMm) * scaleY,
                      }));
                      const d = buildSmoothFreehandSvgPath(localPts);
                      return (
                        <svg
                          key={obj.id}
                          className="absolute overflow-visible pointer-events-none"
                          style={{
                            left,
                            top,
                            width: w,
                            height: h,
                            transform: `rotate(${obj.rotationDeg}deg)`,
                            opacity: obj.opacity,
                          }}
                        >
                          <path
                            d={d}
                            fill="none"
                            stroke={obj.strokeColor || '#0F172A'}
                            strokeWidth={Math.max(1, obj.strokeWidthMm * scaleX)}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      );
                    }

                    if (obj.type === 'text') {
                      return (
                        <div
                          key={obj.id}
                          className="absolute overflow-hidden"
                          style={{
                            left,
                            top,
                            width: w,
                            height: h,
                            backgroundColor:
                              obj.fillColor && obj.fillColor !== 'transparent'
                                ? obj.fillColor
                                : undefined,
                            transform: `rotate(${obj.rotationDeg}deg)`,
                          }}
                        >
                          <div
                            className="w-full h-0.5 mt-0.5"
                            style={{ backgroundColor: obj.color || '#0F172A', opacity: 0.65 }}
                          />
                        </div>
                      );
                    }

                    return (
                      <div
                        key={obj.id}
                        className="absolute"
                        style={{
                          left,
                          top,
                          width: w,
                          height: h,
                          backgroundColor:
                            obj.fillColor && obj.fillColor !== 'transparent'
                              ? obj.fillColor
                              : undefined,
                          border:
                            obj.strokeWidthMm > 0 && obj.strokeColor !== 'transparent'
                              ? `1px solid ${obj.strokeColor}`
                              : undefined,
                          borderRadius:
                            obj.type === 'ellipse' || obj.type === 'circle' ? '9999px' : undefined,
                          opacity: obj.opacity,
                          transform: `rotate(${obj.rotationDeg}deg)`,
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>{page.objects.length} items</span>
                <span>
                  {widthMm}×{heightMm} mm
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
