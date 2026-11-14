/**
 * @license
 * SPDX-License-Identifier: MIT
 *
 * PageLay — Physical Units, ISO Paper Sizes, and Coordinate Conversions
 *
 * Canonical Internal Unit: Millimetres (mm)
 * Conversion Constants:
 * - 1 inch = 25.4 mm
 * - 1 PDF point (pt) = 1 / 72 inch = 25.4 / 72 mm ≈ 0.35277778 mm
 * - Screen Base Scale (at 100% zoom): 96 CSS px per inch = 96 / 25.4 ≈ 3.77952756 px/mm
 */

import {
  CropRect,
  LineObject,
  ArrowObject,
  DimensionObject,
  GroupObject,
  FreehandStrokeObject,
  FreehandPointMm,
  Orientation,
  PageObject,
  PaperFormat,
} from '../model/documentTypes';

export interface PaperSizeSpec {
  format: PaperFormat;
  label: string;
  /** Portrait width in mm (shorter side) */
  shortMm: number;
  /** Portrait height in mm (longer side) */
  longMm: number;
  description: string;
}

export const ISO_PAPER_SIZES: Record<Exclude<PaperFormat, 'Custom'>, PaperSizeSpec> = {
  A0: {
    format: 'A0',
    label: 'A0',
    shortMm: 841,
    longMm: 1189,
    description: '841 × 1189 mm (Exhibition / Technical Sheet)',
  },
  A1: {
    format: 'A1',
    label: 'A1',
    shortMm: 594,
    longMm: 841,
    description: '594 × 841 mm (Architectural / Poster)',
  },
  A2: {
    format: 'A2',
    label: 'A2',
    shortMm: 420,
    longMm: 594,
    description: '420 × 594 mm (Medium Presentation Board)',
  },
  A3: {
    format: 'A3',
    label: 'A3',
    shortMm: 297,
    longMm: 420,
    description: '297 × 420 mm (Tabloid / Drawing Print)',
  },
  A4: {
    format: 'A4',
    label: 'A4',
    shortMm: 210,
    longMm: 297,
    description: '210 × 297 mm (Standard Document)',
  },
};

/**
 * Standard 96 DPI screen conversion factor: 1 mm = 96 / 25.4 CSS pixels at 100% zoom (zoom = 1.0)
 */
export const CSS_PX_PER_MM_AT_100 = 96 / 25.4;

/**
 * Standard PDF point conversion factor: 1 mm = 72 / 25.4 PDF points
 */
export const PDF_PT_PER_MM = 72 / 25.4;

export function getPaperDimensionsMm(
  format: PaperFormat,
  orientation: Orientation,
  customWidthMm = 1189,
  customHeightMm = 841
): { widthMm: number; heightMm: number } {
  if (format === 'Custom') {
    const minSide = Math.min(customWidthMm, customHeightMm);
    const maxSide = Math.max(customWidthMm, customHeightMm);
    return orientation === 'landscape'
      ? { widthMm: maxSide, heightMm: minSide }
      : { widthMm: minSide, heightMm: maxSide };
  }
  const spec = ISO_PAPER_SIZES[format];
  return orientation === 'landscape'
    ? { widthMm: spec.longMm, heightMm: spec.shortMm }
    : { widthMm: spec.shortMm, heightMm: spec.longMm };
}

/**
 * Converts canonical millimetres to screen CSS pixels for a given zoom factor (1.0 = 100%).
 */
export function mmToScreenPx(mm: number, zoom: number): number {
  return mm * CSS_PX_PER_MM_AT_100 * zoom;
}

/**
 * Converts screen CSS pixels at a given zoom factor back to canonical millimetres.
 */
export function screenPxToMm(px: number, zoom: number): number {
  return px / (CSS_PX_PER_MM_AT_100 * zoom);
}

/**
 * Converts canonical millimetres to PDF points (72 points per inch).
 */
export function mmToPt(mm: number): number {
  return mm * PDF_PT_PER_MM;
}

/**
 * Converts typographic points (pt) to canonical millimetres (mm).
 */
export function ptToMm(pt: number): number {
  return pt / PDF_PT_PER_MM;
}

/**
 * Formats a millimetre number cleanly for display/editing (up to 2 decimal places, or 1 decimal place).
 */
export function formatMm(mm: number, decimals = 1): number {
  const factor = Math.pow(10, decimals);
  return Math.round(mm * factor) / factor;
}

/**
 * Calculates the effective print DPI of an image object given its original pixel dimensions,
 * non-destructive crop rectangle, and placed physical size in millimetres.
 */
export function calculateEffectiveDpi(
  originalWidthPx: number,
  originalHeightPx: number,
  crop: CropRect,
  placedWidthMm: number,
  placedHeightMm: number
): { dpiX: number; dpiY: number; effectiveDpi: number; croppedWidthPx: number; croppedHeightPx: number } {
  const croppedWidthPx = Math.max(1, Math.round(originalWidthPx * crop.width));
  const croppedHeightPx = Math.max(1, Math.round(originalHeightPx * crop.height));

  const placedWidthInches = Math.max(0.01, placedWidthMm / 25.4);
  const placedHeightInches = Math.max(0.01, placedHeightMm / 25.4);

  const dpiX = Math.round(croppedWidthPx / placedWidthInches);
  const dpiY = Math.round(croppedHeightPx / placedHeightInches);
  const effectiveDpi = Math.min(dpiX, dpiY);

  return {
    dpiX,
    dpiY,
    effectiveDpi,
    croppedWidthPx,
    croppedHeightPx,
  };
}

