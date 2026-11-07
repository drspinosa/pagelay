/**
 * @license
 * SPDX-License-Identifier: MIT
 *
 * PageLay — Native ".lay" Document Packaging, File System Access API & Loading Service
 *
 * Native ".lay" format specification:
 * - Standard ZIP archive containing:
 *   - `manifest.json`: Document metadata, physical paper size in mm, pages, guidelines, objects, and asset table
 *   - `assets/<assetId>_<filename>`: Exact raw binary file bytes (Uint8Array) of each imported image.
 *     Original images are NEVER recompressed, resized, or altered.
 */

import JSZip from 'jszip';
import {
  ImageAsset,
  PageData,
  PageLayDocument,
  PageObject,
  PaperFormat,
  Orientation,
} from '../model/documentTypes';
import { syncFreehandBoundingBox } from '../utils/units';

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
 * Runtime-only File System Access API handle interfaces.
 * Kept strictly in application runtime state and never serialized into `.lay` files.
 */
export interface LayFileWritableStream {
  write: (data: Blob | BufferSource | string) => Promise<void>;
  close: () => Promise<void>;
}

export interface LayFileSystemHandle {
  readonly kind?: 'file';
  readonly name: string;
  getFile?: () => Promise<File>;
  createWritable: () => Promise<LayFileWritableStream>;
  queryPermission?: (descriptor?: {
    mode?: 'read' | 'readwrite';
  }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: {
    mode?: 'read' | 'readwrite';
  }) => Promise<PermissionState>;
}

