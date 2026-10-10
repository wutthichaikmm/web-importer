# Web Importer UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the frontend as a tabbed, one-screen workspace (chapter list + sticky control panel) with range selection, retry of failed chapters, and a start button that is enabled as soon as the TOC loads.

**Architecture:** Selection, status and button-state rules become pure functions in `public/app-core.js` (unit-tested with `node --test`). DOM code splits into `public/importer.js` (web tab), `public/file-tools.js` (file tab) and `public/app.js` (tabs + bootstrap). Rows are built once per TOC load/reorder and updated in place.

**Tech Stack:** Plain HTML, CSS, ES modules in the browser; Node 20+ `node:test`; Express server unchanged.

**Spec:** `docs/superpowers/specs/2026-10-10-ui-redesign-design.md`

## Global Constraints

- No framework, no new dependencies, no build step. Backend, `/api/toc`, `/api/chapter` and `buildExportText` output unchanged.
- UI copy is Thai. Exact labels: tabs `ดึงจากเว็บ`, `จัดการไฟล์ .txt`; buttons `ดึงสารบัญ`, `เลือกทั้งหมด` / `ยกเลิกทั้งหมด`, `เลือกช่วง`, `สลับลำดับ`, `เริ่มดึง N ตอน`, `หยุด`, `ลองดึงตอนที่ไม่สำเร็จ (k)`, `ดาวน์โหลด .txt (n ตอน)`, `เริ่มใหม่`.
- Range errors, verbatim: `ช่วงตอนต้องเป็นจำนวนเต็มบวก`, `ตอนเริ่มต้นต้องไม่มากกว่าตอนสิ้นสุด`, `ไม่พบตอนในช่วง {from}–{to}` (en dash).
- Chapter `status` ∈ `idle | queued | fetching | done | error | stopped`.
- Dark warm palette (existing `--ink`, `--surface*`, `--line*`, `--accent*`, `--success`, `--danger` values); no glows or background gradients. Font stack: `"Noto Sans Thai", "Noto Sans TC", "Microsoft JhengHei", Tahoma, sans-serif`.
- Layout: two columns (list + 320px sticky panel) at ≥ 900px; single column below 900px with list `max-height: 60vh`; list `min-height: 360px`.
- File tab keeps encoding `auto` and range defaults `205`–`400`.
- No commits unless the user asks (uncommitted user work is on the branch).

## Review Focus

- Stop, then Retry as soon as it enables → no chapter in the new run is overwritten by a late response from the stopped run (Task 4 browser check 6).
- Reverse order / change start number after chapters are done → download follows the current list order; titles unchanged (Task 1 `exportableChapters` order test, Task 4 check 8).
- New TOC or `เริ่มใหม่` while chapters are done → confirm first; Cancel keeps the list and its content (Task 4 check 9).
- TOC request fails (FlareSolverr error) → one error message under the URL, status pill shows error, `ดึงสารบัญ` re-enabled, existing list kept (Task 4 check 10).
- Long Chinese titles and 390px width → no horizontal page scroll; titles ellipsize with the full title in `title` (Task 4 check 11).

---

### Task 1: Pure selection and control-state functions

**Files:**
- Modify: `public/app-core.js` (append after `buildExportText`)
- Test: `test/client-core.test.js`

**Interfaces:**
- Produces (all exported from `public/app-core.js`; `Chapter = { idx, title, url, chapterNumber, selected, status, content, error }`):
  - `selectChapterRange(chapters: Chapter[], from: string|number, to: string|number): Chapter[]` — new array of shallow copies with `selected = from <= chapterNumber <= to`; does not mutate input; throws `Error` with the verbatim range messages.
  - `chaptersToStart(chapters): Chapter[]` — `selected && status === "idle"`.
  - `chaptersToRetry(chapters): Chapter[]` — `selected && (status === "error" || status === "stopped")`.
  - `exportableChapters(chapters): Chapter[]` — `selected && status === "done"`, input order.
  - `runProgress(chapters): { total, finished, done, error, stopped, remaining }` — `finished = done + error + stopped`, `remaining = queued + fetching`.
  - `importerControls({ chapters, tocLoading, running, stopping }): { total, selected, locked, start: { visible, disabled, count }, stop: { visible, disabled }, retry: { visible, disabled, count }, download: { disabled, count } }` with `locked = tocLoading || running`, `start.visible = !running`, `start.disabled = tocLoading || start.count === 0`, `stop.visible = running`, `stop.disabled = stopping`, `retry.visible = !running && retry.count > 0`, `retry.disabled = tocLoading`, `download.disabled = download.count === 0`.

