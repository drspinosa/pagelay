/**
 * @license
 * SPDX-License-Identifier: MIT
 *
 * PageLay — Print-Ready, Physically Accurate PDF Export Service
 *
 * Uses `pdf-lib` to generate true vector PDFs with exact physical dimensions in points
 * (1 mm = 72 / 25.4 pt), untouched embedded JPEG/PNG image streams, non-destructive
 * PDF clipping paths for cropped images, true selectable PDF text, and vector arrows/shapes.
 */

import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  StandardFonts,
  rgb,
  LineCapStyle,
  pushGraphicsState,
  popGraphicsState,
  translate,
  rotateDegrees,
  rectangle,
  clip,
  endPath,
  moveTo,
  lineTo,
  closePath,
  fill,
  stroke,
  fillAndStroke,
  setFillingRgbColor,
  setStrokingRgbColor,
  setLineWidth,
  setDashPattern,
  restoreDashPattern,
} from 'pdf-lib';
import {
  ArrowObject,
  AVAILABLE_FONTS,
  DimensionObject,
  ImageAsset,
  ImageObject,
  LineObject,
  PageLayDocument,
  ShapeObject,
  TextObject,
} from '../model/documentTypes';
import { flattenPageObjects, getLineLengthMm, mmToPt } from '../utils/units';

export interface FontSubstitutionWarning {
  objectId: string;
  objectName: string;
  pageName: string;
  requestedFont: string;
  replacementFont: 'Helvetica' | 'Times-Roman' | 'Courier';
}

/**
 * Inspects the document for any text objects using operating-system fonts
 * that are not bundled PDF standard fonts, so the user can be explicitly warned.
 */
export function findSystemFontWarnings(doc: PageLayDocument): FontSubstitutionWarning[] {
  const warnings: FontSubstitutionWarning[] = [];
  for (const page of doc.pages) {
    const flatObjects = flattenPageObjects(page.objects);
    for (const obj of flatObjects) {
      if (obj.type === 'text') {
        const fontDef = AVAILABLE_FONTS.find((f) => f.id === obj.fontFamily);
        if (!fontDef || !fontDef.pdfGuaranteed) {
          warnings.push({
            objectId: obj.id,
            objectName: obj.name,
            pageName: page.name,
            requestedFont: obj.fontFamily,
            replacementFont: fontDef?.pdfFallback || 'Helvetica',
          });
        }
      }
    }
  }
  return warnings;
}

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  if (!hex || hex === 'transparent' || hex === 'none') return null;
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    return { r, g, b };
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return { r: isNaN(r) ? 0 : r, g: isNaN(g) ? 0 : g, b: isNaN(b) ? 0 : b };
  }
  return { r: 0, g: 0, b: 0 };
}

/**
 * Converts a WebP asset at 100% original resolution into lossless PNG bytes
 * because the PDF 1.7 specification only natively supports JPEG (DCTDecode) and PNG (FlateDecode).
 */
async function convertWebpAssetToLosslessPngBytes(asset: ImageAsset): Promise<Uint8Array> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`Failed to decode WebP image "${asset.filename}".`));
    el.src = asset.objectUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = asset.widthPx;
  canvas.height = asset.heightPx;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, asset.widthPx, asset.heightPx);
  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/png')
  );
  return new Uint8Array(await blob.arrayBuffer());
}

