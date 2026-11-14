// Sends today's post (made by build.mjs) to TikTok through Buffer.
//
//   node post.mjs              publish images, then schedule the post(s) in Buffer
//   node post.mjs --draft      same, but saves them as Buffer drafts (nothing gets scheduled)
//   node post.mjs --dry-run    show what would be sent, send nothing
//
// Needs BUFFER_API_KEY, either in a .env file (on your Mac) or as a GitHub
// secret (for the daily automation). Without it, this always does a dry run.
//
// How it works:
//   1. Buffer can only take images from a public web link, so the day's
//      images are pushed to the "posts" branch of this (public) GitHub repo.
//      Dated folders older than 14 days are removed; other folders (like
//      quirky/, for hand-made videos) are left alone.
//   2. A post is created in Buffer for each (carousel, and video on video
//      days). With scheduling "notification" (the default) Buffer sends a
//      notification to your phone at the set time: tap it, add a sound in
//      TikTok, post.
//
// Running it twice on the same day creates a second set of Buffer posts.
// On your Mac, output/<date>/sent.json stops that; on GitHub each run starts
// fresh, so don't re-run the daily job by hand on a day it already ran.

import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";
import { londonToday } from "./src/data.mjs";

// ---- Read .env (a simple KEY=value file) if there is one ----
if (fs.existsSync(".env")) {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match && match[2] && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const KEY = process.env.BUFFER_API_KEY;
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run") || !KEY;
const asDraft = args.includes("--draft");
const config = JSON.parse(fs.readFileSync("config.json", "utf8")).buffer;

const MEDIA_BRANCH = "posts";
const KEEP_DAYS = 14;

// ---- Load today's post ----
const today = londonToday();
const outDir = path.resolve("output", today);
const postFile = path.join(outDir, "post.json");
if (!fs.existsSync(postFile)) throw new Error(`No post built for ${today}. Run: node build.mjs`);
const post = JSON.parse(fs.readFileSync(postFile, "utf8"));

const files = [...post.carousel.images, ...(post.video ? [post.video.file] : [])];

// ---- 1. Put the images online (posts branch of this GitHub repo) ----

const git = (cwd, ...gitArgs) => execFileSync("git", ["-C", cwd, ...gitArgs], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function mediaBaseUrl() {
  if (process.env.MEDIA_BASE_URL) return process.env.MEDIA_BASE_URL;
  const remote = git(".", "remote", "get-url", "origin"); // e.g. https://github.com/dar-k99/saunahop-tiktok.git
  const repo = remote.replace(/^.*github\.com[:/]/, "").replace(/\.git$/, "");
  return `https://raw.githubusercontent.com/${repo}/${MEDIA_BRANCH}`;
}

/**
 * Copies today's files into the "posts" branch and pushes it. Each time, the
 * branch is replaced by a single fresh commit (old dated folders dropped),
 * so the repo never grows large.
 */
function publishMedia() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "saunahop-posts-"));
  const bot = ["-c", "user.name=saunahop-bot", "-c", "user.email=saunahop-bot@users.noreply.github.com"];
  let exists = true;
  try { git(".", "fetch", "-q", "origin", MEDIA_BRANCH); } catch { exists = false; }

  try {
    if (exists) {
      git(".", "worktree", "add", "-q", "--detach", work, "FETCH_HEAD");
    } else {
      git(".", "worktree", "add", "-q", "--detach", work);
      git(work, "checkout", "-q", "--orphan", "new-posts");
      git(work, "rm", "-rq", "--cached", ".");
      for (const f of fs.readdirSync(work)) if (f !== ".git") fs.rmSync(path.join(work, f), { recursive: true, force: true });
    }

    // Drop folders older than KEEP_DAYS, then add today's.
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86400_000).toISOString().slice(0, 10);
    for (const dir of fs.readdirSync(work)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dir) && dir < cutoff) fs.rmSync(path.join(work, dir), { recursive: true });
    }
    fs.mkdirSync(path.join(work, today), { recursive: true });
    for (const f of files) fs.copyFileSync(path.join(outDir, f), path.join(work, today, f));
    fs.writeFileSync(path.join(work, "README.md"), "Images for the daily TikTok posts (last 14 days). Generated automatically: do not edit.\n");

    git(work, "add", "-A");
    // Always one commit: start a fresh orphan each time and force-push it.
    git(work, "checkout", "-q", "--orphan", `publish-${Date.now()}`);
    execFileSync("git", ["-C", work, ...bot, "commit", "-q", "-m", `Images for ${today}`], { stdio: "pipe" });
    git(work, "push", "-q", "--force", "origin", `HEAD:refs/heads/${MEDIA_BRANCH}`);
  } finally {
    try { git(".", "worktree", "remove", "--force", work); } catch { fs.rmSync(work, { recursive: true, force: true }); }
  }
}

