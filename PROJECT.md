# PageLay — Project Progression & Engineering Tracker

> **Project Name**: PageLay  
> **Tagline**: *Simple page layouts. No fuss.*  
> **Architecture**: Client-side React 19 + TypeScript + Tailwind CSS v4 + `pdf-lib` + `JSZip`

---

## 1. Architectural Foundation & Core Principles

1. **Authoritative Millimetre (`mm`) Data Model**:
   - Every page dimension, guideline, box object (`image`, `text`, `rectangle`, `square`, `ellipse`, `circle`, `triangle`, `highlight`, `group`), and linear object (`line`, `arrow`, `dimension`) is stored exclusively in physical millimetres (`mm`).
   - Screen zoom (`zoom`) and viewport pan (`panX`, `panY`) are strictly presentation state and never mutate document coordinates.
2. **100% Lossless Image Pipeline**:
   - Uploaded image files are read directly into `Uint8Array` buffers without canvas re-compression.
   - Cropping is stored as normalized `[0..1]` crop ratios (`crop: { x, y, width, height }`) so users can adjust or reset crops at any time.
   - Native `.lay` archives store the untouched binary files in `/assets/`, and PDF exports embed original image bytes directly.
3. **Three Separated Rendering Targets**:
   - **Editor Canvas (`EditorCanvas.tsx`)**: Zoom-invariant DOM/SVG workspace laid out at canonical `100%` scale (`CSS_PX_PER_MM_AT_100`) and GPU-transformed via `scale(zoom)`.
   - **Vector PDF Exporter (`pdfExportService.ts`)**: `pdf-lib` generator mapping `1 mm = 72 / 25.4 pt` with vector lines, arrowheads, dimensions, shapes, and embedded fonts.
   - **High-DPI Raster Exporter (`imageExportService.ts`)**: Offscreen HTML5 Canvas renderer supporting 72, 150, and 300 DPI PNG/JPEG output.

---

## 2. Chronological Development Log & Completed Milestones

### Milestone 1 — Core Desktop Publishing & `.lay` Packaging Engine
- **Status**: Completed
- **Summary**:
  - Designed canonical `PageLayDocument`, `PageData`, `ImageAsset`, and `PageObject` TypeScript schemas in `src/model/documentTypes.ts`.
  - Built ISO A-series (`A0`–`A4` + `Custom`) paper size definitions defaulting to `A0` Landscape (`1189 × 841 mm`).
  - Implemented `.lay` ZIP archive save/load (`src/services/layFileService.ts`), vector PDF export (`src/services/pdfExportService.ts`), and high-DPI PNG/JPG export (`src/services/imageExportService.ts`).
  - Created a built-in **Sample A0 Exhibition Stand Layout** (`src/model/documentFactory.ts`) featuring three procedural high-resolution architectural renders, callout arrows, and millimetre dimension lines.

### Milestone 2 — Mobile Viewport Lock, Touch Panning & Code Refinement
- **Status**: Completed
- **User Requests Addressed**:
  - *"It doses not look ok in me phone and the screen doesn't move or slide to see the rest of the screen also there is some giberish inspe the code and refine any errors"*
  - *"Refactor the EditorCanvas and main layout containers to ensure the workspace properly respects mobile viewport meta tags, preventing browser-level overscroll and enabling standard touch scrolling for areas outside the active drawing canvas."*
  - *"Fix mobile view port"*
- **Engineering Changes**:
  - Configured `index.html` with `width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover`.
  - Locked `html`, `body`, and `#root` to `100dvh` with `overflow: hidden` and `overscroll-behavior: none` in `src/index.css`, while enabling `.touch-scroll-y` (`-webkit-overflow-scrolling: touch`) on sidebars, drawers, and modals.
  - Replaced zoom-dependent font sizing with true zoom-invariant rendering (`transform: scale(zoom)` on the physical page container) so mobile browsers never distort or clamp small text sizes when viewing an A0 sheet on a phone screen.
  - Added responsive slide-over drawers for the Pages and Properties panels on viewports `< 1024px`.