function getStandardFontEnum(
  family: string,
  bold: boolean,
  italic: boolean
): StandardFonts {
  const fontDef = AVAILABLE_FONTS.find((f) => f.id === family);
  const base = fontDef ? fontDef.pdfFallback : 'Helvetica';

  if (base === 'Times-Roman') {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
    if (bold) return StandardFonts.TimesRomanBold;
    if (italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if (base === 'Courier') {
    if (bold && italic) return StandardFonts.CourierBoldOblique;
    if (bold) return StandardFonts.CourierBold;
    if (italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  // Default Helvetica
  if (bold && italic) return StandardFonts.HelveticaBoldOblique;
  if (bold) return StandardFonts.HelveticaBold;
  if (italic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

/**
 * Word-wraps a single paragraph line to fit within `maxWidthPt`.
 */
function wrapTextLines(
  text: string,
  font: PDFFont,
  fontSizePt: number,
  maxWidthPt: number
): string[] {
  const rawParagraphs = (text || '').split(/\r?\n/);
  const resultLines: string[] = [];

  for (const para of rawParagraphs) {
    if (!para.trim()) {
      resultLines.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let currentLine = words[0] || '';

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const candidate = `${currentLine} ${word}`;
      const width = font.widthOfTextAtSize(candidate, fontSizePt);
      if (width <= maxWidthPt || currentLine.length === 0) {
        currentLine = candidate;
      } else {
        resultLines.push(currentLine);
        currentLine = word;
      }
    }
    resultLines.push(currentLine);
  }

  return resultLines;
}

function getDashArrayPt(style: 'solid' | 'dashed' | 'dotted', strokeWidthPt: number): number[] | undefined {
  if (style === 'dashed') {
    return [Math.max(4, strokeWidthPt * 3.5), Math.max(3, strokeWidthPt * 2.2)];
  }
  if (style === 'dotted') {
    return [Math.max(1.5, strokeWidthPt * 1.1), Math.max(2.5, strokeWidthPt * 2)];
  }
  return undefined;
}

function drawArrowheadOnPage(
  page: PDFPage,
  tipXPt: number,
  tipYPt: number,
  angleRad: number,
  headSizePt: number,
  color: { r: number; g: number; b: number },
  opacity: number
) {
  const spread = Math.PI / 6.5; // ~27.7 degrees
  const x1 = tipXPt - headSizePt * Math.cos(angleRad - spread);
  const y1 = tipYPt - headSizePt * Math.sin(angleRad - spread);
  const x2 = tipXPt - headSizePt * Math.cos(angleRad + spread);
  const y2 = tipYPt - headSizePt * Math.sin(angleRad + spread);

  // Draw filled triangle using PDF operators
  page.pushOperators(
    pushGraphicsState(),
    setFillingRgbColor(color.r, color.g, color.b),
    moveTo(tipXPt, tipYPt),
    lineTo(x1, y1),
    lineTo(x2, y2),
    closePath(),
    fill(),
    popGraphicsState()
  );
  // Also draw thin matching edge with opacity support
  page.drawLine({
    start: { x: tipXPt, y: tipYPt },
    end: { x: x1, y: y1 },
    thickness: 0.5,
    color: rgb(color.r, color.g, color.b),
    opacity,
  });
}

/**
 * Generates a print-ready, physically accurate PDF Uint8Array from the PageLayDocument.
 * Guidelines are never included in the exported PDF.
 */
export async function generatePdfBytes(doc: PageLayDocument): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(doc.name);
  pdfDoc.setCreator('PageLay — Simple page layouts. No fuss.');
  pdfDoc.setProducer('PageLay Open-Source Layout Editor (pdf-lib)');
  pdfDoc.setCreationDate(new Date());

  // Cache embedded PDF fonts
  const fontCache = new Map<StandardFonts, PDFFont>();
  const getFont = async (stdFont: StandardFonts): Promise<PDFFont> => {
    const existing = fontCache.get(stdFont);
    if (existing) return existing;
    const embedded = await pdfDoc.embedFont(stdFont);
    fontCache.set(stdFont, embedded);
    return embedded;
  };

  // Cache embedded PDF images (embed each asset only once per document!)
  const imageCache = new Map<string, PDFImage>();
  const getEmbeddedImage = async (assetId: string): Promise<PDFImage | null> => {
    if (imageCache.has(assetId)) return imageCache.get(assetId)!;
    const asset = doc.assets[assetId];
    if (!asset) return null;

    let embedded: PDFImage;
    if (asset.mimeType === 'image/jpeg') {
      embedded = await pdfDoc.embedJpg(asset.originalBytes);
    } else if (asset.mimeType === 'image/png') {
      embedded = await pdfDoc.embedPng(asset.originalBytes);
    } else {
      const pngBytes = await convertWebpAssetToLosslessPngBytes(asset);
      embedded = await pdfDoc.embedPng(pngBytes);
    }
    imageCache.set(assetId, embedded);
    return embedded;
  };

  const pageWidthPt = mmToPt(doc.widthMm);
  const pageHeightPt = mmToPt(doc.heightMm);

  for (const pageData of doc.pages) {
    const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
    const flatObjects = flattenPageObjects(pageData.objects);

    for (const obj of flatObjects) {
      if (obj.type === 'image') {
        await renderImageObjectToPdf(page, obj, pageHeightPt, getEmbeddedImage);
      } else if (obj.type === 'text') {
        await renderTextObjectToPdf(page, obj, pageHeightPt, getFont);
      } else if (obj.type === 'line') {
        renderLineObjectToPdf(page, obj, pageHeightPt);
      } else if (obj.type === 'arrow') {
        renderArrowObjectToPdf(page, obj, pageHeightPt);
      } else if (obj.type === 'dimension') {
        await renderDimensionObjectToPdf(page, obj, pageHeightPt, getFont);
      } else {
        renderShapeObjectToPdf(page, obj, pageHeightPt);
      }
    }
  }

  return await pdfDoc.save();
}

async function renderImageObjectToPdf(
  page: PDFPage,
  obj: ImageObject,
  pageHeightPt: number,
  getEmbeddedImage: (assetId: string) => Promise<PDFImage | null>
) {
  const pdfImage = await getEmbeddedImage(obj.assetId);
  if (!pdfImage) return;

  const wPt = mmToPt(obj.widthMm);
  const hPt = mmToPt(obj.heightMm);
  const centerXPt = mmToPt(obj.xMm + obj.widthMm / 2);
  const centerYPt = pageHeightPt - mmToPt(obj.yMm + obj.heightMm / 2);

  const crop = obj.crop || { x: 0, y: 0, width: 1, height: 1 };
  const fullWPt = wPt / Math.max(0.001, crop.width);
  const fullHPt = hPt / Math.max(0.001, crop.height);

  // Relative to center (-wPt/2, -hPt/2) of the placed box:
  // In top-down coords, crop top-left is at (crop.x * fullWPt, crop.y * fullHPt).
  // In bottom-up PDF coords inside the clipped box [-wPt/2, -hPt/2, wPt, hPt]:
  const imgXRel = -wPt / 2 - crop.x * fullWPt;
  const imgYRel = -hPt / 2 - (1 - crop.y - crop.height) * fullHPt;

  page.pushOperators(
    pushGraphicsState(),
    translate(centerXPt, centerYPt),
    rotateDegrees(-obj.rotationDeg),
    rectangle(-wPt / 2, -hPt / 2, wPt, hPt),
    clip(),
    endPath()
  );

  page.drawImage(pdfImage, {
    x: imgXRel,
    y: imgYRel,
    width: fullWPt,
    height: fullHPt,
    opacity: obj.opacity,
  });

  page.pushOperators(popGraphicsState());

  // Optional border around image
  if (obj.strokeWidthMm > 0 && obj.strokeColor && obj.strokeColor !== 'transparent') {
    const borderRgb = parseHexColor(obj.strokeColor);
    if (borderRgb) {
      page.pushOperators(
        pushGraphicsState(),
        translate(centerXPt, centerYPt),
        rotateDegrees(-obj.rotationDeg)
      );
      page.drawRectangle({
        x: -wPt / 2,
        y: -hPt / 2,
        width: wPt,
        height: hPt,
        borderColor: rgb(borderRgb.r, borderRgb.g, borderRgb.b),
        borderWidth: mmToPt(obj.strokeWidthMm),
        opacity: obj.opacity,
        borderOpacity: obj.opacity,
      });
      page.pushOperators(popGraphicsState());
    }
  }
}

async function renderTextObjectToPdf(
  page: PDFPage,
  obj: TextObject,
  pageHeightPt: number,
  getFont: (stdFont: StandardFonts) => Promise<PDFFont>
) {
  const stdFontEnum = getStandardFontEnum(
    obj.fontFamily,
    obj.fontWeight === 'bold',
    obj.fontStyle === 'italic'
  );
  const font = await getFont(stdFontEnum);

  const wPt = mmToPt(obj.widthMm);
  const hPt = mmToPt(obj.heightMm);
  const centerXPt = mmToPt(obj.xMm + obj.widthMm / 2);
  const centerYPt = pageHeightPt - mmToPt(obj.yMm + obj.heightMm / 2);
  const padPt = mmToPt(obj.paddingMm ?? 2);

  page.pushOperators(
    pushGraphicsState(),
    translate(centerXPt, centerYPt),
    rotateDegrees(-obj.rotationDeg)
  );

  // Background or border if configured
  const fillRgb = parseHexColor(obj.fillColor);
  const strokeRgb = parseHexColor(obj.strokeColor);
  if (fillRgb || (strokeRgb && obj.strokeWidthMm > 0)) {
    page.drawRectangle({
      x: -wPt / 2,
      y: -hPt / 2,
      width: wPt,
      height: hPt,
      color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : undefined,
      borderColor: strokeRgb && obj.strokeWidthMm > 0 ? rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b) : undefined,
      borderWidth: strokeRgb && obj.strokeWidthMm > 0 ? mmToPt(obj.strokeWidthMm) : 0,
      opacity: obj.opacity,
      borderOpacity: obj.opacity,
    });
  }

  const textRgb = parseHexColor(obj.color) || { r: 0, g: 0, b: 0 };
  const fontSizePt = obj.fontSizePt;
  const lineHeightPt = fontSizePt * 1.25;
  const innerWidthPt = Math.max(10, wPt - padPt * 2);

  const lines = wrapTextLines(obj.text, font, fontSizePt, innerWidthPt);

  // Start near top of box in local coordinates (top is +hPt/2)
  let currentBaselineY = hPt / 2 - padPt - fontSizePt * 0.85;

  for (const line of lines) {
    if (currentBaselineY < -hPt / 2) break;
    const lineWidth = font.widthOfTextAtSize(line, fontSizePt);
    let lineX = -wPt / 2 + padPt;
    if (obj.align === 'center') {
      lineX = -lineWidth / 2;
    } else if (obj.align === 'right') {
      lineX = wPt / 2 - padPt - lineWidth;
    }

    if (line.length > 0) {
      page.drawText(line, {
        x: lineX,
        y: currentBaselineY,
        font,
        size: fontSizePt,
        color: rgb(textRgb.r, textRgb.g, textRgb.b),
        opacity: obj.opacity,
      });

      if (obj.underline) {
        const underlineY = currentBaselineY - fontSizePt * 0.12;
        page.drawLine({
          start: { x: lineX, y: underlineY },
          end: { x: lineX + lineWidth, y: underlineY },
          thickness: Math.max(0.75, fontSizePt * 0.06),
          color: rgb(textRgb.r, textRgb.g, textRgb.b),
          opacity: obj.opacity,
        });
      }
    }

    currentBaselineY -= lineHeightPt;
  }

  page.pushOperators(popGraphicsState());
}

function renderLineObjectToPdf(page: PDFPage, obj: LineObject, pageHeightPt: number) {
  const strokeRgb = parseHexColor(obj.strokeColor) || { r: 0, g: 0, b: 0 };
  const thicknessPt = mmToPt(Math.max(0.2, obj.strokeWidthMm));
  const x1Pt = mmToPt(obj.x1Mm);
  const y1Pt = pageHeightPt - mmToPt(obj.y1Mm);
  const x2Pt = mmToPt(obj.x2Mm);
  const y2Pt = pageHeightPt - mmToPt(obj.y2Mm);

  page.drawLine({
    start: { x: x1Pt, y: y1Pt },
    end: { x: x2Pt, y: y2Pt },
    thickness: thicknessPt,
    color: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
    opacity: obj.opacity,
    dashArray: getDashArrayPt(obj.lineStyle, thicknessPt),
    lineCap: LineCapStyle.Round,
  });
}

function renderArrowObjectToPdf(page: PDFPage, obj: ArrowObject, pageHeightPt: number) {
  const strokeRgb = parseHexColor(obj.strokeColor) || { r: 0.86, g: 0.15, b: 0.15 };
  const thicknessPt = mmToPt(Math.max(0.2, obj.strokeWidthMm));
  const headSizePt = mmToPt(Math.max(2, obj.headSizeMm || 8));

  const x1Pt = mmToPt(obj.x1Mm);
  const y1Pt = pageHeightPt - mmToPt(obj.y1Mm);
  const x2Pt = mmToPt(obj.x2Mm);
  const y2Pt = pageHeightPt - mmToPt(obj.y2Mm);

  const angleRad = Math.atan2(y2Pt - y1Pt, x2Pt - x1Pt);
  const hasStart = obj.arrowEnds === 'start' || obj.arrowEnds === 'both';
  const hasEnd = obj.arrowEnds === 'end' || obj.arrowEnds === 'both';

  const startShorten = hasStart ? headSizePt * 0.65 : 0;
  const endShorten = hasEnd ? headSizePt * 0.65 : 0;

  const lineStartX = x1Pt + Math.cos(angleRad) * startShorten;
  const lineStartY = y1Pt + Math.sin(angleRad) * startShorten;
  const lineEndX = x2Pt - Math.cos(angleRad) * endShorten;
  const lineEndY = y2Pt - Math.sin(angleRad) * endShorten;

  page.drawLine({
    start: { x: lineStartX, y: lineStartY },
    end: { x: lineEndX, y: lineEndY },
    thickness: thicknessPt,
    color: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
    opacity: obj.opacity,
    dashArray: getDashArrayPt(obj.lineStyle, thicknessPt),
    lineCap: LineCapStyle.Butt,
  });

  if (hasEnd) {
    drawArrowheadOnPage(page, x2Pt, y2Pt, angleRad, headSizePt, strokeRgb, obj.opacity);
  }
  if (hasStart) {
    drawArrowheadOnPage(
      page,
      x1Pt,
      y1Pt,
      angleRad + Math.PI,
      headSizePt,
      strokeRgb,
      obj.opacity
    );
  }
}

async function renderDimensionObjectToPdf(
  page: PDFPage,
  obj: DimensionObject,
  pageHeightPt: number,
  getFont: (stdFont: StandardFonts) => Promise<PDFFont>
) {
  const strokeRgb = parseHexColor(obj.strokeColor) || { r: 0.86, g: 0.15, b: 0.15 };
  const thicknessPt = mmToPt(Math.max(0.2, obj.strokeWidthMm));
  const headSizePt = mmToPt(Math.max(2, obj.headSizeMm || 6));
  const extPt = mmToPt(obj.extensionHeightMm || 10);

  const x1Pt = mmToPt(obj.x1Mm);
  const y1Pt = pageHeightPt - mmToPt(obj.y1Mm);
  const x2Pt = mmToPt(obj.x2Mm);
  const y2Pt = pageHeightPt - mmToPt(obj.y2Mm);

  const angleRad = Math.atan2(y2Pt - y1Pt, x2Pt - x1Pt);
  const perpX = -Math.sin(angleRad) * (extPt / 2);
  const perpY = Math.cos(angleRad) * (extPt / 2);

  // Extension witness ticks at both ends
  page.drawLine({
    start: { x: x1Pt - perpX, y: y1Pt - perpY },
    end: { x: x1Pt + perpX, y: y1Pt + perpY },
    thickness: thicknessPt,
    color: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
    opacity: obj.opacity,
  });
  page.drawLine({
    start: { x: x2Pt - perpX, y: y2Pt - perpY },
    end: { x: x2Pt + perpX, y: y2Pt + perpY },
    thickness: thicknessPt,
    color: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
    opacity: obj.opacity,
  });

  // Main dimension line + double arrowheads
  page.drawLine({
    start: { x: x1Pt, y: y1Pt },
    end: { x: x2Pt, y: y2Pt },
    thickness: thicknessPt,
    color: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
    opacity: obj.opacity,
  });
  drawArrowheadOnPage(page, x2Pt, y2Pt, angleRad, headSizePt, strokeRgb, obj.opacity);
  drawArrowheadOnPage(page, x1Pt, y1Pt, angleRad + Math.PI, headSizePt, strokeRgb, obj.opacity);

  // Dimension label
  const distMm = Math.round(getLineLengthMm(obj.x1Mm, obj.y1Mm, obj.x2Mm, obj.y2Mm));
  const labelText = obj.customLabel?.trim() || `${distMm} mm`;
  const font = await getFont(StandardFonts.HelveticaBold);
  const fontSizePt = obj.fontSizePt || 20;
  const textWidth = font.widthOfTextAtSize(labelText, fontSizePt);

  const midX = (x1Pt + x2Pt) / 2;
  const midY = (y1Pt + y2Pt) / 2;

  page.pushOperators(
    pushGraphicsState(),
    translate(midX, midY),
    rotateDegrees((angleRad * 180) / Math.PI)
  );

  // Crisp white backing box behind dimension text
  const padX = 4;
  const padY = 2;
  page.drawRectangle({
    x: -textWidth / 2 - padX,
    y: 4,
    width: textWidth + padX * 2,
    height: fontSizePt + padY * 2,
    color: rgb(1, 1, 1),
    opacity: 0.92,
  });

  page.drawText(labelText, {
    x: -textWidth / 2,
    y: 4 + padY + fontSizePt * 0.12,
    font,
    size: fontSizePt,
    color: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
    opacity: obj.opacity,
  });

  page.pushOperators(popGraphicsState());
}

function renderShapeObjectToPdf(page: PDFPage, obj: ShapeObject, pageHeightPt: number) {
  const wPt = mmToPt(obj.widthMm);
  const hPt = mmToPt(obj.heightMm);
  const centerXPt = mmToPt(obj.xMm + obj.widthMm / 2);
  const centerYPt = pageHeightPt - mmToPt(obj.yMm + obj.heightMm / 2);

  const fillRgb = parseHexColor(obj.fillColor);
  const strokeRgb = parseHexColor(obj.strokeColor);
  const strokeWidthPt = obj.strokeWidthMm > 0 ? mmToPt(obj.strokeWidthMm) : 0;
  const dashArray = getDashArrayPt(obj.lineStyle, strokeWidthPt);

  page.pushOperators(
    pushGraphicsState(),
    translate(centerXPt, centerYPt),
    rotateDegrees(-obj.rotationDeg)
  );

  if (obj.type === 'rectangle' || obj.type === 'square' || obj.type === 'highlight') {
    page.drawRectangle({
      x: -wPt / 2,
      y: -hPt / 2,
      width: wPt,
      height: hPt,
      color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : undefined,
      borderColor: strokeRgb && strokeWidthPt > 0 ? rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b) : undefined,
      borderWidth: strokeWidthPt,
      borderDashArray: dashArray,
      opacity: obj.opacity,
      borderOpacity: obj.opacity,
    });
  } else if (obj.type === 'ellipse' || obj.type === 'circle') {
    page.drawEllipse({
      x: 0,
      y: 0,
      xScale: wPt / 2,
      yScale: hPt / 2,
      color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : undefined,
      borderColor: strokeRgb && strokeWidthPt > 0 ? rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b) : undefined,
      borderWidth: strokeWidthPt,
      borderDashArray: dashArray,
      opacity: obj.opacity,
      borderOpacity: obj.opacity,
    });
  } else if (obj.type === 'triangle') {
    // Draw triangle using PDF path operators
    const ops = [
      moveTo(0, hPt / 2),
      lineTo(wPt / 2, -hPt / 2),
      lineTo(-wPt / 2, -hPt / 2),
      closePath(),
    ];
    if (fillRgb && strokeRgb && strokeWidthPt > 0) {
      page.pushOperators(
        setFillingRgbColor(fillRgb.r, fillRgb.g, fillRgb.b),
        setStrokingRgbColor(strokeRgb.r, strokeRgb.g, strokeRgb.b),
        setLineWidth(strokeWidthPt),
        ...(dashArray ? [setDashPattern(dashArray, 0)] : []),
        ...ops,
        fillAndStroke(),
        ...(dashArray ? [restoreDashPattern()] : [])
      );
    } else if (fillRgb) {
      page.pushOperators(
        setFillingRgbColor(fillRgb.r, fillRgb.g, fillRgb.b),
        ...ops,
        fill()
      );
    } else if (strokeRgb && strokeWidthPt > 0) {
      page.pushOperators(
        setStrokingRgbColor(strokeRgb.r, strokeRgb.g, strokeRgb.b),
        setLineWidth(strokeWidthPt),
        ...(dashArray ? [setDashPattern(dashArray, 0)] : []),
        ...ops,
        stroke(),
        ...(dashArray ? [restoreDashPattern()] : [])
      );
    }
  }

  page.pushOperators(popGraphicsState());
}

/**
 * Triggers a browser download for the exported PDF.
 */
export async function exportDocumentToPdfFile(doc: PageLayDocument): Promise<void> {
  const pdfBytes = await generatePdfBytes(doc);
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const safeName = (doc.name || 'document').trim().replace(/\.lay$/i, '');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
