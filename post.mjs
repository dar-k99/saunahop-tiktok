// Sends today's post (made by build.mjs) to TikTok through Postiz.
//
//   node post.mjs              send today's post
//   node post.mjs --dry-run    show what would be sent, send nothing
//   node post.mjs --channels   list the channels connected in Postiz
//
// Needs POSTIZ_API_KEY, either in a .env file (on your Mac) or as a GitHub
// secret (for the daily automation). Without it, this always does a dry run.
//
// With postingMethod "UPLOAD" (the default) the post lands in your TikTok
// app inbox as a draft: open it, add a sound, post. TikTok deletes drafts
// that aren't posted within 24 hours.

import fs from "fs";
import path from "path";
import { londonToday } from "./src/data.mjs";

// ---- Read .env (a simple KEY=value file) if there is one ----
if (fs.existsSync(".env")) {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const API = process.env.POSTIZ_API_URL || "https://api.postiz.com/public/v1";
const KEY = process.env.POSTIZ_API_KEY;
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run") || !KEY;
const config = JSON.parse(fs.readFileSync("config.json", "utf8"));

async function postiz(method, endpoint, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(API + endpoint, {
    method,
    headers: { Authorization: KEY, ...(isForm || !body ? {} : { "Content-Type": "application/json" }) },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Postiz ${method} ${endpoint} failed (${res.status}): ${text}`);
  return text ? JSON.parse(text) : null;
}

// ---- --channels: list what's connected ----
if (args.includes("--channels")) {
  if (!KEY) throw new Error("Set POSTIZ_API_KEY in .env first.");
  const channels = await postiz("GET", "/integrations");
  for (const c of channels) console.log(`${c.identifier.padEnd(12)} ${c.id}  ${c.name}${c.disabled ? "  (disabled)" : ""}`);
  process.exit(0);
}

// ---- Load today's post ----
const today = londonToday();
const outDir = path.resolve("output", today);
const postFile = path.join(outDir, "post.json");
if (!fs.existsSync(postFile)) throw new Error(`No post built for ${today}. Run: node build.mjs`);
const post = JSON.parse(fs.readFileSync(postFile, "utf8"));

const sentFile = path.join(outDir, "sent.json");
if (fs.existsSync(sentFile) && !dryRun) {
  console.log(`Already sent today's post (see ${sentFile}). Delete that file to send again.`);
  process.exit(0);
}

// ---- Which TikTok channel ----
async function tiktokChannelId() {
  if (process.env.POSTIZ_TIKTOK_ID) return process.env.POSTIZ_TIKTOK_ID;
  const channels = await postiz("GET", "/integrations");
  const tiktok = channels.filter((c) => c.identifier.startsWith("tiktok") && !c.disabled);
  if (tiktok.length !== 1) {
    throw new Error(`Expected 1 TikTok channel in Postiz, found ${tiktok.length}. Set POSTIZ_TIKTOK_ID (see: node post.mjs --channels).`);
  }
  return tiktok[0].id;
}

const mimeTypes = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".mp4": "video/mp4" };
async function upload(file) {
  const form = new FormData();
  const blob = await fs.openAsBlob(file, { type: mimeTypes[path.extname(file).toLowerCase()] });
  form.append("file", blob, path.basename(file));
  const { id, path: url } = await postiz("POST", "/upload", form);
  return { id, path: url };
}

function tiktokSettings(isVideo) {
  const t = config.tiktok;
  return {
    __type: "tiktok",
    title: post.title,
    privacy_level: t.privacy,
    duet: false,
    stitch: false,
    comment: t.allowComments,
    autoAddMusic: isVideo ? "no" : t.autoAddMusic,
    brand_content_toggle: false,
    brand_organic_toggle: false,
    video_made_with_ai: false,
    content_posting_method: t.postingMethod,
  };
}

async function send(label, files, caption, isVideo) {
  const settings = tiktokSettings(isVideo);
  if (dryRun) {
    console.log(`\n[dry run] ${label}: ${files.length} file(s), ${settings.content_posting_method}`);
    files.forEach((f) => console.log(`  ${path.basename(f)}`));
    console.log(caption.split("\n").map((l) => "  | " + l).join("\n"));
    return null;
  }
  const channelId = await tiktokChannelId();
  const media = [];
  for (const f of files) {
    console.log(`Uploading ${path.basename(f)}...`);
    media.push(await upload(f));
  }
  const result = await postiz("POST", "/posts", {
    type: "now",
    date: new Date().toISOString(),
    shortLink: false,
    tags: [],
    posts: [{ integration: { id: channelId }, value: [{ content: caption, image: media }], settings }],
  });
  console.log(`Sent ${label} to Postiz.`);
  return result;
}

const sent = {};
sent.carousel = await send("Carousel", post.carousel.images.map((f) => path.join(outDir, f)), post.carousel.caption, false);
if (post.video) {
  sent.video = await send("Video", [path.join(outDir, post.video.file)], post.video.caption, true);
}

if (dryRun) {
  console.log(KEY ? "\nDry run: nothing was sent." : "\nNo POSTIZ_API_KEY set, so this was a dry run. Nothing was sent.");
} else {
  fs.writeFileSync(sentFile, JSON.stringify({ sentAt: new Date().toISOString(), ...sent }, null, 2));
  console.log(config.tiktok.postingMethod === "UPLOAD"
    ? "\nDone. Open TikTok: the post is in your inbox. Add a sound and post within 24 hours."
    : "\nDone. Posted to TikTok.");
}
