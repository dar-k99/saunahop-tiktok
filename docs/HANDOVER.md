# SaunaHop TikTok: handover to Donnacha

As of 24 Nov 2026. This repo makes the SaunaHop TikTok posts and schedules them in Buffer. Buffer then pings a phone, and someone posts them to TikTok with a trending sound. How the code works is in the [README](../README.md); the posts planned for 22 Nov to 12 Dec are in [content-calendar.md](content-calendar.md).

**Daryna said to open these first and take a look at them as inspiration:** [Dublin history, part 1](examples/dublin-history-part-1/), [London history, part 1](examples/london-history-part-1/) and the [content calendar](content-calendar.md). Dublin history part 1 goes out first.

## First post: Dublin history, part 1

Send this one first, via Buffer. It's in `stories.json` as `dublin-bathhouses`, and the finished slides and caption are in [examples/dublin-history-part-1](examples/dublin-history-part-1/).

From a laptop with this repo, after `npm install`, `npm run setup` and `BUFFER_API_KEY` in a `.env` file:

```bash
node build.mjs --topic dublin-bathhouses --city dublin   # builds it into output/<today>/
node post.mjs --draft                                    # saves it in Buffer as a draft to check
node post.mjs --time 12:30                               # schedules it (Buffer pings the phone at 12:30)
```

Or skip the code: in Buffer, make a new TikTok post, upload the 7 slides from the examples folder in order, paste `caption.txt`, and set "Notify me". Add a trending sound in TikTok when it pings.

## Where things stand

| | Status |
|---|---|
| Daily job (GitHub Actions, "Daily TikTok post") | Running every day, 2 posts a day (12:30 and 18:40 London) |
| What it is posting | **The old tips-and-myths carousels** (`stories.json`). These were meant to stop on 21 Nov. |
| Content calendar (history + discovery posts) | Written and sourced, **not loaded into the poster yet** |
| London history post ("london bathhouses", part 1) | Sent once by hand on 19 Nov; the rewritten version (cream "framed" slides, longer text) is in `stories.json` |
| Dublin history post ("dublin bathhouses", part 1) | In `stories.json`, slides in `docs/examples/`. **Goes out first** (above) |
| Buffer | Free plan, channel "saunahop" (TikTok), posts as "Notify me" |
| `BUFFER_API_KEY` secret | Set (14 Nov), tied to the current Buffer account |
| `LOYLY_TOKEN` secret | Not set, so the weekly venue-list refresh skips (only matters for venue-list posts) |

## What you need access to

1. **This GitHub repo** (`dar-k99/saunahop-tiktok`): ask to be added as a collaborator (Settings → Collaborators), or have the repo transferred to you. You need this to edit posts and see the Actions tab.
2. **Buffer** ([publish.buffer.com](https://publish.buffer.com)): log in to the SaunaHop Buffer account. Get the login privately, **never put it in this repo** (the repo is public). Then install the **Buffer app on your phone**, log in, and allow notifications. "Notify me" posts only reach phones logged in to Buffer.
3. **TikTok**: log in to the SaunaHop TikTok account in the TikTok app on the same phone. Buffer's notification opens TikTok with the images and caption ready.

If you ever make a new Buffer account instead: connect the TikTok account, create an API key at publish.buffer.com/settings/api, and replace the `BUFFER_API_KEY` secret (repo → Settings → Secrets and variables → Actions).

## Outstanding steps

- [ ] **Get access**: GitHub, Buffer (and the phone app), TikTok (above).
- [ ] **Stop the tips and myths now**: Actions → Daily TikTok post → "…" → Disable workflow. Otherwise it keeps posting them twice a day until the calendar is loaded.
- [ ] **Send Dublin history part 1 first** (see "First post" above).
- [ ] **Load the calendar** into `stories.json`, one entry per row, in date order (format below). Remove the tips-and-myths entries, or move them to a spare file.
- [ ] **Pictures**: every history post needs its images in `assets/photos/history/` (Wikimedia Commons, public domain or CC BY; put the credit in the post's `note` so it goes in the caption). The calendar links each source. "yours" means it was on the previous owner's Mac: re-download it from the link.
- [ ] **Discovery posts** end with a screenshot of that venue on the SaunaHop map (there are no per-venue pages). Take it on a phone-sized browser and close the newsletter popup first.
- [ ] **Check facts before each goes out**: the rows marked "check" (Docklands women-only day, Porchester single-sex days, Outcast review count) and every price, on the venue's own site, the week it posts.
- [ ] **Preview, then turn the job back on**: `node build.mjs --topic <id>` on a laptop, look at `output/<date>/`. Then Actions → Daily TikTok post → Enable, and do one "Run workflow" with "Send to Buffer" unticked; the images are under the run's Artifacts.
- [ ] Optional: add `LOYLY_TOKEN`, or publish `venues.json` at data.saunahop.com, so the venue list refreshes weekly.

## Every day once it's running (about 2 minutes)

At 12:30 and 18:40 London time Buffer sends a notification. Tap it, it opens TikTok with the slides and caption; add a trending sound, post, then pin a comment "Book here → saunahop.com".

GitHub usually starts the daily job late (around 2pm UTC instead of 7am). That's fine: if a slot's time has already passed, Buffer notifies straight away instead.

Don't re-run the daily job by hand on a day it already ran: building twice gives the same post, but sending twice makes two sets of Buffer notifications.

## House style (so new posts match)

- All lowercase, **no emojis** anywhere.
- London: a blustering, posh old-school politician voice ("cripes", "piffle"). It's a parody: never name or quote a real person.
- Dublin: an Irish voice ("grand", "deadly", "bad craic", "notions", "sure look").
- **Only London or Dublin content**: local history, and "discovery" posts about one named venue told through what reviewers actually say (real reviews, lightly adapted, no reviewer names). No generic lists, no tips or myths.
- "Highest-rated" series: only venues at 4.8+ on Google.
- No Banya No.1 content.
- Health: "linked with", never "cures".
- Never show session counts unless they're live data under 6 hours old (the code already enforces this for venue lists).
- Never use the word "mosque" (for the Lincoln Place baths, say Joyce put it in Ulysses).
- History slides: clear, a bit longer, explain references (don't assume people know who Hogarth was), cream paper style, not black backgrounds.

## Story format (`stories.json`)

A history post, as the London one is written now:

```json
{
  "id": "london-bathhouses",
  "cities": ["london"],
  "hook": "london's secret sauna history",
  "subhook": "part 1: steam, scandal and a building you walk past every day",
  "hookImage": "assets/photos/history/08-1862-jermyn-st-hot-room.jpg",
  "slides": [
    { "year": "1600s", "title": "london's first steam rooms",
      "image": "assets/photos/history/01-1600s-bagnio-st-giles.jpg",
      "body": "picture it: the 1600s, no showers ..." }
  ],
  "question": "what should part 2 cover?",
  "note": "pictures: william hogarth (public domain); ... (credits, go in the caption)"
}
```

`cities` limits a post to London or Dublin days. A slide with an `image` is shown "framed" (whole picture on the top half). Build one post with `node build.mjs --topic <id>`.
