# Page Crawler

Crawl any company website for law-relevant assertions, then get a structured analysis back inside the extension. Industry-agnostic — same logic for food, supplements, cosmetics, software, financial services, professional services, consumer goods, or anything else with a public-facing website.

The tool inventories factual verifiable claims, effect claims, implied claims, operational cues, and testimonials. It does not do legal analysis. You take the inventory and apply the regulatory frameworks.

## Setup (~2 minutes, one time)

Apple Silicon Mac only as packaged. Intel Macs need to rebuild — see "Rebuilding from source" at the bottom.

### Step 1 — Sign in to NotebookLM
Open <https://notebooklm.google.com/> in Chrome and sign in with the Google account you want this tool to use. Close the tab.

### Step 2 — Load the extension
1. Open Chrome and go to `chrome://extensions`.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and pick this folder.
4. The Page Crawler icon appears in the toolbar. Pin it for easy access.

### Step 3 — Install the helper
1. In Finder, double-click `PageCrawlerSetup.app` in this folder.
2. macOS may block it with *"PageCrawlerSetup.app cannot be opened because Apple cannot check it for malicious software."* This happens because the app is unsigned. Fix:
   - Open **System Settings → Privacy & Security**, scroll to the bottom, click **Open Anyway**, enter your Mac password.
   - Double-click `PageCrawlerSetup.app` again.
3. Click **Install** in the welcome dialog.
4. macOS will prompt for **Chrome Safe Storage** access. Click **Always Allow**. This lets the helper read your Chrome Google session cookies (the same cookies you use to log in to NotebookLM in your browser).
5. The "Done" alert appears. Close it.

### Step 4 — Verify
Click the Page Crawler icon. The status line should say "Ready."

If it doesn't, click **Set up** to see troubleshooting steps. Most issues are fixed by re-running `PageCrawlerSetup.app` (right-click → Open).

## Use

1. Open the client website you're reviewing.
2. Click the Page Crawler icon.
3. Click **Review this site**.
4. A detached popup window opens. It crawls the site, uploads pages to a temporary NotebookLM notebook, walks each source for claims, and renders cards back into the window.

Each card shows the verbatim quote (or implied phrase), a category badge, and a clickable URL. For implied claims, there's an inline note explaining what's implied.

The notebook is deleted after the review completes, so the run leaves zero trace in your NotebookLM account.

## What it surfaces

**Factual verifiable claims** — anything checkable against independent evidence:
- `factual-business` — founding, founders, ownership, location, history, mission
- `factual-product` — ingredients, sourcing, manufacturing, format, specifications
- `factual-origin` — made in, sourced from, country-of-origin
- `factual-certification` — USDA Organic, Non-GMO, Fair Trade, B Corp, HIPAA, SOC 2, etc.
- `factual-endorsement` — doctor recommended, clinically proven, as seen in, used by N customers
- `factual-award` — awards, recognition, partnerships
- `factual-quantitative` — specific numbers, percentages, absolutes ("100%," "zero")
- `factual-comparison` — better than, only, more than
- `factual-pricing` — prices, discounts, fees
- `factual-policy` — returns, shipping, warranty, terms
- `factual-impact` — donations, ESG, carbon, sustainability

**Effect claims** — `effect-claim` — verbatim quotes linking the product or service to a specific effect, function, condition, outcome, or audience benefit.

**Operational cues** — `operational-cue` — text that hints at which regulatory regime applies:
- Production location (home kitchen, shared kitchen, licensed facility, contract manufacturer)
- Audience targeting (kids, seniors, pets, age ranges)
- Geographic scope (ships nationwide, US only, specific states, international)
- Distribution channel (DTC, wholesale, subscription, marketplace, telehealth)
- Data practices (newsletter, cookies, account creation)
- Industry-regime signals (cottage food, supplement, OTC drug, FINRA member, HIPAA covered)

**Other**:
- `testimonial` — customer or third-party quotation
- `implied` — names, titles, or taglines that substantively imply a specific function, condition, audience problem, or operational context (mood/vibe names get skipped)

## Files

- `manifest.json`, `popup.html`, `popup.css`, `popup.js`, `installer.html` — Chrome extension.
- `PageCrawlerSetup.app` — the macOS installer with the bundled Python helper inside.
- `server.py`, `auth.py` — helper source. Compiled into the binary inside `PageCrawlerSetup.app`.
- `helper.spec`, `build.sh` — build configuration. Only needed if you change the helper.
- `README.md` — this file.

## Privacy

The helper runs locally on `127.0.0.1:7837`. The extension's only network outbound is to that local helper. The helper, in turn, talks to NotebookLM under your own Google account using cookies from your Chrome profile. Nothing about the scanned site, the uploaded pages, or the review output ever leaves your computer except through NotebookLM via your own account.

## Logs (if something goes wrong)

- Install log: `~/.cache/page-crawler-helper/install.log`
- Helper stdout: `~/.cache/page-crawler-helper/stdout.log`
- Helper stderr: `~/.cache/page-crawler-helper/stderr.log`

## Re-running setup

Just right-click `PageCrawlerSetup.app` → Open again. The installer is idempotent — it reloads the helper without breaking anything.

## Rebuilding from source

You only need to do this if you change `server.py` or `auth.py`, or if you're on Intel Mac and need an x86_64 helper.

```bash
./build.sh
```

That script will:
1. Create a build venv (Python 3.10–3.12 — `rookiepy` doesn't support 3.13+ yet).
2. Install PyInstaller, `notebooklm-py[cookies]`, and `rookiepy` into it.
3. Compile `server.py` plus dependencies into a single binary.
4. Drop the binary into `PageCrawlerSetup.app/Contents/MacOS/helper`, overwriting the old one.

After rebuilding, double-click `PageCrawlerSetup.app` again to reload the helper.

## Notes

- **The first scan is slow.** Crawling 50 pages takes about a minute, and the LLM queries take 15–30 seconds each per source. A typical full review takes 2–4 minutes end-to-end.
- **Don't worry about the detached window.** Once you click Review, a separate popup window opens. You can do anything else in Chrome — the run continues in that window until it finishes or you close it.
- **Notebooks are deleted after.** You'll never see "Page Crawler" notebooks piling up in your NotebookLM account.
- **It misses what the website doesn't say.** If the client tells you they're a Chicago shared-kitchen operation, but the website doesn't mention the kitchen, the tool can't surface it. The tool's job is to inventory what the website does say. Operational facts you learn in intake have to be tracked separately.