type NativeSaveFilePicker = (options?: {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<LayFileSystemHandle>;

type NativeOpenFilePicker = (options?: {
  multiple?: boolean;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<LayFileSystemHandle[]>;

const LAY_FILE_PICKER_TYPES = [
  {
    description: 'PageLay Document (.lay)',
    accept: {
      'application/octet-stream': ['.lay'],
      'application/zip': ['.lay'],
    },
  },
];

/**
 * Packages the authoritative PageLayDocument and all original untouched image bytes
 * into a downloadable `.lay` binary Blob.
 */
export async function serializeDocumentToLayBlob(
  doc: PageLayDocument
): Promise<Blob> {
  const zip = new JSZip();
  const serializedAssets: SerializedAssetMeta[] = [];

  // Only include assets that are present in the document's asset table
  for (const asset of Object.values(doc.assets)) {
    const safeFilename = asset.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const zipPath = `assets/${asset.id}_${safeFilename}`;

    // Store raw original bytes without any alteration
    zip.file(zipPath, asset.originalBytes, {
      binary: true,
      compression: 'DEFLATE',
    });

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

export interface SaveLayResult {
  status:
    | 'saved-native'
    | 'download-initiated'
    | 'cancelled'
    | 'needs-fallback-modal'
    | 'permission-denied';
  documentName: string;
  filename: string;
  fileHandle: LayFileSystemHandle | null;
}

export interface OpenLayPickerResult {
  status: 'opened' | 'cancelled' | 'unsupported';
  doc?: PageLayDocument;
  fileHandle?: LayFileSystemHandle | null;
}

/**
 * Normalizes a user-entered or file-derived document name by stripping any trailing `.lay` extension.
 */
export function normalizeDocumentName(rawName: string): string {
  const cleaned = (rawName || '')
    .trim()
    .replace(/\.lay$/i, '')
    .trim();
  return cleaned || 'Untitled Document';
}

function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  return (err as { name?: string })?.name === 'AbortError';
}

/**
 * Verifies or requests readwrite permission on an existing FileSystemFileHandle.
 */
export async function ensureReadWritePermission(
  handle: LayFileSystemHandle
): Promise<boolean> {
  try {
    if (typeof handle.queryPermission === 'function') {
      const current = await handle.queryPermission({ mode: 'readwrite' });
      if (current === 'granted') return true;
    }
    if (typeof handle.requestPermission === 'function') {
      const requested = await handle.requestPermission({ mode: 'readwrite' });
      return requested === 'granted';
    }
    // If the browser handle implementation omits queryPermission/requestPermission,
    // allow createWritable() to perform the permission check.
    return true;
  } catch {
    return false;
  }
}

/**
 * Overwrites an existing `FileSystemFileHandle` in place using `createWritable()`, `write()`, and `close()`.
 */
export async function writeDocumentToFileHandle(
  doc: PageLayDocument,
  handle: LayFileSystemHandle,
  syncNameFromHandle: boolean
): Promise<SaveLayResult> {
  const hasPermission = await ensureReadWritePermission(handle);
  if (!hasPermission) {
    return {
      status: 'permission-denied',
      documentName: doc.name,
      filename: handle.name || `${normalizeDocumentName(doc.name)}.lay`,
      fileHandle: handle,
    };
  }

  const handleName = handle.name ? handle.name.trim() : '';
  const finalDocName = syncNameFromHandle
    ? normalizeDocumentName(handleName || doc.name)
    : normalizeDocumentName(doc.name || handleName);
  const finalFilename =
    handleName && /\.lay$/i.test(handleName)
      ? handleName
      : `${finalDocName}.lay`;

  const updatedDoc: PageLayDocument = {
    ...doc,
    name: finalDocName,
    updatedAt: new Date().toISOString(),
  };

  const blob = await serializeDocumentToLayBlob(updatedDoc);
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();

  return {
    status: 'saved-native',
    documentName: finalDocName,
    filename: finalFilename,
    fileHandle: handle,
  };
}

/**
 * Prompts the user with the native OS Save As file picker (`showSaveFilePicker`) if supported and permitted.
 */
async function promptNativeSaveFilePicker(
  suggestedDocName: string
): Promise<
  | { kind: 'picked'; handle: LayFileSystemHandle }
  | { kind: 'cancelled' }
  | { kind: 'unsupported' }
> {
  const picker =
    typeof window !== 'undefined'
      ? (window as unknown as { showSaveFilePicker?: NativeSaveFilePicker })
          .showSaveFilePicker
      : undefined;

  if (typeof picker !== 'function') {
    return { kind: 'unsupported' };
  }

  const cleanSuggested = normalizeDocumentName(suggestedDocName);
  try {
    const handle = await picker({
      suggestedName: `${cleanSuggested}.lay`,
      types: LAY_FILE_PICKER_TYPES,
    });
    return { kind: 'picked', handle };
  } catch (err) {
    if (isAbortError(err)) {
      return { kind: 'cancelled' };
    }
    // SecurityError or cross-origin iframe restriction
    return { kind: 'unsupported' };
  }
}

/**
 * Standard **Save** (`Ctrl/Cmd+S`) workflow:
 * 1. If `existingHandle` is present, writes directly to that file handle with `createWritable()`,
 *    `write()`, and `close()` without opening a Save As dialog or creating duplicate downloads.
 * 2. If `existingHandle` is null (document has never been saved or was opened without a writable handle),
 *    prompts the user via `showSaveFilePicker` once, writes the file, and returns the new handle.
 * 3. If native file handles are unsupported/blocked in the current browser environment,
 *    returns `status: 'needs-fallback-modal'` so the application can present the fallback Save dialog.
 */
export async function saveDocumentToExistingOrNewHandle(
  doc: PageLayDocument,
  existingHandle: LayFileSystemHandle | null
): Promise<SaveLayResult> {
  if (existingHandle) {
    try {
      return await writeDocumentToFileHandle(doc, existingHandle, false);
    } catch (err) {
      if (isAbortError(err)) {
        return {
          status: 'cancelled',
          documentName: doc.name,
          filename: existingHandle.name,
          fileHandle: existingHandle,
        };
      }
      throw err;
    }
  }

  const picked = await promptNativeSaveFilePicker(doc.name);
  if (picked.kind === 'cancelled') {
    return {
      status: 'cancelled',
      documentName: doc.name,
      filename: '',
      fileHandle: null,
    };
  }
  if (picked.kind === 'picked') {
    return await writeDocumentToFileHandle(doc, picked.handle, true);
  }

  return {
    status: 'needs-fallback-modal',
    documentName: doc.name,
    filename: '',
    fileHandle: null,
  };
}

/**
 * **Save As...** (`Ctrl/Cmd+Shift+S`) workflow:
 * - Always prompts the user to choose a new filename or location.
 * - When `showSaveFilePicker` is supported and permitted, opens the native Save As dialog directly,
 *   writes the file, updates the internal `.lay` manifest name, and returns the new `fileHandle`.
 * - If cancelled, preserves `previousHandle` and returns `status: 'cancelled'`.
 * - When native file handles are unavailable/blocked, returns `status: 'needs-fallback-modal'` so
 *   the application can open its filename modal for the browser download fallback.
 */
export async function saveDocumentAsWithNativePicker(
  doc: PageLayDocument,
  previousHandle: LayFileSystemHandle | null
): Promise<SaveLayResult> {
  const picked = await promptNativeSaveFilePicker(doc.name);
  if (picked.kind === 'cancelled') {
    return {
      status: 'cancelled',
      documentName: doc.name,
      filename: previousHandle?.name || '',
      fileHandle: previousHandle,
    };
  }
  if (picked.kind === 'picked') {
    return await writeDocumentToFileHandle(doc, picked.handle, true);
  }

  return {
    status: 'needs-fallback-modal',
    documentName: doc.name,
    filename: previousHandle?.name || '',
    fileHandle: previousHandle,
  };
}

/**
 * Triggers a browser file download fallback for environments where the File System Access API
 * is unavailable or blocked. Does NOT claim to overwrite an existing disk file.
 */
export async function saveDocumentAsLayFile(
  doc: PageLayDocument,
  overrideName?: string
): Promise<SaveLayResult> {
  const finalDocName = normalizeDocumentName(overrideName ?? doc.name);
  const docToSave: PageLayDocument =
    finalDocName === doc.name ? doc : { ...doc, name: finalDocName };
  const blob = await serializeDocumentToLayBlob(docToSave);
  const url = URL.createObjectURL(blob);
  const filename = `${finalDocName}.lay`;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return {
    status: 'download-initiated',
    documentName: finalDocName,
    filename,
    fileHandle: null,
  };
}

/**
 * Used when the user submits the fallback `SaveAsModal`:
 * Attempts `showSaveFilePicker` with the user-entered `requestedName` first (in case the browser
 * supports it from the modal submit gesture), and otherwise initiates a browser download.
 */
export async function saveDocumentAsLayFileWithPicker(
  doc: PageLayDocument,
  requestedName: string,
  previousHandle: LayFileSystemHandle | null = null
): Promise<SaveLayResult> {
  const cleanRequestedName = normalizeDocumentName(requestedName);
  const picked = await promptNativeSaveFilePicker(cleanRequestedName);
  if (picked.kind === 'cancelled') {
    return {
      status: 'cancelled',
      documentName: doc.name,
      filename: previousHandle?.name || '',
      fileHandle: previousHandle,
    };
  }
  if (picked.kind === 'picked') {
    const docWithRequested: PageLayDocument = {
      ...doc,
      name: cleanRequestedName,
    };
    return await writeDocumentToFileHandle(
      docWithRequested,
      picked.handle,
      true
    );
  }

  return await saveDocumentAsLayFile(doc, cleanRequestedName);
}

/**
 * Opens an existing `.lay` document using `showOpenFilePicker()` where supported and permitted,
 * retaining the `FileSystemFileHandle` so subsequent Save operations overwrite the opened file directly.
 * Returns `{ status: 'unsupported' }` if the browser does not support `showOpenFilePicker` or blocks it,
 * allowing the caller to fall back to `<input type="file">`.
 */
export async function openDocumentWithNativePicker(): Promise<OpenLayPickerResult> {
  const picker =
    typeof window !== 'undefined'
      ? (window as unknown as { showOpenFilePicker?: NativeOpenFilePicker })
          .showOpenFilePicker
      : undefined;

  if (typeof picker !== 'function') {
    return { status: 'unsupported' };
  }

  let handles: LayFileSystemHandle[];
  try {
    handles = await picker({
      multiple: false,
      types: LAY_FILE_PICKER_TYPES,
    });
  } catch (err) {
    if (isAbortError(err)) {
      return { status: 'cancelled' };
    }
    // SecurityError (e.g. cross-origin iframe) or unsupported environment
    return { status: 'unsupported' };
  }

  const handle = handles?.[0];
  if (!handle || typeof handle.getFile !== 'function') {
    return { status: 'cancelled' };
  }

  const file = await handle.getFile();
  const doc = await loadDocumentFromLayFile(file);
  return {
    status: 'opened',
    doc,
    fileHandle: handle,
  };
}

function sanitizeLoadedPageObjects(objects: PageObject[]): PageObject[] {
  if (!Array.isArray(objects)) return [];
  const sanitized: PageObject[] = [];

  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue;

    if (obj.type === 'group') {
      sanitized.push({
        ...obj,
        children: sanitizeLoadedPageObjects(obj.children || []),
      });
      continue;
    }

    if (obj.type === 'freehand') {
      const rawPoints = Array.isArray(obj.pointsMm) ? obj.pointsMm : [];
      const validPoints = rawPoints
        .filter(
          (pt) =>
            pt &&
            typeof pt.xMm === 'number' &&
            Number.isFinite(pt.xMm) &&
            typeof pt.yMm === 'number' &&
            Number.isFinite(pt.yMm)
        )
        .map((pt) => ({ xMm: pt.xMm, yMm: pt.yMm }));

      if (validPoints.length === 0) continue;

      const strokeTool = obj.strokeTool === 'highlighter' ? 'highlighter' : 'pen';
      const defaultWidth = strokeTool === 'highlighter' ? 6 : 0.8;
      const defaultOpacity = strokeTool === 'highlighter' ? 0.38 : 1;

      sanitized.push(
        syncFreehandBoundingBox({
          ...obj,
          type: 'freehand',
          strokeTool,
          pointsMm: validPoints,
          strokeColor:
            typeof obj.strokeColor === 'string' && obj.strokeColor.trim()
              ? obj.strokeColor
              : strokeTool === 'highlighter'
              ? '#FACC15'
              : '#0F172A',
          strokeWidthMm:
            typeof obj.strokeWidthMm === 'number' && Number.isFinite(obj.strokeWidthMm)
              ? Math.max(0.2, obj.strokeWidthMm)
              : defaultWidth,
          opacity:
            typeof obj.opacity === 'number' && Number.isFinite(obj.opacity)
              ? Math.max(0.05, Math.min(1, obj.opacity))
              : defaultOpacity,
          rotationDeg:
            typeof obj.rotationDeg === 'number' && Number.isFinite(obj.rotationDeg)
              ? obj.rotationDeg
              : 0,
        })
      );
      continue;
    }

    sanitized.push(obj);
  }

  return sanitized;
}

/**
 * Reads and validates a `.lay` file from a browser File or Blob,
 * restoring all original image bytes and editable objects.
 * If the opened File's actual filename differs from the internal manifest name,
 * adopts the file's base name so the user never continues working under a stale name.
 */
export async function loadDocumentFromLayFile(
  file: File | Blob
): Promise<PageLayDocument> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error(
      'Invalid or corrupted .lay file: archive could not be unpacked.'
    );
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
    throw new Error(
      'Invalid .lay file: manifest.json contains malformed JSON.'
    );
  }

  if (manifest.format !== 'PageLay' || !Array.isArray(manifest.pages)) {
    throw new Error(
      'Unsupported .lay file: missing PageLay format header or pages list.'
    );
  }

  const assetsRecord: Record<string, ImageAsset> = {};

  for (const meta of manifest.assets || []) {
    const assetEntry = zip.file(meta.zipPath);
    if (!assetEntry) {
      throw new Error(
        `Missing embedded image asset "${meta.filename}" in .lay file.`
      );
    }
    const originalBytes = await assetEntry.async('uint8array');
    const blob = new Blob([originalBytes as unknown as BlobPart], {
      type: meta.mimeType,
    });
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

  const fileBaseName =
    file instanceof File && file.name ? normalizeDocumentName(file.name) : '';
  const manifestName = manifest.name ? normalizeDocumentName(manifest.name) : '';
  const resolvedDocName = fileBaseName || manifestName || 'Untitled Document';

  const normalizedPages: PageData[] = manifest.pages.map((p, index) => ({
    ...p,
    id: p.id || `page_${index + 1}`,
    name: p.name || `Page ${index + 1}`,
    guidelines: Array.isArray(p.guidelines) ? p.guidelines : [],
    objects: sanitizeLoadedPageObjects(p.objects || []),
  }));

  return {
    id: manifest.id || `doc_${Date.now()}`,
    name: resolvedDocName,
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
    pages: normalizedPages,
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
      throw new Error(
        `Unsupported image format "${file.name}". Please upload JPEG, PNG, or WebP.`
      );
    }
  }

  const arrayBuffer = await file.arrayBuffer();
  const originalBytes = new Uint8Array(arrayBuffer);
  const blob = new Blob([originalBytes as unknown as BlobPart], {
    type: mimeType,
  });
  const objectUrl = URL.createObjectURL(blob);

  const dimensions = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => {
      const img = new Image();
      img.onload = () =>
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(
          new Error(
            `Failed to decode image "${file.name}". The file may be corrupted.`
          )
        );
      };
      img.src = objectUrl;
    }
  );

  return {
    id: `asset_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 7)}`,
    filename: file.name,
    mimeType,
    originalBytes,
    objectUrl,
    widthPx: dimensions.width,
    heightPx: dimensions.height,
    fileSizeBytes: originalBytes.byteLength,
  };
}