### Milestone 3 — Pinch-to-Zoom & Two-Finger Mobile Touch Gestures
- **Status**: Completed
- **User Requests Addressed**:
  - *"Implement touch event handlers (touchstart, touchmove, touchend) in the EditorCanvas to support pinch-to-zoom and two-finger panning on mobile devices, ensuring the canvas responds correctly to gesture-based input."*
  - *"Implement touch event listeners on the EditorCanvas to detect two-finger 'pinch' gestures and calculate the resulting zoom scale change, ensuring this updates the existing 'zoom' state correctly to support intuitive mobile interaction."*
- **Engineering Changes**:
  - Added both React touch handlers (`onTouchStart`, `onTouchMove`, `onTouchEnd`, `onTouchCancel`) and native `{ passive: false }` touch listeners on the workspace container in `src/components/EditorCanvas.tsx`.
  - Implemented Euclidean two-finger distance tracking (`Math.hypot(x2 - x1, y2 - y1)`) and midpoint focal tracking so two-finger pinch gestures smoothly scale `zoom` (`0.04` to `4.0`) while keeping the pinched document point anchored under the user's fingers.
  - Added seamless gesture transitions when lifting one finger from a 2-finger pinch into 1-finger panning without viewport jumps.

### Milestone 4 — Pointer Event Unification & Ruler / Guideline Touch Isolation
- **Status**: Completed
- **User Requests Addressed**:
  - *"Also when i drag a guide line from the ruler the whol document moves. This is happening on a mobile phone"*
  - *"Update the EditorCanvas to implement pointer events instead of just mouse events, and specifically add a check in the onMouseDown / onPointerDown logic to ignore events originating from the ruler or sidebar areas to prevent unintended document panning while adjusting guides on mobile."*
  - *"Update the EditorCanvas pointer event logic to explicitly verify the event target. If the pointer event originates from within the ruler containers (left or top) or sidebar areas, it must be ignored by the document panning / canvas interaction handler to prevent unintended page movement while adjusting guidelines."*
- **Engineering Changes**:
  - Tagged the top ruler (`#ruler-top`), left ruler (`#ruler-left`), corner square (`#ruler-corner`), and guideline hit targets with `data-ruler="true"`, and tagged sidebars with `data-sidebar="true"`.
  - Implemented `isEventFromRulerOrSidebar()` in `src/components/EditorCanvas.tsx` checking `event.target`, `event.composedPath()`, `document.elementFromPoint(clientX, clientY)`, and the `24px` ruler bounding strip.
  - Added `isAdjustingGuideOrRulerRef` lock so any interaction originating on a ruler or guideline strictly updates the guideline position in millimetres and never triggers document panning.

### Milestone 5 — Page Alignment Menu & Quick Alignment Bar
- **Status**: Completed
- **User Request Addressed**:
  - *"Add a new 'Align' menu to the PropertiesPanel that allows users to align the currently selected object to the horizontal center, vertical center, top, bottom, left, or right edge of the page."*
- **Engineering Changes**:
  - Added an interactive **Align** dropdown menu and a 6-button quick alignment bar in `src/components/PropertiesPanel.tsx` supporting:
    - **Align Left Edge** (`0 mm`)
    - **Align Horizontal Center** (`widthMm / 2`)
    - **Align Right Edge** (`widthMm`)
    - **Align Top Edge** (`0 mm`)
    - **Align Vertical Center** (`heightMm / 2`)
    - **Align Bottom Edge** (`heightMm`)
    - **Center on Page (Both Axes)**
  - Supported both box objects (`xMm`, `yMm`) and linear objects (`x1Mm`, `y1Mm`, `x2Mm`, `y2Mm` preserving span and angle).

