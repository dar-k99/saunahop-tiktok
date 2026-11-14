// Builds today's TikTok post into output/<date>/.
//
//   node build.mjs                   today's topic (from the rotation in topics.json)
//   node build.mjs --topic tonight   a specific topic
//   node build.mjs --video           also make the video, even if today isn't a video day
//
// Output: slide-1.jpg ... slide-6.jpg, caption.txt, (video.mp4, video-caption.txt), post.json

import fs from "fs";
import path from "path";
import { loadVenues, loadAvailability, countFreeSessions, londonToday, londonWeekday } from "./src/data.mjs";
import { seededRandom, shuffle, pickTopic, pickVenues, pillsFor, listFiles, buildCaption } from "./src/pick.mjs";
import { hookSlide, venueSlide, endSlide, videoOverlay } from "./src/slides.mjs";
import { renderPages, renderVideo } from "./src/render.mjs";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const config = readJson("config.json");
const { topics } = readJson("topics.json");
const captions = readJson("captions.json");

const args = process.argv.slice(2);
const forcedTopic = args.includes("--topic") ? args[args.indexOf("--topic") + 1] : null;
const forceVideo = args.includes("--video");

const now = new Date();
const today = londonToday(now);
const random = seededRandom(today + (forcedTopic || ""));

// ---- 1. Data ----
const venues = loadVenues();
const availability = await loadAvailability();
const freeSessions = countFreeSessions(venues, availability, config.tonightFromHour, now);
console.log(`${venues.length} London venues, ${Object.keys(freeSessions).length} with live availability.`);

const checkedAt = availability
  ? new Date(availability.generatedAt)
      .toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "numeric", minute: "2-digit", hour12: true })
      .replace(":00", "").replace(" ", "")
  : null;

// ---- 2. Topic and venues ----
const tryTopic = (topic) => pickVenues(topic, venues, freeSessions, config, random);
let chosen;
if (forcedTopic) {
  const topic = topics.find((t) => t.id === forcedTopic);
  if (!topic) throw new Error(`No topic called "${forcedTopic}" in topics.json`);
  const result = tryTopic(topic);
  if (!result) throw new Error(`Topic "${forcedTopic}" doesn't have enough matching venues today.`);
  chosen = { topic, venues: result };
} else {
  chosen = pickTopic(topics, today, tryTopic);
}
const { topic } = chosen;
console.log(`Topic: ${topic.id}: "${topic.hook}"`);
chosen.venues.forEach((v) => console.log(`  - ${v.name}`));

// ---- 3. Photos: people for the hook and ending, empty saunas behind venue names ----
const people = shuffle(listFiles("assets/photos/people", [".jpg", ".jpeg", ".png"]), random);
const empty = shuffle(listFiles("assets/photos/empty", [".jpg", ".jpeg", ".png"]), random);
const clips = listFiles("assets/clips", [".mp4", ".mov"]);

// ---- 4. Render slides ----
const outDir = path.resolve("output", today);
const tmpDir = path.join(outDir, "tmp");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const slidePages = [
  { html: hookSlide(topic, people[0]) },
  ...chosen.venues.map((venue, index) => ({
    html: venueSlide({
      venue,
      index,
      total: chosen.venues.length,
      pills: pillsFor(venue, topic),
      show: topic.show,
      free: topic.show ? freeSessions[venue.id]?.[topic.show] : null,
      checkedAt,
      background: empty[index % empty.length],
    }),
  })),
  { html: endSlide(venues.length, people[1 % people.length]) },
].map((p, i) => ({ ...p, file: path.join(outDir, `slide-${i + 1}.jpg`) }));

const makeVideo = forceVideo || config.videoDays.includes(londonWeekday(now));
const overlayFile = path.join(tmpDir, "overlay.png");
const pages = makeVideo ? [...slidePages, { html: videoOverlay(venues.length), file: overlayFile, transparent: true }] : slidePages;
await renderPages(pages, tmpDir);

// ---- 5. Captions ----
const caption = buildCaption(captions.carousel, captions.hashtags, { hook: topic.hook, subhook: topic.subhook }, random);
fs.writeFileSync(path.join(outDir, "caption.txt"), caption);

const post = {
  date: today,
  topic: topic.id,
  title: topic.hook.slice(0, 90),
  carousel: { images: slidePages.map((p) => path.basename(p.file)), caption },
  video: null,
};

// ---- 6. Video (on video days) ----
if (makeVideo) {
  const clip = clips[Math.floor(random() * clips.length)];
  renderVideo({ clip, overlay: overlayFile, output: path.join(outDir, "video.mp4"), ...config.video });
  const videoCaption = buildCaption(captions.video, captions.hashtags, {}, random);
  fs.writeFileSync(path.join(outDir, "video-caption.txt"), videoCaption);
  post.video = { file: "video.mp4", caption: videoCaption, clip: path.basename(clip) };
}

fs.writeFileSync(path.join(outDir, "post.json"), JSON.stringify(post, null, 2));
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\nDone: ${outDir}`);
