export function parsePid(text) {
  const value = String(text ?? "").trim();
  if (!/^\d+$/.test(value)) return null;
  const pid = Number(value);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
}

// Stops a FlareSolverr that a previous run left behind (e.g. its window was
// closed abruptly). The pid is only killed if it is still a FlareSolverr, since
// Windows reuses pids.
export function cleanupStaleFlare({ readPidFile, removePidFile, isFlareProcess, killTree }) {
  let text;
  try {
    text = readPidFile();
  } catch {
    return false;
  }

  const pid = parsePid(text);
  removePidFile();
  if (pid === null || !isFlareProcess(pid)) return false;

  killTree(pid);
  return true;
}