### Milestone 6 — Object Grouping & Ungrouping (`GroupObject`)
- **Status**: Completed
- **User Request Addressed**:
  - *"Implement a 'Group' function in the PropertiesPanel that combines multiple selected objects into a single group entity, allowing for synchronized movement and transformation, and add an 'Ungroup' function to restore them."*
- **Engineering Changes**:
  - Added `GroupObject` (`type: 'group'`, `children: PageObject[]`) to `src/model/documentTypes.ts`.
  - Built canonical millimetre group transformation utilities in `src/utils/units.ts`:
    - `getObjectBoundsMm` & `getCombinedBoundsMm` for exact enclosing bounding boxes across mixed box and linear objects.
    - `translatePageObjectMm` for synchronized movement of groups and all nested children.
    - `resizeGroupObjectMm` for proportional millimetre scaling of a group and all its children (`widthMm`, `heightMm`, `x1Mm/y1Mm/x2Mm/y2Mm`).
    - `rotateGroupObjectMm` for rotating a group and all its children around the group's center in millimetres.
    - `flattenPageObjects` so page thumbnails (`PagesSidebar.tsx`), vector PDF exports (`pdfExportService.ts`), and high-DPI image exports (`imageExportService.ts`) render grouped children seamlessly.
  - Updated `PropertiesPanel.tsx` and `EditorCanvas.tsx` to support:
    - Multi-object selection via `Shift+Click` on the canvas or via the **Page Objects & Grouping** checklist in the Properties Panel (enabling effortless multi-selection on mobile phones and tablets without a keyboard).
    - **Group Objects** action in the Properties Panel, floating canvas bar, and `Ctrl+G` / `Cmd+G` shortcut.
    - **Ungroup Objects** action in the Properties Panel, floating canvas bar, and `Ctrl+Shift+G` / `Cmd+Shift+G` shortcut.

### Milestone 7 — Project & Repository Documentation (`README.md` & `PROJECT.md`)
- **Status**: Completed
- **User Request Addressed**:
  - *"I would like you to create two md files if already not created one readme with all the latest what this app is and can do you know the usual. And the other project.md that lists all the work an tracks the process ans project progression"*
- **Engineering Changes**:
  - Created `/README.md` with full feature documentation, architecture overview, setup commands, and directory guide.
  - Created `/PROJECT.md` tracking all architectural decisions, user requests, milestones, and verification status.

### Milestone 8 — CSS & Layout Audit, Style Standardization & Mobile Viewport Enforcement
- **Status**: Completed
- **User Request Addressed**:
  - *"Review `src/index.css` and the main `App.tsx` layout structure to identify and remove any redundant or 'gibberish' style declarations. Ensure that the mobile viewport meta tag configuration and overflow settings are strictly enforced to prevent unexpected layout shifts on mobile devices."*
- **Engineering Changes**:
  - Refactored `src/index.css` to remove redundant stacked `position: fixed; inset: 0; max-width: 100vw; max-height: 100dvh;` declarations across `html`, `body`, and `#root`, replacing them with a deterministic `100dvh` flex root and strict `overflow: hidden; overscroll-behavior: none;` rules.
  - Fixed conflicting `max-lg:absolute` + `relative` utility classes on the Pages and Properties drawer wrappers in `src/App.tsx` by using explicit breakpoint-separated rules (`max-lg:absolute ... lg:relative shrink-0`) so mobile drawers never push or shift the workspace flex layout.
  - Standardized all non-standard shorthand classes (`shadow-2xs`, `rounded-xs`, `wrap-break-word`) to standard Tailwind utilities (`shadow-sm`, `rounded-sm`, `break-words`) across `EditorCanvas.tsx`, `PropertiesPanel.tsx`, `TopToolbar.tsx`, `PagesSidebar.tsx`, and `Modals.tsx`.

