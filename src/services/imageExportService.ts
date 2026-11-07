/**
 * @license
 * SPDX-License-Identifier: MIT
 *
 * PageLay — High-Resolution PNG & JPG Page Export Service
 *
 * Renders any page directly from the authoritative document data model and original
 * full-resolution image assets onto an offscreen canvas at the user's chosen print DPI.
 * Never includes rulers, guidelines, or selection handles.
 */

import {
  ArrowObject,
  AVAILABLE_FONTS,
  DimensionObject,
  FreehandStrokeObject,
  ImageObject,
  LineObject,
  PageData,
  PageLayDocument,
  ShapeObject,
  TextObject,
} from '../model/documentTypes';
import { flattenPageObjects, getLineLengthMm, ptToMm } from '../utils/units';

export interface ImageExportOptions {
  format: 'png' | 'jpeg';
  /** Target DPI (e.g., 72, 150, 300) */
  dpi: number;
  /** JPEG quality from 0.7 to 1.0 */
  jpegQuality: number;
}

const MAX_BROWSER_CANVAS_SIDE = 8192;

async function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image asset for export.'));
    img.src = url;
  });
}

function getDashPatternPx(style: 'solid' | 'dashed' | 'dotted', strokeWidthPx: number): number[] {
  if (style === 'dashed') {
    return [Math.max(6, strokeWidthPx * 3.5), Math.max(4, strokeWidthPx * 2.2)];
  }
  if (style === 'dotted') {
    return [Math.max(2, strokeWidthPx * 1.1), Math.max(4, strokeWidthPx * 2.2)];
  }
  return [];
}

function drawCanvasArrowhead(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  angleRad: number,
  headSizePx: number,
  color: string
) {
  const spread = Math.PI / 6.5;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(
    tipX - headSizePx * Math.cos(angleRad - spread),
    tipY - headSizePx * Math.sin(angleRad - spread)
  );
  ctx.lineTo(
    tipX - headSizePx * Math.cos(angleRad + spread),
    tipY - headSizePx * Math.sin(angleRad + spread)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Renders a single page from `doc` at high resolution into a PNG or JPEG Blob.
 */
export async function renderPageToImageBlob(
  doc: PageLayDocument,
  page: PageData,
  options: ImageExportOptions
): Promise<{ blob: Blob; widthPx: number; heightPx: number; effectiveDpi: number }> {
  const rawPxPerMm = options.dpi / 25.4;
  let targetWidthPx = Math.round(doc.widthMm * rawPxPerMm);
  let targetHeightPx = Math.round(doc.heightMm * rawPxPerMm);

  // Safeguard against browser maximum canvas texture limits (e.g. A0 @ 300 DPI = 14043 px)
  const maxSide = Math.max(targetWidthPx, targetHeightPx);
  let scaleClamp = 1;
  if (maxSide > MAX_BROWSER_CANVAS_SIDE) {
    scaleClamp = MAX_BROWSER_CANVAS_SIDE / maxSide;
    targetWidthPx = Math.round(targetWidthPx * scaleClamp);
    targetHeightPx = Math.round(targetHeightPx * scaleClamp);
  }

  const pxPerMm = targetWidthPx / doc.widthMm;
  const effectiveDpi = Math.round(pxPerMm * 25.4);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidthPx;
  canvas.height = targetHeightPx;
  const ctx = canvas.getContext('2d')!;

  // Crisp white page background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetWidthPx, targetHeightPx);

  // Flatten any GroupObjects into their leaf children in exact z-order
  const flatObjects = flattenPageObjects(page.objects);

  // Preload all needed HTMLImageElement instances from original asset URLs
  const loadedImages = new Map<string, HTMLImageElement>();
  for (const obj of flatObjects) {
    if (obj.type === 'image' && !loadedImages.has(obj.assetId)) {
      const asset = doc.assets[obj.assetId];
      if (asset) {
        const imgEl = await loadHtmlImage(asset.objectUrl);
        loadedImages.set(obj.assetId, imgEl);
      }
    }
  }

  for (const obj of flatObjects) {
    ctx.save();
    ctx.globalAlpha = obj.opacity;

    if (obj.type === 'image') {
      renderImageOnCanvas(ctx, obj, loadedImages.get(obj.assetId), pxPerMm);
    } else if (obj.type === 'text') {
      renderTextOnCanvas(ctx, obj, pxPerMm);
    } else if (obj.type === 'line') {
      renderLineOnCanvas(ctx, obj, pxPerMm);
    } else if (obj.type === 'arrow') {
      renderArrowOnCanvas(ctx, obj, pxPerMm);
    } else if (obj.type === 'dimension') {
      renderDimensionOnCanvas(ctx, obj, pxPerMm);
    } else if (obj.type === 'freehand') {
      renderFreehandOnCanvas(ctx, obj, pxPerMm);
    } else {
      renderShapeOnCanvas(ctx, obj, pxPerMm);
    }

    ctx.restore();
  }

  const mimeType = options.format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Failed to encode exported page image.'));
      },
      mimeType,
      options.format === 'jpeg' ? options.jpegQuality : undefined
    );
  });

  return { blob, widthPx: targetWidthPx, heightPx: targetHeightPx, effectiveDpi };
}

