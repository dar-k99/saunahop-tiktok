// The slide designs, as HTML. Playwright opens each one and saves a 1080x1920 image.
// Brand: Amoured (headlines), Hanken Grotesk (body), ember orange #f0773f.

import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FONT = path.join(ROOT, "assets/brand/Amoured.otf");
const LOGO = path.join(ROOT, "assets/brand/saunahop-mark-light.png");

const escape = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const price = (n, currency) => currency + (Number.isInteger(n) ? n : n.toFixed(2));

// "Peckham, South London" / "Inchicore, Dublin"
const place = (venue, city) => (city.name === "London" ? `${venue.area}, ${venue.region} London` : `${venue.area}, ${city.name}`);

// Long text gets a smaller font so it never runs off the slide.
const sizeFor = (text, sizes) => {
  for (const [maxLength, size] of sizes) if (text.length <= maxLength) return size;
  return sizes[sizes.length - 1][1];
};

function page(body, background) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;800&display=swap" rel="stylesheet">
<style>
  @font-face { font-family: "Amoured"; src: url("file://${FONT}"); }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1080px; height: 1920px; overflow: hidden; background: ${background ? "#000" : "transparent"}; }
  body { font-family: "Hanken Grotesk", sans-serif; color: #fff; position: relative; }
  .bg { position: absolute; inset: 0; background: url("file://${background}") center/cover; }
  .shade { position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.2) 30%, rgba(0,0,0,.55) 55%, rgba(0,0,0,.88) 100%); }
  .logo { position: absolute; top: 90px; left: 80px; display: flex; align-items: center; gap: 18px;
    font-family: "Amoured"; font-size: 54px; }
  .logo img { width: 64px; }
  .url { position: absolute; bottom: 330px; right: 170px; font-size: 32px; font-weight: 600; opacity: .85; }
  /* Text stays clear of TikTok's buttons (right edge) and caption area (bottom). */
  .content { position: absolute; left: 80px; right: 170px; bottom: 420px; }
  .brand { font-family: "Amoured"; line-height: 1.05; text-shadow: 0 4px 30px rgba(0,0,0,.5); }
  .pill { display: inline-block; padding: 12px 26px; border-radius: 999px; font-size: 32px; font-weight: 600;
    background: rgba(255,255,255,.16); border: 2px solid rgba(255,255,255,.35); margin: 0 12px 14px 0; }
  .ember { color: #f0773f; }
  .live { display: inline-flex; align-items: center; gap: 14px; font-size: 40px; font-weight: 700; margin-bottom: 30px; }
  .live .dot { width: 20px; height: 20px; border-radius: 50%; background: #f0773f; }
  .live small { font-size: 28px; font-weight: 400; opacity: .75; }
  .button { display: inline-block; background: #f0773f; color: #fff; padding: 22px 48px; border-radius: 999px;
    font-size: 64px; font-weight: 800; }
</style></head><body>
${background ? `<div class="bg"></div><div class="shade"></div>` : ""}
<div class="logo"><img src="file://${LOGO}">SaunaHop</div>
${body}
</body></html>`;
}

export function hookSlide(topic, background) {
  const size = sizeFor(topic.hook, [[24, 160], [34, 140], [44, 120], [999, 104]]);
  return page(`
  <div class="content">
    <div class="brand" style="font-size:${size}px">${escape(topic.hook)}</div>
    <div style="font-size:60px;font-weight:600;margin-top:24px">${escape(topic.subhook)} 🔥</div>
    <div style="font-size:38px;margin-top:40px;opacity:.9">live slots → <b>saunahop.com</b></div>
  </div>`, background);
}

/**
 * One venue. `free` is the number of sessions with space (tonight or this
 * weekend), only passed for venues with live data. `checkedAt` is a label
 * like "3:34pm" (when the scraper last checked) so viewers know when the number was true.
 */
export function venueSlide({ venue, city, index, total, pills, show, free, checkedAt, background }) {
  const size = sizeFor(venue.name, [[18, 120], [26, 104], [34, 92], [999, 80]]);
  const when = show === "tonight" ? "tonight" : "this weekend";
  const live = free
    ? `<div class="live"><span class="dot"></span>${free} session${free === 1 ? "" : "s"} with space ${when} <small>at ${checkedAt}</small></div>`
    : "";
  return page(`
  <div class="content">
    <div style="font-size:40px;font-weight:600;opacity:.85;margin-bottom:16px">${index + 1} / ${total} · ${escape(place(venue, city))}</div>
    <div class="brand" style="font-size:${size}px;margin-bottom:30px">${escape(venue.name)}</div>
    ${venue.priceFrom != null ? `<div style="font-size:84px;font-weight:800;margin-bottom:30px">from <span class="ember">${price(venue.priceFrom, city.currency)}</span></div>` : ""}
    ${live}
    <div>${pills.map((t) => `<span class="pill">${escape(t)}</span>`).join("")}</div>
  </div>
  <div class="url">saunahop.com</div>`, background);
}

function endingBody(city, venueCount) {
  return `
  <div class="content" style="bottom:470px">
    <div class="brand" style="font-size:130px">Every ${city.name} sauna.<br>One timetable.</div>
    <div style="font-size:48px;font-weight:600;margin:30px 0 50px">Live availability for ${venueCount} saunas</div>
    <div class="button">saunahop.com</div>
  </div>`;
}

export const endSlide = (city, venueCount, background) => page(endingBody(city, venueCount), background);

/** Transparent version laid over the video clip, with a light tint so it fades in with the text. */
export const videoOverlay = (city, venueCount) =>
  page(`<div style="position:absolute;inset:0;background:rgba(0,0,0,.4)"></div>${endingBody(city, venueCount)}`, null);