### Milestone 9 — Extended Keyboard Shortcuts (`Ctrl/Cmd + A` Select All & `Ctrl/Cmd + L` Lock/Unlock)
- **Status**: Completed
- **User Requests Addressed**:
  - *"Update the existing keyboard shortcut handler in App.tsx to include shortcuts for 'Select All' (Ctrl/Cmd + A) and 'Lock/Unlock' (Ctrl/Cmd + L) for selected objects."*
  - *"After this update the project.md with the latest additions"*
- **Engineering Changes**:
  - Added **`Ctrl/Cmd + A` (Select All)** to the global keyboard shortcut handler in `src/App.tsx` to select all objects on the active page (`selectedObjectIds`), switch to the `select` tool, exit active crop/text-edit modes, and display a confirmation toast.
  - Added **`Ctrl/Cmd + L` (Lock / Unlock)** to toggle the `locked` state for either a single selected object or multiple selected objects (`selectedObjectIds`) simultaneously with full undo/redo history support.
  - Updated the Lock/Unlock button tooltip in `src/components/PropertiesPanel.tsx` and documented the full keyboard shortcut reference in `README.md` and `PROJECT.md`.

### Milestone 10 — StatusBar 'Fit Selection' Viewport Zoom & Centering
- **Status**: Completed
- **User Request Addressed**:
  - *"Update the StatusBar to include a 'Fit Selection' zoom option that automatically adjusts the zoom and pan values to perfectly center the currently selected object(s) within the viewport."*
- **Engineering Changes**:
  - Added `fitSelectionToWorkspace` in `src/App.tsx` using `getCombinedBoundsMm` to compute the enclosing millimetre bounding box of the currently selected object(s) (single object, group, or multi-selection), calculate the optimal `zoom` scale (`0.05` to `4.0`) with viewport padding, and set `panX` and `panY` so the selection's center is positioned at the exact center of the workspace viewport.
  - Updated `src/components/StatusBar.tsx` with a **Fit Selection** button alongside **Fit Page** and **Fit Width**.

### Milestone 11 — Magnetic 'Snap to Objects' Feature & TopToolbar Toggle
- **Status**: Completed
- **User Request Addressed**:
  - *"Implement a 'Snap to Objects' feature in the EditorCanvas where objects magnetise to the edges or centres of other objects during dragging, controlled by a new toggle in the TopToolbar."*
- **Engineering Changes**:
  - Added `snapToObjects: boolean` to `PageLayDocument` (`src/model/documentTypes.ts`), initialized to `true` in `createNewDocument` (`src/model/documentFactory.ts`), and persisted in `.lay` manifest archives (`src/services/layFileService.ts`).
  - Updated `snapCoordinateMm` and `snapBoxPositionMm` in `src/components/EditorCanvas.tsx` to evaluate left/right/top/bottom edges and horizontal/vertical centers (`getObjectBoundsMm`) of all other non-excluded objects on the active page, choosing the closest magnetic snap target and rendering live visual snap indicator lines (`activeSnapLines`) during single-object dragging, multi-object dragging, linear object dragging, endpoint dragging, and resizing.
  - Added a quick **Snap Objects** toggle button in `src/components/TopToolbar.tsx` as well as a **Snap to Objects** toggle entry inside the **Guides & Snap** menu.

### Milestone 12 — Multi-Object Mouse Selection via `Ctrl / Cmd (⌘) + Click`
- **Status**: Completed
- **User Request Addressed**:
  - *"i want When I hold Ctrl and whatever is equivalent to Mac, then when I click with the mouse, I can select multiple objects"*
- **Engineering Changes**:
  - Updated `startObjectSelectionAndMove` and all object `onPointerDown`, `onMouseDown`, and `onContextMenu` handlers in `src/components/EditorCanvas.tsx` to detect `e.ctrlKey` (Windows/Linux `Ctrl`), `e.metaKey` (macOS `⌘ Command`), and `e.shiftKey`, toggling the clicked object in `selectedObjectIds` without triggering a duplicate toggle on the subsequent `mousedown` event or opening the native browser context menu on macOS `Ctrl + Click`.
  - Updated `startWorkspaceInteraction` so clicking empty workspace while holding `Ctrl` / `Cmd (⌘)` / `Shift` preserves the active multi-selection instead of clearing it.