function renderImageOnCanvas(
  ctx: CanvasRenderingContext2D,
  obj: ImageObject,
  imgEl: HTMLImageElement | undefined,
  pxPerMm: number
) {
  if (!imgEl) return;
  const wPx = obj.widthMm * pxPerMm;
  const hPx = obj.heightMm * pxPerMm;
  const cx = (obj.xMm + obj.widthMm / 2) * pxPerMm;
  const cy = (obj.yMm + obj.heightMm / 2) * pxPerMm;

  ctx.translate(cx, cy);
  ctx.rotate((obj.rotationDeg * Math.PI) / 180);

  const crop = obj.crop || { x: 0, y: 0, width: 1, height: 1 };
  const sx = crop.x * imgEl.naturalWidth;
  const sy = crop.y * imgEl.naturalHeight;
  const sw = Math.max(1, crop.width * imgEl.naturalWidth);
  const sh = Math.max(1, crop.height * imgEl.naturalHeight);

  ctx.drawImage(imgEl, sx, sy, sw, sh, -wPx / 2, -hPx / 2, wPx, hPx);

  if (obj.strokeWidthMm > 0 && obj.strokeColor && obj.strokeColor !== 'transparent') {
    ctx.strokeStyle = obj.strokeColor;
    ctx.lineWidth = obj.strokeWidthMm * pxPerMm;
    ctx.strokeRect(-wPx / 2, -hPx / 2, wPx, hPx);
  }
}

