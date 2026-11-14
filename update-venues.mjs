// Refreshes data/venues.json (this repo's copy of the London and Irish venue list)
// from the SaunaHop repo, so the daily post doesn't need access to it.
//
//   node update-venues.mjs [path/to/loyly]     default: $LOYLY_DIR or ~/code/loyly
//
// London and Irish venues are kept: names, areas, prices, tags, booking links.
// All of it is already public on saunahop.com.

import fs from "fs";
import path from "path";
import os from "os";

const loylyDir = process.argv[2] || process.env.LOYLY_DIR || path.join(os.homedir(), "code/loyly");
const source = JSON.parse(fs.readFileSync(path.join(loylyDir, "data/venues.json"), "utf8"));
const venues = (source.venues || source).filter((v) => !v.country || v.country === "uk" || v.country === "ie");

const output = {
  _README: "Copy of the London and Irish venues from the SaunaHop repo (data/venues.json). Do not edit here: edit it in the SaunaHop repo, and the weekly 'Update venue list' job copies it over.",
  venues,
};

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/venues.json", JSON.stringify(output, null, 2) + "\n");
console.log(`Saved ${venues.length} venues to data/venues.json`);