/** Waits until every link actually loads (GitHub can take a few seconds after a push). */
async function waitForUrls(urls) {
  for (const url of urls) {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) break;
      if (attempt >= 12) throw new Error(`Image link not reachable: ${url} (${res.status})`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// ---- 2. Buffer ----

async function buffer(query, variables) {
  const res = await fetch("https://api.buffer.com", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`Buffer error: ${JSON.stringify(json.errors || json)}`);
  return json.data;
}

async function tiktokChannelId() {
  if (process.env.BUFFER_CHANNEL_ID) return process.env.BUFFER_CHANNEL_ID;
  const { account } = await buffer(`{ account { organizations { id } } }`);
  const channels = [];
  for (const org of account.organizations) {
    const data = await buffer(`query($id: OrganizationId!) { channels(input: { organizationId: $id }) { id name service isDisconnected } }`, { id: org.id });
    channels.push(...data.channels.filter((c) => c.service === "tiktok" && !c.isDisconnected));
  }
  if (channels.length !== 1) {
    throw new Error(`Expected 1 TikTok channel in Buffer, found ${channels.length}. Set BUFFER_CHANNEL_ID.`);
  }
  return channels[0].id;
}

/** A time like "17:00" today in London, as a UTC timestamp (handles summer time). */
function londonTimeToday(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const [y, mo, d] = today.split("-").map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, h, m));
  const londonHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }).format(guess)) % 24;
  let offset = (londonHour - guess.getUTCHours() + 24) % 24; // 0 in winter, 1 in summer
  if (offset > 12) offset -= 24;
  return new Date(guess.getTime() - offset * 3600_000);
}

const CREATE_POST = `mutation($input: CreatePostInput!) {
  createPost(input: $input) {
    ... on PostActionSuccess { post { id dueAt } }
    ... on MutationError { message }
  }
}`;

async function send(label, assets, caption, time, channelId) {
  const due = londonTimeToday(time);
  const soon = due.getTime() < Date.now() + 5 * 60_000; // time already passed today: notify now
  const input = {
    channelId,
    text: caption,
    assets,
    schedulingType: config.scheduling,
    metadata: { tiktok: { title: post.title } },
    ...(asDraft ? { saveToDraft: true, mode: "addToQueue" } : soon ? { mode: "shareNow" } : { mode: "customScheduled", dueAt: due.toISOString() }),
  };

  if (dryRun) {
    console.log(`\n[dry run] ${label}: ${assets.length} file(s), ${config.scheduling}, ${asDraft ? "draft" : soon ? "now" : time}`);
    assets.forEach((a) => console.log("  " + (a.image || a.video).url));
    console.log(caption.split("\n").map((l) => "  | " + l).join("\n"));
    return null;
  }

  const { createPost } = await buffer(CREATE_POST, { input });
  if (!createPost.post) throw new Error(`Buffer refused the ${label}: ${createPost.message}`);
  console.log(`${label}: ${asDraft ? "saved as a Buffer draft" : `scheduled for ${soon ? "now" : time}`} (post ${createPost.post.id})`);
  return createPost.post;
}

// ---- Run ----

const sentFile = path.join(outDir, "sent.json");
if (fs.existsSync(sentFile) && !dryRun) {
  console.log(`Already sent today's post (see ${sentFile}). Delete that file to send again.`);
  process.exit(0);
}

const base = `${mediaBaseUrl()}/${today}`;
const imageAssets = post.carousel.images.map((f) => ({ image: { url: `${base}/${f}` } }));
const videoAssets = post.video ? [{ video: { url: `${base}/${post.video.file}` } }] : null;

let channelId = null;
if (!dryRun) {
  console.log("Putting today's images online...");
  publishMedia();
  await waitForUrls(files.map((f) => `${base}/${f}`));
  channelId = await tiktokChannelId();
}

const sent = {};
sent.carousel = await send("Carousel", imageAssets, post.carousel.caption, config.carouselTime, channelId);
if (videoAssets) sent.video = await send("Video", videoAssets, post.video.caption, config.videoTime, channelId);

if (dryRun) {
  console.log(KEY ? "\nDry run: nothing was sent." : "\nNo BUFFER_API_KEY set, so this was a dry run. Nothing was sent.");
} else if (!asDraft) {
  fs.writeFileSync(sentFile, JSON.stringify({ sentAt: new Date().toISOString(), ...sent }, null, 2));
}
