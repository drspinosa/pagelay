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

### Milestone 15 — Precision Line Drawing (`1 mm` Position & Length Snapping) and `Save As...` Document Naming
- **Status**: Completed
- **User Request Addressed**:
  - *"PageLay — Fix Precision Line Drawing and Save As Naming"*
- **Engineering Changes**:
  - **Precision Line Drawing — `1 mm` Position and Length Snapping**:
    - Extended `startWorkspaceInteraction`, `constrainLineEndpointByAngleMm`, `processPointerMove`, and `finishWorkspaceInteraction` in `src/components/EditorCanvas.tsx` so when `Precision Mode` is ON or `Shift` is held:
      - The starting point (`X1, Y1`) of newly drawn lines, arrows, and dimensions snaps to the nearest whole millimetre (`1 mm`) relative to the page origin, while preserving the raw pointer anchor (`rawStartMmX`, `rawStartMmY`) so toggling `Shift` mid-drag never causes jumps or anchor drift.
      - The physical radial length snaps to whole `1 mm` increments (`Math.round(rawLengthMm)`) simultaneously with the configured angle increment (`1°`–`45°` + exact cardinal axes), calculating the constrained endpoint via trigonometry (`anchorXMm + snappedLengthMm * Math.cos(rad)`, `anchorYMm + snappedLengthMm * Math.sin(rad)` retained to `0.0001 mm` precision) without independently integer-rounding both endpoint coordinates.
      - Existing line, arrow, and dimension endpoints (`p1` or `p2`) also snap to whole `1 mm` lengths + configured angle increments when dragged with `Shift` or `Precision Mode`, keeping the opposite endpoint fixed.
      - Added a compact live HUD readout pill at the top-center of the canvas during linear drawing and endpoint dragging (`X: 100 mm | Y: 50 mm | Length: 120 mm | Angle: 10°`).
  - **Save As... — Synchronized `.lay` Filename, Manifest Name, and Document Title**:
    - Added `SaveAsModal` in `src/components/Modals.tsx` and **Save As...** triggers in `src/components/TopToolbar.tsx` (desktop toolbar + mobile File menu) and `src/App.tsx` (`Ctrl / Cmd + Shift + S`).
    - Updated `src/services/layFileService.ts` (`saveDocumentAsLayFile`, `saveDocumentAsLayFileWithPicker`, `loadDocumentFromLayFile`) to update both the exported `<name>.lay` filename and internal `manifest.json` `name`, support the File System Access API (`showSaveFilePicker`) in top-level contexts while gracefully falling back to browser download in embedded/unsupported environments, distinguish confirmed native writes from browser download initiation, ignore cancelled saves cleanly, and adopt the opened `.lay` file's actual filename on load.

### Milestone 16 — Fix Save vs Save As Behaviour (`FileSystemFileHandle` In-Place Overwrite & Native Open Handle Retention)
- **Status**: Completed
- **User Request Addressed**:
  - *"PageLay — Fix Save vs Save As Behaviour"*
- **Engineering Changes**:
  - **Save (`Ctrl/Cmd + S` & Save Button)**:
    - Retained `activeFileHandle: LayFileSystemHandle | null` in runtime state (`src/App.tsx`), kept strictly separate from the serialized `.lay` document model and undo/redo snapshots.
    - When a document has never been saved (or was opened via `<input type="file">` / drag-and-drop without a writable handle), pressing **Save** / `Ctrl+S` prompts once via `showSaveFilePicker`, writes the `.lay` file, and retains the returned `FileSystemFileHandle`.
    - On all subsequent **Save** / `Ctrl+S` operations, `saveDocumentToExistingOrNewHandle` verifies/requests `readwrite` permission (`queryPermission` / `requestPermission`) and overwrites the existing file in place using `handle.createWritable()`, `write()`, and `close()` without opening Save As again or producing numbered duplicate downloads.
    - Guarded against simultaneous concurrent writes to the same file via `isSavingRef`.
  - **Save As (`Ctrl/Cmd + Shift + S` & Save As... Button)**:
    - Always opens a new file picker (`saveDocumentAsWithNativePicker`) so the user can choose a new filename or location, updates `activeFileHandle`, `doc.name`, and internal `.lay` manifest `name` only after the write completes, and preserves the previous document and file association if cancelled or failed.
  - **Open Existing Document (`showOpenFilePicker`)**:
    - Added `openDocumentWithNativePicker` in `src/services/layFileService.ts` and wired `onTriggerOpenNativePicker` in `src/components/TopToolbar.tsx` and `src/App.tsx` so opening a `.lay` file in supported browsers retains its `FileSystemFileHandle` for direct in-place saving, while falling back cleanly to `<input type="file">` in unsupported or embedded environments.

### Milestone 17 — Urgent Regression Fix: Undo/Redo and Keyboard Shortcuts
- **Status**: Completed
- **User Request Addressed**:
  - *"PageLay — Urgent Regression Fix: Undo/Redo and Keyboard Shortcuts"*
