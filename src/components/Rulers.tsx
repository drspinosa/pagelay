/**
 * @license
 * SPDX-License-Identifier: MIT
 *
 * PageLay — Millimetre Horizontal and Vertical Rulers
 *
 * Dynamically renders readable millimetre ticks and labels at any zoom level
 * (from 5% mobile overview up to 400% detail zoom) without overlapping labels.
 * Uses Pointer Events and `data-ruler="true"` markers so dragging a guideline
 * from a ruler never bubbles or triggers unintended document panning.
 */

import React from 'react';
import { CSS_PX_PER_MM_AT_100 } from '../utils/units';

interface RulersProps {
  zoom: number;
  panX: number;
  panY: number;
  pageWidthMm: number;
  pageHeightMm: number;
  cursorMm: { x: number; y: number } | null;
  lockGuides: boolean;
  onStartCreateGuide: (
    orientation: 'horizontal' | 'vertical',
    clientX: number,
    clientY: number,
    pointerId?: number
  ) => void;
}

export const RULER_THICKNESS_PX = 26;

/**
 * Selects a clean millimetre major/medium/minor tick interval based on current zoom
 * so ruler numbers always have at least ~65px of breathing room and never overlap.
 */
function getTickIntervalsMm(zoom: number): {
  majorMm: number;
  mediumMm: number;
  minorMm: number;
} {
  const pxPerMm = CSS_PX_PER_MM_AT_100 * zoom;

  if (pxPerMm < 0.14) {
    return { majorMm: 500, mediumMm: 250, minorMm: 100 };
  }
  if (pxPerMm < 0.28) {
    return { majorMm: 250, mediumMm: 50, minorMm: 50 };
  }
  if (pxPerMm < 0.45) {
    return { majorMm: 200, mediumMm: 100, minorMm: 20 };
  }
  if (pxPerMm < 0.85) {
    return { majorMm: 100, mediumMm: 50, minorMm: 10 };
  }
  if (pxPerMm < 1.8) {
    return { majorMm: 50, mediumMm: 10, minorMm: 5 };
  }
  if (pxPerMm < 4.5) {
    return { majorMm: 20, mediumMm: 10, minorMm: 2 };
  }
  if (pxPerMm < 10) {
    return { majorMm: 10, mediumMm: 5, minorMm: 1 };
  }
  return { majorMm: 5, mediumMm: 1, minorMm: 0.5 };
}