### Milestone 13 — Workspace `touch-action: none` vs Sidebar `touch-action: pan-y` Refinement
- **Status**: Completed
- **User Request Addressed**:
  - *"Review `src/index.css` to remove redundant style declarations, ensuring that all layout containers specifically use `touch-action: none` for the workspace canvas while keeping `touch-action: pan-y` for scrollable sidebars to prevent unwanted document panning on mobile devices."*
- **Engineering Changes**:
  - Consolidated `src/index.css` rules so `.workspace-canvas` enforces `touch-action: none` while `[data-sidebar="true"]` and `.touch-scroll-y` containers explicitly preserve `touch-action: pan-y`.

### Milestone 14 — Precision Snapping, Configurable Angle Snapping, Exact Guideline Editing & Touch Precision Mode
- **Status**: Completed
- **User Request Addressed**:
  - *"PageLay — Precision Snapping, Rotation and Guideline Improvements"*
- **Engineering Changes**:
  - **Configurable Angle Snapping (`1°`–`45°`)**:
    - Added `angleSnapIncrementDeg: number` (default `15`) and `precisionMode: boolean` (default `false`) to `PageLayDocument` (`src/model/documentTypes.ts`, `src/model/documentFactory.ts`) with backwards-compatible `.lay` manifest persistence (`src/services/layFileService.ts`).
    - Replaced hardcoded `15°` rotation snapping in `src/components/EditorCanvas.tsx` with `doc.angleSnapIncrementDeg` (`1°`–`45°`), supporting quick presets (`1°, 5°, 10°, 15°, 30°, 45°`) and custom whole-number entry in the **Guides & Snap** menu (`src/components/TopToolbar.tsx`).
    - Added live `Shift` key press/release listener during active drags so pressing or releasing `Shift` mid-drag immediately toggles snapping without restarting the interaction.
  - **Shift-Constrained Line, Arrow & Dimension Drawing and Endpoint Adjustment**:
    - Added `constrainLineEndpointByAngleMm` in `src/components/EditorCanvas.tsx` to project dragged endpoints onto multiples of `angleSnapIncrementDeg` measured from the horizontal axis while always including exact horizontal (`0°`, `180°`) and vertical (`90°`, `270°`) directions and giving angle constraints strict precedence over magnetic position snapping.
  - **Precision Guideline Dragging (`Shift + Drag` = `1 mm`) & Exact Numeric Position Entry**:
    - Updated `dragging-guide` in `src/components/EditorCanvas.tsx` to snap to whole `1 mm` increments when `Shift` or `Precision Mode` is active (`0.1 mm` free movement otherwise).
    - Extended `src/components/PropertiesPanel.tsx` and `src/components/EditorCanvas.tsx` so clicking/tapping a guideline selects it and allows inline decimal editing (`Vertical guide — X: 123.4 mm` / `Horizontal guide — Y: 250.0 mm`) with `Enter` to confirm, `Escape` to cancel, page-boundary validation, and undo/redo history support.
  - **Touch Precision Mode & Structured Guides & Snap Menu**:
    - Reorganized the **Guides & Snap** dropdown in `src/components/TopToolbar.tsx` into three compact sections: **Magnetic Snapping**, **Angle Snapping**, and **Precision** (including the **Precision Mode (Touch)** toggle and toolbar active badge).

---

