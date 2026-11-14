/**
 * @license
 * SPDX-License-Identifier: MIT
 *
 * PageLay — Clipboard Image Paste & Internal Multi-Object Copy/Paste Service
 *
 * - Extracts raster image data (PNG, JPEG, WebP, or lossless BMP/GIF->PNG conversion)
 *   from native browser ClipboardData with zero network requests and no unnecessary permissions.
 * - Manages deep internal object/group copy snapshots including isolated ImageAsset bytes
 *   so pasting across pages and across different documents never breaks image references.
 */

import {
  ImageAsset,
  PageLayDocument,
  PageObject,
} from '../model/documentTypes';
import {
  collectReferencedAssetIds,
  generateId,
} from '../model/documentFactory';
import {
  getCombinedBoundsMm,
  translatePageObjectMm,
} from '../utils/units';

export interface PageLayClipboardPayload {
  clipId: string;
  plainTextSummary: string;
  objects: PageObject[];
  assets: Record<string, ImageAsset>;
  sourcePageId: string;
  pasteCount: number;
  wroteToSystemClipboard: boolean;
  copiedAtMs: number;
}

export type ClipboardInspectionResult =
  | { kind: 'images'; files: File[] }
  | { kind: 'pagelay-internal' }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'empty' };

function areUint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function collectReferencedAssetIdsFromObjects(objects: PageObject[]): Set<string> {
  return collectReferencedAssetIds([
    { id: '_clip', name: '_clip', guidelines: [], objects },
  ]);
}

function cloneObjectWithNewIdsAndAssets(
  obj: PageObject,
  assetIdMap: Map<string, string>
): PageObject {
  const cloned = JSON.parse(JSON.stringify(obj)) as PageObject;
  cloned.id = generateId(obj.type);
  if (cloned.type === 'image') {
    cloned.assetId = assetIdMap.get(cloned.assetId) ?? cloned.assetId;
  } else if (cloned.type === 'group' && Array.isArray(cloned.children)) {
    cloned.children = cloned.children.map((child) =>
      cloneObjectWithNewIdsAndAssets(child, assetIdMap)
    );
  }
  return cloned;
}

function formatClipboardTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

function extensionForMime(mimeType: string): string {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

function normalizeSupportedMime(rawMime: string, fileName = ''): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  const lower = (rawMime || '').toLowerCase();
  if (lower === 'image/png') return 'image/png';
  if (lower === 'image/jpeg' || lower === 'image/jpg') return 'image/jpeg';
  if (lower === 'image/webp') return 'image/webp';

  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return null;
}

function isGenericClipboardFilename(name: string): boolean {
  const trimmed = (name || '').trim().toLowerCase();
  if (!trimmed) return true;
  return (
    trimmed === 'image.png' ||
    trimmed === 'image.jpg' ||
    trimmed === 'image.jpeg' ||
    trimmed === 'image.webp' ||
    trimmed === 'image' ||
    trimmed === 'blob' ||
    trimmed === 'clipboard.png' ||
    trimmed === 'clipboard.jpg' ||
    trimmed === 'clipboard.webp' ||
    trimmed === 'pasted-image.png'
  );
}

/**
 * Ensures an unnamed or generically named clipboard image receives a clear, human-readable filename
 * while keeping real filenames intact and never altering the binary image bytes.
 */
function ensureNamedClipboardImageFile(
  blob: Blob,
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp',
  rawName: string | undefined,
  index: number
): File {
  const ext = extensionForMime(mimeType);
  let resolvedName: string;
  if (rawName && !isGenericClipboardFilename(rawName)) {
    resolvedName = rawName;
  } else {
    const stamp = formatClipboardTimestamp();
    const suffix = index > 0 ? ` (${index + 1})` : '';
    resolvedName = `Pasted Image ${stamp}${suffix}.${ext}`;
  }
  return new File([blob], resolvedName, {
    type: mimeType,
    lastModified: Date.now(),
  });
}

/**
 * Losslessly converts browser-decodable raster formats (such as BMP or GIF from older desktop apps)
 * into a PNG File at exact original pixel resolution.
 */
async function convertRasterBlobToPngFile(
  blob: Blob,
  rawName: string | undefined,
  index: number
): Promise<File | null> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode clipboard image.'));
      el.src = objectUrl;
    });
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (!width || !height) return null;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);

    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    );
    if (!pngBlob) return null;

    return ensureNamedClipboardImageFile(pngBlob, 'image/png', rawName, index);
  } catch {
    return null;
  } finally {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Ignore cleanup error
    }
  }
}

