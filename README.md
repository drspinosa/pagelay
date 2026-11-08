# PageLay

> **Simple page layouts. No fuss.**

**PageLay** is a fast, precision desktop-publishing and page-layout web application engineered for creating multi-page exhibition boards, technical sheets, architectural layouts, and visual callout documents using **canonical millimetre (`mm`) coordinates** and **100% lossless original image preservation**.

All operations run locally in your browser with zero external cloud dependencies, accounts, or servers.

---

## Key Features

### 1. Canonical Millimetre (`mm`) Layout Engine
- **Physical ISO Paper Sizes**: Full support for **A0** (`1189 × 841 mm` default), **A1**, **A2**, **A3**, **A4**, and **Custom** millimetre dimensions in both **Landscape** and **Portrait** orientations.
- **Zoom-Invariant Rendering**: The internal document page is laid out at a canonical 1:1 physical scale and GPU-scaled (`transform: scale(zoom)`), guaranteeing identical text wrapping, font metrics, and vector geometry at 7% mobile zoom, 25% laptop overview, or 200% detail inspection.
- **Interactive Millimetre Rulers & Guidelines**: Top and left rulers adapt tick intervals (`1 mm` to `100 mm`) dynamically with zoom. Drag horizontal or vertical non-printing guidelines directly onto the page (`Shift + Drag` constrains movement to exact `1 mm` increments), click any guideline or its entry in the Properties Panel to edit its exact decimal `X` or `Y` coordinate (`0.1 mm`+ precision), or generate 1-click page margin guides (`20 mm` / `40 mm`).
- **Magnetic Snapping, Configurable Angle Snapping & Precision Mode**:
  - **Magnetic Snapping**: Snap objects and endpoints to guidelines, physical page edges/centers, and the edges or centers of other objects with live visual snap-line indicators and a quick **Snap Objects** toggle.
  - **Configurable Angle Snapping (`1°`–`45°`) & `1 mm` Linear Precision**: Choose quick presets (`1°`, `5°`, `10°`, `15°`, `30°`, `45°`) or enter any custom whole-number increment (`1°`–`45°`, default `15°`) in the **Guides & Snap** menu. Holding `Shift` (or enabling **Precision Mode**) while drawing or adjusting Lines, Arrows, and Dimensions snaps the starting point to the nearest `1 mm`, constrains the physical length to whole `1 mm` increments, and snaps the angle to the chosen increment (`X: 100 mm | Y: 50 mm | Length: 120 mm | Angle: 10°`).
  - **Touch Precision Mode**: Optional toggle in the **Guides & Snap** menu that enables `1 mm` guideline snapping, `1 mm` start/length + angle-constrained line/arrow/dimension drawing, and angle-constrained rotation on phones and tablets without needing a physical `Shift` key.

### 2. Lossless Image Handling & Non-Destructive Cropping
- **Zero Re-encoding on Import**: Uploaded JPEG, PNG, and WebP images are stored in memory as untouched binary bytes (`Uint8Array`).
- **Non-Destructive Crop Mode**: Double-click any image (or click **Crop Image** in the Properties Panel) to adjust the visible crop window while keeping the full original image ghosted in context and 100% of original image bytes intact.
- **Live Effective Print DPI Inspector**: Automatically computes and displays the real effective print resolution (`DPI`) based on the original pixel dimensions, active crop region, and placed physical size in millimetres, warning when resolution drops below `100 DPI`.

### 3. Rich Layout & Annotation Tools
- **Freehand Pen, Freehand Highlighter & Basic Eraser**:
  - **Freehand Pen**: Draw smooth freehand annotations, circles, underlines, or notes with mouse, finger, or stylus. Includes a Snipping Tool-style popover with 12 preset colours, thickness slider (`0.3 mm`–`5.0 mm`), and live stroke preview.
  - **Freehand Highlighter**: Draw translucent (`~38%` opacity) marker strokes directly over plans, text, or images using a single non-compounding path with 6 fluorescent colours and a `2 mm`–`20 mm` thickness slider.
  - **Basic Eraser**: Click or drag across any freehand Pen or Highlighter stroke to remove the entire stroke with full Undo/Redo support, while strictly protecting images, text, lines, dimensions, shapes, and rectangular Area Highlights.
  - **Non-Destructive Vector Strokes**: Every freehand stroke is stored in canonical millimetres (`mm`) and can be selected, moved, resized, rotated, recoloured, grouped, saved in `.lay` archives, and exported as true PDF vector paths (`pdf-lib`).
