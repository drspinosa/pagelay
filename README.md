# PageLay

> **Simple page layouts. No fuss.**

**PageLay** is a fast, precision desktop-publishing and page-layout web application engineered for creating multi-page exhibition boards, technical sheets, architectural layouts, and visual callout documents using **canonical millimetre (`mm`) coordinates** and **100% lossless original image preservation**.

All operations run locally in your browser with zero external cloud dependencies, accounts, or servers.

---

## Key Features

### 1. Canonical Millimetre (`mm`) Layout Engine
- **Physical ISO Paper Sizes**: Full support for **A0** (`1189 × 841 mm` default), **A1**, **A2**, **A3**, **A4**, and **Custom** millimetre dimensions in both **Landscape** and **Portrait** orientations.
- **Zoom-Invariant Rendering**: The internal document page is laid out at a canonical 1:1 physical scale and GPU-scaled (`transform: scale(zoom)`), guaranteeing identical text wrapping, font metrics, and vector geometry at 7% mobile zoom, 25% laptop overview, or 200% detail inspection.
- **Interactive Millimetre Rulers & Guidelines**: Top and left rulers adapt tick intervals (`1 mm` to `100 mm`) dynamically with zoom. Drag horizontal or vertical non-printing guidelines directly onto the page, add exact millimetre positions, or generate 1-click page margin guides (`20 mm` / `40 mm`).
- **Magnetic Snapping (Guidelines, Page Edges & Objects)**: Snap objects and endpoints to guidelines, physical page edges/centers, and the edges or centers of other objects on the page with live visual snap-line indicators and a quick **Snap Objects** toggle in the Top Toolbar.

### 2. Lossless Image Handling & Non-Destructive Cropping
- **Zero Re-encoding on Import**: Uploaded JPEG, PNG, and WebP images are stored in memory as untouched binary bytes (`Uint8Array`).
- **Non-Destructive Crop Mode**: Double-click any image (or click **Crop Image** in the Properties Panel) to adjust the visible crop window while keeping the full original image ghosted in context and 100% of original image bytes intact.
- **Live Effective Print DPI Inspector**: Automatically computes and displays the real effective print resolution (`DPI`) based on the original pixel dimensions, active crop region, and placed physical size in millimetres, warning when resolution drops below `100 DPI`.

### 3. Rich Layout & Annotation Tools
- **Text Boxes**: Multi-line text boxes with font family selection (PDF-guaranteed standard fonts + system fonts), point size (`pt`), bold/italic/underline, alignment, text colour, fill colour, border thickness (`mm`), and internal padding (`mm`).
- **Technical Lines, Callout Arrows & Dimensions**:
  - **Lines**: Solid, dashed, or dotted lines with exact `X1, Y1` and `X2, Y2` millimetre coordinates.
  - **Callout Arrows**: Configurable arrowheads (Single `→`, Double `↔`, or Start `←`) and head size in `mm`.
  - **Dimension Lines**: Architectural dimension lines with witness ticks and live physical length readouts in `mm` (or custom label overrides).
- **Geometric Shapes & Translucent Highlights**: Rectangles, squares, ellipses, circles, triangles, and 1-click translucent highlighter overlays (Yellow, Green, Cyan, Pink).

