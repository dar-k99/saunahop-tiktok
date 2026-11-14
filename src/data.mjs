// Loads the two SaunaHop data files:
//   - venues.json: the hand-maintained venue list, read from a copy of the loyly repo
//   - availability.json: live slots, downloaded from the scraper server
//
// Rule from the SaunaHop project: never invent availability. A venue only
// gets a "sessions with space" line when its data is live (scraped and the
// latest scrape worked). Everything else shows price and tags only.

import fs from "fs";
import path from "path";
import os from "os";

const LOYLY_DIR = process.env.LOYLY_DIR || path.join(os.homedir(), "code/loyly");
const AVAILABILITY_URL = process.env.AVAILABILITY_URL || "https://data.saunahop.com/availability.json";

// Availability older than this is treated as missing, so we never post stale numbers.
const MAX_AGE_HOURS = 6;

export function loadVenues() {
  const file = path.join(LOYLY_DIR, "data/venues.json");
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const all = json.venues || json;
  // London venues have no "country" field; Irish ones have country: "ie".
  return all.filter((v) => !v.country || v.country === "uk");
}

export async function loadAvailability() {
  try {
    const res = await fetch(AVAILABILITY_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const ageHours = (Date.now() - new Date(data.generatedAt).getTime()) / 3600_000;
    if (ageHours > MAX_AGE_HOURS) {
      console.warn(`Availability is ${ageHours.toFixed(1)} hours old, so no slot numbers will be shown today.`);
      return null;
    }
    return data;
  } catch (err) {
    console.warn(`Could not download availability (${err.message}), so no slot numbers will be shown today.`);
    return null;
  }
}

// ---- London dates and times ----

const londonParts = (date) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24, weekday: get("weekday") };
};

export const londonToday = (now = new Date()) => londonParts(now).day;
export const londonWeekday = (now = new Date()) => londonParts(now).weekday;

// The coming weekend's dates in London: today/tomorrow if it's already the weekend.
function weekendDays(now) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const p = londonParts(new Date(now.getTime() + i * 86400_000));
    if (p.weekday === "Sat" || p.weekday === "Sun") days.push(p.day);
    else if (days.length) break;
  }
  return days;
}

// ---- Counting free sessions ----

const hasSpace = (slot) => !slot.soldOut && (slot.spacesLeft == null || slot.spacesLeft > 0);

/**
 * For each venue with live data, count the sessions that still have space
 * tonight and this weekend. Venues without live data are left out.
 */
export function countFreeSessions(venues, availability, tonightFromHour, now = new Date()) {
  const counts = {};
  if (!availability) return counts;

  const today = londonToday(now);
  const weekend = weekendDays(now);
  const liveIds = new Set(availability.runs.filter((r) => r.ok && r.quality === "live").map((r) => r.venueId));

  for (const v of venues) {
    if (v.dataSource !== "scraped" || !liveIds.has(v.id)) continue;
    counts[v.id] = { tonight: 0, weekend: 0 };
  }

  for (const slot of availability.slots) {
    const c = counts[slot.venueId];
    if (!c || !hasSpace(slot)) continue;
    const start = new Date(slot.start);
    if (start < now) continue;
    const p = londonParts(start);
    if (p.day === today && p.hour >= tonightFromHour) c.tonight++;
    if (weekend.includes(p.day)) c.weekend++;
  }
  return counts;
}
