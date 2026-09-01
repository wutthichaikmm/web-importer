import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../server.js";

async function withServer(app, callback) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("POST /api/toc validates input and returns chapters", async () => {
  const app = createApp({
    tocScraper: async (url) => ({
      chapters: [{ title: "Chapter 1", url: `${url}/1` }],
      error: null,
    }),
  });

  await withServer(app, async (baseUrl) => {
    const bad = await fetch(`${baseUrl}/api/toc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "ftp://example.com/book" }),
    });
    assert.equal(bad.status, 400);

    const good = await fetch(`${baseUrl}/api/toc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/book" }),
    });
    assert.equal(good.status, 200);
    assert.deepEqual(await good.json(), {
      chapters: [
        {
          title: "Chapter 1",
          url: "https://example.com/book/1",
        },
      ],
    });
  });
});

test("POST /api/chapter maps scraper errors to 502", async () => {
  const app = createApp({
    chapterScraper: async (url) =>
      url.endsWith("/fail")
        ? {
            content: "",
            error: "FlareSolverr unreachable: refused",
          }
        : { content: "ข้อความ chapter", error: null },
  });

  await withServer(app, async (baseUrl) => {
    const good = await fetch(`${baseUrl}/api/chapter`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/chapter/1",
      }),
    });
    assert.equal(good.status, 200);
    assert.deepEqual(await good.json(), {
      content: "ข้อความ chapter",
    });

    const failed = await fetch(`${baseUrl}/api/chapter`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/chapter/fail",
      }),
    });
    assert.equal(failed.status, 502);
    assert.deepEqual(await failed.json(), {
      error: "FlareSolverr unreachable: refused",
    });
  });
});
