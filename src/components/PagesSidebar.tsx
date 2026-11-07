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

import React from 'react';
import { Plus, Copy, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
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
}) => {
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
      className="w-52 h-full bg-white border-r border-slate-200 flex flex-col overflow-hidden touch-pan-y select-none shrink-0 z-20"
    >
      {/* Sidebar Header */}
      <div className="h-9 px-3 max-lg:pr-9 border-b border-slate-200 flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold text-slate-700">
          Pages ({pages.length})
        </span>
        <button
          type="button"
          onClick={onAddPage}
          className="px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded flex items-center gap-1 transition-colors"
          title="Add New Page"
        >
          <Plus className="w-3 h-3" />
          <span>Add Page</span>
        </button>
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
