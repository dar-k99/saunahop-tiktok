// Chooses the day's topic and venues, lists photos and clips, and writes the caption.
// Everything "random" is seeded by the date, so running twice on the same
// day gives the same post, but each day is different.

import fs from "fs";
import path from "path";

// ---- A repeatable random number generator, seeded by text (the date) ----
export function seededRandom(seedText) {
  let h = 1779033703;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 3432918353);
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---- Venues ----

function matchesFilter(venue, filter = {}) {
  if (filter.maxPrice != null && (venue.priceFrom == null || venue.priceFrom > filter.maxPrice)) return false;
  if (filter.regions && !filter.regions.includes(venue.region)) return false;
  if (filter.tagsAny && !venue.tags.some((t) => filter.tagsAny.includes(t))) return false;
  return true;
}

/**
 * Returns the venues for a topic, or null if fewer than the minimum match.
 * "show: tonight/weekend" topics only use venues with live free sessions.
 */
export function pickVenues(topic, venues, freeSessions, config, random) {
  let matches = venues.filter((v) => matchesFilter(v, topic.filter));

  if (topic.show) {
    matches = matches.filter((v) => (freeSessions[v.id]?.[topic.show] || 0) > 0);
  }

  const min = topic.minVenues || config.minVenuesPerPost;
  if (matches.length < min) return null;

  // Shuffle first so ties and "random" topics vary from day to day.
  const chosen = shuffle(matches, random);
  if (topic.sort === "free") {
    chosen.sort((a, b) => freeSessions[b.id][topic.show] - freeSessions[a.id][topic.show]);
  }
  if (topic.sort === "price") {
    chosen.sort((a, b) => (a.priceFrom ?? 999) - (b.priceFrom ?? 999));
  }
  return chosen.slice(0, config.venuesPerPost);
}

/** The tags to show as pills: ones that match the topic first, then the rest. */
export function pillsFor(venue, topic, count = 3) {
  const wanted = topic.filter?.tagsAny || [];
  const first = venue.tags.filter((t) => wanted.includes(t));
  const rest = venue.tags.filter((t) => !wanted.includes(t));
  return [...first, ...rest].slice(0, count);
}

// ---- Topic rotation ----

/** Days since Monday 5 Jan 2026. */
function dayNumber(isoDay) {
  return Math.round((new Date(isoDay + "T12:00:00Z") - new Date("2026-01-05T12:00:00Z")) / 86400_000);
}

/**
 * Counts this city's posts so far, so each city steps through its own topic
 * list one by one. (Dublin posts twice a week, so a plain day count would skip topics.)
 */
function postNumber(isoDay, weekday, cityDays) {
  return Math.floor(dayNumber(isoDay) / 7) * cityDays.length + cityDays.indexOf(weekday);
}

/**
 * Picks today's topic: the next one in the city's list, skipping any that
 * don't have enough venues today (for example "space tonight" when nothing is free).
 */
export function pickTopic(topics, today, weekday, cityDays, tryTopic) {
  const n = postNumber(today, weekday, cityDays);
  const start = ((n % topics.length) + topics.length) % topics.length;
  for (let i = 0; i < topics.length; i++) {
    const topic = topics[(start + i) % topics.length];
    const result = tryTopic(topic);
    if (result) return { topic, venues: result };
    console.log(`Skipping topic "${topic.id}": not enough matching venues today.`);
  }
  throw new Error("No topic had enough venues today.");
}

// ---- Photos and clips ----

export function listFiles(dir, extensions) {
  return fs.readdirSync(dir)
    .filter((f) => extensions.some((ext) => f.toLowerCase().endsWith(ext)))
    .sort()
    .map((f) => path.resolve(dir, f)); // full paths: the slide HTML needs them to load the images
}

// ---- Captions ----

export function buildCaption(templates, hashtags, cityId, values, random) {
  let text = templates[Math.floor(random() * templates.length)];
  for (const [key, value] of Object.entries(values)) text = text.replaceAll(`{${key}}`, value);
  const { always, pool } = hashtags[cityId];
  const tags = [...always, ...shuffle(pool, random).slice(0, hashtags.pickFromPool)];
  return `${text}\n\n${tags.join(" ")}`;
}
