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
 * Synchronously translates any PageObject (including linear objects and GroupObjects
 * with all their nested children) by (dxMm, dyMm) in canonical millimetres.
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