function decodeBase64DataUrlToFile(
  dataUrl: string,
  index: number
): File | null {
  const match = dataUrl.match(
    /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/i
  );
  if (!match) return null;
  const mime = normalizeSupportedMime(match[1]);
  if (!mime) return null;

  try {
    const binaryStr = atob(match[2]);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });
    return ensureNamedClipboardImageFile(blob, mime, undefined, index);
  } catch {
    return null;
  }
}

/**
 * Builds an isolated internal clipboard snapshot of one or more PageLay objects,
 * including copies of all referenced original ImageAsset binary bytes.
 */
export function createPageLayClipboardPayload(
  objects: PageObject[],
  docAssets: Record<string, ImageAsset>,
  sourcePageId: string
): PageLayClipboardPayload {
  const clonedObjects = JSON.parse(JSON.stringify(objects)) as PageObject[];
  const referencedIds = collectReferencedAssetIdsFromObjects(clonedObjects);
  const isolatedAssets: Record<string, ImageAsset> = {};

  for (const assetId of referencedIds) {
    const asset = docAssets[assetId];
    if (!asset) continue;
    const bytesCopy = new Uint8Array(asset.originalBytes);
    isolatedAssets[assetId] = {
      ...asset,
      originalBytes: bytesCopy,
      fileSizeBytes: bytesCopy.byteLength,
    };
  }

  let plainTextSummary = '';
  if (clonedObjects.length === 1 && clonedObjects[0].type === 'text') {
    const textVal = clonedObjects[0].text.trim();
    plainTextSummary = textVal
      ? textVal.slice(0, 200)
      : `[PageLay: ${clonedObjects[0].name}]`;
  } else {
    const previewNames = clonedObjects
      .slice(0, 3)
      .map((o) => o.name)
      .join(', ');
    plainTextSummary = `[PageLay: ${clonedObjects.length} object${
      clonedObjects.length > 1 ? 's' : ''
    }${previewNames ? ` (${previewNames})` : ''}]`;
  }

  return {
    clipId: generateId('clip'),
    plainTextSummary,
    objects: clonedObjects,
    assets: isolatedAssets,
    sourcePageId,
    pasteCount: 0,
    wroteToSystemClipboard: false,
    copiedAtMs: Date.now(),
  };
}

/**
 * Resolves assets, generates fresh object IDs, and translates copied objects cleanly
 * for pasting into `targetDoc` as a single atomic Undo operation.
 */