- [ ] **Step 1: Write the failing tests** (add the new names to the existing import; helper at top of the new block)

```js
const chapter = (idx, overrides = {}) => ({
  idx, title: `第${idx + 1}章`, url: `https://example.com/${idx + 1}`,
  chapterNumber: idx + 1, selected: true, status: "idle", content: "", error: "",
  ...overrides,
});
const ids = (chapters) => chapters.map(({ idx }) => idx);

test("selectChapterRange selects the inclusive range without mutating input", () => {
  const chapters = Array.from({ length: 5 }, (_, i) => chapter(i, { selected: i === 0 }));
  assert.deepEqual(selectChapterRange(chapters, "2", "4").map((c) => c.selected),
    [false, true, true, true, false]);
  assert.equal(chapters[0].selected, true);
});

test("selectChapterRange matches displayed chapter numbers", () => {
  const chapters = Array.from({ length: 5 }, (_, i) => chapter(i, { chapterNumber: 101 + i }));
  assert.deepEqual(selectChapterRange(chapters, 102, 103).map((c) => c.selected),
    [false, true, true, false, false]);
});

test("selectChapterRange rejects invalid ranges", () => {
  const chapters = Array.from({ length: 5 }, (_, i) => chapter(i));
  for (const [from, to] of [["", "3"], ["0", "3"], ["1.5", "3"], ["2", "x"]]) {
    assert.throws(() => selectChapterRange(chapters, from, to), /ช่วงตอนต้องเป็นจำนวนเต็มบวก/);
  }
  assert.throws(() => selectChapterRange(chapters, "4", "2"), /ตอนเริ่มต้นต้องไม่มากกว่าตอนสิ้นสุด/);
  assert.throws(() => selectChapterRange(chapters, "50", "60"), /ไม่พบตอนในช่วง 50–60/);
});

test("chaptersToStart returns selected chapters never fetched", () => {
  const chapters = [chapter(0), chapter(1, { selected: false }), chapter(2, { status: "done" }),
    chapter(3, { status: "error" }), chapter(4, { status: "stopped" })];
  assert.deepEqual(ids(chaptersToStart(chapters)), [0]);
});

test("chaptersToRetry returns selected failed or stopped chapters", () => {
  const chapters = [chapter(0, { status: "done" }), chapter(1, { status: "error", selected: false }),
    chapter(2, { status: "error" }), chapter(3, { status: "stopped" }), chapter(4)];
  assert.deepEqual(ids(chaptersToRetry(chapters)), [2, 3]);
});

test("exportableChapters keeps list order of selected done chapters", () => {
  const chapters = [chapter(2, { status: "done" }), chapter(0, { status: "done" }),
    chapter(1, { status: "done", selected: false }), chapter(3, { status: "error" })];
  assert.deepEqual(ids(exportableChapters(chapters)), [2, 0]);
});

test("runProgress counts the chapters of a run", () => {
  const statuses = ["done", "done", "error", "stopped", "fetching", "queued"];
  assert.deepEqual(runProgress(statuses.map((status, i) => chapter(i, { status }))),
    { total: 6, finished: 4, done: 2, error: 1, stopped: 1, remaining: 2 });
});

test("importerControls enables start as soon as the TOC has loaded", () => {
  const controls = importerControls({
    chapters: [chapter(0), chapter(1), chapter(2)], tocLoading: false, running: false, stopping: false,
  });
  assert.deepEqual(controls.start, { visible: true, disabled: false, count: 3 });
  assert.equal(controls.stop.visible, false);
  assert.equal(controls.retry.visible, false);
  assert.deepEqual(controls.download, { disabled: true, count: 0 });
  assert.equal(controls.locked, false);
  assert.equal(controls.selected, 3);
  assert.equal(controls.total, 3);
});

