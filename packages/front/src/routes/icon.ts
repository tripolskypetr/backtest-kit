import micro from "micro";
import Router from "router";

import { join } from "path";
import { existsSync } from "fs";
import { readFile } from "fs/promises";

const router = Router({
  params: true,
});

const ASSET_SVG = join(process.cwd(), "node_modules/cryptocurrency-icons/svg/color");
const ASSET_128 = join(process.cwd(), "node_modules/cryptocurrency-icons/128/color");
const ASSET_32 = join(process.cwd(), "node_modules/cryptocurrency-icons/32/color");

// File caches to avoid repeated disk reads
const cache128 = new Map<string, Buffer>();
const cache32 = new Map<string, Buffer>();
const cacheSvg = new Map<string, Buffer>();

router.get("/api/v1/icon/128/:filename", async (req, res) => {
  const filename = req.params.filename;

  // Check cache first
  if (cache128.has(filename)) {
    res.setHeader("Content-Type", "image/png");
    return await micro.send(res, 200, cache128.get(filename));
  }

  const filePath = join(ASSET_128, filename);
  if (existsSync(filePath)) {
    const fileBuffer = await readFile(filePath);
    cache128.set(filename, fileBuffer);
    res.setHeader("Content-Type", "image/png");
    return await micro.send(res, 200, fileBuffer);
  }
  return await micro.send(res, 404, "File not found (128)");
});

router.get("/api/v1/icon/32/:filename", async (req, res) => {
  const filename = req.params.filename;

  // Check cache first
  if (cache32.has(filename)) {
    res.setHeader("Content-Type", "image/png");
    return await micro.send(res, 200, cache32.get(filename));
  }

  const filePath = join(ASSET_32, filename);
  if (existsSync(filePath)) {
    const fileBuffer = await readFile(filePath);
    cache32.set(filename, fileBuffer);
    res.setHeader("Content-Type", "image/png");
    return await micro.send(res, 200, fileBuffer);
  }
  return await micro.send(res, 404, "File not found (32)");
});

router.get("/api/v1/icon/svg/:filename", async (req, res) => {
  const filename = req.params.filename;

  // Check cache first
  if (cacheSvg.has(filename)) {
    res.setHeader("Content-Type", "image/svg+xml");
    return await micro.send(res, 200, cacheSvg.get(filename));
  }

  const filePath = join(ASSET_SVG, filename);
  if (existsSync(filePath)) {
    const fileBuffer = await readFile(filePath);
    cacheSvg.set(filename, fileBuffer);
    res.setHeader("Content-Type", "image/svg+xml");
    return await micro.send(res, 200, fileBuffer);
  }
  return await micro.send(res, 404, "File not found (svg)");
});

router.get("/api/v1/icon/:filename", async (req, res) => {
  const filename = req.params.filename;

  // Check cache first
  if (cache32.has(filename)) {
    res.setHeader("Content-Type", "image/png");
    return await micro.send(res, 200, cache32.get(filename));
  }

  const filePath = join(ASSET_32, filename);
  if (existsSync(filePath)) {
    const fileBuffer = await readFile(filePath);
    cache32.set(filename, fileBuffer);
    res.setHeader("Content-Type", "image/png");
    return await micro.send(res, 200, fileBuffer);
  }
  return await micro.send(res, 404, "File not found (root)");
});

export default router;