- **Text Boxes**: Multi-line text boxes with font family selection (PDF-guaranteed standard fonts + system fonts), point size (`pt`), bold/italic/underline, alignment, text colour, fill colour, border thickness (`mm`), and internal padding (`mm`).
- **Technical Lines, Callout Arrows & Dimensions**:
  - **Lines**: Solid, dashed, or dotted lines with exact `X1, Y1` and `X2, Y2` millimetre coordinates and `Shift` / `Precision Mode` `1 mm` start & length + angle-constrained drawing/endpoint adjustment.
  - **Callout Arrows**: Configurable arrowheads (Single `→`, Double `↔`, or Start `←`), head size in `mm`, and `Shift` / `Precision Mode` `1 mm` start & length + angle-constrained drawing/endpoint adjustment.
  - **Dimension Lines**: Architectural dimension lines with witness ticks, live physical document length readouts in `mm` (or custom label overrides), and `Shift` / `Precision Mode` `1 mm` start & length + angle-constrained drawing/endpoint adjustment.
- **Geometric Shapes & Rectangular Area Highlights**: Rectangles, squares, ellipses, circles, triangles, and rectangular translucent Area Highlight boxes (Yellow, Green, Cyan, Pink).

### 4. Multi-Selection, Object Grouping, Alignment & Z-Order
- **Multi-Object Selection (`Ctrl + Click` / `⌘ + Click`)**: Hold **Ctrl** (Windows/Linux) or **Command `⌘`** (Mac)—or **Shift**—while clicking objects on the canvas to add or toggle multiple objects in the selection, or use the multi-select checklist in the Properties Panel.
- **Group & Ungroup (`Ctrl+G` / `Ctrl+Shift+G`)**: Combine multiple selected objects into a single **Group** entity. Moving, resizing, rotating, or aligning a group transforms all constituent objects synchronously in canonical millimetres (`mm`). Ungroup at any time to restore individual objects at their transformed positions.
- **Align to Page Menu & Quick Bar**: Align any selected object, multi-selection, or group to the **Left Edge**, **Horizontal Center**, **Right Edge**, **Top Edge**, **Vertical Center**, **Bottom Edge**, or **Center on Page (Both Axes)**.
- **Layer Ordering, Selection & Locking**: Select All (`Ctrl/Cmd+A`), Lock/Unlock selected object(s) (`Ctrl/Cmd+L`), Fit Selection in the Status Bar, Bring to Front, Bring Forward, Send Backward, Send to Back, duplicate (`Ctrl/Cmd+D`), copy/paste (`Ctrl/Cmd+C` / `Ctrl/Cmd+V`), and arrow-key nudging (`1 mm` or `10 mm` with `Shift`).
- **Multi-Page Management & `.lay` Page Importing**: Add, duplicate, reorder, and delete pages with live miniature vector/image thumbnails in the left Pages Sidebar. Dragging a `.lay` file onto the **Pages Sidebar** (or clicking **Import** in the Pages Sidebar header) appends all pages and referenced untouched image assets from that `.lay` document into the current document as a single undoable operation (validating matching physical paper dimensions in `mm`), whereas dropping a `.lay` file onto the **main canvas** opens it as a replacement document (protected by the unsaved-changes confirmation dialog).

### 5. Native `.lay` Archive, Local Draft Recovery, Unsaved-Changes Protection & Print-Ready Exports
- **`.lay` Document Format, Save (`Ctrl/Cmd+S`) & Save As (`Ctrl/Cmd+Shift+S`)**: Saves and loads the entire multi-page document as a self-contained `.lay` ZIP archive containing `manifest.json` and the `/assets/` directory with the exact original binary image files (`Uint8Array`). Retains the native `FileSystemFileHandle` where supported for in-place saves and warns before discarding unsaved changes when creating a new document, opening a `.lay` file, loading the sample layout, dropping a `.lay` file onto the canvas, or closing/refreshing the browser tab.
- **Automatic Local Draft Recovery (`IndexedDB` + Per-Tab Session Tracking)**: Protects unsaved work against mobile phone lock/unlock reloads, background tab termination, and accidental refreshes using a dedicated local IndexedDB database (`pagelay_local_recovery_v1`):
  - **Quiet Same-Session Reload Recovery**: Associates the active tab (`window.sessionStorage`) with the current document ID and recovery checkpoint. When a mobile lock/unlock cycle, embedded preview reload, or in-tab refresh reloads the same active editing session, PageLay automatically restores the document, original images, active page, and full Undo/Redo history without blocking the screen with a modal, showing a discreet `"Draft restored locally"` notification.
  - **Full Undo/Redo History & Deleted Asset Retention Across Recovery**: Persists bounded `historyPast` and `historyFuture` stacks alongside the checkpoint without duplicating binary image data, while retaining all `Uint8Array` image binaries referenced by either the active pages or any recoverable Undo/Redo snapshot (so undoing an image deletion or redoing a page import works seamlessly after recovery).
  - **Incremental Binary Image Storage & Lifecycle Checkpoints**: Preserves full-resolution `Uint8Array` image binaries in `draft_assets` without recompression, writing only newly added or modified image assets, and flushes checkpoints on a `~1.2s` debounce as well as `visibilitychange` (hidden), `pagehide`, `freeze`, and internal document transitions.
  - **Interrupted-Session Recovery Prompt**: When opening PageLay after a genuine browser restart or in a new tab with an unrecovered draft, presents **"Continue editing your document?"** displaying the document name, last recovery timestamp, paper size, page/image count, and Undo/Redo step count with **Continue Editing** and a two-step confirmed **Discard Draft** option.
