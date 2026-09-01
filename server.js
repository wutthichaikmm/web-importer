import express from "express";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  scrapeChapterContent,
  scrapeTableOfContents,
  validateTargetUrl,
} from "./scraper.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = join(currentDirectory, "public");

export function createApp({
  tocScraper = scrapeTableOfContents,
  chapterScraper = scrapeChapterContent,
} = {}) {
  const app = express();

  app.use(express.json({ limit: "32kb" }));

  app.post("/api/toc", async (request, response) => {
    const validation = validateTargetUrl(request.body?.url);
    if (!validation.ok) {
      return response.status(400).json({ error: validation.error });
    }

    try {
      const result = await tocScraper(validation.url);
      if (result.error) {
        return response.status(502).json({ error: result.error });
      }
      return response.status(200).json({ chapters: result.chapters });
    } catch (error) {
      return response.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : "เกิดข้อผิดพลาดในการดึงสารบัญ",
      });
    }
  });

  app.post("/api/chapter", async (request, response) => {
    const validation = validateTargetUrl(request.body?.url);
    if (!validation.ok) {
      return response.status(400).json({ error: validation.error });
    }

    try {
      const result = await chapterScraper(validation.url);
      if (result.error) {
        return response.status(502).json({ error: result.error });
      }
      return response.status(200).json({ content: result.content });
    } catch (error) {
      return response.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : "เกิดข้อผิดพลาดในการดึงเนื้อหา",
      });
    }
  });

  app.use(express.static(publicDirectory));

  app.use((error, _request, response, next) => {
    if (error instanceof SyntaxError && "body" in error) {
      return response.status(400).json({ error: "JSON request ไม่ถูกต้อง" });
    }
    return next(error);
  });

  return app;
}

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
  const app = createApp();
  const port = Number(process.env.PORT || 8787);
  app.listen(port, "127.0.0.1", () => {
    console.log(
      "Web Importer listening at http://127.0.0.1:" + port,
    );
  });
}