/**
 * Synchronizes the bounding box (xMm, yMm, widthMm, heightMm) of a two-point linear object
 * (Line, Arrow, or Dimension) from its endpoints (x1Mm, y1Mm, x2Mm, y2Mm).
 */
export function syncLinearBoundingBox<T extends LineObject | ArrowObject | DimensionObject>(obj: T): T {
  const minX = Math.min(obj.x1Mm, obj.x2Mm);
  const minY = Math.min(obj.y1Mm, obj.y2Mm);
  const maxX = Math.max(obj.x1Mm, obj.x2Mm);
  const maxY = Math.max(obj.y1Mm, obj.y2Mm);
  return {
    ...obj,
    xMm: minX,
    yMm: minY,
    widthMm: Math.max(1, maxX - minX),
    heightMm: Math.max(1, maxY - minY),
  };
}

/**
 * Synchronizes the bounding box (xMm, yMm, widthMm, heightMm) of a FreehandStrokeObject
 * from its `pointsMm` array. Ensures a minimum 1 mm bounding box for single-dot or collinear strokes.
 */
export function syncFreehandBoundingBox(stroke: FreehandStrokeObject): FreehandStrokeObject {
  if (!stroke.pointsMm || stroke.pointsMm.length === 0) {
    return {
      ...stroke,
      pointsMm: [{ xMm: stroke.xMm, yMm: stroke.yMm }],
      widthMm: Math.max(1, stroke.widthMm || 1),
      heightMm: Math.max(1, stroke.heightMm || 1),
    };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pt of stroke.pointsMm) {
    if (pt.xMm < minX) minX = pt.xMm;
    if (pt.yMm < minY) minY = pt.yMm;
    if (pt.xMm > maxX) maxX = pt.xMm;
    if (pt.yMm > maxY) maxY = pt.yMm;
  }
  const pad = Math.max(0.2, (stroke.strokeWidthMm || 0.8) * 0.25);
  const spanW = maxX - minX;
  const spanH = maxY - minY;
  const xMm = spanW < 0.5 ? minX - pad : minX;
  const yMm = spanH < 0.5 ? minY - pad : minY;
  const widthMm = Math.max(1, spanW < 0.5 ? spanW + pad * 2 : spanW);
  const heightMm = Math.max(1, spanH < 0.5 ? spanH + pad * 2 : spanH);
  return {
    ...stroke,
    xMm: formatMm(xMm, 2),
    yMm: formatMm(yMm, 2),
    widthMm: formatMm(widthMm, 2),
    heightMm: formatMm(heightMm, 2),
  };
}

/**
 * Proportionally scales all vertices of a FreehandStrokeObject into a new bounding box.
 */
export function resizeFreehandStrokeMm(
  stroke: FreehandStrokeObject,
  newXMm: number,
  newYMm: number,
  newWidthMm: number,
  newHeightMm: number
): FreehandStrokeObject {
  const safeNewW = Math.max(1, newWidthMm);
  const safeNewH = Math.max(1, newHeightMm);
  if (!stroke.pointsMm || stroke.pointsMm.length === 0) {
    return {
      ...stroke,
      xMm: formatMm(newXMm, 2),
      yMm: formatMm(newYMm, 2),
      widthMm: formatMm(safeNewW, 2),
      heightMm: formatMm(safeNewH, 2),
    };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pt of stroke.pointsMm) {
    if (pt.xMm < minX) minX = pt.xMm;
    if (pt.yMm < minY) minY = pt.yMm;
    if (pt.xMm > maxX) maxX = pt.xMm;
    if (pt.yMm > maxY) maxY = pt.yMm;
  }
  const oldSpanX = maxX - minX;
  const oldSpanY = maxY - minY;
  const newPoints: FreehandPointMm[] = stroke.pointsMm.map((pt) => {
    const normX = oldSpanX > 0.001 ? (pt.xMm - minX) / oldSpanX : 0.5;
    const normY = oldSpanY > 0.001 ? (pt.yMm - minY) / oldSpanY : 0.5;
    return {
      xMm: formatMm(newXMm + normX * safeNewW, 2),
      yMm: formatMm(newYMm + normY * safeNewH, 2),
    };
  });
  return {
    ...stroke,
    xMm: formatMm(newXMm, 2),
    yMm: formatMm(newYMm, 2),
    widthMm: formatMm(safeNewW, 2),
    heightMm: formatMm(safeNewH, 2),
    pointsMm: newPoints,
  };
}

/**
 * Builds a smooth SVG path data string ("M ... Q ... L ...") from a list of 2D coordinates.
 * Uses quadratic Bézier midpoint interpolation so freehand Pen and Highlighter strokes
 * look naturally smooth with round caps and joins while staying faithful to the user's path.
 */
