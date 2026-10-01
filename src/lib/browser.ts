// Opens a page in Cloudflare's headless Chrome and returns its text.
// Only used when a normal fetch gets too little text (JavaScript sites).
import puppeteer, { type BrowserWorker } from "@cloudflare/puppeteer";

const NAV_TIMEOUT_MS = 20_000;

export async function renderPageText(binding: BrowserWorker, url: string) {
  const browser = await puppeteer.launch(binding);
  try {
    const page = await browser.newPage();
    // Skip images, video and fonts; we only need the text.
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const type = req.resourceType();
      if (type === "image" || type === "media" || type === "font") req.abort();
      else req.continue();
    });
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: NAV_TIMEOUT_MS
    });
    const title = await page.title();
    const text = await page.evaluate(() => document.body?.innerText ?? "");
    return { url: page.url(), title, text };
  } finally {
    await browser.close();
  }
}
