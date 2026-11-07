/**
 * @license
 * SPDX-License-Identifier: MIT
 *
 * PageLay — Document & Object Factory + Sample A0 Exhibition Sheet Generator
 */

import {
  ArrowObject,
  DimensionObject,
  ImageAsset,
  ImageObject,
  LineObject,
  Orientation,
  PageData,
  PageLayDocument,
  PageObject,
  PaperFormat,
  ShapeObject,
  TextObject,
} from './documentTypes';
import { getPaperDimensionsMm, syncLinearBoundingBox, translatePageObjectMm } from '../utils/units';

export function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createBlankPage(index: number): PageData {
  return {
    id: generateId('page'),
    name: `Page ${index}`,
    guidelines: [],
    objects: [],
  };
}

/**
 * Default document: A0 landscape, 1189 mm wide × 841 mm high.
 */
export function createNewDocument(
  name = 'Untitled Exhibition Layout',
  paperSize: PaperFormat = 'A0',
  orientation: Orientation = 'landscape',
  customWidthMm = 1189,
  customHeightMm = 841
): PageLayDocument {
  const { widthMm, heightMm } = getPaperDimensionsMm(
    paperSize,
    orientation,
    customWidthMm,
    customHeightMm
  );
  const now = new Date().toISOString();

  return {
    id: generateId('doc'),
    name,
    version: '1.0.0',
    createdAt: now,
    updatedAt: now,
    paperSize,
    orientation,
    widthMm,
    heightMm,
    showGuides: true,
    lockGuides: false,
    snapToGuides: true,
    snapToPageEdges: true,
    snapToObjects: true,
    angleSnapIncrementDeg: 15,
    precisionMode: false,
    pages: [createBlankPage(1)],
    assets: {},
  };
}

function assignNewObjectIds(obj: PageObject): PageObject {
  const cloned = JSON.parse(JSON.stringify(obj)) as PageObject;
  cloned.id = generateId(obj.type);
  if (cloned.type === 'group') {
    cloned.children = cloned.children.map((child) => assignNewObjectIds(child));
  }
  return cloned;
}

export function cloneObject(obj: PageObject, offsetMm = 15): PageObject {
  const withIds = assignNewObjectIds(obj);
  withIds.name = `${obj.name} Copy`;
  return translatePageObjectMm(withIds, offsetMm, offsetMm);
}

export function clonePage(page: PageData, newIndex: number): PageData {
  return {
    id: generateId('page'),
    name: `Page ${newIndex}`,
    guidelines: page.guidelines.map((g) => ({
      ...g,
      id: generateId('guide'),
    })),
    objects: page.objects.map((o) => assignNewObjectIds(o)),
  };
}

/**
 * Collects all image `assetId`s referenced by objects across the given pages,
 * traversing nested `group` objects recursively.
 */
export function collectReferencedAssetIds(pages: PageData[]): Set<string> {
  const referenced = new Set<string>();
  const walkObjects = (objects: PageObject[]) => {
    for (const obj of objects) {
      if (!obj) continue;
      if (obj.type === 'image' && obj.assetId) {
        referenced.add(obj.assetId);
      } else if (obj.type === 'group' && Array.isArray(obj.children)) {
        walkObjects(obj.children);
      }
    }
  };
  for (const page of pages) {
    if (page && Array.isArray(page.objects)) {
      walkObjects(page.objects);
    }
  }
  return referenced;
}

function areUint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function cloneObjectForPageImport(
  obj: PageObject,
  assetIdMap: Map<string, string>
): PageObject {
  const cloned = JSON.parse(JSON.stringify(obj)) as PageObject;
  cloned.id = generateId(obj.type);
  if (cloned.type === 'image') {
    cloned.assetId = assetIdMap.get(cloned.assetId) ?? cloned.assetId;
  } else if (cloned.type === 'group' && Array.isArray(cloned.children)) {
    cloned.children = cloned.children.map((child) =>
      cloneObjectForPageImport(child, assetIdMap)
    );
  }
  return cloned;
}