export function buildSmoothFreehandSvgPath(points: ReadonlyArray<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)} L ${(p.x + 0.01).toFixed(2)} ${p.y.toFixed(2)}`;
  }
  if (points.length === 2) {
    const [p0, p1] = points;
    return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const midX = (curr.x + next.x) / 2;
    const midY = (curr.y + next.y) / 2;
    d += ` Q ${curr.x.toFixed(2)} ${curr.y.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
  return d;
}

/**
 * Computes the shortest distance in millimetres from a point (px, py) to a line segment (ax, ay)-(bx, by).
 */
export function pointToSegmentDistanceMm(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-8) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}

/**
 * Tests whether a point in canonical page millimetres (ptXMm, ptYMm) hits a FreehandStrokeObject
 * within a given extra tolerance in millimetres. Accounts for object rotation around its bounding center.
 */
export function isPointNearFreehandStrokeMm(
  ptXMm: number,
  ptYMm: number,
  stroke: FreehandStrokeObject,
  extraToleranceMm = 2.0
): boolean {
  if (!stroke.pointsMm || stroke.pointsMm.length === 0) return false;

  let localX = ptXMm;
  let localY = ptYMm;
  const rotDeg = stroke.rotationDeg || 0;
  if (Math.abs(rotDeg) > 0.001) {
    const cx = stroke.xMm + stroke.widthMm / 2;
    const cy = stroke.yMm + stroke.heightMm / 2;
    const rad = (-rotDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = ptXMm - cx;
    const dy = ptYMm - cy;
    localX = cx + dx * cos - dy * sin;
    localY = cy + dx * sin + dy * cos;
  }

  const thresholdMm = (stroke.strokeWidthMm || 0.8) / 2 + extraToleranceMm;

  if (
    localX < stroke.xMm - thresholdMm - 2 ||
    localX > stroke.xMm + stroke.widthMm + thresholdMm + 2 ||
    localY < stroke.yMm - thresholdMm - 2 ||
    localY > stroke.yMm + stroke.heightMm + thresholdMm + 2
  ) {
    return false;
  }

  if (stroke.pointsMm.length === 1) {
    const p = stroke.pointsMm[0];
    return Math.hypot(localX - p.xMm, localY - p.yMm) <= thresholdMm;
  }

  for (let i = 0; i < stroke.pointsMm.length - 1; i++) {
    const a = stroke.pointsMm[i];
    const b = stroke.pointsMm[i + 1];
    if (pointToSegmentDistanceMm(localX, localY, a.xMm, a.yMm, b.xMm, b.yMm) <= thresholdMm) {
      return true;
    }
  }
  return false;
}

/**
 * Calculates the physical Euclidean distance in mm between two endpoints.
 */
export function getLineLengthMm(x1Mm: number, y1Mm: number, x2Mm: number, y2Mm: number): number {
  return Math.hypot(x2Mm - x1Mm, y2Mm - y1Mm);
}

/**
 * Formats byte size into human-readable KB / MB.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

/**
 * Returns the canonical millimetre bounding box of any PageObject.
 */
export function getObjectBoundsMm(obj: PageObject): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  widthMm: number;
  heightMm: number;
} {
  if (obj.type === 'line' || obj.type === 'arrow' || obj.type === 'dimension') {
    const minX = Math.min(obj.x1Mm, obj.x2Mm);
    const minY = Math.min(obj.y1Mm, obj.y2Mm);
    const maxX = Math.max(obj.x1Mm, obj.x2Mm);
    const maxY = Math.max(obj.y1Mm, obj.y2Mm);
    return {
      minX,
      minY,
      maxX,
      maxY,
      widthMm: Math.max(1, maxX - minX),
      heightMm: Math.max(1, maxY - minY),
    };
  }
  return {
    minX: obj.xMm,
    minY: obj.yMm,
    maxX: obj.xMm + obj.widthMm,
    maxY: obj.yMm + obj.heightMm,
    widthMm: Math.max(1, obj.widthMm),
    heightMm: Math.max(1, obj.heightMm),
  };
}

/**
 * Computes the combined bounding box in millimetres enclosing a list of PageObjects.
 */