function renderTextOnCanvas(ctx: CanvasRenderingContext2D, obj: TextObject, pxPerMm: number) {
  const wPx = obj.widthMm * pxPerMm;
  const hPx = obj.heightMm * pxPerMm;
  const cx = (obj.xMm + obj.widthMm / 2) * pxPerMm;
  const cy = (obj.yMm + obj.heightMm / 2) * pxPerMm;
  const padPx = (obj.paddingMm ?? 2) * pxPerMm;

  ctx.translate(cx, cy);
  ctx.rotate((obj.rotationDeg * Math.PI) / 180);

  if (obj.fillColor && obj.fillColor !== 'transparent') {
    ctx.fillStyle = obj.fillColor;
    ctx.fillRect(-wPx / 2, -hPx / 2, wPx, hPx);
  }
  if (obj.strokeWidthMm > 0 && obj.strokeColor && obj.strokeColor !== 'transparent') {
    ctx.strokeStyle = obj.strokeColor;
    ctx.lineWidth = obj.strokeWidthMm * pxPerMm;
    ctx.strokeRect(-wPx / 2, -hPx / 2, wPx, hPx);
  }

  // Clip text to box
  ctx.beginPath();
  ctx.rect(-wPx / 2, -hPx / 2, wPx, hPx);
  ctx.clip();

  const fontDef = AVAILABLE_FONTS.find((f) => f.id === obj.fontFamily);
  const cssFamily = fontDef ? fontDef.cssFamily : obj.fontFamily;
  const fontSizePx = ptToMm(obj.fontSizePt) * pxPerMm;
  const lineHeightPx = fontSizePx * 1.25;

  ctx.font = `${obj.fontStyle === 'italic' ? 'italic ' : ''}${
    obj.fontWeight === 'bold' ? 'bold ' : ''
  }${fontSizePx}px ${cssFamily}`;
  ctx.fillStyle = obj.color || '#0F172A';
  ctx.textBaseline = 'top';

  const maxLineWidth = Math.max(10, wPx - padPx * 2);
  const paragraphs = (obj.text || '').split(/\r?\n/);
  const wrappedLines: string[] = [];

  for (const para of paragraphs) {
    if (!para.trim()) {
      wrappedLines.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let currentLine = words[0] || '';
    for (let i = 1; i < words.length; i++) {
      const candidate = `${currentLine} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxLineWidth) {
        currentLine = candidate;
      } else {
        wrappedLines.push(currentLine);
        currentLine = words[i];
      }
    }
    wrappedLines.push(currentLine);
  }

  let yCursor = -hPx / 2 + padPx;
  for (const line of wrappedLines) {
    const metrics = ctx.measureText(line);
    let xCursor = -wPx / 2 + padPx;
    if (obj.align === 'center') {
      xCursor = -metrics.width / 2;
    } else if (obj.align === 'right') {
      xCursor = wPx / 2 - padPx - metrics.width;
    }
    ctx.fillText(line, xCursor, yCursor);

    if (obj.underline && line.length > 0) {
      ctx.strokeStyle = obj.color || '#0F172A';
      ctx.lineWidth = Math.max(1, fontSizePx * 0.06);
      ctx.beginPath();
      ctx.moveTo(xCursor, yCursor + fontSizePx * 1.05);
      ctx.lineTo(xCursor + metrics.width, yCursor + fontSizePx * 1.05);
      ctx.stroke();
    }
    yCursor += lineHeightPx;
  }
}

function renderLineOnCanvas(ctx: CanvasRenderingContext2D, obj: LineObject, pxPerMm: number) {
  const strokePx = Math.max(1, obj.strokeWidthMm * pxPerMm);
  ctx.strokeStyle = obj.strokeColor || '#0F172A';
  ctx.lineWidth = strokePx;
  ctx.lineCap = 'round';
  ctx.setLineDash(getDashPatternPx(obj.lineStyle, strokePx));
  ctx.beginPath();
  ctx.moveTo(obj.x1Mm * pxPerMm, obj.y1Mm * pxPerMm);
  ctx.lineTo(obj.x2Mm * pxPerMm, obj.y2Mm * pxPerMm);
  ctx.stroke();
}

function renderArrowOnCanvas(ctx: CanvasRenderingContext2D, obj: ArrowObject, pxPerMm: number) {
  const strokePx = Math.max(1, obj.strokeWidthMm * pxPerMm);
  const headPx = Math.max(6, (obj.headSizeMm || 8) * pxPerMm);
  const x1 = obj.x1Mm * pxPerMm;
  const y1 = obj.y1Mm * pxPerMm;
  const x2 = obj.x2Mm * pxPerMm;
  const y2 = obj.y2Mm * pxPerMm;

  const angleRad = Math.atan2(y2 - y1, x2 - x1);
  const hasStart = obj.arrowEnds === 'start' || obj.arrowEnds === 'both';
  const hasEnd = obj.arrowEnds === 'end' || obj.arrowEnds === 'both';

  const startShorten = hasStart ? headPx * 0.65 : 0;
  const endShorten = hasEnd ? headPx * 0.65 : 0;

  ctx.strokeStyle = obj.strokeColor || '#DC2626';
  ctx.lineWidth = strokePx;
  ctx.setLineDash(getDashPatternPx(obj.lineStyle, strokePx));
  ctx.beginPath();
  ctx.moveTo(x1 + Math.cos(angleRad) * startShorten, y1 + Math.sin(angleRad) * startShorten);
  ctx.lineTo(x2 - Math.cos(angleRad) * endShorten, y2 - Math.sin(angleRad) * endShorten);
  ctx.stroke();
  ctx.setLineDash([]);

  if (hasEnd) {
    drawCanvasArrowhead(ctx, x2, y2, angleRad, headPx, obj.strokeColor || '#DC2626');
  }
  if (hasStart) {
    drawCanvasArrowhead(ctx, x1, y1, angleRad + Math.PI, headPx, obj.strokeColor || '#DC2626');
  }
}

function renderDimensionOnCanvas(
  ctx: CanvasRenderingContext2D,
  obj: DimensionObject,
  pxPerMm: number
) {
  const strokePx = Math.max(1, obj.strokeWidthMm * pxPerMm);
  const headPx = Math.max(5, (obj.headSizeMm || 6) * pxPerMm);
  const extPx = (obj.extensionHeightMm || 10) * pxPerMm;

  const x1 = obj.x1Mm * pxPerMm;
  const y1 = obj.y1Mm * pxPerMm;
  const x2 = obj.x2Mm * pxPerMm;
  const y2 = obj.y2Mm * pxPerMm;

  const angleRad = Math.atan2(y2 - y1, x2 - x1);
  const perpX = -Math.sin(angleRad) * (extPx / 2);
  const perpY = Math.cos(angleRad) * (extPx / 2);

  ctx.strokeStyle = obj.strokeColor || '#DC2626';
  ctx.lineWidth = strokePx;

  // Extension ticks
  ctx.beginPath();
  ctx.moveTo(x1 - perpX, y1 - perpY);
  ctx.lineTo(x1 + perpX, y1 + perpY);
  ctx.moveTo(x2 - perpX, y2 - perpY);
  ctx.lineTo(x2 + perpX, y2 + perpY);
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  drawCanvasArrowhead(ctx, x2, y2, angleRad, headPx, obj.strokeColor || '#DC2626');
  drawCanvasArrowhead(ctx, x1, y1, angleRad + Math.PI, headPx, obj.strokeColor || '#DC2626');

  const distMm = Math.round(getLineLengthMm(obj.x1Mm, obj.y1Mm, obj.x2Mm, obj.y2Mm));
  const labelText = obj.customLabel?.trim() || `${distMm} mm`;
  const fontSizePx = ptToMm(obj.fontSizePt || 20) * pxPerMm;

  ctx.save();
  ctx.translate((x1 + x2) / 2, (y1 + y2) / 2);
  ctx.rotate(angleRad);
  ctx.font = `bold ${fontSizePx}px Helvetica, Arial, sans-serif`;
  const textWidth = ctx.measureText(labelText).width;
  const padX = 4 * pxPerMm * 0.4;
  const padY = 2 * pxPerMm * 0.4;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.fillRect(
    -textWidth / 2 - padX,
    -fontSizePx - padY * 2 - strokePx,
    textWidth + padX * 2,
    fontSizePx + padY * 2
  );

  ctx.fillStyle = obj.strokeColor || '#DC2626';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(labelText, 0, -padY - strokePx);
  ctx.restore();
}

function renderFreehandOnCanvas(
  ctx: CanvasRenderingContext2D,
  obj: FreehandStrokeObject,
  pxPerMm: number
) {
  const pts = obj.pointsMm || [];
  if (pts.length === 0) return;

  const cx = (obj.xMm + obj.widthMm / 2) * pxPerMm;
  const cy = (obj.yMm + obj.heightMm / 2) * pxPerMm;

  ctx.translate(cx, cy);
  ctx.rotate((obj.rotationDeg * Math.PI) / 180);

  const localPts = pts.map((pt) => ({
    x: (pt.xMm - (obj.xMm + obj.widthMm / 2)) * pxPerMm,
    y: (pt.yMm - (obj.yMm + obj.heightMm / 2)) * pxPerMm,
  }));

  ctx.strokeStyle = obj.strokeColor || '#0F172A';
  ctx.lineWidth = Math.max(1, obj.strokeWidthMm * pxPerMm);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.moveTo(localPts[0].x, localPts[0].y);

  if (localPts.length === 1) {
    ctx.lineTo(localPts[0].x + 0.01, localPts[0].y);
  } else if (localPts.length === 2) {
    ctx.lineTo(localPts[1].x, localPts[1].y);
  } else {
    for (let i = 1; i < localPts.length - 1; i++) {
      const midX = (localPts[i].x + localPts[i + 1].x) / 2;
      const midY = (localPts[i].y + localPts[i + 1].y) / 2;
      ctx.quadraticCurveTo(localPts[i].x, localPts[i].y, midX, midY);
    }
    const last = localPts[localPts.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  ctx.stroke();
}

function renderShapeOnCanvas(ctx: CanvasRenderingContext2D, obj: ShapeObject, pxPerMm: number) {
  const wPx = obj.widthMm * pxPerMm;
  const hPx = obj.heightMm * pxPerMm;
  const cx = (obj.xMm + obj.widthMm / 2) * pxPerMm;
  const cy = (obj.yMm + obj.heightMm / 2) * pxPerMm;

  ctx.translate(cx, cy);
  ctx.rotate((obj.rotationDeg * Math.PI) / 180);

  const hasFill = obj.fillColor && obj.fillColor !== 'transparent';
  const hasStroke = obj.strokeWidthMm > 0 && obj.strokeColor && obj.strokeColor !== 'transparent';
  const strokePx = obj.strokeWidthMm * pxPerMm;

  if (hasStroke) {
    ctx.strokeStyle = obj.strokeColor;
    ctx.lineWidth = strokePx;
    ctx.setLineDash(getDashPatternPx(obj.lineStyle, strokePx));
  }
  if (hasFill) {
    ctx.fillStyle = obj.fillColor;
  }

  ctx.beginPath();
  if (obj.type === 'rectangle' || obj.type === 'square' || obj.type === 'highlight') {
    ctx.rect(-wPx / 2, -hPx / 2, wPx, hPx);
  } else if (obj.type === 'ellipse' || obj.type === 'circle') {
    ctx.ellipse(0, 0, wPx / 2, hPx / 2, 0, 0, Math.PI * 2);
  } else if (obj.type === 'triangle') {
    ctx.moveTo(0, -hPx / 2);
    ctx.lineTo(wPx / 2, hPx / 2);
    ctx.lineTo(-wPx / 2, hPx / 2);
    ctx.closePath();
  }

  if (hasFill) ctx.fill();
  if (hasStroke) ctx.stroke();
}

export async function exportPageToImageFile(
  doc: PageLayDocument,
  page: PageData,
  pageIndex: number,
  options: ImageExportOptions
): Promise<{ widthPx: number; heightPx: number; effectiveDpi: number }> {
  const result = await renderPageToImageBlob(doc, page, options);
  const url = URL.createObjectURL(result.blob);
  const safeName = (doc.name || 'document').trim().replace(/\.lay$/i, '');
  const ext = options.format === 'jpeg' ? 'jpg' : 'png';
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}_page_${pageIndex + 1}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return {
    widthPx: result.widthPx,
    heightPx: result.heightPx,
    effectiveDpi: result.effectiveDpi,
  };
}