export function prepareInternalPasteFromPayload(
  payload: PageLayClipboardPayload,
  targetDoc: PageLayDocument
): {
  pastedObjects: PageObject[];
  mergedAssets: Record<string, ImageAsset>;
  nextPasteCount: number;
} {
  const mergedAssets: Record<string, ImageAsset> = { ...targetDoc.assets };
  const assetIdMap = new Map<string, string>();
  const referencedIds = collectReferencedAssetIdsFromObjects(payload.objects);

  for (const sourceAssetId of referencedIds) {
    const clipAsset = payload.assets[sourceAssetId];
    if (!clipAsset) continue;

    const existing = mergedAssets[sourceAssetId];
    if (!existing) {
      const freshBytes = new Uint8Array(clipAsset.originalBytes);
      const blob = new Blob([freshBytes as unknown as BlobPart], {
        type: clipAsset.mimeType,
      });
      mergedAssets[sourceAssetId] = {
        ...clipAsset,
        originalBytes: freshBytes,
        objectUrl: URL.createObjectURL(blob),
        fileSizeBytes: freshBytes.byteLength,
      };
      assetIdMap.set(sourceAssetId, sourceAssetId);
    } else if (
      existing.fileSizeBytes === clipAsset.fileSizeBytes &&
      existing.mimeType === clipAsset.mimeType &&
      existing.widthPx === clipAsset.widthPx &&
      existing.heightPx === clipAsset.heightPx &&
      areUint8ArraysEqual(existing.originalBytes, clipAsset.originalBytes)
    ) {
      assetIdMap.set(sourceAssetId, sourceAssetId);
    } else {
      let newAssetId = generateId('asset');
      while (mergedAssets[newAssetId]) {
        newAssetId = generateId('asset');
      }
      const freshBytes = new Uint8Array(clipAsset.originalBytes);
      const blob = new Blob([freshBytes as unknown as BlobPart], {
        type: clipAsset.mimeType,
      });
      mergedAssets[newAssetId] = {
        ...clipAsset,
        id: newAssetId,
        originalBytes: freshBytes,
        objectUrl: URL.createObjectURL(blob),
        fileSizeBytes: freshBytes.byteLength,
      };
      assetIdMap.set(sourceAssetId, newAssetId);
    }
  }

  const nextPasteCount = payload.pasteCount + 1;
  const freshCopies = payload.objects.map((obj) => {
    const copy = cloneObjectWithNewIdsAndAssets(obj, assetIdMap);
    copy.name = copy.name.endsWith(' Copy') ? copy.name : `${copy.name} Copy`;
    return copy;
  });

  const bounds = getCombinedBoundsMm(freshCopies);
  const stepMm = Math.max(8, Math.round(targetDoc.widthMm * 0.015));
  let dx = stepMm * nextPasteCount;
  let dy = stepMm * nextPasteCount;

  // Keep relative spacing intact while ensuring pasted items land visibly on the target page
  if (bounds.widthMm <= targetDoc.widthMm) {
    if (bounds.xMm + dx + bounds.widthMm > targetDoc.widthMm) {
      const altDx = -stepMm * nextPasteCount;
      dx =
        bounds.xMm + altDx >= 0
          ? altDx
          : targetDoc.widthMm - bounds.widthMm - bounds.xMm;
    }
    if (bounds.xMm + dx < 0) {
      dx = -bounds.xMm;
    }
  } else {
    dx = (targetDoc.widthMm - bounds.widthMm) / 2 - bounds.xMm;
  }

  if (bounds.heightMm <= targetDoc.heightMm) {
    if (bounds.yMm + dy + bounds.heightMm > targetDoc.heightMm) {
      const altDy = -stepMm * nextPasteCount;
      dy =
        bounds.yMm + altDy >= 0
          ? altDy
          : targetDoc.heightMm - bounds.heightMm - bounds.yMm;
    }
    if (bounds.yMm + dy < 0) {
      dy = -bounds.yMm;
    }
  } else {
    dy = (targetDoc.heightMm - bounds.heightMm) / 2 - bounds.yMm;
  }

  const pastedObjects = freshCopies.map((obj) =>
    translatePageObjectMm(obj, dx, dy)
  );

  return {
    pastedObjects,
    mergedAssets,
    nextPasteCount,
  };
}

/**
 * Inspects a native browser ClipboardData object to decide between:
 * 1. System clipboard image(s) (highest priority — never overridden by stale PageLay clipboard)
 * 2. Active PageLay internal clipboard objects (when matching PageLay's copy marker or empty fallback)
 * 3. Unsupported clipboard content (non-destructive feedback)
 */