test("importerControls disables start while the TOC is loading", () => {
  const controls = importerControls({ chapters: [chapter(0)], tocLoading: true, running: false, stopping: false });
  assert.equal(controls.start.disabled, true);
  assert.equal(controls.locked, true);
});

test("importerControls swaps start for stop while running and keeps download", () => {
  const controls = importerControls({
    chapters: [chapter(0, { status: "done" }), chapter(1, { status: "fetching" }), chapter(2, { status: "queued" })],
    tocLoading: false, running: true, stopping: false,
  });
  assert.equal(controls.start.visible, false);
  assert.deepEqual(controls.stop, { visible: true, disabled: false });
  assert.deepEqual(controls.download, { disabled: false, count: 1 });
  assert.equal(controls.retry.visible, false);
  assert.equal(controls.locked, true);
});

test("importerControls disables stop once stopping", () => {
  const controls = importerControls({ chapters: [chapter(0, { status: "fetching" })], tocLoading: false, running: true, stopping: true });
  assert.equal(controls.stop.disabled, true);
});

test("importerControls offers retry for failed chapters after a run", () => {
  const controls = importerControls({
    chapters: [chapter(0, { status: "done" }), chapter(1, { status: "error" }),
      chapter(2, { status: "stopped" }), chapter(3, { selected: false })],
    tocLoading: false, running: false, stopping: false,
  });
  assert.deepEqual(controls.retry, { visible: true, disabled: false, count: 2 });
  assert.deepEqual(controls.start, { visible: true, disabled: true, count: 0 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/client-core.test.js`
Expected: FAIL — `SyntaxError: The requested module '../public/app-core.js' does not provide an export named 'selectChapterRange'`.

- [ ] **Step 3: Implement the six functions in `public/app-core.js`** per the Interfaces block. Range parsing reuses the existing `positiveInteger()` helper.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all pass (30 existing + 12 new).

---

### Task 2: Page markup and stylesheet

**Files:**
- Modify (rewrite): `public/index.html`, `public/styles.css`
- Delete: `public/file-tools.css`
- Test: `test/e2e.test.js`

**Interfaces:**
- Produces element ids used by Tasks 3–4:
  - Header: `#flare-status` (`role="status"`, contains `.status-dot` + `#flare-status-text`).
  - Tabs: `#tab-importer` (contains `#importer-tab-badge`, hidden by default) and `#tab-file-tools`, both `role="tab"` with `aria-controls` → `#panel-importer`, `#file-tools-panel` (`role="tabpanel"`; file panel `hidden` initially).
  - Web tab: `#toc-form`, `#toc-url`, `#fetch-toc-button`, `#importer-message` (`role="alert"`); toolbar `#select-all-button`, `#range-form` (contains `#range-from`, `#range-to`, submit `#select-range-button`), `#start-number` (value `1`), `#reverse-order-button`; list `#chapter-list` (`<ol>`) and `#chapter-empty` (3 short steps); panel `#selected-count`, `#total-count`, `#delay-ms` (`100`), `#concurrency` (`4`, max `12`), `#progress-section` (`hidden`) containing `#progress-bar` (`role="progressbar"`, child `.progress-fill`), `#progress-label`, `#progress-counts`; `#fetch-summary`; buttons `#start-fetch-button`, `#stop-button` (`hidden`), `#retry-button` (`hidden`), `#export-button`, `#reset-button`; `#live-region` (`aria-live="polite"`).
  - File tab: existing ids `#source-text-file`, `#file-tools-encoding` (options auto/UTF-8/GB18030/GBK/Big5), `#file-tools-start` (`205`), `#file-tools-end` (`400`), `#format-file-button`, `#download-formatted-button`, `#file-tools-status`, `#file-tools-preview`.
  - Row classes for Task 4 styling: `.chapter-row[data-status]`, `.chapter-check`, `.chapter-number`, `.chapter-title`, `.chapter-url`, `.status-chip`.

- [ ] **Step 1: Replace the first e2e test with the new markup check**

```js
test("served UI exposes the tabbed importer workspace", async () => {
  // fetch `${app.url}/`, then:
  for (const id of ["tab-importer", "tab-file-tools", "panel-importer", "toc-url", "range-from", "range-to",
    "select-range-button", "start-fetch-button", "stop-button", "retry-button", "export-button",
    "reset-button", "chapter-list", "progress-section"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /download-now-button|file-tools\.css|data-select-count/);
});
```

Keep the existing file-tools markup test unchanged.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/e2e.test.js`
Expected: FAIL on `id="tab-importer"`.

- [ ] **Step 3: Rewrite `index.html`** per spec §1 layout using the ids above; scripts: `<script type="module" src="/app.js">` only; one stylesheet `/styles.css`.

- [ ] **Step 4: Rewrite `styles.css`** per Global Constraints (palette, font stack, breakpoints), including tab styles, status chip colors per `data-status`, `[hidden] { display: none !important; }`, visible focus ring, title ellipsis. Delete `public/file-tools.css`.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: all pass.

---

### Task 3: Tabs and file tab module

**Files:**
- Create: `public/file-tools.js`
- Modify (rewrite): `public/app.js`

**Interfaces:**
- Consumes: Task 2 ids; `decodeTextBuffer`, `formatNovelText`, `extractChapterRange`, `formatPostProcessFilename` from `app-core.js`.
- Produces: `export function initFileTools(): void` in `file-tools.js`; `app.js` initializes tabs then calls `initFileTools()` (Task 4 adds `initImporter()`).

- [ ] **Step 1: Move file-tool code** (current `app.js` `setFileToolsStatus` … `downloadFormattedFile` and their listeners) into `file-tools.js` with its own `dom`/`state` and an `announce()` writing to `#live-region`. Behavior unchanged.

- [ ] **Step 2: Write `app.js` tabs**: click selects a tab; ArrowLeft/ArrowRight move focus and selection; selected tab gets `aria-selected="true"` and `tabindex="0"`, the other `aria-selected="false"`, `tabindex="-1"`; only the selected panel is visible.

- [ ] **Step 3: Verify in the browser** (harness at `http://127.0.0.1:8790`)

Expected: clicking `จัดการไฟล์ .txt` shows the file panel and hides the web panel; ArrowLeft returns; assigning a UTF-8 `.txt` containing `第205章 起点\n內容\n第206章 下一章` via `DataTransfer` + `change` event, then clicking format with range 205–205, shows `第205章 起点` in `#file-tools-preview` and enables download; console has no errors.

---

### Task 4: Web tab module

**Files:**
- Create: `public/importer.js`
- Modify: `public/app.js` (import and call `initImporter()`)

**Interfaces:**
- Consumes: Task 1 functions; `buildExportText`, `formatExportFilename`, `runWithConcurrency`, `isActiveRequest` from `app-core.js`; Task 2 ids.
- Produces: `export function initImporter(): void`.

Decisions the implementer must follow:
- State: `{ chapters, tocLoading, running, stopping, runIds: Set<idx>, tocController, runController, lastClickedIdx, rows: Map<idx, { row, check, number, chip }> }`. `postJson` moves here from the old `app.js`.
- `renderControls()` applies `importerControls(state)` to every button (labels with counts, `hidden`, `disabled`), locks `#toc-form` controls, toolbar, checkboxes, `#delay-ms`, `#concurrency` when `locked`, updates `#selected-count`/`#total-count` and the select-all label. Call it after every state change, including both `finally` blocks.
- Rows: rebuilt only on TOC load and reverse; `updateRow(chapter)` sets `data-status`, chip text (`queued` `รอคิว`, `fetching` `กำลังดึง`, `done` `สำเร็จ`, `error` = error message, `stopped` `หยุดแล้ว`, `idle` empty and hidden), and `title` attributes for full title/error. Checkbox `click` with `shiftKey` applies the clicked row's new state to the range from `lastClickedIdx`.
- TOC load: confirm first if any chapter is `done` (`มี ${n} ตอนที่ดึงสำเร็จแล้ว การดึงสารบัญใหม่จะล้างรายการเดิม ต้องการดำเนินการต่อหรือไม่?`); replace the list only on success; on failure keep the list, show the message in `#importer-message`, set the pill to error.
- Runs: `startFetch()` uses `chaptersToStart`, `retryFailed()` uses `chaptersToRetry` (clears `error`); both call `runFetch(chapters)`, which marks them `queued`, sets `runIds`, shows `#progress-section`, and runs `runWithConcurrency` with `#concurrency`/`#delay-ms` values. Worker results apply only while `isActiveRequest(state.runController, controller)`. On finish, leftover `queued`/`fetching` in the run become `stopped`; summary text and announcement reuse the current wording.
- Progress: `runProgress` of chapters in `runIds` → bar width/aria-valuenow, `#progress-label` `${finished} / ${total} ตอน`, `#progress-counts` `สำเร็จ ${done} · ล้มเหลว ${error} · หยุด ${stopped} · เหลือ ${remaining}`; `#importer-tab-badge` shows `${finished}/${total}` only while running.
- Export: `exportableChapters` → existing download flow with `formatExportFilename`.
- Reset: confirm when any `done` (`มี ${n} ตอนที่ดึงสำเร็จแล้ว ต้องการล้างทั้งหมดหรือไม่?`); abort controllers, clear list/messages/progress, keep `#toc-url` value.

- [ ] **Step 1: Implement `importer.js` and wire it in `app.js`.**

- [ ] **Step 2: Run unit/e2e tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 3: Browser checks** (harness: 240 chapters, every chapter number divisible by 37 fails, `/broken` URL returns a FlareSolverr error; viewport 1280×800)

1. Load `https://example.com/book` → `#start-fetch-button` enabled, label `เริ่มดึง 240 ตอน`, no row clicked.
2. Range 101–200 → `เลือก 100 จาก 240`, label `เริ่มดึง 100 ตอน`; range 200–101 → `ตอนเริ่มต้นต้องไม่มากกว่าตอนสิ้นสุด`, selection unchanged.
3. Start → stop visible, checkboxes disabled, tab badge counts; switch to file tab and back → count kept increasing.
4. Stop mid-run → some rows `หยุดแล้ว`; retry label count = error + stopped among selected.
5. Retry → run ends with exactly chapters 111, 148, 185 as `error`; retry shows `(3)`.
6. Stop then click retry immediately when enabled → after it ends, `runProgress` counts equal the per-row statuses.
7. Download (stub `URL.createObjectURL` to capture the Blob) → 97 sections, first heading `第101章`, numbers ascending, none of 111/148/185.
8. Reverse order, download again → sections in descending order.
9. With `window.confirm = () => false`: load TOC and click `เริ่มใหม่` → list unchanged; with `true`: reset clears the list and keeps the URL.
10. Load `https://example.com/broken` → message under URL, pill error, `ดึงสารบัญ` enabled, list from before kept.
11. 390px width → `document.documentElement.scrollWidth <= innerWidth`; long titles ellipsize.
12. 1280×800 after TOC load at scroll 0 → `#chapter-list`, `#start-fetch-button`, `#export-button`, `#reset-button` bottoms ≤ 800.
13. Console has no errors.

---

### Task 5: README and final verification

**Files:**
- Modify: `README.md` (Usage → web tab steps: load TOC, select all or range, `เริ่มดึง`, `หยุด`, `ลองดึงตอนที่ไม่สำเร็จ`, `ดาวน์โหลด .txt` of selected done chapters, tabs; remove `ดาวน์โหลดทันที`)

- [ ] **Step 1: Update README Usage** to match the labels in Global Constraints.
- [ ] **Step 2: Run `npm test`** — Expected: all pass.
- [ ] **Step 3: Repeat Task 4 checks 1, 3, 7, 11, 12 against the final build** — Expected: same results.