- **Confirmed Root Causes**:
  1. **Post-Drag Snapshot Bug & Click No-Op Snapshots (`src/components/EditorCanvas.tsx`)**:
     - During continuous drag interactions (`moving-object`, `moving-multi`, `resizing-object`, `rotating-object`, `dragging-endpoint`, `cropping-image`, `dragging-guide`), `processPointerMove` called `onUpdateObject(updated, false)` on every pointer move, mutating `doc` in `src/App.tsx` in real time. Then, on pointer release (`finishWorkspaceInteraction`), `EditorCanvas` called `onUpdateObject(currentObj, true)` which invoked `pushHistory(doc)` with the **already-mutated post-drag `doc`** instead of the pre-drag document state. As a result, pressing Undo restored the post-drag state rather than the pre-drag state. Additionally, clicking an object without dragging (`hasMoved === false`) still called `onUpdateObject(currentObj, true)` on pointer release, pushing duplicate no-op snapshots onto `historyPast`.
  2. **Lingering Focus in Toolbar / Sidebar Controls Blocking Global Shortcuts (`src/components/EditorCanvas.tsx` & `src/App.tsx`)**:
     - Focusing any `<input>`, `<select>`, or `<button>` in `TopToolbar` or `PropertiesPanel` and then clicking/dragging on `EditorCanvas` left browser focus inside that external form control (`e.preventDefault()` on canvas pointerdown prevented default focus transfer). Because `onKeyDown` in `src/App.tsx` returned early whenever `e.target` was `INPUT`, `TEXTAREA`, or `SELECT`, shortcuts (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Y`, `Ctrl/Cmd+S`, `Delete`, `Ctrl/Cmd+C/V/D`, `Arrow` keys) were ignored.
  3. **Shortcut Ordering & Selection Guard Issues (`src/App.tsx`)**:
     - `if (!selectedObject) return;` ran before `Ctrl/Cmd+V` (Paste), preventing Paste whenever no object was selected.
     - `Ctrl/Cmd+S` and `Ctrl/Cmd+Shift+S` ran after the `INPUT`/`TEXTAREA`/`SELECT` guard, allowing the browser's native "Save Webpage" dialog to intercept `Ctrl+S` when an editor field was focused.
     - `Escape` did not deselect selected objects/guidelines when already in the `select` tool, and `Delete` / `Arrow` keys did not handle multi-object selections (`selectedObjectIds`) or selected guidelines (`selectedGuideId`) in global shortcuts.
  4. **Stale Closure & Listener Churn (`src/App.tsx`)**:
     - `handleUndo` and `handleRedo` depended directly on `[historyPast, doc]` and `[historyFuture, doc]`, recreating handlers and re-binding the global `keydown` listener on every drag frame.
- **Engineering Changes**:
  - Added `onRecordHistorySnapshot` prop and `recordDragHistoryOnce()` in `src/components/EditorCanvas.tsx` so continuous drags record the **pre-drag** snapshot once on the first move frame (`hasMoved`), and no-op clicks never pollute `historyPast`.
  - Added `hasRecordedTextEditHistoryRef` in `src/components/EditorCanvas.tsx` so typing inside an on-canvas text box records one pre-edit undo snapshot per editing session.
  - Added `blurExternalInputIfFocused()` in `src/components/EditorCanvas.tsx` when interacting with the canvas so lingering focus in toolbar/sidebar inputs is blurred automatically.
  - Added synchronized refs (`docRef`, `historyPastRef`, `historyFutureRef`) in `src/App.tsx` so `pushHistory`, `handleUndo`, and `handleRedo` always operate on fresh state while keeping `activeFileHandle` preserved across Undo/Redo and Save/Save As.
  - Updated the global `onKeyDown` listener in `src/App.tsx` to guard modal dialogs, handle `Ctrl/Cmd+S` and `Ctrl/Cmd+Shift+S` globally, preserve native text editing inside inputs/textareas, allow `Ctrl/Cmd+V` without an active selection, and support single/multi-object and guideline deletion, nudging, and `Escape` deselection.

### Milestone 18 — Fix Numeric Properties Undo History (`NumericPropertyInput` Single-Operation Commit)
- **Status**: Completed
- **User Request Addressed**:
  - *"PageLay — Fix Numeric Properties Undo History"*
- **Confirmed Root Cause**:
  - Every numeric field in `src/components/PropertiesPanel.tsx` (`X/Y Position`, `Width`, `Height`, `Rotation`, `Opacity`, `Start X1/Y1`, `End X2/Y2`, `Border`, `Font Size`, `Thickness`, `Arrowhead Size`, `Witness Tick`, `Outline Thickness`, and Document `Width`/`Height`) was bound directly via `onChange={(e) => onUpdateObject(...)}` with `recordHistory = true` by default.
  - Consequently, changing Width from `72.7` to `80` fired `onUpdateObject` on `"8"` (recording `72.7` in history and mutating width to `8 mm`) and again on `"80"` (recording the intermediate `8 mm` in history and mutating width to `80 mm`), requiring two Undos (`80 -> 8 -> 72.7`) and distorting aspect-ratio-locked images or groups on intermediate keystrokes.
- **Engineering Changes**:
  - Created `NumericPropertyInput` in `src/components/PropertiesPanel.tsx` and applied it across all numeric geometry and styling fields:
    - Buffers intermediate typing locally (including decimal prefixes like `72.` and negative signs `-`) without mutating document geometry or pushing intermediate Undo entries on every keystroke.
    - Commits the validated, clamped numeric change **once** when the user presses `Enter` or leaves the field (`onBlur`), recording exactly **one** pre-edit history snapshot when the value has actually changed.
    - Restores the original pre-edit value without recording history if the user presses `Escape` or leaves an incomplete/invalid value.
    - Also grouped text-field edits in `PropertiesPanel.tsx` (`Object Label`, `Text Content`, `Dimension Text Override`) via `hasRecordedTextFieldHistoryRef` so typing in a text property field records one Undo entry per focus session.
  - Updated `handleUndo` and `handleRedo` in `src/App.tsx` to preserve `selectedObjectId` and `selectedObjectIds` when the selected object(s) still exist on the restored page so the Properties panel remains open and immediately reflects the restored numeric values on `Ctrl/Cmd+Z` and `Ctrl/Cmd+Y`.

### Milestone 19 — Freehand Pen, Freehand Highlighter and Basic Eraser
- **Status**: Completed
- **User Request Addressed**:
  - *"PageLay — Freehand Pen, Highlighter and Eraser"*
- **Engineering Changes**:
  - **Non-Destructive Millimetre Vector Stroke Model (`FreehandStrokeObject`)**:
    - Added `'pen' | 'freehand-highlighter' | 'eraser'` to `ToolType` and added `FreehandStrokeObject` (`type: 'freehand'`, `strokeTool: 'pen' | 'highlighter'`, `pointsMm: Array<{ xMm, yMm }>`, `strokeColor`, `strokeWidthMm`, `opacity`) to `src/model/documentTypes.ts`.
    - Added `syncFreehandBoundingBox`, `resizeFreehandStrokeMm`, `buildSmoothFreehandSvgPath` (quadratic Bezier midpoint smoothing), and `isPointNearFreehandStrokeMm` to `src/utils/units.ts`, and integrated `freehand` strokes into `translatePageObjectMm`, `scaleChildInGroupMm`, and `rotateChildAroundCenterMm`.
  - **Windows Snipping Tool-Style Toolbar Popovers (`src/components/TopToolbar.tsx`)**:
    - Added **Pen** split button (12 preset colour circles, `0.3–5.0 mm` thickness slider, live curved SVG preview), **Highlighter** split button (6 fluorescent colours, `2–20 mm` thickness slider, live translucent curved SVG preview), and **Eraser** button while preserving the existing rectangular **Area Highlight** tool.
  - **Canvas Freehand Drawing, Whole-Stroke Eraser & Touch Safety (`src/components/EditorCanvas.tsx`)**:
    - Implemented `drawing-freehand` and `erasing-freehand` interaction modes with distance-thresholded point sampling (`0.35 mm`) and single-path translucent rendering (`opacity: 0.38` for highlighter so strokes never self-darken).
    - Whole-stroke **Eraser** (`eraseFreehandStrokeAtMm`) erases only unlocked `freehand` Pen/Highlighter strokes on click or drag-across and strictly ignores images, text, lines, arrows, dimensions, shapes, and rectangular Area Highlights.
    - Multi-touch 2-finger pinch/pan (`startPinchAndTwoFingerPan`) and `pointercancel`/`touchcancel` cleanly discard any in-progress freehand stroke without committing stray marks.
  - **Properties Inspector, `.lay` Persistence & Vector PDF / Image Exports**:
    - Updated `src/components/PropertiesPanel.tsx` so selected `freehand` strokes can be moved, resized, rotated, aligned to page, or styled (colour, opacity, thickness in `mm`).
    - Added `sanitizeLoadedPageObjects` in `src/services/layFileService.ts` for validated `.lay` round-trip persistence.
    - Added `renderFreehandObjectToPdf` in `src/services/pdfExportService.ts` (`pdf-lib` vector SVG paths with round line caps/joins and single-path opacity) and `renderFreehandOnCanvas` in `src/services/imageExportService.ts` + `src/components/PagesSidebar.tsx`.

### Milestone 20 — Toolbar Dropdowns, Remembered Shape State & WYSIWYG Shape Preview
- **Status**: Completed
- **User Request Addressed**:
  - *"PageLay — Toolbar Dropdowns and WYSIWYG Shape Preview"*
- **Confirmed Root Causes**:
  1. **Shapes Button Reverting to "Rectangle" (`src/components/TopToolbar.tsx`)**:
     - The Shapes button derived its displayed icon and label solely from `isShapeTool ? activeTool : 'Rectangle'`. When `finishWorkspaceInteraction` returned `activeTool` to `'select'` after drawing a Circle, Ellipse, Square, or Triangle, `isShapeTool` became `false` and the button label immediately reverted to `Rectangle`.
  2. **Generic Dashed Box Preview Instead of WYSIWYG Shape (`src/components/EditorCanvas.tsx`)**:
     - The `creating-object` preview block rendered a single generic `<div className="absolute bg-blue-500/10" ... />` rectangle for all non-linear tools, without applying the `1:1` equal-side rule for `square`/`circle` or rendering the actual SVG `<rect>`, `<ellipse>`, `<polygon>`, or translucent highlight geometry.
  3. **Second Click Required to Open Tool Dropdowns (`src/components/TopToolbar.tsx`)**:
     - Clicking the main label of `Shapes`, `Pen`, `Highlighter`, or `Area Highlight` only called `onSelectTool(...)` without opening the tool's dropdown menu on the first click.
  4. **Misaligned Hardcoded Dropdown Offsets (`src/components/TopToolbar.tsx`)**:
     - Dropdown menus used hardcoded Tailwind offsets (`left-2 sm:left-60`, `sm:left-64`, `sm:left-76`, `sm:left-80`) instead of measuring each trigger button's actual bounding rect.
- **Engineering Changes**:
  - Added `lastSelectedShape` UI state in `src/components/TopToolbar.tsx` so the Shapes button remembers and displays the chosen shape (`Rectangle`, `Square`, `Ellipse`, `Circle`, or `Triangle`) and its icon even after the editor returns to `Select` post-drawing.
  - Updated `Shapes`, `Pen`, `Highlighter`, and `Area Highlight` buttons in `src/components/TopToolbar.tsx` so clicking the main button activates the tool and opens its dropdown/settings popover on the first click, while clicking outside or pressing `Escape` closes the menu without deactivating the active tool.
  - Replaced hardcoded dropdown offsets in `src/components/TopToolbar.tsx` with trigger-ref `getBoundingClientRect()` measurement (`computeMenuCoords`), viewport boundary clamping, `resize`/`scroll` listeners (including horizontal toolbar strip scroll), and `createPortal(..., document.body)`.
  - Added `computeBoxCreationGeometryMm` and an SVG WYSIWYG live creation preview in `src/components/EditorCanvas.tsx` so dragging `Rectangle`, `Square` (`1:1`), `Ellipse`, `Circle` (`1:1`), `Triangle`, or `Area Highlight` previews the exact shape geometry, aspect ratio, fill, stroke, and opacity in all drag directions.

### Milestone 21 — Critical Fix: Warn Before Discarding Unsaved Changes
- **Status**: Completed
- **User Request Addressed**:
  - *"PageLay — Critical Fix: Warn Before Discarding Unsaved Changes"*
- **Engineering Changes**:
  - **Centralised Unsaved Changes Protection (`requestDocumentReplacement` in `src/App.tsx`)**:
    - Guards all actions that can replace the active document whenever `isDirty === true`:
      1. **New Document** (desktop toolbar button and mobile `File` menu)
      2. **Open `.lay` Document** (desktop toolbar button, mobile `File` menu, native `showOpenFilePicker`, or fallback `<input type="file">`)
      3. **Load Sample A0** (desktop toolbar button, mobile `File` menu, empty-page floating bar, or inside `NewDocumentModal`)
      4. **Drag-and-Drop of a `.lay` file** onto `EditorCanvas` (`handleFilesImported` when a `.lay` file is dropped; dropping images continues to import directly into the current document)
    - When `isDirty === false`, performs the requested action immediately without unnecessary confirmation.
  - **Unsaved Changes Confirmation Modal (`UnsavedChangesModal` in `src/components/Modals.tsx`)**:
    - Displays **"Save changes before continuing?"** with *"You have unsaved changes to [document name]. Continuing without saving will discard those changes."*
    - **Save**: Executes the existing Save workflow (`handleSaveDocument`) and continues the originally requested action only after saving succeeds (`saved-native` or user-confirmed fallback download in `SaveAsModal`). If Save is cancelled or fails, preserves the current document and aborts the pending replacement.
    - **Don't Save**: Explicitly discards unsaved changes and continues the requested New, Open, Sample, or Dropped `.lay` action.
    - **Cancel**: Closes the confirmation modal and keeps the existing document, selections, Undo/Redo history, `isDirty` status, and `activeFileHandle` association untouched.
  - **Browser & Download Fallback Nuance (`SaveAsModal` in `src/components/Modals.tsx`)**:
    - In environments where `FileSystemFileHandle` direct overwrite is unavailable, explains that **Save** downloads a `.lay` copy rather than overwriting an existing file on disk, and requires explicit user confirmation (**"Confirm Saved & Continue"** vs **"Keep Current Document"**) after download initiation before replacing the current document.
  - **Browser Tab Close / Refresh Protection (`beforeunload` in `src/App.tsx`)**:
    - Attaches a standard `window` `beforeunload` listener exclusively when `isDirty === true` so the browser warns before closing or refreshing the tab with unsaved changes.

### Milestone 22 — Fix Unsafe `.lay` Drag-and-Drop and Add Import Pages via Pages Sidebar
- **Status**: Completed
- **User Request Addressed**:
  - *"PageLay — Fix Unsafe .lay Drag-and-Drop and Add Import Pages"*
- **Confirmed Root Causes of the Drag-and-Drop Bypass**:
  1. **Shared `layInputAuthorisedRef` Bypass on `action.type === 'open-file'` (`src/App.tsx`)**:
     - When `executeReplacementAction({ type: 'open-picker' })` fell back to `<input type="file">`, it set `layInputAuthorisedRef.current = true`. Because cancelling a native `<input type="file">` dialog in browsers does not fire `onChange`, `layInputAuthorisedRef.current` remained `true`. Since canvas drag-and-drop (`handleFilesImported`) also dispatched `{ type: 'open-file', file }`, `alreadyAuthorisedFromOpenPicker` evaluated to `true` and bypassed the `isDirty` guard.
  2. **Asynchronous React `isDirty` Closure vs Synchronous `isDirtyRef` & Transient `FileList` (`src/App.tsx`, `src/components/EditorCanvas.tsx`)**:
     - `requestDocumentReplacement` relied only on the React state `isDirty` closure rather than a synchronous `isDirtyRef`, several toolbar setting mutations (`showGuides`, `lockGuides`, `snapToGuides`, `snapToPageEdges`, `snapToObjects`) did not call `markDirty()`, and `EditorCanvas.tsx` passed the transient `e.dataTransfer.files` `FileList` instead of synchronously copying `Array.from(e.dataTransfer.files)` during the `drop` event.
- **Engineering Changes**:
  - **Phase 1 — Safe Canvas `.lay` Drag-and-Drop (`src/App.tsx`, `src/components/EditorCanvas.tsx`)**:
    - Removed `layInputAuthorisedRef` completely and ensured `{ type: 'open-file', file }` never has an authorisation bypass flag.
    - Added synchronous `isDirtyRef` and `markDirty()` / `markClean()` helpers in `src/App.tsx` so `requestDocumentReplacement` always checks `isDirtyRef.current || isDirty`.
    - Updated `EditorCanvas.tsx` `onDrop` to call `e.preventDefault(); e.stopPropagation();` and synchronously copy `Array.from(e.dataTransfer.files)` into a retained `File[]` array so the dropped `File` object remains valid while `UnsavedChangesModal` is displayed.
  - **Phase 2 & 5 — Independent Drop Target & Import Button in `PagesSidebar` (`src/components/PagesSidebar.tsx`)**:
    - Added isolated `onDragEnter`, `onDragOver`, `onDragLeave`, and `onDrop` handlers (`e.preventDefault(); e.stopPropagation()`) to `PagesSidebar.tsx` with a **"Drop to Import Pages"** visual overlay and a compact **Import** button + hidden `.lay` file input for mobile/tablet/desktop convenience.
    - Dropping onto the **main canvas** triggers **Open Document** (subject to the unsaved-changes guard), whereas dropping onto the **Pages sidebar** triggers **Import Pages** (appending pages to the current document without replacing it or altering its name/file handle).
  - **Phase 3 & 4 — Paper-Size Validation, Lossless Asset Merging, Collision Resolution & Single-Step Undo/Redo (`src/model/documentFactory.ts`, `src/services/layFileService.ts`, `src/App.tsx`)**:
    - Added `collectReferencedAssetIds` and `prepareImportedPagesFromDocument` in `src/model/documentFactory.ts`:
      - Validates that the source `.lay` document's physical `widthMm` and `heightMm` match the active document before importing; rejects mismatched paper sizes with a clear message showing both dimensions.
      - Imports only the `ImageAsset`s referenced by incoming pages (preserving 100% original `Uint8Array` bytes), resolves any `assetId` collisions safely, and updates all `ImageObject.assetId` references including inside nested `GroupObject`s.
      - Generates fresh unique IDs for all imported pages, guidelines, objects, and group children while preserving page names, z-order, rotations, shapes, dimensions, text formatting, and freehand Pen/Highlighter strokes.
    - Records the entire multi-page import as a **single undoable operation** (`pushHistory(currentDoc)`), keeping imported `ImageAsset`s in `doc.assets` so **Undo** followed by **Redo** restores all imported pages and images, while `serializeDocumentToLayBlob` in `src/services/layFileService.ts` filters out unreferenced orphan assets when saving `.lay` archives.

### Milestone 23 — Fix New Document Modal on Mobile Viewports
- **Status**: Completed
- **User Request Addressed**:
  - *"PageLay — Fix New Document Modal on Mobile"*
- **Engineering Changes**:
  - Updated `NewDocumentModal` in `src/components/Modals.tsx` to fit constrained mobile viewports (including Android Chrome browser toolbars, Google AI Studio's preview frame, landscape orientation, and on-screen keyboards):
    - Pinned the modal header and bottom action bar (`Cancel` and `Create Blank Document`) with `shrink-0` inside `max-h-[calc(100dvh-16px)] sm:max-h-[90dvh]` with safe-area inset padding.
    - Enabled smooth vertical touch scrolling on the form body (`flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y` with `data-allow-touch-scroll="true"`).
    - Reflowed paper-size cards (`grid-cols-2 sm:grid-cols-3`), orientation and custom dimension inputs (`grid-cols-1 sm:grid-cols-2`), and the Sample A0 callout (`flex-col sm:flex-row`) for narrow screens.

### Milestone 24 — Critical Mobile Session Recovery and Local Draft Protection
- **Status**: Completed
- **User Request Addressed**:
  - *"PageLay — Critical Mobile Session Recovery and Local Draft Protection"*
- **Engineering Changes**:
  - **Local Recovery Storage (`src/services/recoveryDraftService.ts`)**:
    - Implemented a dedicated IndexedDB database (`pagelay_local_recovery_v1`) with two atomic object stores (`draft_meta` and `draft_assets`), kept strictly separate from `.lay` archives and future Open Recent lists.
    - Preserves full document and page metadata, all pages and objects, freehand Pen and Highlighter strokes, text, dimensions, shapes, guidelines, object IDs, and original binary image assets (`Uint8Array`) without recompression or downsampling.
    - Never persists temporary `blob:` object URLs; recreates fresh `blob:` URLs from raw `Uint8Array` bytes on recovery.
    - Uses an in-memory + IndexedDB key signature check (`persistedAssetSignatures`) so unchanged multi-megabyte image binaries are never rewritten during routine edits (moving objects, drawing strokes, typing text, adjusting guidelines).
  - **Automatic Recovery Checkpoints & Concurrency Safety (`src/App.tsx`, `src/services/recoveryDraftService.ts`)**:
    - Debounces local checkpoints (`1.2s`) after meaningful document edits (`isDirty === true`).
    - Immediately flushes pending checkpoints on `visibilitychange` (`document.visibilityState === 'hidden'`), `pagehide`, `freeze` (Page Lifecycle API), and before internal document transitions (`requestDocumentReplacement`, `handleSaveDocument`, `handleSaveAsDocument`).
    - Serializes all IndexedDB operations through an async queue with a monotonically increasing `revision` counter so an older checkpoint can never overwrite a newer version or resurrect a cleared draft.
  - **Startup Recovery Prompt (`RecoveryDraftModal` in `src/components/Modals.tsx`, `src/App.tsx`)**:
    - On startup, probes IndexedDB availability (`probeRecoveryStorage`) and checks for an existing valid recovery draft (`peekRecoveryDraftSummary`) before allowing any new checkpoint writes.
    - Displays **"Recover unsaved document?"** with the document name, last recovery time, paper format, page count, and image count, offering:
      - **Recover**: Restores the document and full-resolution `Uint8Array` image assets, resets `activeFileHandle` to `null` (never assuming an old handle is still writable), and marks the document as **Unsaved** (`isDirty = true`).
      - **Discard Recovery**: Deliberately clears `draft_meta` and `draft_assets` from IndexedDB so the discarded work never returns on subsequent refreshes.
  - **Save, Save As, Discard & Document Replacement Integration (`src/App.tsx`, `src/components/StatusBar.tsx`)**:
    - Clears the recovery draft (`resolveAndClearRecoveryDraft`) when a manual **Save** or **Save As** succeeds, when the user explicitly selects **Don't Save**, or when a new/opened/sample document replaces the active session cleanly, while preserving the recovery draft if Save / Save As is cancelled or fails.
    - Keeps local recovery checkpoints distinct from explicit `.lay` saves (`StatusBar` continues to show **Unsaved** until a `.lay` file is saved, and displays a clear warning badge if IndexedDB is unavailable or over quota).

### Milestone 25 — Refine Mobile Recovery UX and Preserve Undo/Redo History
- **Status**: Completed
- **User Request Addressed**:
  - *"PageLay — Refine Mobile Recovery UX and Preserve Undo/Redo History"*
- **Confirmed Root Causes**:
  1. **Blocking Modal Shown on Every Same-Tab Mobile Reload (`src/App.tsx`, `src/services/recoveryDraftService.ts`)**:
     - On startup, `App.tsx` checked `peekRecoveryDraftSummary()` and unconditionally opened the blocking `RecoveryDraftModal` whenever any draft existed in IndexedDB, without recording or checking `window.sessionStorage` to distinguish an in-place reload of the same active browser tab (such as an Android/iPhone screen lock/unlock reload or AI Studio preview reload) from a genuine interrupted session opened in a new tab or after a browser restart.
  2. **Loss of Undo/Redo History on Recovery (`src/services/recoveryDraftService.ts`, `src/App.tsx`)**:
     - `StoredRecoveryDraftMeta` only persisted `doc` and `activePageIndex` (omitting `historyPast` and `historyFuture`), and `handleConfirmRecoverDraft` in `src/App.tsx` explicitly called `clearHistory()`. Furthermore, `draft_assets` garbage collection only scanned `doc.pages`, meaning an image that had just been deleted before a phone lock would have its binary `Uint8Array` pruned from `draft_assets` and could not be restored by Undo after recovery.
- **Engineering Changes**:
  - **Quiet Automatic Recovery of the Same Working Session (`src/services/recoveryDraftService.ts`, `src/App.tsx`)**:
    - Captures the pre-existing `window.sessionStorage` marker (`pagelay_active_tab_session_v1`) synchronously on module load (`initialTabMarkerOnLoad`) before React effects run, and binds each recovery checkpoint (`meta.tabSessionId`) and dirty state (`markTabSessionDirty` / `markTabSessionClean`) to the active tab's `tabSessionId` and `documentId`.
    - When `isSameActiveSessionReload(meta)` confirms that the reloaded tab matches the checkpoint's `tabSessionId`, `documentId`, and `isDirty === true`, `App.tsx` automatically restores the document, original images, active page, and Undo/Redo history (`applyRestoredRecoveryDraft`) without showing a blocking modal, displaying a discreet `"Draft restored locally"` toast notification.
    - When session identity is uncertain (new tab, closed tab, or full browser restart), PageLay requires explicit user confirmation via `RecoveryDraftModal`.
  - **Full Undo/Redo History & Deleted Asset Preservation Across Recovery (`src/services/recoveryDraftService.ts`, `src/App.tsx`)**:
    - Extended `StoredRecoveryDraftMeta` to persist bounded `historyPast` and `historyFuture` stacks (up to `40` snapshots each, with an automatic `8`-snapshot fallback if storage quota is tight) tagged with `historyDocumentId = doc.id`.
    - Added `collectAllReferencedAssetIdsAcrossHistory(pagesClone, boundedPast, boundedFuture)` so `draft_assets` retains all binary `Uint8Array` image assets referenced by either the current pages OR any snapshot in `historyPast` / `historyFuture` without duplicating binary bytes across history entries.
    - Updated `applyRestoredRecoveryDraft` in `src/App.tsx` to restore `restored.historyPast` and `restored.historyFuture` directly so Undo (`Ctrl/Cmd+Z` / toolbar Undo) and Redo (`Ctrl/Cmd+Y` / toolbar Redo) immediately work after recovery—including restoring objects or images deleted just before a phone lock.
  - **Friendlier Interrupted-Session Recovery Modal (`src/components/Modals.tsx`)**:
    - Updated `RecoveryDraftModal` with the heading **"Continue editing your document?"**, reassuring copy (*"PageLay found a locally saved working draft of [document name]. You can continue where you left off."*), primary button **Continue Editing**, and secondary button **Discard Draft** protected by a two-step inline confirmation (**Keep Draft** vs **Permanently Discard**), while displaying the document name, last recovery timestamp, paper size, page/image count, and preserved Undo/Redo step counts.
    - Upon selecting **Continue Editing**, `restoreRecoveryDraft()` binds the checkpoint to the current `tabSessionId` in IndexedDB and `sessionStorage` so subsequent reloads in that tab recover quietly without re-prompting.

### Milestone 26 — Mobile Delete Button in Floating Canvas Toolbar and Save As Modal Keyboard Fix
- **Status**: Completed
- **User Request Addressed**:
  - *"PageLay — Mobile Delete Button and Save As Modal Fix"*
- **Engineering Changes**:
  - **1. Floating Canvas Toolbar Delete Action (`src/components/EditorCanvas.tsx`, `src/App.tsx`, `src/components/PropertiesPanel.tsx`)**:
    - Added a shared `handleDeleteSelected` callback and `canDeleteSelected` computed state in `src/App.tsx` used by both the desktop `Delete` / `Backspace` keyboard shortcuts and the floating bottom-right canvas toolbar:
      - Deletes a single selected unlocked object or multiple selected unlocked objects together as a **single Undo operation** (`pushHistory`), marking the document dirty for Save and local IndexedDB recovery while keeping `doc.assets` intact so Undo and recovery retain full-resolution images.
      - Strictly respects object locks (`o.locked`): locked objects cannot be deleted from the floating toolbar, keyboard shortcuts, or Properties Panel header until unlocked.
      - Supports deleting a selected guideline when only a guideline is selected and `doc.lockGuides` is `false`.
    - Updated the bottom-right floating toolbar in `src/components/EditorCanvas.tsx` to display a distinct `40 × 40 px` (`w-10 h-10 min-w-[40px] min-h-[40px]`) rose-tinted `Trash2` Delete button separated by a vertical divider next to the zoom controls exclusively when `canDeleteSelected` is `true`.
  - **2. Mobile Save As Modal Keyboard & Viewport Scrolling (`src/components/Modals.tsx`, `src/index.css`)**:
    - Added `useVisualViewportCssVars` in `src/components/Modals.tsx` and `.modal-viewport-overlay` / `.modal-viewport-card` in `src/index.css` to track `window.visualViewport` height and top offset when mobile on-screen keyboards appear.
    - Updated `SaveAsModal` in `src/components/Modals.tsx` to match the responsive mobile pattern of `NewDocumentModal`:
      - Pinned header (`shrink-0`) keeping the title and Close button visible.
      - Independently scrollable form body (`flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y` with `data-allow-touch-scroll="true"`).
      - Pinned footer (`shrink-0`) keeping **Cancel** / **Keep Current Document** and **Save .lay** / **Confirm Saved & Continue** accessible at all times, including in short landscape viewports and when the Android/iPhone on-screen keyboard is open (`items-start sm:items-center` + `max-sm:max-h-[min(56dvh,calc(var(--vv-height,100dvh)-16px))]` while editing the filename on mobile).
      - Avoids automatically focusing the filename input on mobile/coarse-pointer devices when the modal first opens so the keyboard only appears when the user taps the field, while preserving automatic focus and filename selection on desktop.

### Milestone 27 — Fix Mobile Open: Document Disappears After 2–3 Seconds
- **Status**: Completed
- **User Request Addressed**:
  - *"PageLay — Fix Mobile Open: Document Disappears After 2–3 Seconds"*
- **Confirmed Root Causes**:
  1. **Wiping IndexedDB on Open + Preview Remount 2–3 Seconds After Android File Picker Return (`src/App.tsx`, `src/services/recoveryDraftService.ts`)**:
     - When opening a `.lay` file via `<input type="file">` (`openLayFileAndApply`) or native file picker (`handleTriggerOpenNativePicker`), PageLay applied `loadedDoc` to React state and then immediately called `markClean()` + `resolveAndClearRecoveryDraft()`. That **deleted the IndexedDB checkpoint (`draft_meta` and `draft_assets`)** and marked `isDirty: false`. Because the newly opened document was clean (`isDirty === false`), the debounced recovery effect refused to write `loadedDoc` to IndexedDB.
     - On Android inside Google AI Studio's preview (and mobile browsers returning from the external `DocumentsUI` file-picker Activity), the host container or browser sometimes reloads or recreates the preview `<iframe>` ~2–3 seconds after returning from the file picker. When `App.tsx` remounted, it initialized `createNewDocument('Untitled A0 Layout', 'A0', 'landscape')`, checked IndexedDB, found nothing (because `openLayFileAndApply` had just cleared IndexedDB and `isSameActiveSessionReload` previously rejected `!isDirty`), and remained on the blank A0 document.
  2. **Startup Recovery `useEffect` Dependency Re-run & `!isDirtyRef.current` Race (`src/App.tsx`)**:
     - `fitPageToWorkspace` previously depended on `[doc.widthMm, doc.heightMm]`, which caused `applyRestoredRecoveryDraft` and the startup `useEffect` (`[applyRestoredRecoveryDraft]`) to re-run its cleanup (`cancelled = true`) whenever a document with non-A0 dimensions was opened, leaving `isRecoveryReady` stuck at `false`.
     - Additionally, the startup recovery `useEffect` only checked `if (existingSummary && !isDirtyRef.current)` before restoring a draft. Because a freshly opened `.lay` document is legitimately clean (`isDirtyRef.current === false`), a delayed startup recovery read completing after a file open could see `!isDirtyRef.current === true` and overwrite the newly opened document.
- **Engineering Changes**:
  - **1. Active Clean Session Persistence on Open, Save, Sample & New Document (`src/services/recoveryDraftService.ts`, `src/App.tsx`)**:
    - Extended `saveRecoveryCheckpoint` to accept `{ isDirty?: boolean }` and added `persistCleanActiveDocumentCheckpoint` in `src/App.tsx`.
    - Whenever a `.lay` document is opened (`openLayFileAndApply` or `handleTriggerOpenNativePicker`), saved (`handleSaveDocument`, `handleSaveAsDocument`, `SaveAsModal`), or replaced (`loadSampleDocumentImmediate`, `create-blank`), PageLay immediately persists the active document and its binary image assets to IndexedDB with `isDirty: false` and `hasActiveSessionDoc: true`, and mirrors the active session marker to both `window.sessionStorage` and `window.localStorage` (`pagelay_active_session_mirror_v1`).
    - If the mobile browser or embedded preview `<iframe>` remounts/reloads 2–3 seconds after returning from the Android/iPhone file picker (or after locking/unlocking the phone), `peekRecoveryDraftSummary` and `isSameActiveSessionReload` recognize the active session document and `applyRestoredRecoveryDraft` seamlessly restores it with `isDirty: false`—while ensuring clean documents never trigger a recovery modal in a new tab or later session.
  - **2. Monotonic Document Session Generation Guard (`documentSessionGenRef` in `src/App.tsx`)**:
    - Added `documentSessionGenRef` and `hasUserReplacedOrEditedDocRef` in `src/App.tsx`. Every file open, new document creation, sample load, or user edit increments `documentSessionGenRef.current` and sets `hasUserReplacedOrEditedDocRef.current = true`.
    - Both the startup recovery `useEffect` and `applyRestoredRecoveryDraft(expectedSessionGen)` verify `documentSessionGenRef.current === expectedSessionGen && !hasUserReplacedOrEditedDocRef.current` before and after awaiting IndexedDB operations so a slow startup recovery check can never overwrite a newly opened clean `.lay` document.
    - Stabilized `fitPageToWorkspace` (`[]` dependencies, reading `docRef.current` defaults) so opening a document with different dimensions never cancels startup recovery initialization.
  - **3. Synchronous Native Picker Capability Check (`canUseNativeOpenFilePickerSync` in `src/services/layFileService.ts`, `src/App.tsx`)**:
    - Added `canUseNativeOpenFilePickerSync()` so mobile browsers and cross-origin preview iframes trigger `hiddenLayInputRef.current?.click()` synchronously inside the user's tap gesture without awaiting a rejected async promise.
  - **4. Concise Lifecycle Diagnostics (`logDocumentLifecycle` in `src/App.tsx`)**:
    - Added structured `[PageLay Lifecycle]` console diagnostics tracing initial blank state creation, startup recovery checks, `.lay` file open start/apply, clean session checkpoint persistence, and recovery draft clearing.

### Milestone 28 — Desktop Mouse Wheel Navigation Refinement
- **Status**: Completed
- **User Request Addressed**:
  - *"PageLay — Desktop Mouse Wheel Navigation"*
- **Engineering Changes**:
  - Updated `handleWheel` in `src/components/EditorCanvas.tsx`:
    - **`Ctrl + Wheel` (including `Ctrl + Shift + Wheel`)**: Returns immediately without calling `e.preventDefault()`, allowing the browser's normal page/tab zoom.
    - **`Shift + Wheel`**: Zooms PageLay's canvas in/out centred around the mouse pointer (`e.deltaY !== 0 ? e.deltaY : e.deltaX`) using `onZoomChange` and `onPanChange`.
    - **`Alt + Wheel`**: Pans the canvas horizontally (`panX - panDelta`).
    - **`Wheel` alone**: Pans vertically (and preserves normal horizontal trackpad two-finger panning when `deltaX` is present).

### Milestone 29 — Open Recent Documents (Maximum 10 Documents)
- **Status**: Completed
- **User Request Addressed**:
  - *"PageLay — Implement Open Recent (Maximum 10 Documents)"*
- **Engineering Changes**:
  - **1. Dedicated Recent Files Service (`src/services/recentFilesService.ts`)**:
    - Implemented `MAX_RECENT_DOCUMENTS = 10`, `RecentDocumentEntry`, `loadRecentDocuments`, `recordRecentDocument`, `removeRecentDocumentEntry`, `clearAllRecentDocuments`, `tryReopenRecentFromStoredHandle`, and `formatRecentTimestamp`.
    - Stores lightweight metadata (`id`, `filename`, `documentName`, `documentId`, `lastOpenedOrSavedAt`, `paperSize`, `orientation`, `hasStoredHandle`) in `window.localStorage` (`pagelay_recent_documents_v1`).
    - Persists structured-cloneable `FileSystemFileHandle` references in a dedicated IndexedDB database (`pagelay_recent_files_v1` / store `recent_handles`) strictly separated from `pagelay_local_recovery_v1`, never storing `.lay` ZIP archives or binary image assets.
    - Deduplicates using `FileSystemFileHandle.isSameEntry()` when handles exist or `(documentId + filename)` when handles do not exist, without falsely merging two different files that merely share a filename.
  - **2. File Menu & Desktop Toolbar Integration (`src/components/TopToolbar.tsx`)**:
    - Updated the mobile `File` menu in exact order:
      1. `New Document`
      2. `Open .lay Document`
      3. `Open Recent` (inline collapsible list with touch scrolling, entry remove button, and two-step `Clear Recent History`)
      4. `Save`
      5. `Save As`
      6. `Sample A0`
    - Added a compact `Recent` dropdown button immediately beside `Open` on the desktop toolbar while retaining the existing inline `New` / `Open` / `Save` / `Save As...` / `Sample A0` controls.
  - **3. Direct Handle Reopen, Mobile Fallback Modal & Unsaved Changes Guard (`src/App.tsx`, `src/components/Modals.tsx`)**:
    - Routed all Open Recent selections through `requestDocumentReplacement({ type: 'open-recent', entry })` so dirty documents always show the `Save changes before continuing?` modal (`Save`, `Don't Save`, `Cancel`).
    - When a stored desktop `FileSystemFileHandle` is available and granted permission, `tryReopenRecentFromStoredHandle` reads and parses the `.lay` file directly and retains the writable handle for subsequent `Save` operations.
    - When no handle is stored (mobile Android/iPhone, embedded preview, or download fallback) or when a file was moved, deleted, or had permissions revoked, opens `ReopenRecentModal` with **"Choose File to Reopen"** to launch the file picker directly from a trusted user click gesture without discarding the current document if cancelled.

### Milestone 30 — Genuine Quick Reopen & Local `.lay` Caching for Open Recent
- **Status**: Completed
- **User Request Addressed**:
  - *"PageLay — Make Open Recent Actually Reopen Documents"*
- **Engineering Changes**:
  - **1. Three-Tier Quick Reopen Priority (`src/services/recentFilesService.ts`, `src/App.tsx`)**:
    1. **Direct Original File Handle**: Where a valid `FileSystemFileHandle` exists and is supported in the current browser context, reopens the original file directly from disk and retains the writable handle for subsequent `Save` operations.
    2. **Locally Cached `.lay` Copy**: Where a persistent file handle is unavailable (such as in Google AI Studio's embedded preview, mobile Android/iPhone browsers, drag-and-drop opens, or download-based saves), immediately reopens the locally cached `.lay` binary snapshot with a single click (`activeFileHandle = null`, clearly notifying the user that `Save` will ask to choose a destination rather than silently overwriting a disk file).
    3. **Manual Reselection (`ReopenRecentModal`)**: Only prompts the user to locate the file when neither a usable handle nor a cached local copy is available (or when a stored handle encountered `NotFoundError` or `permission-denied`).
  - **2. Quota-Checked Local `.lay` Binary Caching (`pagelay_recent_files_v1` / `recent_blobs`)**:
    - Added the `recent_blobs` object store in `pagelay_recent_files_v1` (strictly separate from `pagelay_local_recovery_v1`), storing the untouched `.lay` `Blob` on Open, Save, Save As, and download-based Save without altering original image bytes or document geometry.
    - Enforces conservative per-file (`MAX_SINGLE_CACHED_LAY_BYTES = 25 MB`), total-cache (`MAX_TOTAL_CACHED_LAY_BYTES = 80 MB`), and free browser storage headroom (`MIN_FREE_QUOTA_HEADROOM_BYTES = 60 MB`) limits via `navigator.storage.estimate()` so `pagelay_local_recovery_v1` recovery checkpoints are never compromised.
    - Automatically removes obsolete cached `.lay` blobs when an entry is removed, pruned past 10 entries, or cleared.
  - **3. Missing File (`NotFoundError`) Handling & Honest Status Labels (`src/components/TopToolbar.tsx`, `src/components/Modals.tsx`)**:
    - When a stored `FileSystemFileHandle` throws `NotFoundError`, notifies the user that the original file no longer exists; automatically removes the invalid recent entry if no cached copy exists, or retains the entry and offers **"Open Local Copy"** in `ReopenRecentModal` if a cached snapshot is available.
    - Updated the Recent list UI in `TopToolbar.tsx` to clearly distinguish **`Open directly`** (accessible original file), **`Local copy`** (cached version available), and **`Locate file`** (neither available).

### Milestone 31 — Responsive Desktop Drawing Tools Ribbon
- **Status**: Completed
- **User Request Addressed**:
  - *"PageLay — Responsive Drawing Tools Ribbon"*
- **Engineering Changes**:
  - **1. Desktop-Only Pointer Detection & Zero Mobile Impact (`src/components/TopToolbar.tsx`)**:
    - Added `detectDesktopFinePointer()` checking `(hover: hover) and (pointer: fine)` and excluding `(pointer: coarse)` so responsive scroll controls, edge fades, and wheel listeners apply **strictly** to desktop/laptop viewports using a mouse or trackpad.
    - Mobile/touch layouts (`Android` and `iPhone`) retain their exact single-row `.touch-scroll-x no-scrollbar` horizontal finger-swipe ribbon without any added buttons, fade overlays, or layout changes.
  - **2. Overflow Detection, Docked Scroll Arrows & Edge Fades (`src/components/TopToolbar.tsx`)**:
    - Added hysteresis-free overflow measurement (`updateRibbonScrollState`) connected to `ResizeObserver`, `window` resize, `window.visualViewport` resize, and ribbon `scroll` events so the ribbon adapts automatically when the browser window is resized or browser zoom changes.
    - When `isDesktopPointer && hasRibbonOverflow` is true, renders compact left/right scroll arrow buttons (`ChevronLeft` / `ChevronRight`) docked cleanly at the outer ends of the ribbon (never covering the first `Select` or last `Guides & Snap` tool buttons), disabling each arrow when its respective scroll end is reached (`canScrollRibbonLeft` / `canScrollRibbonRight`).
    - Renders subtle left/right gradient edge fades (`bg-gradient-to-r` / `bg-gradient-to-l`) on desktop whenever additional tools remain scrolled out of view in that direction.
  - **3. Mouse-Wheel Horizontal Scrolling, Active Tool Visibility & Dropdown Sync (`src/components/TopToolbar.tsx`)**:
    - Added a desktop-only native `{ passive: false }` wheel listener on `toolStripRef` so vertical mouse-wheel scrolling over the drawing-tools ribbon scrolls tools horizontally, while preserving native two-axis horizontal trackpad scrolling and never intercepting `Ctrl + Wheel` (or `Meta + Wheel`) browser zoom.
    - Added `data-tool-id` attributes and `ensureActiveToolVisibleOnDesktop` so selecting a tool on desktop automatically scrolls it into view if partially clipped.
    - Updated `handleOutsidePointerDown` so clicking the left/right ribbon scroll arrows does not close an open tool dropdown (Pen, Highlighter, Shapes, Precision, or Guides & Snap), while `updatePopoverPositions` keeps anchored React portal menus synchronized with their trigger buttons during scroll.

### Milestone 32 — Integrated Help & How To Manual (Version 1)
- **Status**: Completed
- **User Request Addressed**:
  - *"PageLay — Help & How To (Version 1)"*
- **Engineering Changes**:
  - **1. Structured Local Help Content & Offline Search (`src/content/helpContent.ts`)**:
    - Created a read-only local manual written in British English and organised into 10 practical sections (`Getting Started`, `Pages and Layout`, `Drawing Tools`, `Precision and Snapping`, `Images and Objects`, `Opening and Saving`, `Recovery and Undo`, `Exporting`, `Mobile and Keyboard Controls`, and `Troubleshooting`).
    - Included `searchHelpArticles(rawQuery)` for instant offline search across section titles, article titles, summaries, keywords, step-by-step instructions, bullet points, callout warnings, and shortcuts without any external API calls.
    - Prepared an optional `illustrations?: HelpArticleIllustration[]` interface for future screenshots/diagrams without introducing invented screenshots or placeholder assets in Version 1.
  - **2. Responsive Help Panel & Toolbar Button (`src/components/HelpPanel.tsx`, `src/components/TopToolbar.tsx`, `src/App.tsx`)**:
    - Added the **Help** button (`CircleHelp` icon) in `TopToolbar.tsx` immediately between **Properties** and **Export**, showing the icon + `Help` label on desktop (`lg+`) and the compact question-mark icon on smaller laptop screens and mobile (`< 1024px`).
    - On desktop (`lg+`), `HelpPanel` opens as a docked right-side scrollable panel (`lg:w-[352px]`), mutually exclusive with `PropertiesPanel` so only one right-hand panel is open at a time.
    - On phone and tablet (`max-lg`), `HelpPanel` opens as a full-screen responsive in-app view with touch scrolling (`data-allow-touch-scroll="true"`, `touch-scroll-y`), search input keyboard isolation, and clear `Back` / `Close` actions that return directly to the editor while preserving document state, selection, zoom, pan, history, and unsaved changes.

---


### Milestone 33 — First Public Deployment (8 November 2026)
- **Status**: Completed
- **Public URL**: https://pagelay.look4ideas.com
- **Hosting**: IONOS static web hosting, deployed via FTP.
- **Development Environment**: VS Code, Windows, Node.js, React, TypeScript and Vite.
- **Source Control**: GitHub — `drspinosa/pagelay`.
- **Deployment Process**:
  - Validated TypeScript using `npm.cmd run lint`.
  - Generated production files using `npm.cmd run build`.
  - Copied `dist/` contents to the locally excluded `webpage/` deployment folder.
  - Uploaded the production files to the IONOS subdomain document root using FTP.
- **Release Features**:
  - Responsive desktop and mobile page-layout editor.
  - A0–A4 and custom page dimensions with millimetre-based precision.
  - Drawing, annotation, image placement and multi-page layouts.
  - Editable `.lay` files, Open Recent and browser-based recovery.
  - Vector PDF and high-resolution image export.
  - Integrated searchable Help & How To manual.
  - PageLay favicon and mobile home-screen icon.
- **Verification**:
  - Production build and TypeScript validation passed.
  - Public application loaded successfully.
  - Desktop ribbon and Help manual tested locally.
  - Favicon confirmed working on the public website.
- **Future Improvements**:
  - Further mobile/browser compatibility testing.
  - Optional annotated Help illustrations.
  - Continued refinement based on user feedback.


## 3. Keyboard & Mouse Shortcuts Reference

| Shortcut | Action |
| :--- | :--- |
| `Wheel` | Pan canvas vertically (and horizontally on 2-axis trackpads); scroll drawing-tools ribbon horizontally when hovering the desktop ribbon |
| `Alt + Wheel` | Pan canvas horizontally |
| `Shift + Wheel` | Zoom canvas in / out centred around the mouse pointer |
| `Ctrl + Wheel` | Native browser tab / page zoom (not intercepted by PageLay) |
| `Ctrl + Click` / `⌘ + Click` (or `Shift + Click`) | Add or toggle multiple objects in selection on the canvas |
| `Shift + Rotate` | Constrain object/group rotation to configured angle increment (`1°`–`45°`, default `15°`) |
| `Shift + Drag` (Line / Arrow / Dimension) | Snap start point to `1 mm`, physical length to `1 mm`, and angle to configured increment + cardinal axes |
| `Shift + Drag` (Guideline) | Constrain guideline movement to exact `1 mm` whole-millimetre increments |
| `Ctrl / Cmd + Z` | Undo last action |
| `Ctrl / Cmd + Y` or `Ctrl / Cmd + Shift + Z` | Redo action |
| `Ctrl / Cmd + S` | Save changes to active `.lay` file (or prompt once if never saved) |
| `Ctrl / Cmd + Shift + S` | Save As... (choose new filename/location and update active file handle) |
| `Ctrl / Cmd + A` | Select all objects on the active page |
| `Ctrl / Cmd + G` | Group selected objects (`2+` objects) |
| `Ctrl / Cmd + Shift + G` | Ungroup selected group entity |
| `Ctrl / Cmd + L` | Lock / Unlock selected object(s) |
| `Ctrl / Cmd + C` | Copy selected object |
| `Ctrl / Cmd + V` | Paste copied object |
| `Ctrl / Cmd + D` | Duplicate selected object |
| `Delete` / `Backspace` | Delete selected object(s) or selected guideline |
| `Arrow Keys` | Nudge selected object(s) by `1 mm` (`10 mm` with `Shift`) |
| `Spacebar + Drag` | Pan / slide canvas |
| `Escape` | Exit text editing / crop mode / cancel inline guide edit, reset tool to Select, or deselect object(s) |

---

## 4. Feature & Verification Matrix

| Subsystem | Key Files | Status | Notes |
| :--- | :--- | :---: | :--- |
| Canonical `mm` Data Model | `src/model/documentTypes.ts`, `src/utils/units.ts` | Verified | ISO A0–A4 + Custom sizes, `GroupObject`, `FreehandStrokeObject`, DPI math |
| Zoom-Invariant Canvas | `src/components/EditorCanvas.tsx` | Verified | 1:1 `mm` layout scaled via GPU compositor |
| Mobile Touch & Pinch Zoom | `src/components/EditorCanvas.tsx`, `src/index.css` | Verified | 1-finger pan, 2-finger pinch zoom & focal pan, multi-touch stroke cancel |
| Desktop Mouse Wheel Navigation | `src/components/EditorCanvas.tsx` | Verified | `Wheel` vertical pan, `Alt+Wheel` horizontal pan, `Shift+Wheel` pointer-centred zoom, `Ctrl+Wheel` native browser zoom |
| Responsive Drawing Tools Ribbon | `src/components/TopToolbar.tsx` | Verified | Desktop-only overflow detection, docked left/right scroll arrows, edge fades, vertical mouse-wheel horizontal scroll, mobile touch-scroll preserved |
| Viewport & Overflow Lock | `index.html`, `src/index.css`, `src/App.tsx` | Verified | `100dvh` lock, `overscroll-none`, isolated drawer positioning |
| Ruler & Guideline Isolation | `src/components/Rulers.tsx`, `src/components/EditorCanvas.tsx` | Verified | Target & coordinate checks prevent accidental page pan |
| Magnetic Snap to Objects | `src/components/EditorCanvas.tsx`, `src/components/TopToolbar.tsx` | Verified | Snaps to edges & centres of other objects + TopToolbar toggle |
| Configurable Angle & Linear `1 mm` Precision | `src/components/EditorCanvas.tsx`, `src/components/TopToolbar.tsx`, `src/components/PropertiesPanel.tsx` | Verified | `1°–45°` angle snap, `1 mm` line start & length snap + trigonometric endpoint precision, `1 mm` guide snap, Touch Precision Mode |
| Freehand Pen, Highlighter & Eraser | `src/components/TopToolbar.tsx`, `src/components/EditorCanvas.tsx`, `src/services/pdfExportService.ts` | Verified | Snipping Tool-style colour/thickness popovers, smooth `mm` vector paths, whole-stroke Eraser |
| Page Alignment Controls | `src/components/PropertiesPanel.tsx` | Verified | Left, Center H, Right, Top, Center V, Bottom, Center Both |
| Multi-Select & Grouping | `src/App.tsx`, `src/components/PropertiesPanel.tsx`, `src/components/EditorCanvas.tsx` | Verified | `Ctrl/⌘ + Click` multi-select, synchronized move, resize, rotate, align |
| Undo/Redo & Keyboard Shortcuts Suite | `src/App.tsx`, `src/components/EditorCanvas.tsx` | Verified | Pre-drag history snapshots, Undo (`Ctrl+Z`), Redo (`Ctrl+Y`/`Ctrl+Shift+Z`), Save (`Ctrl+S`), Save As (`Ctrl+Shift+S`), Select All (`Ctrl+A`), Lock (`Ctrl+L`), Group (`Ctrl+G`) |
| `.lay` Archive Save / Save As / Open & Page Import | `src/services/layFileService.ts`, `src/components/PagesSidebar.tsx`, `src/components/Modals.tsx` | Verified | `FileSystemFileHandle` in-place overwrite, `showOpenFilePicker`, lossless `Uint8Array` asset preservation, sidebar `.lay` page import |
| Open Recent Documents (Max 10) | `src/services/recentFilesService.ts`, `src/components/TopToolbar.tsx`, `src/components/Modals.tsx`, `src/App.tsx` | Verified | 3-tier quick reopen: 1. `FileSystemFileHandle`, 2. Cached `.lay` Blob in `pagelay_recent_files_v1` / `recent_blobs`, 3. `ReopenRecentModal` picker |
| Local Session Recovery & Undo/Redo Persistence | `src/services/recoveryDraftService.ts`, `src/App.tsx`, `src/components/Modals.tsx` | Verified | Quiet same-tab reload recovery (`sessionStorage` + IndexedDB), full `historyPast`/`historyFuture` & deleted image asset retention, "Continue editing your document?" modal |
| Integrated Help & How To Manual | `src/content/helpContent.ts`, `src/components/HelpPanel.tsx`, `src/components/TopToolbar.tsx`, `src/App.tsx` | Verified | 10-section searchable British English manual, docked right panel on desktop (`~352px`) replacing Properties, full-screen in-app view on mobile |
| Vector PDF & High-DPI Export | `src/services/pdfExportService.ts`, `src/services/imageExportService.ts` | Verified | `pdf-lib` vector output + 72/150/300 DPI PNG/JPG |