export function getCombinedBoundsMm(objects: PageObject[]): {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
} {
  if (objects.length === 0) {
    return { xMm: 0, yMm: 0, widthMm: 10, heightMm: 10 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const obj of objects) {
    const b = getObjectBoundsMm(obj);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }

  return {
    xMm: formatMm(minX, 2),
    yMm: formatMm(minY, 2),
    widthMm: formatMm(Math.max(1, maxX - minX), 2),
    heightMm: formatMm(Math.max(1, maxY - minY), 2),
  };
}

/**
 * Synchronously translates any PageObject (including linear objects, FreehandStrokeObjects,
 * and GroupObjects with all their nested children) by (dxMm, dyMm) in canonical millimetres.
 */
export function translatePageObjectMm<T extends PageObject>(
  obj: T,
  dxMm: number,
  dyMm: number
): T {
  if (obj.type === 'line' || obj.type === 'arrow' || obj.type === 'dimension') {
    return syncLinearBoundingBox({
      ...obj,
      x1Mm: formatMm(obj.x1Mm + dxMm, 2),
      y1Mm: formatMm(obj.y1Mm + dyMm, 2),
      x2Mm: formatMm(obj.x2Mm + dxMm, 2),
      y2Mm: formatMm(obj.y2Mm + dyMm, 2),
    }) as T;
  }

  if (obj.type === 'freehand') {
    return {
      ...obj,
      xMm: formatMm(obj.xMm + dxMm, 2),
      yMm: formatMm(obj.yMm + dyMm, 2),
      pointsMm: obj.pointsMm.map((pt) => ({
        xMm: formatMm(pt.xMm + dxMm, 2),
        yMm: formatMm(pt.yMm + dyMm, 2),
      })),
    } as T;
  }

  if (obj.type === 'group') {
    return {
      ...obj,
      xMm: formatMm(obj.xMm + dxMm, 2),
      yMm: formatMm(obj.yMm + dyMm, 2),
      children: obj.children.map((child) => translatePageObjectMm(child, dxMm, dyMm)),
    } as T;
  }

  return {
    ...obj,
    xMm: formatMm(obj.xMm + dxMm, 2),
    yMm: formatMm(obj.yMm + dyMm, 2),
  } as T;
}

/**
 * Scales and repositions a single child object proportionally when its parent group
 * bounding box changes from (oldX, oldY, oldW, oldH) to (newX, newY, newW, newH).
 */
function scaleChildInGroupMm(
  child: PageObject,
  oldX: number,
  oldY: number,
  oldW: number,
  oldH: number,
  newX: number,
  newY: number,
  newW: number,
  newH: number
): PageObject {
  const safeOldW = Math.max(0.1, oldW);
  const safeOldH = Math.max(0.1, oldH);
  const scaleX = newW / safeOldW;
  const scaleY = newH / safeOldH;

  if (child.type === 'line' || child.type === 'arrow' || child.type === 'dimension') {
    const nx1 = newX + (child.x1Mm - oldX) * scaleX;
    const ny1 = newY + (child.y1Mm - oldY) * scaleY;
    const nx2 = newX + (child.x2Mm - oldX) * scaleX;
    const ny2 = newY + (child.y2Mm - oldY) * scaleY;
    return syncLinearBoundingBox({
      ...child,
      x1Mm: formatMm(nx1, 2),
      y1Mm: formatMm(ny1, 2),
      x2Mm: formatMm(nx2, 2),
      y2Mm: formatMm(ny2, 2),
    });
  }

  if (child.type === 'freehand') {
    const nextChildX = formatMm(newX + (child.xMm - oldX) * scaleX, 2);
    const nextChildY = formatMm(newY + (child.yMm - oldY) * scaleY, 2);
    const nextChildW = formatMm(Math.max(1, child.widthMm * scaleX), 2);
    const nextChildH = formatMm(Math.max(1, child.heightMm * scaleY), 2);
    return {
      ...child,
      xMm: nextChildX,
      yMm: nextChildY,
      widthMm: nextChildW,
      heightMm: nextChildH,
      pointsMm: child.pointsMm.map((pt) => ({
        xMm: formatMm(newX + (pt.xMm - oldX) * scaleX, 2),
        yMm: formatMm(newY + (pt.yMm - oldY) * scaleY, 2),
      })),
    };
  }

  const nextChildX = formatMm(newX + (child.xMm - oldX) * scaleX, 2);
  const nextChildY = formatMm(newY + (child.yMm - oldY) * scaleY, 2);
  const nextChildW = formatMm(Math.max(1, child.widthMm * scaleX), 2);
  const nextChildH = formatMm(Math.max(1, child.heightMm * scaleY), 2);

  if (child.type === 'group') {
    return resizeGroupObjectMm(child, nextChildX, nextChildY, nextChildW, nextChildH);
  }

  return {
    ...child,
    xMm: nextChildX,
    yMm: nextChildY,
    widthMm: nextChildW,
    heightMm: nextChildH,
  };
}

/**
 * Synchronously resizes and repositions a GroupObject and all of its child objects
 * to fit the new canonical millimetre bounding box (newXMm, newYMm, newWidthMm, newHeightMm).
 */
export function resizeGroupObjectMm(
  group: GroupObject,
  newXMm: number,
  newYMm: number,
  newWidthMm: number,
  newHeightMm: number
): GroupObject {
  const clampedW = Math.max(2, newWidthMm);
  const clampedH = Math.max(2, newHeightMm);

  const scaledChildren = group.children.map((child) =>
    scaleChildInGroupMm(
      child,
      group.xMm,
      group.yMm,
      group.widthMm,
      group.heightMm,
      newXMm,
      newYMm,
      clampedW,
      clampedH
    )
  );

  return {
    ...group,
    xMm: formatMm(newXMm, 2),
    yMm: formatMm(newYMm, 2),
    widthMm: formatMm(clampedW, 2),
    heightMm: formatMm(clampedH, 2),
    children: scaledChildren,
  };
}

/**
 * Rotates a 2D point (px, py) around a pivot (cx, cy) by `angleRad` radians.
 */
function rotatePointAroundCenter(
  px: number,
  py: number,
  cx: number,
  cy: number,
  angleRad: number
): { x: number; y: number } {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

/**
 * Rotates a child object around a group center (groupCx, groupCy) by `deltaDeg`.
 */
function rotateChildAroundCenterMm(
  child: PageObject,
  groupCx: number,
  groupCy: number,
  deltaDeg: number
): PageObject {
  const rad = (deltaDeg * Math.PI) / 180;

  if (child.type === 'line' || child.type === 'arrow' || child.type === 'dimension') {
    const p1 = rotatePointAroundCenter(child.x1Mm, child.y1Mm, groupCx, groupCy, rad);
    const p2 = rotatePointAroundCenter(child.x2Mm, child.y2Mm, groupCx, groupCy, rad);
    return syncLinearBoundingBox({
      ...child,
      x1Mm: formatMm(p1.x, 2),
      y1Mm: formatMm(p1.y, 2),
      x2Mm: formatMm(p2.x, 2),
      y2Mm: formatMm(p2.y, 2),
    });
  }

  const childCx = child.xMm + child.widthMm / 2;
  const childCy = child.yMm + child.heightMm / 2;
  const rotatedCenter = rotatePointAroundCenter(childCx, childCy, groupCx, groupCy, rad);
  const nextRot = (((child.rotationDeg + deltaDeg) % 360) + 360) % 360;

  if (child.type === 'freehand') {
    const dx = rotatedCenter.x - childCx;
    const dy = rotatedCenter.y - childCy;
    return {
      ...child,
      xMm: formatMm(child.xMm + dx, 2),
      yMm: formatMm(child.yMm + dy, 2),
      rotationDeg: Math.round(nextRot),
      pointsMm: child.pointsMm.map((pt) => ({
        xMm: formatMm(pt.xMm + dx, 2),
        yMm: formatMm(pt.yMm + dy, 2),
      })),
    };
  }

  if (child.type === 'group') {
    const dx = rotatedCenter.x - childCx;
    const dy = rotatedCenter.y - childCy;
    const shifted = translatePageObjectMm(child, dx, dy);
    return {
      ...shifted,
      rotationDeg: Math.round(nextRot),
      children: shifted.children.map((nested) =>
        rotateChildAroundCenterMm(nested, rotatedCenter.x, rotatedCenter.y, deltaDeg)
      ),
    };
  }

  return {
    ...child,
    xMm: formatMm(rotatedCenter.x - child.widthMm / 2, 2),
    yMm: formatMm(rotatedCenter.y - child.heightMm / 2, 2),
    rotationDeg: Math.round(nextRot),
  };
}

/**
 * Synchronously rotates a GroupObject and all of its children around the group's center
 * to `nextRotationDeg`.
 */
export function rotateGroupObjectMm(
  group: GroupObject,
  nextRotationDeg: number
): GroupObject {
  const normalizedNext = (((nextRotationDeg % 360) + 360) % 360);
  const deltaDeg = normalizedNext - group.rotationDeg;
  if (Math.abs(deltaDeg) < 0.001) {
    return group;
  }

  const groupCx = group.xMm + group.widthMm / 2;
  const groupCy = group.yMm + group.heightMm / 2;

  const rotatedChildren = group.children.map((child) =>
    rotateChildAroundCenterMm(child, groupCx, groupCy, deltaDeg)
  );

  return {
    ...group,
    rotationDeg: Math.round(normalizedNext),
    children: rotatedChildren,
  };
}

/**
 * Recursively flattens a page's objects array (expanding any GroupObjects into their leaf children
 * while combining group opacity) for PDF export, raster image export, and thumbnail previews.
 */
export function flattenPageObjects(
  objects: PageObject[],
  parentOpacity = 1
): Exclude<PageObject, GroupObject>[] {
  const result: Exclude<PageObject, GroupObject>[] = [];
  for (const obj of objects) {
    const effectiveOpacity = Number((obj.opacity * parentOpacity).toFixed(3));
    if (obj.type === 'group') {
      result.push(...flattenPageObjects(obj.children, effectiveOpacity));
    } else {
      result.push({
        ...obj,
        opacity: effectiveOpacity,
      });
    }
  }
  return result;
}

export type MarqueeSelectionMode = 'window' | 'crossing';

export interface SelectionRectMm {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function isPointInSelectionRectMm(x: number, y: number, rect: SelectionRectMm): boolean {
  return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}

function orientationSignMm(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): number {
  const val = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(val) <= 1e-9) return 0;
  return val > 0 ? 1 : -1;
}

function isPointOnCollinearSegmentMm(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): boolean {
  return (
    px >= Math.min(ax, bx) - 1e-9 &&
    px <= Math.max(ax, bx) + 1e-9 &&
    py >= Math.min(ay, by) - 1e-9 &&
    py <= Math.max(ay, by) + 1e-9
  );
}

function doSegmentsIntersectMm(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean {
  if (
    Math.max(ax, bx) < Math.min(cx, dx) - 1e-9 ||
    Math.min(ax, bx) > Math.max(cx, dx) + 1e-9 ||
    Math.max(ay, by) < Math.min(cy, dy) - 1e-9 ||
    Math.min(ay, by) > Math.max(cy, dy) + 1e-9
  ) {
    return false;
  }

  const o1 = orientationSignMm(ax, ay, bx, by, cx, cy);
  const o2 = orientationSignMm(ax, ay, bx, by, dx, dy);
  const o3 = orientationSignMm(cx, cy, dx, dy, ax, ay);
  const o4 = orientationSignMm(cx, cy, dx, dy, bx, by);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && isPointOnCollinearSegmentMm(cx, cy, ax, ay, bx, by)) return true;
  if (o2 === 0 && isPointOnCollinearSegmentMm(dx, dy, ax, ay, bx, by)) return true;
  if (o3 === 0 && isPointOnCollinearSegmentMm(ax, ay, cx, cy, dx, dy)) return true;
  if (o4 === 0 && isPointOnCollinearSegmentMm(bx, by, cx, cy, dx, dy)) return true;

  return false;
}

function doesSegmentIntersectSelectionRectMm(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: SelectionRectMm
): boolean {
  if (
    Math.max(x1, x2) < rect.minX - 1e-9 ||
    Math.min(x1, x2) > rect.maxX + 1e-9 ||
    Math.max(y1, y2) < rect.minY - 1e-9 ||
    Math.min(y1, y2) > rect.maxY + 1e-9
  ) {
    return false;
  }

  if (isPointInSelectionRectMm(x1, y1, rect) || isPointInSelectionRectMm(x2, y2, rect)) {
    return true;
  }

  return (
    doSegmentsIntersectMm(x1, y1, x2, y2, rect.minX, rect.minY, rect.maxX, rect.minY) ||
    doSegmentsIntersectMm(x1, y1, x2, y2, rect.maxX, rect.minY, rect.maxX, rect.maxY) ||
    doSegmentsIntersectMm(x1, y1, x2, y2, rect.maxX, rect.maxY, rect.minX, rect.maxY) ||
    doSegmentsIntersectMm(x1, y1, x2, y2, rect.minX, rect.maxY, rect.minX, rect.minY)
  );
}

function isPointInPolygonMm(
  px: number,
  py: number,
  vertices: ReadonlyArray<{ x: number; y: number }>
): boolean {
  if (vertices.length < 3) return false;

  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (pointToSegmentDistanceMm(px, py, a.x, a.y, b.x, b.y) <= 1e-6) {
      return true;
    }
  }

  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x;
    const yi = vertices[i].y;
    const xj = vertices[j].x;
    const yj = vertices[j].y;

    const intersects =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function isPolygonWindowSelectedMm(
  vertices: ReadonlyArray<{ x: number; y: number }>,
  rect: SelectionRectMm
): boolean {
  return (
    vertices.length > 0 &&
    vertices.every((v) => isPointInSelectionRectMm(v.x, v.y, rect))
  );
}

function isPolygonCrossingSelectedMm(
  vertices: ReadonlyArray<{ x: number; y: number }>,
  rect: SelectionRectMm
): boolean {
  if (vertices.length === 0) return false;

  let pMinX = Infinity;
  let pMinY = Infinity;
  let pMaxX = -Infinity;
  let pMaxY = -Infinity;
  for (const v of vertices) {
    if (v.x < pMinX) pMinX = v.x;
    if (v.y < pMinY) pMinY = v.y;
    if (v.x > pMaxX) pMaxX = v.x;
    if (v.y > pMaxY) pMaxY = v.y;
  }

  if (
    pMaxX < rect.minX - 1e-9 ||
    pMinX > rect.maxX + 1e-9 ||
    pMaxY < rect.minY - 1e-9 ||
    pMinY > rect.maxY + 1e-9
  ) {
    return false;
  }

  for (const v of vertices) {
    if (isPointInSelectionRectMm(v.x, v.y, rect)) {
      return true;
    }
  }

  const rectCorners = [
    { x: rect.minX, y: rect.minY },
    { x: rect.maxX, y: rect.minY },
    { x: rect.maxX, y: rect.maxY },
    { x: rect.minX, y: rect.maxY },
  ];
  for (const corner of rectCorners) {
    if (isPointInPolygonMm(corner.x, corner.y, vertices)) {
      return true;
    }
  }

  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (doesSegmentIntersectSelectionRectMm(a.x, a.y, b.x, b.y, rect)) {
      return true;
    }
  }

  return false;
}

function getRotatedBoxCornersMm(
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  rotationDeg: number
): { x: number; y: number }[] {
  const corners = [
    { x: xMm, y: yMm },
    { x: xMm + widthMm, y: yMm },
    { x: xMm + widthMm, y: yMm + heightMm },
    { x: xMm, y: yMm + heightMm },
  ];
  if (Math.abs(rotationDeg || 0) <= 0.001) {
    return corners;
  }
  const cx = xMm + widthMm / 2;
  const cy = yMm + heightMm / 2;
  const rad = (rotationDeg * Math.PI) / 180;
  return corners.map((pt) => rotatePointAroundCenter(pt.x, pt.y, cx, cy, rad));
}

function getRotatedTriangleVerticesMm(
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  rotationDeg: number
): { x: number; y: number }[] {
  const vertices = [
    { x: xMm + widthMm / 2, y: yMm },
    { x: xMm + widthMm, y: yMm + heightMm },
    { x: xMm, y: yMm + heightMm },
  ];
  if (Math.abs(rotationDeg || 0) <= 0.001) {
    return vertices;
  }
  const cx = xMm + widthMm / 2;
  const cy = yMm + heightMm / 2;
  const rad = (rotationDeg * Math.PI) / 180;
  return vertices.map((pt) => rotatePointAroundCenter(pt.x, pt.y, cx, cy, rad));
}

function isRotatedEllipseWindowSelectedMm(
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  rotationDeg: number,
  rect: SelectionRectMm
): boolean {
  const rx = Math.max(0.05, widthMm / 2);
  const ry = Math.max(0.05, heightMm / 2);
  const cx = xMm + rx;
  const cy = yMm + ry;
  const rad = ((rotationDeg || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const halfExtentX = Math.hypot(rx * cos, ry * sin);
  const halfExtentY = Math.hypot(rx * sin, ry * cos);

  return (
    cx - halfExtentX >= rect.minX &&
    cx + halfExtentX <= rect.maxX &&
    cy - halfExtentY >= rect.minY &&
    cy + halfExtentY <= rect.maxY
  );
}

function isRotatedEllipseCrossingSelectedMm(
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  rotationDeg: number,
  rect: SelectionRectMm
): boolean {
  const rx = Math.max(0.05, widthMm / 2);
  const ry = Math.max(0.05, heightMm / 2);
  const cx = xMm + rx;
  const cy = yMm + ry;
  const rad = ((rotationDeg || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const halfExtentX = Math.hypot(rx * cos, ry * sin);
  const halfExtentY = Math.hypot(rx * sin, ry * cos);

  if (
    cx + halfExtentX < rect.minX - 1e-9 ||
    cx - halfExtentX > rect.maxX + 1e-9 ||
    cy + halfExtentY < rect.minY - 1e-9 ||
    cy - halfExtentY > rect.maxY + 1e-9
  ) {
    return false;
  }

  if (isPointInSelectionRectMm(cx, cy, rect)) {
    return true;
  }

  // Map selection rect corners into unit-circle coordinates where the ellipse is u^2 + v^2 <= 1.
  // Because affine transformations preserve straight lines and convexity, the rect intersects
  // the ellipse iff the origin (0, 0) is inside the mapped quad (already checked via center in rect)
  // or within distance 1 of any edge of the mapped quad.
  const toUnitCircle = (px: number, py: number) => {
    const dx = px - cx;
    const dy = py - cy;
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    return { x: lx / rx, y: ly / ry };
  };

  const quad = [
    toUnitCircle(rect.minX, rect.minY),
    toUnitCircle(rect.maxX, rect.minY),
    toUnitCircle(rect.maxX, rect.maxY),
    toUnitCircle(rect.minX, rect.maxY),
  ];

  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    if (pointToSegmentDistanceMm(0, 0, a.x, a.y, b.x, b.y) <= 1 + 1e-6) {
      return true;
    }
  }

  return false;
}

function getRotatedFreehandPointsMm(stroke: FreehandStrokeObject): { x: number; y: number }[] {
  if (!stroke.pointsMm || stroke.pointsMm.length === 0) {
    return getRotatedBoxCornersMm(
      stroke.xMm,
      stroke.yMm,
      stroke.widthMm,
      stroke.heightMm,
      stroke.rotationDeg
    );
  }
  const rotDeg = stroke.rotationDeg || 0;
  if (Math.abs(rotDeg) <= 0.001) {
    return stroke.pointsMm.map((p) => ({ x: p.xMm, y: p.yMm }));
  }
  const cx = stroke.xMm + stroke.widthMm / 2;
  const cy = stroke.yMm + stroke.heightMm / 2;
  const rad = (rotDeg * Math.PI) / 180;
  return stroke.pointsMm.map((p) => rotatePointAroundCenter(p.xMm, p.yMm, cx, cy, rad));
}

function getDimensionWitnessSegmentsMm(obj: DimensionObject): [
  { x1: number; y1: number; x2: number; y2: number },
  { x1: number; y1: number; x2: number; y2: number }
] {
  const angleRad = Math.atan2(obj.y2Mm - obj.y1Mm, obj.x2Mm - obj.x1Mm);
  const halfExt = (obj.extensionHeightMm || 10) / 2;
  const perpX = -Math.sin(angleRad) * halfExt;
  const perpY = Math.cos(angleRad) * halfExt;
  return [
    {
      x1: obj.x1Mm - perpX,
      y1: obj.y1Mm - perpY,
      x2: obj.x1Mm + perpX,
      y2: obj.y1Mm + perpY,
    },
    {
      x1: obj.x2Mm - perpX,
      y1: obj.y2Mm - perpY,
      x2: obj.x2Mm + perpX,
      y2: obj.y2Mm + perpY,
    },
  ];
}

/**
 * Returns true if `obj` is completely enclosed by `rect` (CAD Window selection).
 */
export function isObjectWindowSelectedMm(
  obj: PageObject,
  rect: SelectionRectMm
): boolean {
  if (obj.type === 'group') {
    if (obj.children.length === 0) {
      return isPolygonWindowSelectedMm(
        getRotatedBoxCornersMm(
          obj.xMm,
          obj.yMm,
          obj.widthMm,
          obj.heightMm,
          obj.rotationDeg
        ),
        rect
      );
    }
    return obj.children.every((child) => isObjectWindowSelectedMm(child, rect));
  }

  if (obj.type === 'line' || obj.type === 'arrow' || obj.type === 'dimension') {
    return (
      isPointInSelectionRectMm(obj.x1Mm, obj.y1Mm, rect) &&
      isPointInSelectionRectMm(obj.x2Mm, obj.y2Mm, rect)
    );
  }

  if (obj.type === 'freehand') {
    const pts = getRotatedFreehandPointsMm(obj);
    return pts.length > 0 && pts.every((p) => isPointInSelectionRectMm(p.x, p.y, rect));
  }

  if (obj.type === 'ellipse' || obj.type === 'circle') {
    return isRotatedEllipseWindowSelectedMm(
      obj.xMm,
      obj.yMm,
      obj.widthMm,
      obj.heightMm,
      obj.rotationDeg,
      rect
    );
  }

  if (obj.type === 'triangle') {
    return isPolygonWindowSelectedMm(
      getRotatedTriangleVerticesMm(
        obj.xMm,
        obj.yMm,
        obj.widthMm,
        obj.heightMm,
        obj.rotationDeg
      ),
      rect
    );
  }

  return isPolygonWindowSelectedMm(
    getRotatedBoxCornersMm(
      obj.xMm,
      obj.yMm,
      obj.widthMm,
      obj.heightMm,
      obj.rotationDeg
    ),
    rect
  );
}

/**
 * Returns true if `obj` is enclosed by or intersects `rect` (CAD Crossing selection).
 */
export function isObjectCrossingSelectedMm(
  obj: PageObject,
  rect: SelectionRectMm
): boolean {
  if (obj.type === 'group') {
    if (obj.children.length === 0) {
      return isPolygonCrossingSelectedMm(
        getRotatedBoxCornersMm(
          obj.xMm,
          obj.yMm,
          obj.widthMm,
          obj.heightMm,
          obj.rotationDeg
        ),
        rect
      );
    }
    return obj.children.some((child) => isObjectCrossingSelectedMm(child, rect));
  }

  if (obj.type === 'line' || obj.type === 'arrow' || obj.type === 'dimension') {
    if (doesSegmentIntersectSelectionRectMm(obj.x1Mm, obj.y1Mm, obj.x2Mm, obj.y2Mm, rect)) {
      return true;
    }
    if (obj.type === 'dimension') {
      const [w1, w2] = getDimensionWitnessSegmentsMm(obj);
      return (
        doesSegmentIntersectSelectionRectMm(w1.x1, w1.y1, w1.x2, w1.y2, rect) ||
        doesSegmentIntersectSelectionRectMm(w2.x1, w2.y1, w2.x2, w2.y2, rect)
      );
    }
    return false;
  }

  if (obj.type === 'freehand') {
    const pts = getRotatedFreehandPointsMm(obj);
    if (pts.length === 0) return false;
    const strokePad = Math.max(0.25, (obj.strokeWidthMm || 0.8) / 2);
    const expandedRect: SelectionRectMm = {
      minX: rect.minX - strokePad,
      minY: rect.minY - strokePad,
      maxX: rect.maxX + strokePad,
      maxY: rect.maxY + strokePad,
    };
    if (pts.length === 1) {
      return isPointInSelectionRectMm(pts[0].x, pts[0].y, expandedRect);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      if (
        doesSegmentIntersectSelectionRectMm(
          pts[i].x,
          pts[i].y,
          pts[i + 1].x,
          pts[i + 1].y,
          expandedRect
        )
      ) {
        return true;
      }
    }
    return false;
  }

  if (obj.type === 'ellipse' || obj.type === 'circle') {
    return isRotatedEllipseCrossingSelectedMm(
      obj.xMm,
      obj.yMm,
      obj.widthMm,
      obj.heightMm,
      obj.rotationDeg,
      rect
    );
  }

  if (obj.type === 'triangle') {
    return isPolygonCrossingSelectedMm(
      getRotatedTriangleVerticesMm(
        obj.xMm,
        obj.yMm,
        obj.widthMm,
        obj.heightMm,
        obj.rotationDeg
      ),
      rect
    );
  }

  return isPolygonCrossingSelectedMm(
    getRotatedBoxCornersMm(
      obj.xMm,
      obj.yMm,
      obj.widthMm,
      obj.heightMm,
      obj.rotationDeg
    ),
    rect
  );
}

/**
 * Computes the IDs of all top-level PageObjects matching the given CAD selection rectangle
 * and mode ('window' = left-to-right enclosed only, 'crossing' = right-to-left enclosed or intersecting).
 * Preserves Z-order and treats GroupObjects as single selectable entities.
 */
export function getObjectsInMarqueeSelectionMm(
  objects: PageObject[],
  rect: SelectionRectMm,
  mode: MarqueeSelectionMode
): string[] {
  const testFn =
    mode === 'window' ? isObjectWindowSelectedMm : isObjectCrossingSelectedMm;
  return objects.filter((obj) => testFn(obj, rect)).map((obj) => obj.id);
}