- **Vector PDF Export (`pdf-lib`)**: Generates print-ready PDFs at exact physical millimetre dimensions (`1 mm = 72 / 25.4 pt`), embedding original JPEG/PNG image streams and rendering text, arrows, dimensions, freehand strokes, and shapes as crisp vector graphics.
- **High-Resolution PNG / JPG Export**: Rasterizes the current page or all pages at **72 DPI** (screen), **150 DPI** (draft print), or **300 DPI** (high-resolution print) with automatic memory-safety scaling on large formats.

### 6. Desktop & Mobile Touch Ergonomics + Integrated Help Manual
- **Pointer & Touch Gestures**:
  - **1-Finger Drag / Pan Tool / Spacebar + Drag**: Smoothly pan and slide the workspace.
  - **2-Finger Pinch-to-Zoom & Pan**: Simultaneous focal-point pinch zooming and two-finger panning on phones and tablets.
  - **Desktop Mouse-Wheel Navigation & Responsive Ribbon**: `Wheel` pans vertically, `Alt + Wheel` pans horizontally, `Shift + Wheel` zooms around the cursor, and `Ctrl + Wheel` preserves native browser zoom. On narrower desktop windows, the drawing-tools ribbon shows left/right scroll arrows and supports vertical mouse-wheel horizontal scrolling.
  - **Ruler & Sidebar Touch Isolation**: Pointer and touch handlers verify event targets so dragging guidelines from rulers or scrolling sidebars never triggers unintended document panning.
- **Integrated Help & How To Manual**: Searchable, offline 10-section British English manual accessible via the **Help** button between **Properties** and **Export** (opening as a docked `~352 px` right-hand panel replacing Properties on desktop, or a full-screen in-app view on mobile).

---

## Getting Started

### Prerequisites
- **Node.js** 24 LTS recommended (Vite 8 requires Node.js 20.19+ or 22.12+). Bun is also supported.

### Installation & Local Development
```bash
# Install dependencies
npm install

# Start the development server on port 3000
npm run dev
```

### Production Build & Type Check
```bash
# Build for production
npm run build

# Run TypeScript type validation
npm run lint
```

---

## Project Structure

```text
/
├── index.html                      # Viewport-locked HTML entry point
├── metadata.json                   # Application metadata
├── package.json                    # Scripts and dependencies (React 19, Vite, Tailwind v4, pdf-lib, jszip)
├── README.md                       # Application documentation
├── PROJECT.md                      # Project history, architecture & progression tracker
└── src/
    ├── App.tsx                     # Root application state, undo/redo history, keyboard shortcuts, draft recovery
    ├── main.tsx                    # React DOM entry point
    ├── index.css                   # Tailwind CSS v4 + mobile touch-action & viewport rules
    ├── components/
    │   ├── TopToolbar.tsx          # File menu, recent menu, responsive tool ribbon, Help & Export triggers
    │   ├── PagesSidebar.tsx        # Multi-page thumbnail navigator, page actions & .lay page import
    │   ├── EditorCanvas.tsx        # Zoom-invariant mm canvas, pointer/touch gestures, object manipulation
    │   ├── Rulers.tsx              # Dynamic horizontal & vertical millimetre rulers
    │   ├── PropertiesPanel.tsx     # Context-sensitive mm inspector, Align menu, Group/Ungroup controls
    │   ├── HelpPanel.tsx           # Searchable Help & How To manual (docked right panel on desktop, full-screen on mobile)
    │   ├── StatusBar.tsx           # Live cursor mm coordinates, paper specs, save/recovery status, zoom controls
    │   └── Modals.tsx              # New Document, Export, Save As, Unsaved Changes, Reopen Recent & Recovery modals
    ├── content/
    │   └── helpContent.ts          # Read-only 10-section British English Help & How To articles and offline search
    ├── model/
    │   ├── documentTypes.ts        # Authoritative TypeScript interfaces (canonical mm coordinates)
    │   └── documentFactory.ts      # Document/page factories, deep cloning, page import & A0 sample generator
    ├── services/
    │   ├── layFileService.ts       # .lay ZIP archive packager & loader (JSZip)
    │   ├── recentFilesService.ts   # Open Recent (max 10) metadata, FileSystemFileHandle & cached .lay Blob store
    │   ├── recoveryDraftService.ts # IndexedDB local session recovery & incremental binary asset store
    │   ├── pdfExportService.ts     # Vector PDF generator at exact physical mm scale (pdf-lib)
    │   └── imageExportService.ts   # High-DPI offscreen HTML5 Canvas rasterizer (PNG/JPG)
    └── utils/
        └── units.ts                # Millimetre/point/pixel conversions, DPI math, group transforms
```
