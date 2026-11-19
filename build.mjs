// Builds today's TikTok post into output/<date>/.
//
//   node build.mjs                   today's city and topic (from config.json and topics.json)
//   node build.mjs --city dublin     a specific city
//   node build.mjs --topic tonight   a specific topic (from that city's list, or a story id from stories.json)
//   node build.mjs --type venues     venue list or story post, whatever the day (story | venues)
//   node build.mjs --video           also make the video, even if today isn't a video day
//   node build.mjs --slot 2          the day's 2nd post (config.json postsPerDay), into output/<date>-2/
//
// Output: slide-1.jpg ... slide-6.jpg, caption.txt, (video.mp4, video-caption.txt), post.json

import fs from "fs";
import path from "path";
import { loadVenues, loadAvailability, countFreeSessions, londonToday, londonWeekday } from "./src/data.mjs";
import { seededRandom, shuffle, pickTopic, pickVenues, pickStory, pillsFor, listFiles, buildCaption } from "./src/pick.mjs";
import { hookSlide, venueSlide, mythSlide, pointSlide, endSlide, videoOverlay } from "./src/slides.mjs";
import { renderPages, renderVideo } from "./src/render.mjs";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const config = readJson("config.json");
const allTopics = readJson("topics.json");
const captions = readJson("captions.json");
const { stories } = readJson("stories.json");

const args = process.argv.slice(2);
const argValue = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const forcedTopic = argValue("--topic");
const forcedCity = argValue("--city");
const forcedType = argValue("--type");
const forceVideo = args.includes("--video");
const postsPerDay = config.postsPerDay || 1;
const slot = Number(argValue("--slot") || 1);
if (!(slot >= 1 && slot <= postsPerDay)) throw new Error(`--slot must be 1..${postsPerDay} (postsPerDay in config.json)`);

const now = new Date();
const today = londonToday(now);
const weekday = londonWeekday(now);

// ---- 0. Which city: from config.json (or --city) ----
const cityId = forcedCity || Object.keys(config.cities).find((id) => config.cities[id].days?.includes(weekday));
const city = config.cities[cityId];
if (!city) throw new Error(`No city for ${weekday}: check "cities" in config.json`);
const topics = allTopics[cityId];
const postKey = slot === 1 ? today : `${today}-${slot}`; // output folder name
const random = seededRandom(postKey + cityId + (forcedTopic || ""));
console.log(`City: ${city.name}`);

// ---- Post type: tips/myths story, or venue list ----
const forcedStory = forcedTopic && stories.find((s) => s.id === forcedTopic);
const type = forcedType || (forcedStory ? "story" : forcedTopic ? "venues" : config.storyDays?.includes(weekday) ? "story" : "venues");
if (!["story", "venues"].includes(type)) throw new Error(`--type must be "story" or "venues"`);
console.log(`Post type: ${type}`);

// ---- 1. Data ----
const venues = loadVenues(cityId);
const availability = type === "venues" ? await loadAvailability() : null;
const freeSessions = countFreeSessions(venues, availability, config.tonightFromHour, now);
console.log(`${venues.length} ${city.name} venues, ${Object.keys(freeSessions).length} with live availability.`);

const checkedAt = availability
  ? new Date(availability.generatedAt)
      .toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "numeric", minute: "2-digit", hour12: true })
      .replace(":00", "").replace(" ", "")
  : null;

// ---- 2. Topic and venues (or today's story) ----
const tryTopic = (topic) => pickVenues(topic, venues, freeSessions, config, random);
let chosen;
if (type === "story") {
  const base = forcedStory || pickStory(stories, today, weekday, config.storyDays || [weekday], cityId, slot, postsPerDay);
  const story = { ...base, ...(base[cityId] || {}) }; // e.g. the "dublin" block: same post, irish wording
  if (forcedTopic && !forcedStory) throw new Error(`No story called "${forcedTopic}" in stories.json`);
  const fill = (text) => text.replaceAll("{city}", city.name);
  chosen = { topic: { ...story, hook: fill(story.hook), subhook: fill(story.subhook) }, venues: [] };
} else if (forcedTopic) {
  const topic = topics.find((t) => t.id === forcedTopic);
  if (!topic) throw new Error(`No topic called "${forcedTopic}" in topics.json`);
  const result = tryTopic(topic);
  if (!result) throw new Error(`Topic "${forcedTopic}" doesn't have enough matching venues today.`);
  chosen = { topic, venues: result };
} else {
  chosen = pickTopic(topics, today, weekday, city.days, tryTopic);
}
const { topic } = chosen;
console.log(`${type === "story" ? "Story" : "Topic"}: ${topic.id}: "${topic.hook}"`);
chosen.venues.forEach((v) => console.log(`  - ${v.name}`));

