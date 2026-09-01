import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExportText,
  formatExportFilename,
  isActiveRequest,
  runWithConcurrency,
} from "../public/app-core.js";

test("buildExportText creates ordered chapter sections", () => {
  assert.equal(
    buildExportText([
      {
        chapterNumber: 1,
        title: "第一章",
        content: "เนื้อหาแรก",
      },
      {
        chapterNumber: 2,
        title: "第二章",
        content: "เนื้อหาที่สอง",
      },
    ]),
    "Chapter 1 — 第一章\n\nเนื้อหาแรก\n\n\nChapter 2 — 第二章\n\nเนื้อหาที่สอง",
  );
});

test("formatExportFilename uses local date and time", () => {
  assert.equal(
    formatExportFilename(new Date(2026, 8, 1, 14, 5)),
    "chapters-20260901-1405.txt",
  );
});

test("runWithConcurrency never exceeds active worker count", async () => {
  let active = 0;
  let maxActive = 0;
  const completed = [];

  await runWithConcurrency(
    [1, 2, 3, 4, 5],
    2,
    async (entry) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      completed.push(entry);
      active -= 1;
    },
    0,
  );

  assert.equal(maxActive, 2);
  assert.deepEqual(
    completed.sort((a, b) => a - b),
    [1, 2, 3, 4, 5],
  );
});

test("runWithConcurrency stops queued work after abort", async () => {
  const controller = new AbortController();
  const started = [];

  await runWithConcurrency(
    [1, 2, 3],
    1,
    async (entry) => {
      started.push(entry);
      controller.abort();
    },
    0,
    { signal: controller.signal },
  );

  assert.deepEqual(started, [1]);
});

test("isActiveRequest rejects stale or aborted requests", () => {
  const controller = new AbortController();

  assert.equal(isActiveRequest(controller, controller), true);

  controller.abort();
  assert.equal(isActiveRequest(controller, controller), false);
  assert.equal(isActiveRequest(null, controller), false);
  assert.equal(isActiveRequest(null, null), false);
});
