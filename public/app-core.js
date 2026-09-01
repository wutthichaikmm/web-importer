function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function runWithConcurrency(
  entries,
  concurrency,
  worker,
  delayMs = 0,
) {
  const limit = Math.min(12, Math.max(1, Number(concurrency) || 1));
  const delay = Math.max(0, Number(delayMs) || 0);
  let nextIndex = 0;

  await Promise.all(
    Array.from(
      { length: Math.min(limit, entries.length || 1) },
      async () => {
        while (nextIndex < entries.length) {
          const index = nextIndex;
          nextIndex += 1;

          if (delay > 0 && index > 0) {
            await sleep(index * delay);
          }

          await worker(entries[index], index);
        }
      },
    ),
  );
}

export function buildExportText(entries) {
  return entries
    .map(({ chapterNumber, title, content }) =>
      `Chapter ${chapterNumber} — ${title.trim()}\n\n${content.trim()}`,
    )
    .join("\n\n\n");
}

function pad(value) {
  return String(value).padStart(2, "0");
}

export function formatExportFilename(date) {
  return [
    "chapters-",
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    ".txt",
  ].join("");
}