/**
 * Prepares all pages and referenced untouched original image assets from a source `.lay` document
 * so they can be appended to `destDoc` as a single undoable operation:
 * - Only imports assets actually referenced by `sourceDoc.pages`.
 * - Preserves 100% original image bytes (`Uint8Array`) without recompression or downsampling.
 * - Resolves any `assetId` collisions safely and updates all image object references (including inside groups).
 * - Generates fresh unique IDs for all imported pages, guidelines, objects, and nested group children.
 * - Preserves original page names, object positions, rotations, z-order, freehand strokes, and formatting.
 */
export function prepareImportedPagesFromDocument(
  sourceDoc: PageLayDocument,
  destDoc: PageLayDocument
): {
  importedPages: PageData[];
  mergedAssets: Record<string, ImageAsset>;
} {
  const referencedAssetIds = collectReferencedAssetIds(sourceDoc.pages);
  const mergedAssets: Record<string, ImageAsset> = { ...destDoc.assets };
  const assetIdMap = new Map<string, string>();

  for (const [sourceAssetId, sourceAsset] of Object.entries(sourceDoc.assets)) {
    if (!referencedAssetIds.has(sourceAssetId)) {
      try {
        URL.revokeObjectURL(sourceAsset.objectUrl);
      } catch {
        // Ignore URL revocation errors
      }
      continue;
    }

    const existing = mergedAssets[sourceAssetId];
    if (!existing) {
      mergedAssets[sourceAssetId] = sourceAsset;
      assetIdMap.set(sourceAssetId, sourceAssetId);
    } else if (
      existing.fileSizeBytes === sourceAsset.fileSizeBytes &&
      existing.mimeType === sourceAsset.mimeType &&
      existing.widthPx === sourceAsset.widthPx &&
      existing.heightPx === sourceAsset.heightPx &&
      areUint8ArraysEqual(existing.originalBytes, sourceAsset.originalBytes)
    ) {
      // Exact same binary asset already exists under this ID
      assetIdMap.set(sourceAssetId, sourceAssetId);
      try {
        URL.revokeObjectURL(sourceAsset.objectUrl);
      } catch {
        // Ignore URL revocation errors
      }
    } else {
      // Resolve ID collision by assigning a new unique asset ID
      let newAssetId = generateId('asset');
      while (mergedAssets[newAssetId]) {
        newAssetId = generateId('asset');
      }
      mergedAssets[newAssetId] = {
        ...sourceAsset,
        id: newAssetId,
      };
      assetIdMap.set(sourceAssetId, newAssetId);
    }
  }

  const importedPages: PageData[] = sourceDoc.pages.map((sourcePage, idx) => ({
    id: generateId('page'),
    name: (sourcePage.name || '').trim() || `Imported Page ${idx + 1}`,
    guidelines: (sourcePage.guidelines || []).map((g) => ({
      ...g,
      id: generateId('guide'),
    })),
    objects: (sourcePage.objects || []).map((o) =>
      cloneObjectForPageImport(o, assetIdMap)
    ),
  }));

  return {
    importedPages,
    mergedAssets,
  };
}

/**
 * Helper to generate a real high-resolution PNG Uint8Array in the browser
 * for the Sample A0 Exhibition Stand Layout so users can test full-resolution
 * non-destructive cropping, effective DPI readouts, .lay saving, and PDF export.
 */
