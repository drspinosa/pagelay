/**
 * @license
 * SPDX-License-Identifier: MIT
 *
 * PageLay — Integrated Help & How To Manual (Version 1)
 *
 * Read-only local reference manual organised into 10 practical sections.
 * Written in British English and strictly aligned with PageLay's implemented features.
 */

export type HelpSectionId =
  | 'getting-started'
  | 'pages-and-layout'
  | 'drawing-tools'
  | 'precision-and-snapping'
  | 'images-and-objects'
  | 'opening-and-saving'
  | 'recovery-and-undo'
  | 'exporting'
  | 'mobile-and-keyboard-controls'
  | 'troubleshooting';

/**
 * Optional structure prepared for future annotated screenshots or small SVG diagrams.
 * Not populated in Version 1 so no invented or placeholder images are rendered.
 */
export interface HelpArticleIllustration {
  id: string;
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
}

export interface HelpShortcutItem {
  keys: string;
  action: string;
}

export interface HelpCalloutNote {
  type: 'tip' | 'important' | 'note';
  title?: string;
  text: string;
}

export interface HelpArticle {
  id: string;
  sectionId: HelpSectionId;
  title: string;
  summary: string;
  keywords: string[];
  paragraphs?: string[];
  steps?: string[];
  bullets?: string[];
  shortcuts?: HelpShortcutItem[];
  callouts?: HelpCalloutNote[];
  /** Optional future screenshot/illustration slots (unpopulated in Version 1) */
  illustrations?: HelpArticleIllustration[];
}

export interface HelpSection {
  id: HelpSectionId;
  number: number;
  title: string;
  description: string;
  articles: HelpArticle[];
}