export async function inspectSystemClipboardForPaste(
  clipboardData: DataTransfer | null,
  activeInternalClip: PageLayClipboardPayload | null
): Promise<ClipboardInspectionResult> {
  if (!clipboardData) {
    return activeInternalClip
      ? { kind: 'pagelay-internal' }
      : { kind: 'empty' };
  }

  const extractedFiles: File[] = [];
  const rasterConvertCandidates: Array<{ blob: Blob; rawName?: string }> = [];
  let sawUnsupportedImageType: string | null = null;

  // 1. Gather binary image entries from clipboardData.items first, avoiding duplicates with .files
  const items = Array.from(clipboardData.items || []);
  for (const item of items) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (!file) continue;

    const supportedMime = normalizeSupportedMime(
      item.type || file.type,
      file.name
    );
    if (supportedMime) {
      extractedFiles.push(
        ensureNamedClipboardImageFile(
          file,
          supportedMime,
          file.name,
          extractedFiles.length
        )
      );
      continue;
    }

    const lowerType = (item.type || file.type || '').toLowerCase();
    if (lowerType === 'image/bmp' || lowerType === 'image/gif') {
      rasterConvertCandidates.push({ blob: file, rawName: file.name });
    } else if (lowerType.startsWith('image/')) {
      sawUnsupportedImageType = lowerType;
    }
  }

  // Fallback to clipboardData.files if items did not expose the files
  if (extractedFiles.length === 0 && rasterConvertCandidates.length === 0) {
    const files = Array.from(clipboardData.files || []);
    for (const file of files) {
      const supportedMime = normalizeSupportedMime(file.type, file.name);
      if (supportedMime) {
        extractedFiles.push(
          ensureNamedClipboardImageFile(
            file,
            supportedMime,
            file.name,
            extractedFiles.length
          )
        );
        continue;
      }
      const lowerType = (file.type || '').toLowerCase();
      if (lowerType === 'image/bmp' || lowerType === 'image/gif') {
        rasterConvertCandidates.push({ blob: file, rawName: file.name });
      } else if (lowerType.startsWith('image/')) {
        sawUnsupportedImageType = lowerType;
      }
    }
  }

  // Convert BMP/GIF clipboard images losslessly to PNG at original pixel resolution if present
  if (extractedFiles.length === 0 && rasterConvertCandidates.length > 0) {
    for (let i = 0; i < rasterConvertCandidates.length; i++) {
      const converted = await convertRasterBlobToPngFile(
        rasterConvertCandidates[i].blob,
        rasterConvertCandidates[i].rawName,
        i
      );
      if (converted) {
        extractedFiles.push(converted);
      }
    }
  }

  if (extractedFiles.length > 0) {
    return { kind: 'images', files: extractedFiles };
  }

  // 2. No direct image blob — check if clipboard carries PageLay's own active copy marker
  let customClipId = '';
  let htmlData = '';
  let plainData = '';
  try {
    customClipId = clipboardData.getData('application/x-pagelay-clip') || '';
  } catch {
    customClipId = '';
  }
  try {
    htmlData = clipboardData.getData('text/html') || '';
  } catch {
    htmlData = '';
  }
  try {
    plainData = clipboardData.getData('text/plain') || '';
  } catch {
    plainData = '';
  }

  if (activeInternalClip) {
    const matchesCustomMime =
      Boolean(customClipId) && customClipId === activeInternalClip.clipId;
    const matchesHtmlMarker =
      Boolean(htmlData) &&
      htmlData.includes(`data-pagelay-clip="${activeInternalClip.clipId}"`);
    const matchesPlainFallback =
      activeInternalClip.wroteToSystemClipboard &&
      !customClipId &&
      !htmlData &&
      plainData === activeInternalClip.plainTextSummary;

    if (matchesCustomMime || matchesHtmlMarker || matchesPlainFallback) {
      return { kind: 'pagelay-internal' };
    }
  }

  // 3. Check text/html for an embedded base64 data:image/... URI (without fetching external URLs)
  if (htmlData) {
    const dataUriMatches = Array.from(
      htmlData.matchAll(
        /src\s*=\s*["'](data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+)["']/gi
      )
    );
    const decodedFiles: File[] = [];
    for (let i = 0; i < dataUriMatches.length; i++) {
      const f = decodeBase64DataUrlToFile(dataUriMatches[i][1], i);
      if (f) decodedFiles.push(f);
    }
    if (decodedFiles.length > 0) {
      return { kind: 'images', files: decodedFiles };
    }
  }

  // Also allow local base64 image URI pasted as plain text
  if (
    plainData &&
    /^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(plainData.trim())
  ) {
    const f = decodeBase64DataUrlToFile(plainData.trim(), 0);
    if (f) {
      return { kind: 'images', files: [f] };
    }
  }

  // 4. Fallback if browser prevented writing to system clipboard on Ctrl+C and clipboard appears empty
  const hasAnyOtherContent =
    (clipboardData.files && clipboardData.files.length > 0) ||
    Boolean(plainData.trim()) ||
    Boolean(htmlData.trim());

  if (
    activeInternalClip &&
    !activeInternalClip.wroteToSystemClipboard &&
    !hasAnyOtherContent
  ) {
    return { kind: 'pagelay-internal' };
  }

  // 5. Explain unsupported clipboard contents non-destructively
  if (sawUnsupportedImageType) {
    return {
      kind: 'unsupported',
      reason: `Clipboard image format (${sawUnsupportedImageType}) is not supported. Copy a PNG, JPEG, or WebP image instead.`,
    };
  }

  if (clipboardData.files && clipboardData.files.length > 0) {
    return {
      kind: 'unsupported',
      reason:
        'The copied file is not a supported image (PNG, JPEG, or WebP). To open a .lay file, use Open or drag it onto the canvas.',
    };
  }

  if (htmlData && /<img[^>]+src\s*=\s*["']https?:/i.test(htmlData)) {
    return {
      kind: 'unsupported',
      reason:
        'The copied item contains only a web link without image data. Use "Copy image" or a screenshot instead.',
    };
  }

  if (hasAnyOtherContent || (clipboardData.types && clipboardData.types.length > 0)) {
    return {
      kind: 'unsupported',
      reason:
        'Clipboard contains text or unsupported data. PageLay supports pasting PNG, JPEG, or WebP images, or objects copied inside PageLay.',
    };
  }

  return { kind: 'empty' };
}
