// Stops repeats: checks every post in stories.json that hasn't been retired.
//
//   node src/check.mjs      lists any problems (build.mjs runs the same check and refuses to build)
//
// A post that isn't retired must:
//   - have a date (YYYY-MM-DD) and a city, and no other post on the same date and slot
//   - name its own photo for the hook, every slide and the end (hookImage, slides[].image, endImage)
//   - only use photos that exist, aren't in assets/photos/retired, and no other post uses (repeating one inside a post is fine)
//   - not repeat a line (or a close rewording) from any other post, old or new

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Small words that say nothing about whether two lines are the same idea.
const FILLER = new Set(("a an the and or but so of to in on at for with by from is are was were be been it its it's " +
  "you you're your youre you've youve i i'm im me my we us our they them their this that these those there here " +
  "do does did don't dont not no yes just very really still even if then than when what who how all any one which so " +
  "go got get can many much sauna saunas part week this").split(" "));

const words = (line) =>
  String(line).toLowerCase().replace(/[’']/g, "'").match(/[a-z0-9']+/g)?.map((w) => w.replace(/^'+|'+$/g, "")) || [];
const keyWords = (line) => new Set(words(line).filter((w) => w && !FILLER.has(w) && !/^\d+$/.test(w)));
const same = (a, b) => words(a).join(" ") === words(b).join(" ");

/** Share of key words two lines have in common (0 to 1). */
function overlap(a, b) {
  const x = keyWords(a), y = keyWords(b);
  if (x.size < 2 || y.size < 2) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared >= 2 ? shared / Math.max(x.size, y.size) : 0; // vs the longer line, so a short name inside a long sentence is not a repeat
}

/** Every line of a story, from the main text and each city block. */
function linesOf(story) {
  const blocks = [story, ...Object.values(story).filter((v) => v && typeof v === "object" && !Array.isArray(v) && (v.slides || v.hook))];
  const out = [];
  for (const b of blocks) {
    for (const key of ["hook", "subhook", "question"]) if (b[key]) out.push({ where: key, text: b[key] });
    (b.slides || []).forEach((s, i) => {
      for (const key of ["title", "body", "myth", "truth"]) if (s[key]) out.push({ where: `slide ${i + 1} ${key}`, text: s[key] });
    });
  }
  return out;
}

function photosOf(story) {
  return [
    { where: "hookImage", file: story.hookImage },
    ...(story.slides || []).map((s, i) => ({ where: `slide ${i + 1} image`, file: s.image })),
    { where: "endImage", file: story.endImage },
  ];
}

export function checkStories(stories, root = process.cwd()) {
  const problems = [];
  const active = stories.filter((s) => !s.retired);
  const say = (story, msg) => problems.push(`${story.id}: ${msg}`);

  // Ids, dates, slots
  const ids = new Set();
  for (const s of stories) {
    if (ids.has(s.id)) say(s, "id is used twice");
    ids.add(s.id);
  }
  const slots = new Map();
  for (const s of active) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date || "")) say(s, `needs a "date" (YYYY-MM-DD)`);
    if (!s.cities?.length) say(s, `needs "cities", e.g. ["dublin"]`);
    const key = `${s.date} slot ${s.slot || 1}`;
    if (slots.has(key)) say(s, `same date and slot as ${slots.get(key)} (${key})`);
    slots.set(key, s.id);
  }

  // Photos: every slot filled, file exists, not retired, used once across all posts
  const photoOwner = new Map(); // photo file name -> "story / where"
  for (const s of stories) {
    for (const p of photosOf(s)) if (p.file && s.retired) photoOwner.set(path.basename(p.file), { id: s.id, label: `${s.id} (retired)` });
  }
  for (const s of active) {
    for (const p of photosOf(s)) {
      if (!p.file) { say(s, `${p.where}: needs its own photo`); continue; }
      const name = path.basename(p.file);
      if (p.file.includes("photos/retired/")) say(s, `${p.where}: ${name} is retired`);
      if (!fs.existsSync(path.resolve(root, p.file))) say(s, `${p.where}: no file at ${p.file}`);
      // The same photo can appear more than once inside one post, never in two posts.
      const owner = photoOwner.get(name);
      if (owner && owner.id !== s.id) say(s, `${p.where}: ${name} is already used by ${owner.label}`);
      else if (!owner) photoOwner.set(name, { id: s.id, series: s.series, label: `${s.id} ${p.where}` });
    }
  }
  // Photos in the retired folder count as used even if no story names them (the old random pools).
  const retiredDir = path.resolve(root, "assets/photos/retired");
  const retiredNames = new Set();
  if (fs.existsSync(retiredDir)) {
    for (const sub of fs.readdirSync(retiredDir, { withFileTypes: true })) {
      if (sub.isDirectory()) fs.readdirSync(path.join(retiredDir, sub.name)).forEach((f) => retiredNames.add(f));
    }
  }
  for (const s of active) {
    for (const p of photosOf(s)) {
      if (p.file && !p.file.includes("photos/retired/") && retiredNames.has(path.basename(p.file))) {
        say(s, `${p.where}: ${path.basename(p.file)} is the same file as a retired photo`);
      }
    }
  }

  // Lines: no repeats or close rewordings of any other post's lines (or the same post's other lines)
  const all = stories.flatMap((s) => linesOf(s).map((l) => ({ ...l, id: s.id, series: s.series })));
  for (const s of active) {
    const mine = linesOf(s).map((l) => ({ ...l, id: s.id }));
    // Parts of one series ("series" in stories.json) share a photo and a similar hook, so their hooks aren't compared.
    const others = all.filter((o) => o.id !== s.id && !(s.series && o.series === s.series && o.where === "hook"));
    mine.forEach((line, i) => {
      for (const other of [...mine.slice(i + 1), ...others]) {
        if (same(line.text, other.text)) say(s, `${line.where} "${line.text}" repeats ${other.id} ${other.where}`);
        else if (overlap(line.text, other.text) >= 0.6) say(s, `${line.where} "${line.text}" is too close to ${other.id} ${other.where}: "${other.text}"`);
      }
    });
  }
  return [...new Set(problems)];
}

// Run directly: node src/check.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { stories } = JSON.parse(fs.readFileSync("stories.json", "utf8"));
  const problems = checkStories(stories);
  const active = stories.filter((s) => !s.retired);
  if (problems.length) {
    console.log(`${problems.length} problem(s):\n` + problems.map((p) => "  - " + p).join("\n"));
    process.exit(1);
  }
  console.log(`All good: ${active.length} upcoming post(s), no reused photos or repeated lines.`);
  active.sort((a, b) => `${a.date}${a.slot || 1}`.localeCompare(`${b.date}${b.slot || 1}`))
    .forEach((s) => console.log(`  ${s.date} slot ${s.slot || 1}  ${s.cities.join(",")}  ${s.id}`));
}
