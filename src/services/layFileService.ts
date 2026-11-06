/**
 * @license
 * SPDX-License-Identifier: MIT
 *
 * PageLay — Native ".lay" Document Packaging & Loading Service
 *
 * Native ".lay" format specification:
 * - Standard ZIP archive containing:
 *   - `manifest.json`: Document metadata, physical paper size in mm, pages, guidelines, objects, and asset table
 *   - `assets/<assetId>_<filename>`: Exact raw binary file bytes (Uint8Array) of each imported image.
 *     Original images are NEVER recompressed, resized, or altered.
 */

import JSZip from 'jszip';
import { ImageAsset, PageData, PageLayDocument, PaperFormat, Orientation } from '../model/documentTypes';

interface SerializedAssetMeta {
  id: string;
  filename: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  widthPx: number;
  heightPx: number;
  fileSizeBytes: number;
  zipPath: string;
}

interface LayManifestV1 {
  format: 'PageLay';
  schemaVersion: '1.0.0';
  id: string;
  name: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  paperSize: PaperFormat;
  orientation: Orientation;
  widthMm: number;
  heightMm: number;
  showGuides: boolean;
  lockGuides: boolean;
  snapToGuides: boolean;
  snapToPageEdges: boolean;
  snapToObjects?: boolean;
  angleSnapIncrementDeg?: number;
  precisionMode?: boolean;
  pages: PageData[];
  assets: SerializedAssetMeta[];
}

/**
 * Packages the authoritative PageLayDocument and all original untouched image bytes
 * into a downloadable `.lay` binary Blob.
 */
export async function serializeDocumentToLayBlob(doc: PageLayDocument): Promise<Blob> {
  const zip = new JSZip();
  const serializedAssets: SerializedAssetMeta[] = [];

  // Only include assets that are present in the document's asset table
  for (const asset of Object.values(doc.assets)) {
    const safeFilename = asset.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const zipPath = `assets/${asset.id}_${safeFilename}`;

    // Store raw original bytes without any alteration
    zip.file(zipPath, asset.originalBytes, { binary: true, compression: 'DEFLATE' });

    serializedAssets.push({
      id: asset.id,
      filename: asset.filename,
      mimeType: asset.mimeType,
      widthPx: asset.widthPx,
      heightPx: asset.heightPx,
      fileSizeBytes: asset.fileSizeBytes,
      zipPath,
    });
  }

  const manifest: LayManifestV1 = {
    format: 'PageLay',
    schemaVersion: '1.0.0',
    id: doc.id,
    name: doc.name,
    version: doc.version,
    createdAt: doc.createdAt,
    updatedAt: new Date().toISOString(),
    paperSize: doc.paperSize,
    orientation: doc.orientation,
    widthMm: doc.widthMm,
    heightMm: doc.heightMm,
    showGuides: doc.showGuides,
    lockGuides: doc.lockGuides,
    snapToGuides: doc.snapToGuides,
    snapToPageEdges: doc.snapToPageEdges,
    snapToObjects: doc.snapToObjects,
    angleSnapIncrementDeg: doc.angleSnapIncrementDeg,
    precisionMode: doc.precisionMode,
    pages: doc.pages,
    assets: serializedAssets,
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/octet-stream',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/**
 * Triggers a browser file download for a `.lay` document.
 */
export async function saveDocumentAsLayFile(doc: PageLayDocument): Promise<void> {
  const blob = await serializeDocumentToLayBlob(doc);
  const url = URL.createObjectURL(blob);
  const safeName = (doc.name || 'document').trim().replace(/\.lay$/i, '');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.lay`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Reads and validates a `.lay` file from a browser File or Blob,
 * restoring all original image bytes and editable objects.
 */
export async function loadDocumentFromLayFile(file: File | Blob): Promise<PageLayDocument> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('Invalid or corrupted .lay file: archive could not be unpacked.');
  }

  const manifestEntry = zip.file('manifest.json');
  if (!manifestEntry) {
    throw new Error('Invalid .lay file: missing manifest.json.');
  }

  let manifest: LayManifestV1;
  try {
    const manifestText = await manifestEntry.async('string');
    manifest = JSON.parse(manifestText) as LayManifestV1;
  } catch {
    throw new Error('Invalid .lay file: manifest.json contains malformed JSON.');
  }

  if (manifest.format !== 'PageLay' || !Array.isArray(manifest.pages)) {
    throw new Error('Unsupported .lay file: missing PageLay format header or pages list.');
  }

  const assetsRecord: Record<string, ImageAsset> = {};

  for (const meta of manifest.assets || []) {
    const assetEntry = zip.file(meta.zipPath);
    if (!assetEntry) {
      throw new Error(`Missing embedded image asset "${meta.filename}" in .lay file.`);
    }
    const originalBytes = await assetEntry.async('uint8array');
    const blob = new Blob([originalBytes as unknown as BlobPart], { type: meta.mimeType });
    const objectUrl = URL.createObjectURL(blob);

    assetsRecord[meta.id] = {
      id: meta.id,
      filename: meta.filename,
      mimeType: meta.mimeType,
      originalBytes,
      objectUrl,
      widthPx: meta.widthPx,
      heightPx: meta.heightPx,
      fileSizeBytes: originalBytes.byteLength,
    };
  }

  return {
    id: manifest.id || `doc_${Date.now()}`,
    name: manifest.name || 'Untitled Document',
    version: manifest.version || '1.0.0',
    createdAt: manifest.createdAt || new Date().toISOString(),
    updatedAt: manifest.updatedAt || new Date().toISOString(),
    paperSize: manifest.paperSize || 'A0',
    orientation: manifest.orientation || 'landscape',
    widthMm: Number(manifest.widthMm) || 1189,
    heightMm: Number(manifest.heightMm) || 841,
    showGuides: manifest.showGuides ?? true,
    lockGuides: manifest.lockGuides ?? false,
    snapToGuides: manifest.snapToGuides ?? true,
    snapToPageEdges: manifest.snapToPageEdges ?? true,
    snapToObjects: manifest.snapToObjects ?? true,
    angleSnapIncrementDeg:
      typeof manifest.angleSnapIncrementDeg === 'number' &&
      Number.isFinite(manifest.angleSnapIncrementDeg)
        ? Math.max(1, Math.min(45, Math.round(manifest.angleSnapIncrementDeg)))
        : 15,
    precisionMode: manifest.precisionMode ?? false,
    pages: manifest.pages,
    assets: assetsRecord,
  };
}

/**
 * Imports a user-selected image file (JPEG, PNG, WebP) into an untouched ImageAsset.
 */
export async function importImageFileToAsset(file: File): Promise<ImageAsset> {
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  let mimeType = file.type as 'image/jpeg' | 'image/png' | 'image/webp';
  if (!validTypes.includes(mimeType)) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
    else if (ext === 'png') mimeType = 'image/png';
    else if (ext === 'webp') mimeType = 'image/webp';
    else {
      throw new Error(`Unsupported image format "${file.name}". Please upload JPEG, PNG, or WebP.`);
    }
  }

  const arrayBuffer = await file.arrayBuffer();
  const originalBytes = new Uint8Array(arrayBuffer);
  const blob = new Blob([originalBytes as unknown as BlobPart], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);

  const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to decode image "${file.name}". The file may be corrupted.`));
    };
    img.src = objectUrl;
  });

  return {
    id: `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    filename: file.name,
    mimeType,
    originalBytes,
    objectUrl,
    widthPx: dimensions.width,
    heightPx: dimensions.height,
    fileSizeBytes: originalBytes.byteLength,
  };
}