### 4. Multi-Selection, Object Grouping, Alignment & Z-Order
- **Multi-Object Selection (`Ctrl + Click` / `⌘ + Click`)**: Hold **Ctrl** (Windows/Linux) or **Command `⌘`** (Mac)—or **Shift**—while clicking objects on the canvas to add or toggle multiple objects in the selection, or use the multi-select checklist in the Properties Panel.
- **Group & Ungroup (`Ctrl+G` / `Ctrl+Shift+G`)**: Combine multiple selected objects into a single **Group** entity. Moving, resizing, rotating, or aligning a group transforms all constituent objects synchronously in canonical millimetres (`mm`). Ungroup at any time to restore individual objects at their transformed positions.
- **Align to Page Menu & Quick Bar**: Align any selected object, multi-selection, or group to the **Left Edge**, **Horizontal Center**, **Right Edge**, **Top Edge**, **Vertical Center**, **Bottom Edge**, or **Center on Page (Both Axes)**.
- **Layer Ordering, Selection & Locking**: Select All (`Ctrl/Cmd+A`), Lock/Unlock selected object(s) (`Ctrl/Cmd+L`), Fit Selection in the Status Bar, Bring to Front, Bring Forward, Send Backward, Send to Back, duplicate (`Ctrl/Cmd+D`), copy/paste (`Ctrl/Cmd+C` / `Ctrl/Cmd+V`), and arrow-key nudging (`1 mm` or `10 mm` with `Shift`).
- **Multi-Page Management**: Add, duplicate, reorder, and delete pages with live miniature vector/image thumbnails in the left Pages Sidebar.

### 5. Native `.lay` Archive & Print-Ready Exports
- **`.lay` Document Format**: Saves and loads the entire multi-page document as a self-contained `.lay` ZIP archive containing `manifest.json`, `document.json`, and the `/assets/` directory with the exact original binary image files.
- **Vector PDF Export (`pdf-lib`)**: Generates print-ready PDFs at exact physical millimetre dimensions (`1 mm = 72 / 25.4 pt`), embedding original JPEG/PNG image streams and rendering text, arrows, dimensions, and shapes as crisp vector graphics.
- **High-Resolution PNG / JPG Export**: Rasterizes the current page or all pages at **72 DPI** (screen), **150 DPI** (draft print), or **300 DPI** (high-resolution print) with automatic memory-safety scaling on large formats.

### 6. Desktop & Mobile Touch Ergonomics
- **Pointer & Touch Gestures**:
  - **1-Finger Drag / Pan Tool / Spacebar + Drag**: Smoothly pan and slide the workspace.
  - **2-Finger Pinch-to-Zoom & Pan**: Simultaneous focal-point pinch zooming and two-finger panning on phones and tablets.
  - **Ruler & Sidebar Touch Isolation**: Pointer and touch handlers verify event targets so dragging guidelines from rulers or scrolling sidebars never triggers unintended document panning.

---

## Getting Started

### Prerequisites
- **Node.js** 18+ (or **Bun**)

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
    ├── App.tsx                     # Root application state, undo/redo history, keyboard shortcuts
    ├── main.tsx                    # React DOM entry point
    ├── index.css                   # Tailwind CSS v4 + mobile touch-action & viewport rules
    ├── components/
    │   ├── TopToolbar.tsx          # File menu, tool selector, guides menu, export triggers
    │   ├── PagesSidebar.tsx        # Multi-page thumbnail navigator & page actions
    │   ├── EditorCanvas.tsx        # Zoom-invariant mm canvas, pointer/touch gestures, object manipulation
    │   ├── Rulers.tsx              # Dynamic horizontal & vertical millimetre rulers
    │   ├── PropertiesPanel.tsx     # Context-sensitive mm inspector, Align menu, Group/Ungroup controls
    │   ├── StatusBar.tsx           # Live cursor mm coordinates, paper specs, zoom controls
    │   └── Modals.tsx              # New Document modal & PDF / Image Export modal
    ├── model/
    │   ├── documentTypes.ts        # Authoritative TypeScript interfaces (canonical mm coordinates)
    │   └── documentFactory.ts      # Document/page factories, deep cloning, A0 sample layout generator
    ├── services/
    │   ├── layFileService.ts       # .lay ZIP archive packager & loader (JSZip)
    │   ├── pdfExportService.ts     # Vector PDF generator at exact physical mm scale (pdf-lib)
    │   └── imageExportService.ts   # High-DPI offscreen HTML5 Canvas rasterizer (PNG/JPG)
    └── utils/
        └── units.ts                # Millimetre/point/pixel conversions, DPI math, group transforms
```