export const Rulers: React.FC<RulersProps> = ({
  zoom,
  panX,
  panY,
  pageWidthMm,
  pageHeightMm,
  cursorMm,
  lockGuides,
  onStartCreateGuide,
}) => {
  const pxPerMm = CSS_PX_PER_MM_AT_100 * zoom;
  const { majorMm, mediumMm, minorMm } = getTickIntervalsMm(zoom);

  const minXMm = 0;
  const maxXMm = Math.ceil((pageWidthMm + majorMm) / majorMm) * majorMm;

  const minYMm = 0;
  const maxYMm = Math.ceil((pageHeightMm + majorMm) / majorMm) * majorMm;

  const horizontalTicks: { mm: number; type: 'major' | 'medium' | 'minor' }[] = [];
  for (let mm = minXMm; mm <= maxXMm; mm = Number((mm + minorMm).toFixed(2))) {
    const isMajor = Math.abs(mm % majorMm) < 0.001;
    const isMedium = !isMajor && Math.abs(mm % mediumMm) < 0.001;
    horizontalTicks.push({
      mm,
      type: isMajor ? 'major' : isMedium ? 'medium' : 'minor',
    });
  }

  const verticalTicks: { mm: number; type: 'major' | 'medium' | 'minor' }[] = [];
  for (let mm = minYMm; mm <= maxYMm; mm = Number((mm + minorMm).toFixed(2))) {
    const isMajor = Math.abs(mm % majorMm) < 0.001;
    const isMedium = !isMajor && Math.abs(mm % mediumMm) < 0.001;
    verticalTicks.push({
      mm,
      type: isMajor ? 'major' : isMedium ? 'medium' : 'minor',
    });
  }

  return (
    <>
      {/* Top-Left Corner Unit Badge */}
      <div
        id="ruler-corner"
        data-ruler="true"
        data-ruler-container="corner"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        className="absolute top-0 left-0 z-30 flex items-center justify-center bg-slate-200 border-r border-b border-slate-300 text-[10px] font-mono font-semibold text-slate-600 select-none touch-none"
        style={{ width: RULER_THICKNESS_PX, height: RULER_THICKNESS_PX }}
        title="Canonical measurement unit: millimetres (mm)"
      >
        mm
      </div>

      {/* Horizontal Top Ruler (Drag down to create a horizontal guideline) */}
      <div
        id="ruler-top"
        data-ruler="true"
        data-ruler-container="top"
        onPointerDown={(e) => {
          e.stopPropagation();
          if (!lockGuides && (e.pointerType !== 'mouse' || e.button === 0)) {
            onStartCreateGuide('horizontal', e.clientX, e.clientY, e.pointerId);
          }
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          if (
            typeof window !== 'undefined' &&
            !('PointerEvent' in window) &&
            !lockGuides &&
            e.button === 0
          ) {
            onStartCreateGuide('horizontal', e.clientX, e.clientY);
          }
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          if (
            typeof window !== 'undefined' &&
            !('PointerEvent' in window) &&
            !lockGuides &&
            e.touches.length === 1
          ) {
            const t = e.touches[0];
            onStartCreateGuide('horizontal', t.clientX, t.clientY);
          }
        }}
        className={`absolute top-0 right-0 z-30 overflow-hidden bg-slate-100 border-b border-slate-300 select-none touch-none ${
          lockGuides ? 'cursor-default' : 'cursor-ns-resize'
        }`}
        style={{
          left: RULER_THICKNESS_PX,
          height: RULER_THICKNESS_PX,
        }}
        title={
          lockGuides
            ? 'Horizontal ruler (mm) — Guidelines are locked'
            : 'Drag down from ruler to add a horizontal millimetre guideline'
        }
      >
        {/* Active Page Span Highlight on Ruler */}
        <div
          className="absolute top-0 bottom-0 bg-white/90 pointer-events-none"
          style={{
            left: panX,
            width: pageWidthMm * pxPerMm,
          }}
        />

        {/* Ticks and Labels */}
        {horizontalTicks.map((t) => {
          const leftPx = panX + t.mm * pxPerMm;
          const heightPx = t.type === 'major' ? 11 : t.type === 'medium' ? 6 : 3.5;
          const inPageRange = t.mm >= 0 && t.mm <= pageWidthMm;
          return (
            <div
              key={t.mm}
              className="absolute bottom-0 pointer-events-none"
              style={{ left: leftPx }}
            >
              <div
                className={inPageRange ? 'bg-slate-600' : 'bg-slate-400'}
                style={{ width: 1, height: heightPx }}
              />
              {t.type === 'major' && (
                <span
                  className={`absolute bottom-3 left-1 text-[10px] font-mono leading-none whitespace-nowrap ${
                    inPageRange ? 'text-slate-800 font-medium' : 'text-slate-400'
                  }`}
                >
                  {t.mm}
                </span>
              )}
            </div>
          );
        })}

        {/* Live Cursor X Hairline on Horizontal Ruler */}
        {cursorMm && (
          <div
            className="absolute top-0 bottom-0 w-px bg-blue-600 pointer-events-none z-10"
            style={{ left: panX + cursorMm.x * pxPerMm }}
          />
        )}
      </div>

      {/* Vertical Left Ruler (Drag right to create a vertical guideline) */}
      <div
        id="ruler-left"
        data-ruler="true"
        data-ruler-container="left"
        onPointerDown={(e) => {
          e.stopPropagation();
          if (!lockGuides && (e.pointerType !== 'mouse' || e.button === 0)) {
            onStartCreateGuide('vertical', e.clientX, e.clientY, e.pointerId);
          }
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          if (
            typeof window !== 'undefined' &&
            !('PointerEvent' in window) &&
            !lockGuides &&
            e.button === 0
          ) {
            onStartCreateGuide('vertical', e.clientX, e.clientY);
          }
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          if (
            typeof window !== 'undefined' &&
            !('PointerEvent' in window) &&
            !lockGuides &&
            e.touches.length === 1
          ) {
            const t = e.touches[0];
            onStartCreateGuide('vertical', t.clientX, t.clientY);
          }
        }}
        className={`absolute left-0 bottom-0 z-30 overflow-hidden bg-slate-100 border-r border-slate-300 select-none touch-none ${
          lockGuides ? 'cursor-default' : 'cursor-ew-resize'
        }`}
        style={{
          top: RULER_THICKNESS_PX,
          width: RULER_THICKNESS_PX,
        }}
        title={
          lockGuides
            ? 'Vertical ruler (mm) — Guidelines are locked'
            : 'Drag right from ruler to add a vertical millimetre guideline'
        }
      >
        {/* Active Page Span Highlight on Ruler */}
        <div
          className="absolute left-0 right-0 bg-white/90 pointer-events-none"
          style={{
            top: panY,
            height: pageHeightMm * pxPerMm,
          }}
        />

        {/* Ticks and Vertical Labels */}
        {verticalTicks.map((t) => {
          const topPx = panY + t.mm * pxPerMm;
          const widthPx = t.type === 'major' ? 11 : t.type === 'medium' ? 6 : 3.5;
          const inPageRange = t.mm >= 0 && t.mm <= pageHeightMm;
          return (
            <div
              key={t.mm}
              className="absolute right-0 pointer-events-none"
              style={{ top: topPx }}
            >
              <div
                className={inPageRange ? 'bg-slate-600' : 'bg-slate-400'}
                style={{ height: 1, width: widthPx }}
              />
              {t.type === 'major' && (
                <span
                  className={`absolute right-3 top-1 text-[9px] font-mono leading-none whitespace-nowrap origin-top-right -rotate-90 ${
                    inPageRange ? 'text-slate-800 font-medium' : 'text-slate-400'
                  }`}
                >
                  {t.mm}
                </span>
              )}
            </div>
          );
        })}

        {/* Live Cursor Y Hairline on Vertical Ruler */}
        {cursorMm && (
          <div
            className="absolute left-0 right-0 h-px bg-blue-600 pointer-events-none z-10"
            style={{ top: panY + cursorMm.y * pxPerMm }}
          />
        )}
      </div>
    </>
  );
};