## 3. Keyboard & Mouse Shortcuts Reference

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + Click` / `⌘ + Click` (or `Shift + Click`) | Add or toggle multiple objects in selection on the canvas |
| `Shift + Rotate` | Constrain object/group rotation to configured angle increment (`1°`–`45°`, default `15°`) |
| `Shift + Drag` (Line / Arrow / Dimension) | Constrain drawing or endpoint angle to configured angle increment + cardinal axes |
| `Shift + Drag` (Guideline) | Constrain guideline movement to exact `1 mm` whole-millimetre increments |
| `Ctrl / Cmd + Z` | Undo last action |
| `Ctrl / Cmd + Y` or `Ctrl / Cmd + Shift + Z` | Redo action |
| `Ctrl / Cmd + S` | Save document as `.lay` archive |
| `Ctrl / Cmd + A` | Select all objects on the active page |
| `Ctrl / Cmd + G` | Group selected objects (`2+` objects) |
| `Ctrl / Cmd + Shift + G` | Ungroup selected group entity |
| `Ctrl / Cmd + L` | Lock / Unlock selected object(s) |
| `Ctrl / Cmd + C` | Copy selected object |
| `Ctrl / Cmd + V` | Paste copied object |
| `Ctrl / Cmd + D` | Duplicate selected object |
| `Delete` / `Backspace` | Delete selected object |
| `Arrow Keys` | Nudge selected object by `1 mm` (`10 mm` with `Shift`) |
| `Spacebar + Drag` | Pan / slide canvas |
| `Escape` | Exit text editing / crop mode / cancel inline guide edit and return to Select tool |

---

## 4. Feature & Verification Matrix

| Subsystem | Key Files | Status | Notes |
| :--- | :--- | :---: | :--- |
| Canonical `mm` Data Model | `src/model/documentTypes.ts`, `src/utils/units.ts` | Verified | ISO A0–A4 + Custom sizes, `GroupObject`, DPI math |
| Zoom-Invariant Canvas | `src/components/EditorCanvas.tsx` | Verified | 1:1 `mm` layout scaled via GPU compositor |
| Mobile Touch & Pinch Zoom | `src/components/EditorCanvas.tsx`, `src/index.css` | Verified | 1-finger pan, 2-finger pinch zoom & focal pan |
| Viewport & Overflow Lock | `index.html`, `src/index.css`, `src/App.tsx` | Verified | `100dvh` lock, `overscroll-none`, isolated drawer positioning |
| Ruler & Guideline Isolation | `src/components/Rulers.tsx`, `src/components/EditorCanvas.tsx` | Verified | Target & coordinate checks prevent accidental page pan |
| Magnetic Snap to Objects | `src/components/EditorCanvas.tsx`, `src/components/TopToolbar.tsx` | Verified | Snaps to edges & centres of other objects + TopToolbar toggle |
| Configurable Angle & Guide Precision | `src/components/EditorCanvas.tsx`, `src/components/TopToolbar.tsx`, `src/components/PropertiesPanel.tsx` | Verified | `1°–45°` angle snap, `Shift` line/endpoint snap, `1 mm` guide snap, exact decimal guide edit, Touch Precision Mode |
| Page Alignment Controls | `src/components/PropertiesPanel.tsx` | Verified | Left, Center H, Right, Top, Center V, Bottom, Center Both |
| Multi-Select & Grouping | `src/App.tsx`, `src/components/PropertiesPanel.tsx`, `src/components/EditorCanvas.tsx` | Verified | `Ctrl/⌘ + Click` multi-select, synchronized move, resize, rotate, align |
| Keyboard Shortcuts Suite | `src/App.tsx` | Verified | Undo/Redo, Save, Select All (`Ctrl+A`), Lock (`Ctrl+L`), Group (`Ctrl+G`) |
| `.lay` Archive Save / Load | `src/services/layFileService.ts` | Verified | Lossless `Uint8Array` asset preservation + backwards-compatible precision settings |
| Vector PDF & High-DPI Export | `src/services/pdfExportService.ts`, `src/services/imageExportService.ts` | Verified | `pdf-lib` vector output + 72/150/300 DPI PNG/JPG |


