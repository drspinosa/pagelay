/**
 * @license
 * SPDX-License-Identifier: MIT
 *
 * PageLay — Authoritative Document Data Model
 * All physical coordinates, positions, and dimensions are stored in canonical millimetres (mm).
 */

export type PaperFormat = 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'Custom';
export type Orientation = 'portrait' | 'landscape';
export type LineStyle = 'solid' | 'dashed' | 'dotted';
export type ArrowEndStyle = 'end' | 'both' | 'start';
export type TextAlign = 'left' | 'center' | 'right';

export type ToolType =
  | 'select'
  | 'pan'
  | 'text'
  | 'line'
  | 'arrow'
  | 'dimension'
  | 'rectangle'
  | 'square'
  | 'ellipse'
  | 'circle'
  | 'triangle'
  | 'highlight';

export interface Guideline {
  id: string;
  orientation: 'horizontal' | 'vertical';
  /** Position in millimetres from top (horizontal) or left (vertical) page edge */
  positionMm: number;
}

/**
 * Preserves the exact original file bytes uploaded by the user.
 * Never downsampled, recompressed, or altered.
 */
export interface ImageAsset {
  id: string;
  filename: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  originalBytes: Uint8Array;
  /** Object URL created from originalBytes for display and canvas rendering */
  objectUrl: string;
  /** Original pixel dimensions */
  widthPx: number;
  heightPx: number;
  fileSizeBytes: number;
}

export interface BaseObject {
  id: string;
  name: string;
  /** X position of bounding box top-left in mm relative to page top-left (pre-rotation) */
  xMm: number;
  /** Y position of bounding box top-left in mm relative to page top-left (pre-rotation) */
  yMm: number;
  /** Width in mm */
  widthMm: number;
  /** Height in mm */
  heightMm: number;
  /** Clockwise rotation in degrees around the object's center */
  rotationDeg: number;
  /** Opacity from 0.0 to 1.0 */
  opacity: number;
  locked?: boolean;
}

export interface CropRect {
  /** Normalized 0..1 offset from left of original image */
  x: number;
  /** Normalized 0..1 offset from top of original image */
  y: number;
  /** Normalized 0..1 fraction of original width */
  width: number;
  /** Normalized 0..1 fraction of original height */
  height: number;
}

export interface ImageObject extends BaseObject {
  type: 'image';
  assetId: string;
  preserveAspectRatio: boolean;
  /** Non-destructive crop parameters relative to the original asset */
  crop: CropRect;
  strokeColor: string;
  strokeWidthMm: number;
}

export interface TextObject extends BaseObject {
  type: 'text';
  text: string;
  fontFamily: string;
  /** Font size in typographic points (1 pt = 1/72 inch ≈ 0.3528 mm) */
  fontSizePt: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  underline: boolean;
  color: string;
  align: TextAlign;
  fillColor: string; // 'transparent' or hex
  strokeColor: string; // 'transparent' or hex
  strokeWidthMm: number;
  paddingMm: number;
}

export interface LineObject extends BaseObject {
  type: 'line';
  /** Start point X in mm on page */
  x1Mm: number;
  /** Start point Y in mm on page */
  y1Mm: number;
  /** End point X in mm on page */
  x2Mm: number;
  /** End point Y in mm on page */
  y2Mm: number;
  strokeColor: string;
  strokeWidthMm: number;
  lineStyle: LineStyle;
}

export interface ArrowObject extends BaseObject {
  type: 'arrow';
  x1Mm: number;
  y1Mm: number;
  x2Mm: number;
  y2Mm: number;
  strokeColor: string;
  strokeWidthMm: number;
  lineStyle: LineStyle;
  arrowEnds: ArrowEndStyle;
  headSizeMm: number;
  /** Optional inline technical callout text (e.g., "POWER", "320 mm") */
  label?: string;
}

export interface DimensionObject extends BaseObject {
  type: 'dimension';
  x1Mm: number;
  y1Mm: number;
  x2Mm: number;
  y2Mm: number;
  strokeColor: string;
  strokeWidthMm: number;
  headSizeMm: number;
  /** Custom label override; if empty, displays calculated physical distance in mm */
  customLabel: string;
  fontSizePt: number;
  extensionHeightMm: number;
}