export const HELP_SECTIONS: ReadonlyArray<HelpSection> = [
  // ============================================================================
  // 1. GETTING STARTED
  // ============================================================================
  {
    id: 'getting-started',
    number: 1,
    title: 'Getting Started',
    description:
      'Workspace overview, creating documents, ISO paper sizes, custom dimensions and page orientation.',
    articles: [
      {
        id: 'workspace-overview',
        sectionId: 'getting-started',
        title: 'Workspace Overview',
        summary:
          'Understand the five main areas of the PageLay editor on desktop and mobile.',
        keywords: [
          'workspace',
          'overview',
          'interface',
          'toolbar',
          'ribbon',
          'sidebar',
          'properties',
          'status bar',
          'canvas',
        ],
        paragraphs: [
          'PageLay is a client-side page layout editor that measures every page, object and guideline in physical millimetres (mm). Everything runs locally in your browser.',
        ],
        bullets: [
          'Top Application Bar (Row 1): Toggle the Pages sidebar, rename your document, create/open/save .lay files, undo or redo changes, open Properties or Help, and export PDF or PNG/JPG files.',
          'Drawing Tools Ribbon (Row 2): Select tools for editing, panning, importing images, adding text, drawing technical lines/arrows/dimensions, sketching with Pen or Highlighter, erasing strokes, placing shapes, and configuring Guides & Snap.',
          'Pages Sidebar (Left): View live page thumbnails, switch pages, add, duplicate, reorder or delete pages, and import pages from another .lay file.',
          'Central Canvas & Millimetre Rulers: Interactive page workspace with dynamic top and left millimetre rulers and floating zoom controls.',
          'Properties / Help Panel (Right) & Status Bar (Bottom): Inspect exact millimetre coordinates and object settings on the right, and monitor live cursor coordinates, paper dimensions, save status and zoom along the bottom.',
        ],
        callouts: [
          {
            type: 'tip',
            title: 'Only one right-hand panel opens at a time',
            text: 'On desktop and laptop screens, switching between Properties and Help automatically replaces the right-hand panel so your central canvas keeps maximum space.',
          },
        ],
      },
      {
        id: 'creating-documents-and-sample',
        sectionId: 'getting-started',
        title: 'Creating a New Document or Loading Sample A0',
        summary:
          'Start a blank layout or explore the built-in Sample A0 exhibition stand layout.',
        keywords: [
          'new document',
          'blank',
          'create',
          'sample a0',
          'exhibition',
          'start',
          'rename',
        ],
        steps: [
          'Click New in the top toolbar (or open File -> New Document... on mobile).',
          'If your current document has unsaved changes, choose Save, Don’t Save or Cancel first.',
          'Enter a document name in the New Document dialogue.',
          'Select a paper size (A0, A1, A2, A3, A4 or Custom) and choose Landscape or Portrait orientation.',
          'Click Create Blank Document to initialise the page and automatically fit it to your screen.',
        ],
        bullets: [
          'To explore a ready-made multi-object board, click Sample A0 in the top toolbar (or inside the File menu / New Document dialogue).',
          'You can rename the active document at any time using the document name box in the top toolbar.',
        ],
      },
      {
        id: 'paper-sizes-and-orientation',
        sectionId: 'getting-started',
        title: 'Paper Sizes, Custom Dimensions and Orientation',
        summary:
          'Configure ISO A0–A4 formats or enter custom width and height in millimetres.',
        keywords: [
          'paper size',
          'a0',
          'a1',
          'a2',
          'a3',
          'a4',
          'custom size',
          'orientation',
          'landscape',
          'portrait',
          'millimetres',
          'width',
          'height',
        ],
        paragraphs: [
          'PageLay uses physical ISO A-series dimensions by default and supports custom board sizes from 20 mm up to 5000 mm.',
        ],
        bullets: [
          'A0: 1189 × 841 mm (default exhibition board size)',
          'A1: 841 × 594 mm',
          'A2: 594 × 420 mm',
          'A3: 420 × 297 mm',
          'A4: 297 × 210 mm',
          'Custom: Any user-defined width and height between 20 mm and 5000 mm.',
        ],
        steps: [
          'To change the paper size of an existing document, deselect all objects (click empty space around the page or press Escape).',
          'Open the Properties panel on the right to view Document & Page Setup.',
          'Choose a new ISO format or switch between Landscape and Portrait.',
          'To set a custom size, type the exact Width (mm) and Height (mm) and press Enter.',
        ],
      },
    ],
  },

  // ============================================================================
  // 2. PAGES AND LAYOUT
  // ============================================================================
  {
    id: 'pages-and-layout',
    number: 2,
    title: 'Pages and Layout',
    description:
      'Managing multi-page documents, importing pages from .lay files, and working with millimetre rulers and guidelines.',
    articles: [
      {
        id: 'managing-pages',
        sectionId: 'pages-and-layout',
        title: 'Adding, Duplicating, Rearranging and Deleting Pages',
        summary:
          'Organise multi-page documents using the left-hand Pages sidebar.',
        keywords: [
          'pages',
          'add page',
          'duplicate page',
          'delete page',
          'reorder',
          'move page',
          'thumbnails',
          'sidebar',
        ],
        steps: [
          'Click the Pages button at the top-left of the toolbar if the Pages sidebar is hidden.',
          'Click + Add in the Pages header (or + Add Blank Page at the bottom of the list) to append a new blank page.',
          'Hover or tap a page card and use the Duplicate icon to clone that page, including all its objects and guidelines.',
          'Use the Up and Down arrows on a page card to change the page order.',
          'Use the Trash icon on a page card to delete that page (a document must always keep at least one page).',
        ],
        callouts: [
          {
            type: 'note',
            text: 'All page additions, duplications, moves and deletions are recorded in Undo/Redo history.',
          },
        ],
      },
      {
        id: 'importing-pages-from-lay',
        sectionId: 'pages-and-layout',
        title: 'Importing Pages from Another .lay File',
        summary:
          'Append pages and their original images from an existing .lay document into your current document.',
        keywords: [
          'import pages',
          'merge',
          'append pages',
          'drag and drop',
          'sidebar drop',
          'lay file',
        ],
        paragraphs: [
          'You can combine pages from another PageLay (.lay) file into your current document without replacing the pages you are already working on.',
        ],
        steps: [
          'Open the Pages sidebar on the left.',
          'Click the Import button in the Pages sidebar header and choose a .lay file — or drag and drop a .lay file directly onto the Pages sidebar.',
          'PageLay checks that the physical paper width and height (in mm) match your current document, then appends all pages and their original image assets at the end of your document.',
        ],
        callouts: [
          {
            type: 'important',
            title: 'Canvas drop vs Pages sidebar drop',
            text: 'Dropping a .lay file onto the main canvas opens that file as a replacement document (after checking for unsaved changes). Dropping a .lay file onto the Pages sidebar imports its pages into your current document.',
          },
        ],
      },
      {
        id: 'rulers-and-guidelines',
        sectionId: 'pages-and-layout',
        title: 'Millimetre Rulers and Non-Printing Guidelines',
        summary:
          'Place horizontal and vertical cyan guidelines from the rulers or by typing exact millimetre coordinates.',
        keywords: [
          'rulers',
          'guidelines',
          'guides',
          'margins',
          'cyan lines',
          'coordinates',
          'lock guides',
          'show guides',
          'clear guides',
        ],
        steps: [
          'Drag downwards from the top horizontal ruler to create a horizontal (Y) guideline, or drag rightwards from the left vertical ruler to create a vertical (X) guideline.',
          'Hold Shift while dragging a guideline (or enable Precision Mode) to snap its movement to exact 1 mm whole-millimetre steps.',
          'To type an exact coordinate, deselect all objects and open Properties -> Page Guidelines, or click an existing guideline on the canvas and edit its X or Y value in mm.',
          'Click + 20mm Margins or + 40mm Margins in Properties -> Page Guidelines to add four perimeter margin guides in one click.',
          'Use the Guides & Snap menu in the drawing ribbon to Show/Hide Guidelines, Lock Guidelines against accidental movement, or Clear Page Guidelines.',
        ],
        callouts: [
          {
            type: 'note',
            text: 'Guidelines are non-printing layout aids. They never appear in exported PDF, PNG or JPG files.',
          },
        ],
      },
    ],
  },

  // ============================================================================
  // 3. DRAWING TOOLS
  // ============================================================================
  {
    id: 'drawing-tools',
    number: 3,
    title: 'Drawing Tools',
    description:
      'Using Select, Slide/Pan, Text, Lines, Arrows, Dimensions, Pen, Highlighter, Eraser, Shapes and Area Highlights.',
    articles: [
      {
        id: 'select-pan-and-ribbon-navigation',
        sectionId: 'drawing-tools',
        title: 'Select, Slide / Pan and Scrolling the Tools Ribbon',
        summary:
          'Switch between object selection and workspace panning, and access all tools on narrow screens.',
        keywords: [
          'select tool',
          'slide',
          'pan tool',
          'spacebar',
          'ribbon',
          'scroll tools',
          'toolbar arrows',
        ],
        bullets: [
          'Select: Click any object to select, move, resize or rotate it. Right-drag across the canvas to draw a CAD-style Window (left-to-right, solid blue) or Crossing (right-to-left, dashed green) selection rectangle over multiple objects.',
          'Slide / Pan: Left-drag on empty canvas space (or choose Slide / Pan, or hold Spacebar + Drag at any time) to move around the page without moving objects.',
          'Desktop Ribbon Scrolling: On narrower laptop or desktop windows where the drawing-tools ribbon overflows, use the left/right arrow buttons at the ends of the ribbon or roll your mouse wheel over the ribbon to scroll horizontally.',
          'Mobile Ribbon Swiping: On phones and tablets, swipe left or right across the drawing-tools strip with your finger.',
        ],
      },
      {
        id: 'text-boxes',
        sectionId: 'drawing-tools',
        title: 'Text Boxes and Typography',
        summary:
          'Create multi-line text boxes with point font sizes, alignment, borders, background fills and internal padding.',
        keywords: [
          'text',
          'text box',
          'font',
          'font size',
          'pt',
          'bold',
          'italic',
          'underline',
          'alignment',
          'padding',
          'border',
        ],
        steps: [
          'Select the Text tool in the ribbon, then click or drag on the page to place a text box.',
          'Type your text directly on the canvas. Click outside or press Escape to finish editing text.',
          'Double-click any existing text box to edit its wording on the canvas, or edit the Text Content field in the Properties panel.',
          'Use the Properties panel to adjust Font Family, Size (pt), Line Height, Bold / Italic / Underline, Left / Centre / Right alignment, Text Colour, Background Fill, Border Width (mm) and Padding (mm).',
        ],
        callouts: [
          {
            type: 'tip',
            title: 'PDF-guaranteed fonts',
            text: 'Helvetica (Sans-Serif), Times Roman (Serif) and Courier (Monospace) are marked with a green badge because they embed directly as standard vector fonts in PDF exports.',
          },
        ],
      },
      {
        id: 'lines-arrows-and-dimensions',
        sectionId: 'drawing-tools',
        title: 'Technical Lines, Callout Arrows and Dimension Lines',
        summary:
          'Draw lines, callout arrows and architectural measurement lines with live millimetre readouts.',
        keywords: [
          'line',
          'arrow',
          'callout',
          'dimension',
          'measurement',
          'witness ticks',
          'dashed',
          'dotted',
          'arrowhead',
          'endpoints',
        ],
        bullets: [
          'Line: Draws a straight line between (X1, Y1) and (X2, Y2). In Properties, configure Stroke Thickness (mm), Line Style (Solid, Dashed, Dotted) and exact start/end coordinates.',
          'Arrow: Draws a callout line with configurable arrowheads (Single End ->, Double <->, or Start <-) and adjustable Arrowhead Size (mm).',
          'Dimension: Draws a technical measurement line with perpendicular witness ticks and a centred label showing the exact physical length in millimetres (for example, "420 mm"). You can also enter a Custom Label Override in Properties.',
        ],
        steps: [
          'Select Line, Arrow or Dimension in the ribbon and drag from start point to end point on the page.',
          'Hold Shift while dragging (or turn on Precision Mode) to snap the start point to 1 mm, constrain the length to whole 1 mm increments, and lock the angle to your configured angle snap increment.',
          'When selected, drag either circular endpoint handle (P1 or P2) to reposition the start or end point independently.',
        ],
      },
      {
        id: 'pen-highlighter-and-eraser',
        sectionId: 'drawing-tools',
        title: 'Freehand Pen, Highlighter and Eraser',
        summary:
          'Sketch smooth freehand vector strokes and erase individual strokes without affecting other page objects.',
        keywords: [
          'pen',
          'freehand',
          'highlighter',
          'marker',
          'eraser',
          'sketch',
          'draw',
          'annotate',
          'stroke width',
        ],
        bullets: [
          'Pen: Draws smooth opaque freehand strokes (0.3 mm to 5.0 mm thickness). Click the Pen button or its chevron arrow to choose from 12 preset colours and adjust thickness with a live preview.',
          'Highlighter: Draws translucent (~38% opacity) freehand marker strokes (2 mm to 20 mm thickness) that blend cleanly over text, drawings and images without darkening when a single stroke crosses itself.',
          'Eraser: Click or drag across any freehand Pen or Highlighter stroke to delete that entire stroke.',
        ],
        callouts: [
          {
            type: 'important',
            title: 'What the Eraser removes',
            text: 'The Eraser only removes freehand Pen and Highlighter strokes. It never deletes images, text boxes, lines, arrows, dimensions, geometric shapes or rectangular Area Highlights. To delete those objects, select them and press Delete / Backspace or tap the Trash icon.',
          },
        ],
      },
      {
        id: 'shapes-and-area-highlights',
        sectionId: 'drawing-tools',
        title: 'Geometric Shapes and Area Highlights',
        summary:
          'Draw rectangles, 1:1 squares, ellipses, 1:1 circles, triangles and translucent rectangular highlight callouts.',
        keywords: [
          'shapes',
          'rectangle',
          'square',
          'ellipse',
          'circle',
          'triangle',
          'area highlight',
          'corner radius',
          'fill',
          'stroke',
        ],
        steps: [
          'Click the Shapes button in the ribbon to choose Rectangle, Square (1:1), Ellipse, Circle (1:1) or Triangle, then drag on the page to create the shape.',
          'Square and Circle automatically maintain a 1:1 equal width-to-height ratio while drawing and resizing. Hold Shift while drawing a Rectangle or Ellipse to constrain it to 1:1.',
          'In the Properties panel, adjust Fill Colour (or Transparent Fill), Stroke Colour, Stroke Thickness (mm), Line Style, and Corner Radius (mm) for rectangles and squares.',
          'To highlight a rectangular region of a plan or text block, click Area Highlight, pick a preset tint (Yellow, Green, Cyan or Pink) and drag across the region.',
        ],
      },
    ],
  },

  // ============================================================================
  // 4. PRECISION AND SNAPPING
  // ============================================================================
  {
    id: 'precision-and-snapping',
    number: 4,
    title: 'Precision and Snapping',
    description:
      'Millimetre coordinate accuracy, magnetic snapping, configurable angle increments and Touch Precision Mode.',
    articles: [
      {
        id: 'millimetre-coordinate-system',
        sectionId: 'precision-and-snapping',
        title: 'Canonical Millimetre (mm) Measurements',
        summary:
          'How PageLay measures positions, sizes and cursor coordinates in physical millimetres.',
        keywords: [
          'millimetres',
          'mm',
          'coordinates',
          'origin',
          'x',
          'y',
          'width',
          'height',
          'status bar',
          'zoom invariant',
        ],
        paragraphs: [
          'Every position and dimension in PageLay is stored in physical millimetres (mm) measured from the top-left corner of the page (X = 0 mm, Y = 0 mm).',
          'Zooming in or out only changes your view on screen; it never alters object geometry, text wrapping or print dimensions.',
        ],
        bullets: [
          'Live Cursor Readout: On desktop, the bottom Status Bar displays the live pointer position (X and Y in mm) whenever the cursor is over the workspace.',
          'Numeric Inspector: Select any object to enter exact X, Y, Width, Height or Rotation values in the Properties panel. Press Enter to apply or Escape to cancel an edit.',
        ],
      },
      {
        id: 'magnetic-snapping',
        sectionId: 'precision-and-snapping',
        title: 'Magnetic Snapping to Guides, Page Edges and Objects',
        summary:
          'Align objects effortlessly using magnetic snap targets and visual alignment indicators.',
        keywords: [
          'snap',
          'magnetic',
          'snap to guides',
          'snap to page',
          'snap objects',
          'alignment lines',
        ],
        bullets: [
          'Snap to Guidelines: Snaps object edges, centres and line endpoints to horizontal and vertical page guidelines.',
          'Snap to Page Edges & Centres: Snaps objects to the physical page borders (0 mm, width, height) and page centre axes.',
          'Snap to Other Objects: Snaps the edges and centres of the object you are dragging or resizing to the edges and centres of other objects on the page.',
        ],
        steps: [
          'Click the Snap Objects button directly on the drawing-tools ribbon to toggle object-to-object snapping on or off at any time.',
          'Open the Guides & Snap menu at the right end of the ribbon to toggle Snap to Guidelines, Snap to Page Edges and Snap to Other Objects individually.',
        ],
      },
      {
        id: 'angle-increments-and-precision-mode',
        sectionId: 'precision-and-snapping',
        title: 'Angle Increments (1°–45°) and Touch Precision Mode',
        summary:
          'Constrain line angles, lengths and rotations using Shift on desktop or Precision Mode on mobile.',
        keywords: [
          'angle snap',
          'degrees',
          '15 degrees',
          'shift key',
          'precision mode',
          '1 mm',
          'rotation snap',
          'touch precision',
        ],
        paragraphs: [
          'When drawing or adjusting a Line, Arrow or Dimension — or rotating any object — you can constrain angles and lengths to clean increments.',
        ],
        steps: [
          'Open Guides & Snap in the ribbon to choose an Angle Snap Increment preset (1°, 5°, 10°, 15°, 30° or 45°) or type any whole-degree value between 1° and 45°.',
          'On desktop, hold Shift while drawing or dragging a Line, Arrow or Dimension endpoint to snap the start point to 1 mm, lock the physical length to whole 1 mm steps, and snap the angle to your chosen increment.',
          'Hold Shift while dragging the top rotation handle of any object or group to snap rotation to your chosen angle increment.',
          'On phones and tablets without a physical Shift key, turn on Precision Mode inside the Guides & Snap menu (an emerald "Precision" badge appears on the toolbar button) to enable 1 mm guide movement, 1 mm line length/start snapping and angle snapping automatically.',
        ],
      },
    ],
  },

  // ============================================================================
  // 5. IMAGES AND OBJECTS
  // ============================================================================
  {
    id: 'images-and-objects',
    number: 5,
    title: 'Images and Objects',
    description:
      'Importing lossless images, non-destructive cropping, print DPI checks, multi-selection, grouping, locking, alignment and layer ordering.',
    articles: [
      {
        id: 'importing-and-cropping-images',
        sectionId: 'images-and-objects',
        title: 'Importing, Pasting Images and Non-Destructive Cropping',
        summary:
          'Import or paste JPEG, PNG or WebP images from your clipboard without recompression and crop them non-destructively.',
        keywords: [
          'image',
          'import image',
          'upload',
          'paste image',
          'clipboard',
          'screenshot',
          'snipping tool',
          'ctrl v',
          'cmd v',
          'jpeg',
          'png',
          'webp',
          'crop',
          'non-destructive',
          'reset crop',
          'aspect ratio',
        ],
        steps: [
          'Click Image in the drawing ribbon, drag and drop JPEG, PNG or WebP files from your computer directly onto the canvas, or press Ctrl / ⌘ + V to paste a screenshot or image copied from Windows Snipping Tool, Word, PowerPoint, a web browser or another app.',
          'Pasted clipboard images are placed near the centre of your currently visible page area at their original pixel resolution (PNG, JPEG and WebP bytes are kept untouched; BMP or GIF screenshots are converted losslessly to PNG).',
          'To crop an image, double-click the image on the canvas — or select it and click Crop Image in the Properties panel.',
          'Drag the amber corner or edge handles to frame the visible region while seeing the full original image ghosted in context.',
          'Click Done Cropping in the floating banner (or press Escape) to apply the crop. You can click Reset Full Image in Properties at any time to restore the uncropped image.',
        ],
        callouts: [
          {
            type: 'note',
            title: 'System clipboard priority and unsupported items',
            text: 'If you copy an image or screenshot in another application, pressing Ctrl / ⌘ + V pastes that system clipboard image even if you previously copied an object inside PageLay. If the clipboard only holds plain text or an unsupported format, PageLay leaves your layout untouched and displays a helpful notice (double-click a Text box first if you want to paste wording).',
          },
        ],
      },
      {
        id: 'image-resolution-and-dpi',
        sectionId: 'images-and-objects',
        title: 'Checking Image Resolution and Effective Print DPI',
        summary:
          'Understand how physical size and cropping affect print sharpness (DPI).',
        keywords: [
          'dpi',
          'resolution',
          'print quality',
          'low dpi',
          '100 dpi',
          'pixels',
          'sharpness',
        ],
        paragraphs: [
          'When you select an image, the Properties panel displays its Original File name, pixel dimensions, byte size and live Effective Print DPI.',
          'Effective Print DPI is calculated from the pixel dimensions of the visible (cropped) image divided by its placed physical size in millimetres on the page (1 inch = 25.4 mm).',
        ],
        bullets: [
          '100 DPI or higher (Green badge): Suitable for large-format exhibition boards (such as A0 or A1 viewed from a normal standing distance) and general print.',
          'Below 100 DPI (Amber warning): The image has been stretched physically large relative to its pixel count and may look soft when printed close up. Reduce its physical width/height on the page or use a higher-resolution source image.',
        ],
      },
      {
        id: 'selecting-grouping-and-locking',
        sectionId: 'images-and-objects',
        title: 'Multi-Selection, Cut, Copy & Paste, Grouping and Locking Objects',
        summary:
          'Select multiple objects, cut or copy and paste across pages or documents, combine objects into groups, or lock them in place.',
        keywords: [
          'select multiple',
          'multi-select',
          'marquee',
          'window selection',
          'crossing selection',
          'right drag',
          'autocad',
          'cut',
          'copy',
          'paste',
          'clipboard',
          'cross-document',
          'group',
          'ungroup',
          'lock',
          'unlock',
          'ctrl click',
          'ctrl x',
          'cmd x',
        ],
        bullets: [
          'CAD Window & Crossing Selection (Right-Mouse Drag): With the Select tool active, press and drag the right mouse button from empty canvas or over existing objects (press Escape to cancel a drag; normal right-clicks without dragging still open the context menu):',
          'Window Selection (Left-to-Right): Displays a solid blue rectangle and selects only objects completely enclosed inside it.',
          'Crossing Selection (Right-to-Left): Displays a dashed green rectangle and selects objects that are either enclosed by or intersected by the rectangle.',
          'Click Multi-Select on Canvas: Hold Ctrl (Windows/Linux), Command ⌘ (Mac) or Shift while clicking objects to add or toggle them individually.',
          'Multi-Select in Properties: When no object (or multiple objects) are selected, use the Page Objects checklist in the Properties panel to tick or untick objects.',
          'Cut, Copy & Paste Objects (Ctrl/Cmd + X, Ctrl/Cmd + C, Ctrl/Cmd + V): Cut or copy any single object, multi-selection or group and paste onto the same page, another page, or another document opened in the same session. Relative positions, properties, grouping and original image assets are preserved automatically, and cutting or pasting records a single Undo step. Selections containing locked objects must be unlocked first (Ctrl/Cmd + L) before cutting.',
          'Group Objects (Ctrl/Cmd + G): With 2 or more objects selected, click Group Objects in the floating canvas badge or Properties panel. Moving, resizing, rotating or aligning a group transforms all member objects together in millimetres.',
          'Ungroup (Ctrl/Cmd + Shift + G): Select a group and click Ungroup to restore the individual objects at their current positions.',
          'Lock / Unlock (Ctrl/Cmd + L): Lock any object or selection in the Properties panel so it cannot be accidentally moved, resized, cut or deleted until unlocked.',
        ],
      },
      {
        id: 'aligning-and-ordering-objects',
        sectionId: 'images-and-objects',
        title: 'Aligning Objects to the Page and Layer Ordering (Z-Order)',
        summary:
          'Align objects to page edges or centres and control which objects appear in front or behind.',
        keywords: [
          'align',
          'centre',
          'center',
          'left edge',
          'right edge',
          'top edge',
          'bottom edge',
          'z-order',
          'bring to front',
          'send to back',
          'layer order',
        ],
        steps: [
          'Select an object, group or multi-selection and look at the Align to Page controls in the Properties panel.',
          'Click Left, Center H, Right, Top, Center V, Bottom or Center on Page (Both Axes) to position the selection accurately against the physical page boundaries.',
          'Under Layer Order in Properties, use Front (Bring to Front), Forward (Bring Forward), Backward (Send Backward) or Back (Send to Back) to change the stacking order.',
        ],
      },
    ],
  },

  // ============================================================================
  // 6. OPENING AND SAVING
  // ============================================================================
  {
    id: 'opening-and-saving',
    number: 6,
    title: 'Opening and Saving',
    description:
      'Working with native .lay archives, Save, Save As and Open Recent (direct files, cached local copies and locating files).',
    articles: [
      {
        id: 'native-lay-files-save-and-save-as',
        sectionId: 'opening-and-saving',
        title: 'Native .lay Files, Save and Save As',
        summary:
          'How PageLay packages your layout and original images into a self-contained .lay file.',
        keywords: [
          'lay file',
          'save',
          'save as',
          'zip',
          'archive',
          'overwrite',
          'download',
          'file handle',
        ],
        paragraphs: [
          'PageLay saves editable documents using the native .lay file format. A .lay file is a standard ZIP archive containing manifest.json (your document structure, pages, objects and guidelines in millimetres) alongside an /assets/ folder holding the exact original binary image files.',
        ],
        bullets: [
          'Save (Ctrl/Cmd + S): If the document is linked to an open local file handle on a desktop browser that supports direct file access (such as Chrome or Edge), Save updates that .lay file in place immediately. If the document has never been saved — or was opened in a browser environment without direct file-overwrite access — Save opens the Save As prompt so you can choose a filename and save location.',
          'Save As... (Ctrl/Cmd + Shift + S): Lets you enter a new filename or pick a new destination folder on your device.',
        ],
      },
      {
        id: 'open-recent-and-cached-copies',
        sectionId: 'opening-and-saving',
        title: 'Open Recent: Direct Files, Local Copies and Locating Files',
        summary:
          'Understand how Open Recent reopens up to 10 documents and the difference between an original file and a cached local copy.',
        keywords: [
          'open recent',
          'recent documents',
          'open directly',
          'local copy',
          'locate file',
          'cached copy',
          'clear recent',
          'file handle',
        ],
        paragraphs: [
          'PageLay keeps a list of your 10 most recently opened or saved .lay documents in Recent (on the desktop toolbar) and File -> Open Recent (on mobile). Each item displays a status badge showing how it will reopen:',
        ],
        bullets: [
          'Open directly (Green badge): The browser holds a valid link (FileSystemFileHandle) to the original .lay file on your computer. Clicking the item reopens the actual file on disk, and pressing Save updates that same file in place.',
          'Local copy (Blue badge): Direct file handles are not supported in the current browser environment (for example, inside embedded preview frames, on mobile browsers, or when a file was opened via drag-and-drop), so PageLay stored a cached binary snapshot of the .lay file in browser storage. Clicking the item reopens that cached snapshot immediately.',
          'Locate file (Amber badge): Neither a direct file handle nor a cached browser copy is available (for example, if the file was very large or browser cache was cleared). Clicking the item opens a helper dialogue so you can reselect the .lay file from your device.',
        ],
        callouts: [
          {
            type: 'important',
            title: 'Cached local copy vs original file on disk',
            text: 'When you reopen a document from a "Local copy", you are editing a snapshot stored inside your browser rather than a live link to a file in your computer’s folders. When you press Save, PageLay will ask you where to save the updated .lay file rather than silently overwriting a file on disk.',
          },
          {
            type: 'tip',
            title: 'Managing the Recent list',
            text: 'Use the × button beside any recent item to remove it from the list, or click Clear Recent History at the bottom of the menu.',
          },
        ],
      },
    ],
  },

  // ============================================================================
  // 7. RECOVERY AND UNDO
  // ============================================================================
  {
    id: 'recovery-and-undo',
    number: 7,
    title: 'Recovery and Undo',
    description:
      'Using Undo/Redo, unsaved-document protection and automatic local draft recovery.',
    articles: [
      {
        id: 'undo-redo-and-unsaved-warnings',
        sectionId: 'recovery-and-undo',
        title: 'Undo, Redo and Unsaved-Changes Protection',
        summary:
          'Step backwards or forwards through edits and prevent accidental data loss.',
        keywords: [
          'undo',
          'redo',
          'history',
          'unsaved changes',
          'warning',
          'dirty',
          'save changes before continuing',
        ],
        bullets: [
          'Undo (Ctrl/Cmd + Z) & Redo (Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z): Every object creation, move, resize, rotation, property edit, stroke erasure, guideline change and page action is recorded as an undoable step.',
          'Unsaved-Changes Guard: If your document has unsaved edits ("Unsaved changes" shown in the Status Bar), PageLay automatically prompts you to Save, Don’t Save or Cancel before creating a new document, opening another .lay file, loading Sample A0, or dropping a .lay file onto the canvas.',
        ],
      },
      {
        id: 'automatic-local-draft-recovery',
        sectionId: 'recovery-and-undo',
        title: 'Automatic Local Recovery and Why You Must Still Save .lay Files',
        summary:
          'How PageLay protects your active session against mobile screen lock reloads and unexpected browser restarts.',
        keywords: [
          'recovery',
          'local draft',
          'indexeddb',
          'mobile lock',
          'reload',
          'continue editing',
          'discard draft',
          'backup',
        ],
        paragraphs: [
          'PageLay automatically saves recovery checkpoints of your active document, original image assets and Undo/Redo history into local browser storage (IndexedDB).',
        ],
        bullets: [
          'Quiet Same-Session Reload Recovery: On Android and iPhone, locking and unlocking the phone screen can cause the browser to reload the page. When the same tab reloads, PageLay quietly restores your document, active page and Undo/Redo history so you can carry on editing — including undoing actions taken just before the reload.',
          'Interrupted Session Prompt: If the browser was completely closed or restarted while you had unsaved changes, reopening PageLay displays "Continue editing your document?" so you can either Continue Editing or Discard Draft.',
        ],
        callouts: [
          {
            type: 'important',
            title: 'Browser storage is not a substitute for saving a .lay file',
            text: 'Local recovery storage lives inside your current web browser on one device. Clearing browser data, using private/incognito browsing, running low on device storage, or switching to another browser or computer will remove local recovery data. Always use Save or Save As to keep permanent .lay files on your device or backup drive.',
          },
        ],
      },
    ],
  },

  // ============================================================================
  // 8. EXPORTING
  // ============================================================================
  {
    id: 'exporting',
    number: 8,
    title: 'Exporting',
    description:
      'Exporting print-ready vector PDFs and high-resolution PNG or JPG images.',
    articles: [
      {
        id: 'exporting-vector-pdf',
        sectionId: 'exporting',
        title: 'Exporting Print-Ready Vector PDF',
        summary:
          'Generate true physical-scale PDF documents with crisp vector graphics and embedded original images.',
        keywords: [
          'export pdf',
          'vector pdf',
          'print',
          'fonts',
          'pdf-lib',
          'physical size',
          'all pages',
          'current page',
        ],
        steps: [
          'Click the Export button at the top-right of the toolbar.',
          'Select the Print-Ready PDF tab.',
          'Choose whether to export All Pages or the Current Page Only.',
          'Review the Pre-Export Verification summary (physical dimensions in mm, low-DPI image checks and font checks).',
          'Click Export Vector PDF to generate and download your .pdf file.',
        ],
        callouts: [
          {
            type: 'tip',
            title: 'System fonts vs Standard PDF fonts',
            text: 'If your layout uses device/system fonts that are not part of the standard PDF specification, the Export dialogue offers a one-click Convert All Text Boxes to Standard PDF Fonts button so your PDF exports cleanly on any system.',
          },
        ],
      },
      {
        id: 'exporting-png-and-jpg-images',
        sectionId: 'exporting',
        title: 'Exporting PNG and JPG Images (72, 150 and 300 DPI)',
        summary:
          'Render pages to raster image files for presentations, email sharing or print proofs.',
        keywords: [
          'export png',
          'export jpg',
          'jpeg',
          'raster',
          '72 dpi',
          '150 dpi',
          '300 dpi',
          'image export',
        ],
        steps: [
          'Click Export in the top toolbar and switch to the High-Res PNG / JPG tab.',
          'Choose PNG (Lossless) for crisp graphics and text, or JPG ( Smaller File) for photographic boards.',
          'Select a target resolution: 72 DPI (Screen / Web), 150 DPI (Draft Print) or 300 DPI (High-Res Print).',
          'Choose Current Page Only or All Pages, then click Export.',
        ],
        callouts: [
          {
            type: 'note',
            title: 'Large-format print considerations (A0 / A1)',
            text: 'For large exhibition boards such as A0 (1189 × 841 mm) and A1, Vector PDF is strongly recommended for commercial printing because text, lines, dimensions and shapes remain razor-sharp at any scale. When exporting raster PNG/JPG files of very large boards at 300 DPI, browsers automatically cap canvas pixel dimensions to stay within device memory limits.',
          },
        ],
      },
    ],
  },

  // ============================================================================
  // 9. MOBILE AND KEYBOARD CONTROLS
  // ============================================================================
  {
    id: 'mobile-and-keyboard-controls',
    number: 9,
    title: 'Mobile and Keyboard Controls',
    description:
      'Touch gestures on phones and tablets, desktop mouse-wheel navigation and verified keyboard shortcuts.',
    articles: [
      {
        id: 'mobile-touch-gestures-and-floating-toolbar',
        sectionId: 'mobile-and-keyboard-controls',
        title: 'Mobile Touch Gestures and Floating Canvas Controls',
        summary:
          'Navigate, zoom, select and delete objects smoothly on Android phones, iPhones and tablets.',
        keywords: [
          'mobile',
          'touch',
          'pinch to zoom',
          'two finger',
          'pan',
          'floating toolbar',
          'delete button',
          'trash icon',
          'android',
          'iphone',
        ],
        bullets: [
          'Two-Finger Pinch & Pan: Pinch with two fingers anywhere on the canvas to zoom in or out around your fingers while panning simultaneously.',
          'Single-Finger Slide / Pan: Tap Slide in the bottom-right floating toolbar (or Slide / Pan in the top ribbon) to pan the page comfortably with one finger.',
          'Floating Canvas Toolbar (Bottom-Right): Provides quick thumb access to Select / Slide, Zoom Out (-), Fit Page (zoom percentage button), Zoom In (+), and a red Trash / Delete button that appears automatically whenever a deletable object or guideline is selected.',
          'Touch Precision Mode: Enable Precision Mode in Guides & Snap to get 1 mm guideline snapping and angle-constrained line drawing and rotation without holding Shift.',
        ],
      },
      {
        id: 'desktop-mouse-wheel-and-keyboard-shortcuts',
        sectionId: 'mobile-and-keyboard-controls',
        title: 'Desktop Mouse Wheel and Keyboard Shortcuts Reference',
        summary:
          'Complete list of verified mouse-wheel actions and keyboard shortcuts in PageLay.',
        keywords: [
          'keyboard shortcuts',
          'hotkeys',
          'mouse wheel',
          'scroll',
          'zoom',
          'pan',
          'ctrl z',
          'ctrl s',
          'ctrl g',
          'nudge',
          'arrow keys',
        ],
        paragraphs: [
          'Use these mouse-wheel combinations over the central canvas and keyboard shortcuts across the editor:',
        ],
        shortcuts: [
          {
            keys: 'Mouse Wheel',
            action:
              'Pan canvas vertically (or scroll the desktop drawing-tools ribbon horizontally when hovering the ribbon)',
          },
          { keys: 'Alt + Mouse Wheel', action: 'Pan canvas horizontally' },
          {
            keys: 'Shift + Mouse Wheel',
            action: 'Zoom canvas in or out centred around the mouse pointer',
          },
          {
            keys: 'Ctrl + Mouse Wheel',
            action: 'Normal browser page/tab zoom (not intercepted by PageLay)',
          },
          {
            keys: 'Spacebar + Drag',
            action: 'Pan / slide the workspace temporarily',
          },
          {
            keys: 'Right-Drag Left-to-Right (Select tool)',
            action: 'Window Selection (solid blue) — selects objects completely enclosed',
          },
          {
            keys: 'Right-Drag Right-to-Left (Select tool)',
            action:
              'Crossing Selection (dashed green) — selects enclosed or intersecting objects',
          },
          {
            keys: 'Ctrl / ⌘ + Click (or Shift + Click)',
            action: 'Add or toggle objects in a multi-selection on the canvas',
          },
          {
            keys: 'Shift + Drag (Line / Arrow / Dimension)',
            action:
              'Snap start point to 1 mm, length to 1 mm, and angle to configured increment',
          },
          {
            keys: 'Shift + Drag (Guideline)',
            action: 'Snap guideline movement to exact 1 mm increments',
          },
          {
            keys: 'Shift + Rotate Handle',
            action: 'Snap object or group rotation to configured angle increment',
          },
          { keys: 'Ctrl / ⌘ + S', action: 'Save .lay document' },
          { keys: 'Ctrl / ⌘ + Shift + S', action: 'Save As new .lay document' },
          { keys: 'Ctrl / ⌘ + Z', action: 'Undo last action' },
          {
            keys: 'Ctrl / ⌘ + Y (or Ctrl / ⌘ + Shift + Z)',
            action: 'Redo action',
          },
          {
            keys: 'Ctrl / ⌘ + A',
            action: 'Select all objects on the active page',
          },
          {
            keys: 'Ctrl / ⌘ + G',
            action: 'Group selected objects (2 or more objects)',
          },
          {
            keys: 'Ctrl / ⌘ + Shift + G',
            action: 'Ungroup selected group',
          },
          {
            keys: 'Ctrl / ⌘ + L',
            action: 'Lock or unlock selected object(s)',
          },
          {
            keys: 'Ctrl / ⌘ + X',
            action: 'Cut selected unlocked object(s) or group to the clipboard',
          },
          {
            keys: 'Ctrl / ⌘ + C',
            action: 'Copy selected object(s) or group',
          },
          {
            keys: 'Ctrl / ⌘ + V',
            action:
              'Paste clipboard image from another app, or paste cut/copied PageLay object(s)',
          },
          { keys: 'Ctrl / ⌘ + D', action: 'Duplicate selected object' },
          {
            keys: 'Delete / Backspace',
            action: 'Delete selected object(s) or selected unlocked guideline',
          },
          {
            keys: 'Arrow Keys',
            action: 'Nudge selected object(s) by 1 mm (or 10 mm with Shift)',
          },
          {
            keys: 'Escape',
            action:
              'Exit text editing or crop mode, reset active tool to Select, or clear selection',
          },
        ],
      },
    ],
  },

  // ============================================================================
  // 10. TROUBLESHOOTING
  // ============================================================================
  {
    id: 'troubleshooting',
    number: 10,
    title: 'Troubleshooting',
    description:
      'Solutions for common questions about saving, reopening recent files, importing pages, recovery and exporting.',
    articles: [
      {
        id: 'troubleshooting-saving-and-recent-files',
        sectionId: 'troubleshooting',
        title: 'File Access, Saving and Open Recent Questions',
        summary:
          'Why Save sometimes downloads a new copy or asks where to save, and how Open Recent works across browsers.',
        keywords: [
          'troubleshooting',
          'save',
          'download',
          'overwrite',
          'open recent',
          'locate file',
          'local copy',
          'permission',
        ],
        bullets: [
          'Why did pressing Save ask me for a filename or download a file instead of overwriting my original file? Direct in-place file overwriting requires the browser’s File System Access API and an active file handle opened via the native desktop file picker. In mobile browsers, Safari/Firefox, embedded preview frames, or when a file was opened via drag-and-drop or a cached "Local copy", the browser does not grant direct disk-overwrite access, so PageLay safely prompts you to save or download a new .lay file.',
          'Why does an item in Open Recent say "Local copy"? When the browser environment does not support persistent file handles, PageLay caches a copy of the .lay file in local browser storage so you can still reopen it with one click. Remember to use Save or Save As when you finish editing to write your changes back to a .lay file on your device.',
          'Why does an item in Open Recent ask me to "Locate file"? If a file was larger than the browser cache limit (25 MB per file), or if browser storage was cleared, no cached copy is stored. Click Choose File to Reopen and select the .lay file from your folders.',
        ],
      },
      {
        id: 'troubleshooting-import-recovery-and-export',
        sectionId: 'troubleshooting',
        title: 'Page Import, Recovery, Erasing and Export Questions',
        summary:
          'Resolving page size mismatches on import, Eraser behaviour, font warnings and low-DPI alerts.',
        keywords: [
          'troubleshooting',
          'cannot import pages',
          'paper size mismatch',
          'eraser not working',
          'locked object',
          'fonts',
          'recovery modal',
        ],
        bullets: [
          'Why could I not import pages from another .lay file? All pages inside a single PageLay document share the same physical paper dimensions (width and height in mm). Make sure the current document’s paper size and orientation match the .lay file you are importing into the Pages sidebar.',
          'Why will an object not move or delete? Check whether the object or guideline is locked. Select the object and look for the Unlock button in the Properties panel (or press Ctrl/Cmd + L). If a guideline will not move, open Guides & Snap and untick Lock Guidelines.',
          'Why does the Eraser not remove a line, shape or text box? By design, the Eraser only removes freehand Pen and Highlighter strokes so you do not accidentally wipe out underlying plans or layout boxes while erasing annotations. To delete other objects, select them with the Select tool and press Delete / Backspace (or tap the floating Trash button).',
          'Why did Export warn about non-standard fonts? Standard PDF viewers only guarantee built-in support for Helvetica, Times Roman and Courier. Click Convert All Text Boxes to Standard PDF Fonts in the Export PDF dialogue to convert system fonts automatically before exporting.',
          'Why did pressing Ctrl / ⌘ + V say the clipboard does not contain a supported image? Direct canvas paste supports binary image data from screenshots and image-copy commands (PNG, JPEG, WebP, BMP, GIF) or PageLay copied objects. If you copied plain text or a remote web image link without image data, use the Text tool (double-click a text box) to paste text, or save and import the image file directly.',
        ],
      },
    ],
  },
];

