# SaunaHop TikTok

Makes one TikTok post a day for saunahop.com (London 5 days a week, Dublin on Mondays and Thursdays), from real venue and availability data, and schedules it in Buffer, which sends it to your phone to post on TikTok.

## What happens each day

1. **3:30pm London time (GitHub Action):** the job starts on its own, late enough that "space tonight" numbers are fresh.
2. **Data:** reads the venue list (`data/venues.json`, this repo's copy of the London and Irish venues; Dublin posts use the ones in the Dublin region) and downloads live slots from `data.saunahop.com/availability.json`.
3. **City and topic:** picks the city for the day (`cities` in `config.json`), then the next topic from that city's list in `topics.json`, for example "London saunas under £15" or "Sea saunas in Dublin". Topics that don't have at least 3 matching venues that day are skipped.
4. **Slides:** makes 6 images at 1080×1920 (`slide-1.jpg` … `slide-6.jpg`):
   - 1: the hook, over a photo with people in it
   - 2–5: one venue each (name, area, price, 3 tags, and for "tonight" or "weekend" topics, how many sessions still have space)
   - 6: "Every London sauna. One timetable." (or Dublin) + saunahop.com
5. **Video** (Tue, Thu, Sat): a 4-second sauna clip from `assets/clips/`; "Every London sauna. One timetable." (or Dublin) fades in at 2 seconds.
6. **Caption:** picked from `captions.json`, always with saunahop.com on the first line, plus #londonsauna or #dublinsauna and 5 rotating hashtags for that city.
7. **Images online:** the day's images are pushed to the `posts` branch of this repo, because Buffer only takes images from a public link. That branch only keeps the last 14 days.
8. **Buffer:** the carousel is scheduled for 17:00 and the video (on video days) for 20:00, as "Notify me" posts.
9. **You (1 minute):** at that time the Buffer app on your phone sends a notification. Tap it, it opens TikTok with the images and caption, add a trending sound, post, then pin a comment "Book here → saunahop.com". (No app can pick TikTok sounds for you: TikTok doesn't allow it.)

## Rules it follows

- **Never invents availability.** Session counts are shown only for venues with live, scraped data, only if that data is under 6 hours old, and with the time it was checked ("at 3:34pm"). Otherwise the slide shows price and tags only.
- **People photos only on the first and last slides.** Venue slides use empty saunas, so no one looks like they're at a particular venue.
- **Same day = same post.** All "random" choices are seeded by the date, so re-building gives the same result. But **sending** twice creates two sets of Buffer posts, so don't re-run the daily job by hand on a day it already ran.

## How "sessions with space" are counted

SaunaHop's scraper regularly checks each venue's booking page and publishes every bookable session to `data.saunahop.com/availability.json` (the same data the website uses). For each venue, the job counts sessions that:

- are **live** data (the venue is scraped, and its latest scrape worked; hand-entered venues never get a number)
- start **tonight** (today, from 5pm, not already started) or **this weekend** (the coming Saturday and Sunday)
- are not sold out and have at least 1 space left (or the venue doesn't report a count)

A "session" is one bookable time slot, so a venue with two saunas bookable at 6pm counts 2. If the file is more than 6 hours old, no numbers are shown at all.

## Things you can change without touching code

| File | What it controls |
|---|---|
| `topics.json` | The topics for each city, in order. Add, remove or reword. |
| `captions.json` | Caption wording, and hashtags for each city. |
| `config.json` | Which days are London or Dublin, venues per post, video days, video timing, posting times, notification vs automatic posting. |
| `assets/photos/people/` | Photos for the first and last slides (portrait works best). |
| `assets/photos/empty/` | Photos behind venue names: saunas with no people. |
| `assets/clips/` | Video clips for the video post (vertical, 6+ seconds). One is picked at random. |

### Topic fields

```json
{ "id": "under-15", "hook": "London saunas under £15", "subhook": "you didn't know about",
  "filter": { "maxPrice": 15, "regions": ["East"], "tagsAny": ["Cold plunge"] },
  "show": "tonight", "sort": "price", "minVenues": 2 }
```

- `filter` (optional): `maxPrice` (in the city's currency), `regions` (London only: North, South, East, West, Central), `tagsAny` (venue has at least one of these tags, exactly as written in venues.json).
- `show` (optional): `"tonight"` (from 5pm) or `"weekend"`. Only venues with live free sessions are used, and the slide shows the count.
- `sort` (optional): `"price"` (cheapest first), `"free"` (most free sessions first) or `"random"` (default).
- `minVenues` (optional): default 3.

## How the files fit together

| File | Job |
|---|---|
| `build.mjs` | Makes today's post: picks city, topic and venues, renders slides and video, writes captions into `output/<date>/`. |
| `post.mjs` | Puts the images online (`posts` branch) and schedules them in Buffer. |
| `update-venues.mjs` | Copies the venue list from the SaunaHop repo into `data/venues.json`. |
| `src/data.mjs` | Loads venues and live availability; counts sessions with space. |
| `src/pick.mjs` | Topic rotation, venue choice, photo lists, captions. |
| `src/slides.mjs` | The slide designs (HTML). |
| `src/render.mjs` | Turns slides into images (Playwright) and makes the video (ffmpeg). |
| `.github/workflows/` | The two automatic jobs (see below). |

## Running it on your Mac

```bash
npm install
npm run setup                     # downloads the browser used to make the images (once)
node build.mjs                    # today's post → output/<date>/
node build.mjs --city dublin      # a specific city
node build.mjs --topic tonight    # a specific topic
node build.mjs --video            # also make the video
node post.mjs --dry-run           # shows what would be sent
node post.mjs --draft             # saves it as Buffer drafts (to check, nothing scheduled)
node post.mjs                     # schedules it in Buffer (needs BUFFER_API_KEY in .env)
```

To refresh the venue list by hand from your local SaunaHop repo: `node update-venues.mjs ~/code/loyly`.

## Setting up the automation

There are two GitHub Actions (repo → Actions tab):

| Job | When | Needs |
|---|---|---|
| **Daily TikTok post** | every day, 3:30pm London time | `BUFFER_API_KEY` |
| **Update venue list** | Mondays, 06:00 UTC | `LOYLY_TOKEN` (optional: without it the job skips and the daily post uses the current copy) |

1. **Buffer** (free plan): connect the TikTok account, then publish.buffer.com/settings/api → create a key. Install the Buffer app on your phone and allow notifications.
2. **Secrets:** github.com/dar-k99/saunahop-tiktok/settings/secrets/actions/new
   - `BUFFER_API_KEY`: the Buffer key
   - `LOYLY_TOKEN` (optional): a fine-grained token from github.com/settings/tokens with read-only *Contents* access to `dbinchy/loyly`. If you can't select that repo, Donnacha needs to create or approve it.
3. **Test:** Actions tab → Daily TikTok post → Run workflow. Untick "Send to Buffer" for a first look: the images are under the run's Artifacts.

The jobs run on Ubuntu 24.04 on purpose: Playwright doesn't support GitHub's newer default (Ubuntu 26) yet. When Playwright is updated, `runs-on` can go back to `ubuntu-latest`.

## Credits

Photos and clips: Pexels (free licence, no credit required). Brand font Amoured: SIL Open Font License (`assets/brand/Amoured-OFL.txt`).