async function createProceduralRenderAsset(
  title: string,
  subtitle: string,
  variant: 'perspective' | 'floorplan' | 'elevation',
  widthPx = 2400,
  heightPx = 1600
): Promise<ImageAsset> {
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = variant === 'floorplan' ? '#F8FAFC' : '#F1F5F9';
  ctx.fillRect(0, 0, widthPx, heightPx);

  // Subtle architectural grid
  ctx.strokeStyle = variant === 'floorplan' ? '#E2E8F0' : '#CBD5E1';
  ctx.lineWidth = 2;
  const step = 80;
  for (let x = 0; x < widthPx; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, heightPx);
    ctx.stroke();
  }
  for (let y = 0; y < heightPx; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(widthPx, y);
    ctx.stroke();
  }

  if (variant === 'perspective') {
    // Architectural Stand 3D Perspective Render
    // Floor platform
    ctx.fillStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.moveTo(300, 1180);
    ctx.lineTo(1250, 1420);
    ctx.lineTo(2120, 1120);
    ctx.lineTo(1180, 920);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Back wall left wing
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.moveTo(300, 1180);
    ctx.lineTo(1180, 920);
    ctx.lineTo(1180, 320);
    ctx.lineTo(300, 540);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Back wall right wing
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(1180, 920);
    ctx.lineTo(2120, 1120);
    ctx.lineTo(2120, 500);
    ctx.lineTo(1180, 320);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Illuminated LED fascia canopy
    ctx.fillStyle = '#0284C7';
    ctx.beginPath();
    ctx.moveTo(460, 480);
    ctx.lineTo(1180, 300);
    ctx.lineTo(1960, 460);
    ctx.lineTo(1960, 560);
    ctx.lineTo(1180, 400);
    ctx.lineTo(460, 580);
    ctx.closePath();
    ctx.fill();

    // Reception counter
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(1020, 980, 420, 240);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 6;
    ctx.strokeRect(1020, 980, 420, 240);

    // Display screens on walls
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(540, 650, 420, 240);
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(1400, 620, 480, 270);

    // Electrical floor box markers inside render
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(1050, 1220, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(1580, 940, 22, 0, Math.PI * 2);
    ctx.fill();
  } else if (variant === 'floorplan') {
    // Technical 1:50 Floor Plan Drawing
    const padX = 280;
    const padY = 220;
    const planW = widthPx - padX * 2;
    const planH = heightPx - padY * 2;

    // Outer stand perimeter
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(padX, padY, planW, planH);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 12;
    ctx.strokeRect(padX, padY, planW, planH);

    // Partition room (Storage / AV Closet)
    ctx.fillStyle = '#F1F5F9';
    ctx.fillRect(padX, padY, 560, 480);
    ctx.strokeRect(padX, padY, 560, 480);

    // Meeting table & chairs
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(padX + 1250, padY + 460, 190, 0, Math.PI * 2);
    ctx.stroke();

    // Reception desk footprint
    ctx.fillStyle = '#E0F2FE';
    ctx.fillRect(padX + 680, padY + planH - 260, 520, 180);
    ctx.strokeRect(padX + 680, padY + planH - 260, 520, 180);

    // Electrical distribution board symbol
    ctx.fillStyle = '#FEE2E2';
    ctx.fillRect(padX + 40, padY + 40, 180, 110);
    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 6;
    ctx.strokeRect(padX + 40, padY + 40, 180, 110);

    ctx.fillStyle = '#DC2626';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('DB-32A', padX + 65, padY + 108);
  } else {
    // Technical Wall Elevation
    const baseLineY = 1320;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(180, baseLineY);
    ctx.lineTo(widthPx - 180, baseLineY);
    ctx.stroke();

    // Elevation wall panels
    for (let i = 0; i < 4; i++) {
      const x = 320 + i * 440;
      ctx.fillStyle = i % 2 === 0 ? '#E2E8F0' : '#CBD5E1';
      ctx.fillRect(x, 360, 440, baseLineY - 360);
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 6;
      ctx.strokeRect(x, 360, 440, baseLineY - 360);
    }

    // Mounted AV monitor in panel 2 & 3
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(880, 580, 640, 360);
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 6;
    ctx.strokeRect(880, 580, 640, 360);

    // Twin socket outlet boxes
    ctx.fillStyle = '#EF4444';
    ctx.fillRect(620, 1180, 64, 44);
    ctx.fillRect(1160, 1020, 64, 44);
  }

  // Drawing Title Block inside the high-res image
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, heightPx - 110, widthPx, 110);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText(title, 48, heightPx - 44);
  ctx.fillStyle = '#94A3B8';
  ctx.font = '30px monospace';
  ctx.fillText(`${subtitle}  |  ${widthPx} × ${heightPx} px Original Asset`, widthPx - 880, heightPx - 44);

  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/png')
  );
  const arrayBuffer = await blob.arrayBuffer();
  const originalBytes = new Uint8Array(arrayBuffer);
  const objectUrl = URL.createObjectURL(blob);

  return {
    id: generateId('asset'),
    filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.png`,
    mimeType: 'image/png',
    originalBytes,
    objectUrl,
    widthPx,
    heightPx,
    fileSizeBytes: originalBytes.byteLength,
  };
}

/**
 * Builds the complete primary-use-case A0 Landscape sample document:
 * - A0 Landscape (1189 × 841 mm)
 * - 3 high-resolution architectural/exhibition renders (Perspective, Floor Plan, Wall Elevation)
 * - Red arrows identifying electrical connection positions
 * - Red text annotations reading "POWER", "320 mm" and "800 mm"
 * - Yellow and Red highlights over key contractor zones
 * - Millimetre guidelines at 40 mm margins and column divisions
 */
export async function createSampleExhibitionDocument(): Promise<PageLayDocument> {
  const doc = createNewDocument('Hall 4 — Stand B12 Exhibition Layout', 'A0', 'landscape');

  const [renderPerspective, renderFloorplan, renderElevation] = await Promise.all([
    createProceduralRenderAsset(
      '01. Isometric Stand Perspective',
      'SCALE: NTS',
      'perspective',
      2400,
      1600
    ),
    createProceduralRenderAsset(
      '02. General Arrangement Floor Plan',
      'SCALE 1:50 @ A0',
      'floorplan',
      2400,
      1600
    ),
    createProceduralRenderAsset(
      '03. North Wall Electrical Elevation',
      'SCALE 1:25 @ A0',
      'elevation',
      2400,
      1600
    ),
  ]);

  doc.assets[renderPerspective.id] = renderPerspective;
  doc.assets[renderFloorplan.id] = renderFloorplan;
  doc.assets[renderElevation.id] = renderElevation;

  const page = doc.pages[0];
  page.name = 'Sheet 1 — Electrical & GA';

  // Millimetre guidelines
  page.guidelines = [
    { id: generateId('guide'), orientation: 'vertical', positionMm: 40 },
    { id: generateId('guide'), orientation: 'vertical', positionMm: 610 },
    { id: generateId('guide'), orientation: 'vertical', positionMm: 1149 },
    { id: generateId('guide'), orientation: 'horizontal', positionMm: 40 },
    { id: generateId('guide'), orientation: 'horizontal', positionMm: 115 },
    { id: generateId('guide'), orientation: 'horizontal', positionMm: 801 },
  ];

  // Header Banner Box
  const headerRect: ShapeObject = {
    id: generateId('rect'),
    type: 'rectangle',
    name: 'Title Header Block',
    xMm: 40,
    yMm: 40,
    widthMm: 1109,
    heightMm: 60,
    rotationDeg: 0,
    opacity: 1,
    fillColor: '#0F172A',
    strokeColor: '#0F172A',
    strokeWidthMm: 0.5,
    lineStyle: 'solid',
  };

  const headerTitle: TextObject = {
    id: generateId('text'),
    type: 'text',
    name: 'Sheet Title',
    xMm: 55,
    yMm: 52,
    widthMm: 720,
    heightMm: 36,
    rotationDeg: 0,
    opacity: 1,
    text: 'EXHIBITION STAND B12 — ELECTRICAL & FLOOR PLAN LAYOUT (A0)',
    fontFamily: 'Helvetica',
    fontSizePt: 42,
    fontWeight: 'bold',
    fontStyle: 'normal',
    underline: false,
    color: '#FFFFFF',
    align: 'left',
    fillColor: 'transparent',
    strokeColor: 'transparent',
    strokeWidthMm: 0,
    paddingMm: 2,
  };

  const headerMeta: TextObject = {
    id: generateId('text'),
    type: 'text',
    name: 'Drawing Metadata',
    xMm: 810,
    yMm: 54,
    widthMm: 325,
    heightMm: 34,
    rotationDeg: 0,
    opacity: 1,
    text: 'SHEET: A0 (1189 × 841 mm)  |  REV: C  |  UNITS: mm',
    fontFamily: 'Courier',
    fontSizePt: 26,
    fontWeight: 'bold',
    fontStyle: 'normal',
    underline: false,
    color: '#38BDF8',
    align: 'right',
    fillColor: 'transparent',
    strokeColor: 'transparent',
    strokeWidthMm: 0,
    paddingMm: 2,
  };

  // Three High-Res Renders placed in mm
  const imgPerspective: ImageObject = {
    id: generateId('image'),
    type: 'image',
    name: 'Stand 3D Render',
    assetId: renderPerspective.id,
    xMm: 40,
    yMm: 115,
    widthMm: 540,
    heightMm: 360,
    rotationDeg: 0,
    opacity: 1,
    preserveAspectRatio: true,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    strokeColor: '#94A3B8',
    strokeWidthMm: 0.6,
  };

  const imgFloorplan: ImageObject = {
    id: generateId('image'),
    type: 'image',
    name: '1:50 Floor Plan',
    assetId: renderFloorplan.id,
    xMm: 610,
    yMm: 115,
    widthMm: 539,
    heightMm: 360,
    rotationDeg: 0,
    opacity: 1,
    preserveAspectRatio: true,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    strokeColor: '#94A3B8',
    strokeWidthMm: 0.6,
  };

  const imgElevation: ImageObject = {
    id: generateId('image'),
    type: 'image',
    name: 'North Wall Elevation',
    assetId: renderElevation.id,
    xMm: 40,
    yMm: 500,
    widthMm: 680,
    heightMm: 301,
    rotationDeg: 0,
    opacity: 1,
    preserveAspectRatio: false,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    strokeColor: '#94A3B8',
    strokeWidthMm: 0.6,
  };

  // Highlight over DB-32A Main Distribution Zone on Floor Plan
  const dbHighlight: ShapeObject = {
    id: generateId('highlight'),
    type: 'highlight',
    name: 'Main DB Zone Highlight',
    xMm: 672,
    yMm: 162,
    widthMm: 78,
    heightMm: 52,
    rotationDeg: 0,
    opacity: 0.36,
    fillColor: '#FACC15',
    strokeColor: 'transparent',
    strokeWidthMm: 0,
    lineStyle: 'solid',
  };

  // Red arrows identifying electrical connection positions
  const powerArrow1: ArrowObject = syncLinearBoundingBox({
    id: generateId('arrow'),
    type: 'arrow',
    name: 'Counter Floor Box Arrow',
    xMm: 0,
    yMm: 0,
    widthMm: 0,
    heightMm: 0,
    x1Mm: 185,
    y1Mm: 425,
    x2Mm: 272,
    y2Mm: 392,
    rotationDeg: 0,
    opacity: 1,
    strokeColor: '#DC2626',
    strokeWidthMm: 2.2,
    lineStyle: 'solid',
    arrowEnds: 'end',
    headSizeMm: 10,
  });

  const powerArrow2: ArrowObject = syncLinearBoundingBox({
    id: generateId('arrow'),
    type: 'arrow',
    name: 'AV Wall Feed Arrow',
    xMm: 0,
    yMm: 0,
    widthMm: 0,
    heightMm: 0,
    x1Mm: 485,
    y1Mm: 270,
    x2Mm: 402,
    y2Mm: 324,
    rotationDeg: 0,
    opacity: 1,
    strokeColor: '#DC2626',
    strokeWidthMm: 2.2,
    lineStyle: 'solid',
    arrowEnds: 'end',
    headSizeMm: 10,
  });

  // Red text annotations reading "POWER", "320 mm", and "800 mm"
  const powerText1: TextObject = {
    id: generateId('text'),
    type: 'text',
    name: 'POWER Label 1',
    xMm: 95,
    yMm: 416,
    widthMm: 95,
    heightMm: 24,
    rotationDeg: 0,
    opacity: 1,
    text: 'POWER (16A)',
    fontFamily: 'Helvetica',
    fontSizePt: 30,
    fontWeight: 'bold',
    fontStyle: 'normal',
    underline: false,
    color: '#DC2626',
    align: 'left',
    fillColor: '#FEF2F2',
    strokeColor: '#DC2626',
    strokeWidthMm: 0.6,
    paddingMm: 3,
  };

  const powerText2: TextObject = {
    id: generateId('text'),
    type: 'text',
    name: 'POWER Label 2',
    xMm: 465,
    yMm: 244,
    widthMm: 86,
    heightMm: 24,
    rotationDeg: 0,
    opacity: 1,
    text: 'POWER',
    fontFamily: 'Helvetica',
    fontSizePt: 30,
    fontWeight: 'bold',
    fontStyle: 'normal',
    underline: false,
    color: '#DC2626',
    align: 'center',
    fillColor: '#FEF2F2',
    strokeColor: '#DC2626',
    strokeWidthMm: 0.6,
    paddingMm: 3,
  };

  // Dimension Callouts on Elevation ("320 mm" and "800 mm")
  const dim320: DimensionObject = syncLinearBoundingBox({
    id: generateId('dimension'),
    type: 'dimension',
    name: 'Socket Offset 320 mm',
    xMm: 0,
    yMm: 0,
    widthMm: 0,
    heightMm: 0,
    x1Mm: 130,
    y1Mm: 725,
    x2Mm: 222,
    y2Mm: 725,
    rotationDeg: 0,
    opacity: 1,
    strokeColor: '#DC2626',
    strokeWidthMm: 1.5,
    headSizeMm: 7,
    customLabel: '320 mm',
    fontSizePt: 26,
    extensionHeightMm: 12,
  });

  const dim800: DimensionObject = syncLinearBoundingBox({
    id: generateId('dimension'),
    type: 'dimension',
    name: 'AV Center Height 800 mm',
    xMm: 0,
    yMm: 0,
    widthMm: 0,
    heightMm: 0,
    x1Mm: 230,
    y1Mm: 690,
    x2Mm: 382,
    y2Mm: 690,
    rotationDeg: 0,
    opacity: 1,
    strokeColor: '#DC2626',
    strokeWidthMm: 1.5,
    headSizeMm: 7,
    customLabel: '800 mm',
    fontSizePt: 26,
    extensionHeightMm: 12,
  });

  // Contractor Specification Notes Box on bottom right
  const notesPanel: TextObject = {
    id: generateId('text'),
    type: 'text',
    name: 'Contractor Notes',
    xMm: 745,
    yMm: 500,
    widthMm: 404,
    heightMm: 301,
    rotationDeg: 0,
    opacity: 1,
    text:
      'CONTRACTOR & ELECTRICAL NOTES:\n\n' +
      '1. Main 32A 3-Phase supply enters at DB-32A (highlighted yellow on 1:50 floor plan).\n\n' +
      '2. Floor box POWER feed under reception counter positioned 320 mm from front riser edge.\n\n' +
      '3. LED Wall twin socket outlets recessed at 800 mm AFFL along North Elevation.\n\n' +
      '4. All dimensions verified in millimetres (mm). Print scale 1:1 on ISO A0 Landscape (1189 × 841 mm).',
    fontFamily: 'Helvetica',
    fontSizePt: 28,
    fontWeight: 'normal',
    fontStyle: 'normal',
    underline: false,
    color: '#0F172A',
    align: 'left',
    fillColor: '#FFFFFF',
    strokeColor: '#CBD5E1',
    strokeWidthMm: 0.8,
    paddingMm: 10,
  };

  page.objects = [
    headerRect,
    headerTitle,
    headerMeta,
    imgPerspective,
    imgFloorplan,
    imgElevation,
    dbHighlight,
    powerArrow1,
    powerArrow2,
    powerText1,
    powerText2,
    dim320,
    dim800,
    notesPanel,
  ];

  return doc;
}