export interface ShapeObject extends BaseObject {
  type: 'rectangle' | 'square' | 'ellipse' | 'circle' | 'triangle' | 'highlight';
  fillColor: string;
  strokeColor: string;
  strokeWidthMm: number;
  lineStyle: LineStyle;
}

export interface GroupObject extends BaseObject {
  type: 'group';
  /** Child objects combined into this group, stored in canonical page millimetres (mm) */
  children: PageObject[];
}

export type PageObject =
  | ImageObject
  | TextObject
  | LineObject
  | ArrowObject
  | DimensionObject
  | ShapeObject
  | GroupObject;

export interface PageData {
  id: string;
  name: string;
  guidelines: Guideline[];
  objects: PageObject[];
}

export interface PageLayDocument {
  id: string;
  name: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  paperSize: PaperFormat;
  orientation: Orientation;
  /** Canonical physical page width in millimetres */
  widthMm: number;
  /** Canonical physical page height in millimetres */
  heightMm: number;
  showGuides: boolean;
  lockGuides: boolean;
  snapToGuides: boolean;
  snapToPageEdges: boolean;
  snapToObjects: boolean;
  pages: PageData[];
  assets: Record<string, ImageAsset>;
}

export interface FontDefinition {
  id: string;
  label: string;
  cssFamily: string;
  /** True if guaranteed embeddable in PDF without substitution via StandardFonts */
  pdfGuaranteed: boolean;
  /** Standard PDF replacement family if pdfGuaranteed is false */
  pdfFallback: 'Helvetica' | 'Times-Roman' | 'Courier';
  category: 'Sans-Serif' | 'Serif' | 'Monospace';
}

export const AVAILABLE_FONTS: FontDefinition[] = [
  {
    id: 'Helvetica',
    label: 'Helvetica / Sans (PDF Standard)',
    cssFamily: 'Helvetica, Arial, "Public Sans", sans-serif',
    pdfGuaranteed: true,
    pdfFallback: 'Helvetica',
    category: 'Sans-Serif',
  },
  {
    id: 'Times-Roman',
    label: 'Times Roman / Serif (PDF Standard)',
    cssFamily: '"Times New Roman", "Source Serif 4", Times, serif',
    pdfGuaranteed: true,
    pdfFallback: 'Times-Roman',
    category: 'Serif',
  },
  {
    id: 'Courier',
    label: 'Courier / Mono (PDF Standard)',
    cssFamily: '"Courier New", "IBM Plex Mono", Courier, monospace',
    pdfGuaranteed: true,
    pdfFallback: 'Courier',
    category: 'Monospace',
  },
  {
    id: 'Arial',
    label: 'Arial (System Font)',
    cssFamily: 'Arial, sans-serif',
    pdfGuaranteed: false,
    pdfFallback: 'Helvetica',
    category: 'Sans-Serif',
  },
  {
    id: 'Verdana',
    label: 'Verdana (System Font)',
    cssFamily: 'Verdana, Geneva, sans-serif',
    pdfGuaranteed: false,
    pdfFallback: 'Helvetica',
    category: 'Sans-Serif',
  },
  {
    id: 'Trebuchet MS',
    label: 'Trebuchet MS (System Font)',
    cssFamily: '"Trebuchet MS", sans-serif',
    pdfGuaranteed: false,
    pdfFallback: 'Helvetica',
    category: 'Sans-Serif',
  },
  {
    id: 'Georgia',
    label: 'Georgia (System Font)',
    cssFamily: 'Georgia, serif',
    pdfGuaranteed: false,
    pdfFallback: 'Times-Roman',
    category: 'Serif',
  },
  {
    id: 'Impact',
    label: 'Impact (System Font)',
    cssFamily: 'Impact, Charcoal, sans-serif',
    pdfGuaranteed: false,
    pdfFallback: 'Helvetica',
    category: 'Sans-Serif',
  },
];

export const HIGHLIGHT_PRESETS = [
  { name: 'Yellow', color: '#FACC15', opacity: 0.38 },
  { name: 'Red', color: '#EF4444', opacity: 0.32 },
  { name: 'Green', color: '#22C55E', opacity: 0.32 },
  { name: 'Blue', color: '#3B82F6', opacity: 0.32 },
];