// ---- 3. Photos: people for the hook and ending, empty saunas behind venue names ----
const people = shuffle(listFiles("assets/photos/people", [".jpg", ".jpeg", ".png"]), random);
const empty = shuffle(listFiles("assets/photos/empty", [".jpg", ".jpeg", ".png"]), random);
const clips = listFiles("assets/clips", [".mp4", ".mov"]);

// ---- 4. Render slides ----
const outDir = path.resolve("output", postKey);
const tmpDir = path.join(outDir, "tmp");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// A slide (or the story's "hookImage") can name its own photo, e.g. "assets/photos/history/....jpg".
const ownImage = (file) => file && path.resolve(file);
const storySlides = (topic.slides || []).map((slide, index, all) => ({
  html: (topic.kind === "myths" ? mythSlide : pointSlide)(slide, index, all.length, ownImage(slide.image) || empty[index % empty.length], !!slide.image),
}));

const slidePages = [
  { html: type === "story" ? hookSlide(topic, ownImage(topic.hookImage) || people[0], { cta: "swipe →", plain: true, framed: !!topic.hookImage }) : hookSlide(topic, people[0]) },
  ...storySlides,
  ...chosen.venues.map((venue, index) => ({
    html: venueSlide({
      venue,
      city,
      index,
      total: chosen.venues.length,
      pills: pillsFor(venue, topic),
      show: topic.show,
      free: topic.show ? freeSessions[venue.id]?.[topic.show] : null,
      checkedAt,
      background: empty[index % empty.length],
    }),
  })),
  { html: endSlide(city, venues.length, people[1 % people.length], type === "story") },
].map((p, i) => ({ ...p, file: path.join(outDir, `slide-${i + 1}.jpg`) }));

const makeVideo = forceVideo || (config.videoDays.includes(weekday) && slot === postsPerDay); // video goes with the day's last post
const overlayFile = path.join(tmpDir, "overlay.png");
const pages = makeVideo ? [...slidePages, { html: videoOverlay(city, venues.length, type === "story"), file: overlayFile, transparent: true }] : slidePages;
await renderPages(pages, tmpDir);

// ---- 5. Captions ----
let caption = type === "story"
  ? buildCaption(topic.caption ? [topic.caption] : captions.story, captions.hashtags, cityId, { hook: topic.hook, question: topic.question || "", city: city.name }, random)
  : buildCaption(captions.carousel, captions.hashtags, cityId, { hook: topic.hook, subhook: topic.subhook, city: city.name }, random);
if (topic.note) caption = caption.replace("\n\n#", `\n\n${topic.note}\n\n#`);
if (type === "story") caption = caption.toLowerCase(); // the tips style is all lowercase
fs.writeFileSync(path.join(outDir, "caption.txt"), caption);

const post = {
  date: today,
  slot,
  city: cityId,
  type,
  topic: topic.id,
  title: topic.hook.slice(0, 90),
  carousel: { images: slidePages.map((p) => path.basename(p.file)), caption },
  video: null,
};

// ---- 6. Video (on video days) ----
if (makeVideo) {
  const clip = clips[Math.floor(random() * clips.length)];
  renderVideo({ clip, overlay: overlayFile, output: path.join(outDir, "video.mp4"), ...config.video });
  let videoCaption = buildCaption(type === "story" ? captions.storyVideo : captions.video, captions.hashtags, cityId, { city: city.name }, random);
  if (type === "story") videoCaption = videoCaption.toLowerCase();
  fs.writeFileSync(path.join(outDir, "video-caption.txt"), videoCaption);
  post.video = { file: "video.mp4", caption: videoCaption, clip: path.basename(clip) };
}

fs.writeFileSync(path.join(outDir, "post.json"), JSON.stringify(post, null, 2));
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\nDone: ${outDir}`);