export const ALL_HELP_ARTICLES: ReadonlyArray<HelpArticle> = HELP_SECTIONS.flatMap(
  (section) => section.articles
);

export function getHelpSectionById(
  sectionId: HelpSectionId
): HelpSection | undefined {
  return HELP_SECTIONS.find((section) => section.id === sectionId);
}

export function getHelpArticleById(articleId: string): HelpArticle | undefined {
  return ALL_HELP_ARTICLES.find((article) => article.id === articleId);
}

export interface HelpSearchResult {
  article: HelpArticle;
  section: HelpSection;
  score: number;
  matchedIn: ('title' | 'summary' | 'keywords' | 'content')[];
}

/**
 * Immediate, offline local search across article titles, summaries, keywords, steps, bullets, callouts and shortcuts.
 */
export function searchHelpArticles(rawQuery: string): HelpSearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];

  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const results: HelpSearchResult[] = [];

  for (const section of HELP_SECTIONS) {
    const sectionTitleLower = section.title.toLowerCase();
    for (const article of section.articles) {
      const titleLower = article.title.toLowerCase();
      const summaryLower = article.summary.toLowerCase();
      const keywordsLower = article.keywords.map((k) => k.toLowerCase());
      const bodyParts: string[] = [
        ...(article.paragraphs ?? []),
        ...(article.steps ?? []),
        ...(article.bullets ?? []),
        ...(article.callouts?.map((c) => `${c.title ?? ''} ${c.text}`) ?? []),
        ...(article.shortcuts?.map((s) => `${s.keys} ${s.action}`) ?? []),
      ];
      const bodyLower = bodyParts.join(' ').toLowerCase();

      const fullHaystack = `${sectionTitleLower} ${titleLower} ${summaryLower} ${keywordsLower.join(
        ' '
      )} ${bodyLower}`;

      // Every search token must appear somewhere in the article or its section title
      const matchesAllTokens = tokens.every((token) =>
        fullHaystack.includes(token)
      );
      if (!matchesAllTokens) continue;

      let score = 0;
      const matchedInSet = new Set<'title' | 'summary' | 'keywords' | 'content'>();

      if (titleLower.includes(query)) {
        score += 60;
        matchedInSet.add('title');
      }
      if (keywordsLower.some((k) => k === query || k.includes(query))) {
        score += 45;
        matchedInSet.add('keywords');
      }
      if (summaryLower.includes(query)) {
        score += 25;
        matchedInSet.add('summary');
      }
      if (bodyLower.includes(query)) {
        score += 15;
        matchedInSet.add('content');
      }

      for (const token of tokens) {
        if (titleLower.includes(token)) {
          score += 20;
          matchedInSet.add('title');
        }
        if (keywordsLower.some((k) => k.includes(token))) {
          score += 15;
          matchedInSet.add('keywords');
        }
        if (summaryLower.includes(token)) {
          score += 10;
          matchedInSet.add('summary');
        }
        if (bodyLower.includes(token)) {
          score += 5;
          matchedInSet.add('content');
        }
      }

      results.push({
        article,
        section,
        score,
        matchedIn: Array.from(matchedInSet),
      });
    }
  }

  return results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.section.number - b.section.number;
  });
}
