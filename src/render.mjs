// Turns HTML slides into images (Playwright) and the clip into a video (ffmpeg).

import { chromium } from "playwright";
import ffmpegPath from "ffmpeg-static";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * Renders each HTML page to an image. Carousel slides are saved as JPEG,
 * because TikTok's API only accepts JPEG or WebP for photo posts.
 */
export async function renderPages(pages, tmpDir) {
  fs.mkdirSync(tmpDir, { recursive: true });
  const browser = await chromium.launch();
  const tab = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  try {
    for (const { html, file, transparent } of pages) {
      const htmlFile = path.join(tmpDir, path.basename(file) + ".html");
      fs.writeFileSync(htmlFile, html);
      await tab.goto("file://" + htmlFile, { waitUntil: "networkidle" });
      await tab.evaluate(() => document.fonts.ready);
      if (transparent) {
        await tab.screenshot({ path: file, type: "png", omitBackground: true });
      } else {
        await tab.screenshot({ path: file, type: "jpeg", quality: 92 });
      }
    }
  } finally {
    await browser.close();
  }
}

/** Cuts the clip, scales it to 1080x1920 and fades the overlay in at `textAt` seconds. */
export function renderVideo({ clip, overlay, output, clipStart, clipLength, textAt, fadeLength }) {
  const size = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30";
  const filter =
    `[0:v]${size}[clip];` +
    `[1:v]${size},format=rgba,fade=t=in:st=${textAt}:d=${fadeLength}:alpha=1[text];` +
    `[clip][text]overlay=0:0:shortest=1,format=yuv420p[out]`;

  execFileSync(ffmpegPath, [
    "-y", "-v", "error",
    "-ss", String(clipStart), "-t", String(clipLength), "-i", clip,
    "-loop", "1", "-t", String(clipLength), "-i", overlay,
    "-filter_complex", filter, "-map", "[out]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    output,
  ], { stdio: "inherit" });
}
