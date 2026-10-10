import assert from "node:assert/strict";
import test from "node:test";

import { cleanupStaleFlare, parsePid } from "../packaging/process-guard.mjs";

function setup({ file, running = {} } = {}) {
  const calls = { killed: [], removed: 0 };
  return {
    calls,
    options: {
      readPidFile: () => {
        if (file === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
        return file;
      },
      removePidFile: () => {
        calls.removed += 1;
      },
      isFlareProcess: (pid) => running[pid] === "flaresolverr.exe",
      killTree: (pid) => calls.killed.push(pid),
    },
  };
}

test("parsePid accepts positive integers only", () => {
  assert.equal(parsePid("1234\n"), 1234);
  assert.equal(parsePid(" 7 "), 7);
  for (const bad of ["", "abc", "0", "-5", "12abc", null, undefined]) {
    assert.equal(parsePid(bad), null);
  }
});

test("cleanupStaleFlare kills a leftover FlareSolverr and clears the pid file", () => {
  const { calls, options } = setup({ file: "4321", running: { 4321: "flaresolverr.exe" } });

  assert.equal(cleanupStaleFlare(options), true);
  assert.deepEqual(calls.killed, [4321]);
  assert.equal(calls.removed, 1);
});

test("cleanupStaleFlare never kills a reused pid that is another program", () => {
  const { calls, options } = setup({ file: "4321", running: { 4321: "notepad.exe" } });

  assert.equal(cleanupStaleFlare(options), false);
  assert.deepEqual(calls.killed, []);
  assert.equal(calls.removed, 1);
});

test("cleanupStaleFlare ignores a missing pid file", () => {
  const { calls, options } = setup();

  assert.equal(cleanupStaleFlare(options), false);
  assert.deepEqual(calls.killed, []);
  assert.equal(calls.removed, 0);
});

test("cleanupStaleFlare discards a corrupt pid file without killing anything", () => {
  const { calls, options } = setup({ file: "garbage" });

  assert.equal(cleanupStaleFlare(options), false);
  assert.deepEqual(calls.killed, []);
  assert.equal(calls.removed, 1);
});
