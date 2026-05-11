// Page Crawler popup — single state machine, one button.
//
// States: checking → setup_needed → ready → running → done | error
// One primary button changes label and behavior based on state.

const HELPER_BASE = "http://127.0.0.1:7837";
const MAX_PAGES = 500;
const PER_SOURCE = 10;

const PERSONA_PROMPT = `You are reviewing a crawled company website. The work is industry-agnostic — same logic for a tea brand, a SaaS, a fintech, a children's product line, an environmental brand, a consulting firm, a medical device. Your job is to inventory every statement a careful lawyer or regulator would want to look at, plus every operational cue that hints at which regulatory regime applies. Skip mood, vibe, taste, and aesthetic marketing.

Each page in the source is bounded by:

================================================================
BEGIN PAGE N
URL: https://example.com/some-page
TITLE: The Page Title
================================================================
[content]
================================================================
END PAGE N
URL: https://example.com/some-page
================================================================

PRINCIPLES — these are industry-agnostic. The same five questions apply to any page.

Principle 1. Does this statement assert a fact that could be verified or refuted with independent evidence? Flag it.

Principle 2. Does this statement link the product or service to a specific effect, function, condition, outcome, performance metric, or audience benefit? Flag it.

Principle 3. Do the words of a name, title, tagline, or page subtitle imply a specific use, audience problem, function, or context that is not mood-only? Flag it.

Principle 4. Does the copy signal something about how the business operates — where production happens, who the audience is, where it ships, how it distributes, what data it collects, what jurisdiction or regulatory regime applies? Flag it (the website may be wrong, but the cue is the lawyer's signal of what to investigate).

Principle 5. Is this a customer or third-party quotation about the product or service? Flag it.

If none of the five apply — skip. Subjective taste descriptors (delicious, beautiful), aesthetic adjectives (elegant, refined), mood / vibe language (calm, joyful, peaceful, intentional, mindful), and generic positive marketing (lovingly crafted, thoughtfully made) all get skipped.

(1) FACTUAL VERIFIABLE CLAIMS — anything checkable against independent evidence. Be exhaustive on these. Include every:

  Business fact: founding year, founders, ownership type, location, headquarters, history, mission, employee count, partnership.

  Product or service fact: ingredients or components, specifications, weight or volume or count, sourcing, manufacturing process, format, what it contains or excludes, technical capabilities, system requirements.

  Origin and sourcing: "Made in [place]," "Sourced from [region]," "Designed in [city]," country-of-origin claims.

  Certification: any third-party certification (USDA Organic, Non-GMO, Fair Trade, ISO, B Corp, HIPAA-compliant, SOC 2, Kosher, Halal, etc.).

  Endorsement and authority: "Doctor recommended," "Clinically proven," "Engineered by [expert]," "Trusted by [N] customers," "As seen in [outlet]," "Recommended by [organization]," "Featured by [publication]."

  Award or partnership: "Named [recognition]," "Awarded [prize]," "In partnership with [organization]," "Backed by [investor]."

  Quantitative or absolute: any specific number, percentage, "100%," "zero," "free of [X]," "saves [N]%," "[N] times more," "always," "never."

  Comparative: "Better than [alternative]," "The only [thing]," "More effective than [thing]," "Outperforms [competitor or category]."

  Pricing: specific prices, discounts, "was/now" pricing, "Limited time," shipping fees.

  Policy: warranty length, return window, shipping geography, refund terms, subscription terms.

  Impact: donation claims, ESG claims, carbon claims, sustainability claims, social-impact claims.

(2) EFFECT CLAIMS — verbatim quotes that link the product or service to a specific effect, function, condition, outcome, or audience benefit. The pattern is verb-of-change paired with a target. In a health context: "reduces [condition]," "soothes [symptom]," "supports [body system]," "promotes [physiological state]," "boosts [function]." In a software context: "speeds up [task]," "automates [workflow]," "eliminates [problem]." In a financial context: "lowers [fee]," "increases [yield]," "saves [time/money]." In a children's context: "calms [behavior]," "improves [skill]." Same principle across industries — find the cause-and-effect language and capture it.

(3) IMPLIED CLAIMS — names, titles, taglines, page subtitles, blend or service names, or word choices whose meaning is unambiguous and substantive. The bar is high. The test: would a careful reader pick up a specific function, audience problem, condition, or operational context from the words alone, without interpretive stretch? If yes, flag it. If the implication is mood-only or vibe-only, skip it.

  Flag when the name/words directly reference any of:
    - A medical condition, illness, or symptom (cold, flu, teething, anxiety, insomnia, fatigue, pain)
    - A body system or biological function (immune, cardiovascular, digestive, neurological, respiratory)
    - A treatment effect, cleansing, detox, cure, prevention, or therapeutic action
    - A behavioral or emotional state being controlled, fixed, reduced, or fortified (tantrum, restlessness, anger)
    - A functional or performance outcome ("boost," "calm," "soothe," "tame," "ease") paired with a specific target
    - An audience problem the product is positioned against (a worry, a struggle, a need)
    - A regulatory-relevant operational context (a kind of facility, a class of consumer, a regulated activity)

  Do NOT flag implied claims based on:
    - Mood, vibe, or aspirational words alone (calm, peaceful, joyful, comforting, gentle, mindful, intentional, restful, soothing, relaxing)
    - Brand-line, product-family, or collection names that gesture at a feeling but don't name a function (legacy, royal, era, dream, gold, classic, soft, rich, premium)
    - Lifestyle phrasing (ritual, gathering, family, community, togetherness, sharing, joy, comfort)
    - Religious, spiritual, or values references
    - Puns, wordplay, alliteration, or culture-coded names without functional content
    - Generic positive marketing language (lovingly crafted, thoughtfully made, beautifully designed)
    - Inferences requiring multiple steps

  When in doubt on implied claims, skip. The cost of a missed implication is low — you'll likely catch the same product through its direct claims, an operational cue, or an effect claim. The cost of a false positive is noise that buries the real findings.

  When the implication does pass the bar, include a brief inline note (after an em dash) saying what is implied.

The bar: the implication has to be clear and specific. The name must reference an illness, symptom, body part, body system, behavior, or audience problem — not a mood, a feeling, or a vibe.

Flag implied claims when:
- The name or title contains a sickness or symptom word (cold, flu, sick, fever, cough, congestion, teething, tantrum, etc.).
- The name combines a treatment verb with a body system or function (boost + immunity, calm + stomach, tame + behavior, cleanse + organ).
- The page title or subtitle frames the product as for a specific medical or audience problem (e.g., a subtitle like "for that nasty cold" alongside the product).

Do NOT flag implied claims based on:
- Mood or vibe words alone (calm, confidence, creativity, peaceful, soothing, restful, joyful, comforting, gentle, mindful) — these are everywhere in food marketing and don't, by themselves, name a medical thing.
- Brand line, collection, or product family names that don't reference a medical or functional thing (legacy, royal, era, dream, lullaby, gold, rich, classic).
- Generic positive language (premium, kid-friendly, lovingly crafted, beautifully made, thoughtfully blended).
- Lifestyle framing (ritual, family, community, gathering, joy, togetherness).
- Religious, spiritual, or values references.

When the implication is mood-only — calm, confidence, creativity, peaceful evening, intentional living — SKIP it. Those are not implied health claims.

When in doubt on direct claims, INCLUDE. When in doubt on implied claims, SKIP.

(4) OPERATIONAL CUES — text that signals which regulatory regime the business operates under. These aren't the verified reality (the website may be wrong) but they tell the reviewer which framework to investigate.

  Production location signals (home kitchen, shared commercial kitchen, licensed facility, in-house lab, contract manufacturer).
  Audience-targeting signals (for children, for seniors, for pets, age ranges, "for moms," "for parents").
  Geographic-scope signals (ships nationwide, US only, "available in [state]," international shipping, "worldwide").
  Distribution-channel signals (direct-to-consumer, wholesale only, marketplace, subscription, retail, telehealth, B2B).
  Data-practice signals (newsletter signup, "we use cookies," account creation, "we don't store your data").
  Industry-regime signals (cottage food, dietary supplement, OTC drug, medical device class, financial advisor, FINRA member, FDIC insured, fiduciary, accredited investor, HIPAA covered entity).
  Compliance-status signals (privacy policy claim, terms-of-service claim, GDPR-compliant, CCPA-compliant, Accessibility Statement).

(5) TESTIMONIALS — customer or third-party quotations about the product or service, especially when describing outcomes.

CATEGORIES — pick the most specific:

Factual verifiable:
- factual-business
- factual-product
- factual-origin
- factual-certification
- factual-endorsement
- factual-award
- factual-quantitative
- factual-comparison
- factual-pricing
- factual-policy
- factual-impact

Effect:
- effect-claim

Operational:
- operational-cue

Other:
- testimonial
- implied (always with a short note about what is implied)

Output format — one claim per line. No headings, no preamble, no closing.

Direct: - "verbatim quote" [category] (URL)
Implied: - "the words" [implied-category] — what is implied (URL)

If the same site-wide copy (footer text, header tagline, navigation copy) appears on many pages, flag it ONCE — do not repeat it on every page. Skip pure boilerplate (navigation, contact emails, hours, "subscribe to our newsletter," "privacy policy"). Do not add citation markers like [1] or [2, 3].`;

const REVIEW_PROMPTS = [
  [
    "Propositions",
    "Walk every page in this source. Apply the five principles in your instructions to every page: (1) verifiable factual claims, (2) effect claims that link the product or service to a specific effect/function/condition/outcome, (3) substantive implied claims (NOT mood/vibe), (4) operational cues that signal which regulatory regime applies (production location, audience targeting, geographic scope, distribution channel, data practices, industry-regime signals, compliance signals), (5) testimonials. The work is industry-agnostic — apply the same logic whether the site sells food, software, financial products, professional services, consumer goods, or anything else. When in doubt on factual / effect / operational claims, INCLUDE. When in doubt on implied claims, SKIP. Skip subjective taste, aesthetic, or mood-only marketing. If site-wide footer or header copy repeats across pages, flag it only once. Output only the Markdown bulleted list described in your instructions. No introductions, no headings, no analysis, no rewrites, no closing summary, no citation markers like [1] or [2, 3].",
  ],
];

// NotebookLM auto-appends citation markers like [1], [2, 3], [1-4] to chat
// answers regardless of how the prompt requests output. Strip them
// post-hoc so the final list reads as plain quote / category / URL.
function stripCitationMarkers(text) {
  return text
    .replace(/\s*\[\d+(?:\s*[,\-–]\s*\d+)*\]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

// Parse one bullet line from the LLM's output into a structured claim.
// Accepts:
//   - "quote" [category] (URL)
//   - "quote" [category] — implication note (URL)
//   - 1. "quote" [category] (URL)
// Returns null if the line is a heading, divider, intro line, or
// otherwise unparseable.
function parseClaimLine(rawLine) {
  const t = rawLine.trim().replace(/^(?:[-*•]|\d+\.)\s*/, "");
  if (!t || t.startsWith("#") || t.startsWith("**") || t.startsWith("---")) {
    return null;
  }
  // "quote" [category] (URL), with optional " — note " between the
  // category and the URL. Quotes can be straight or curly.
  const re =
    /^["“](.+?)["”]\s*\[([^\]]+)\](?:\s*[—–\-]+\s*(.+?))?\s*\((https?:\/\/[^\s)]+)\)\s*$/;
  const m = t.match(re);
  if (!m) return null;
  const [, quote, category, note, url] = m;
  const cat = category.trim();
  return {
    quote: quote.trim(),
    category: cat,
    note: note ? note.trim() : null,
    url: url.trim(),
    isImplied: cat.toLowerCase().startsWith("implied-"),
  };
}

function renderClaim(claim) {
  const div = document.createElement("div");
  div.className = "claim " + (claim.isImplied ? "implied" : "direct");

  const badge = document.createElement("span");
  badge.className = "claim-badge";
  badge.textContent = claim.category;
  div.appendChild(badge);

  const quote = document.createElement("blockquote");
  quote.className = "claim-quote";
  quote.textContent = claim.quote;
  div.appendChild(quote);

  if (claim.note) {
    const note = document.createElement("div");
    note.className = "claim-note";
    note.textContent = "→ " + claim.note;
    div.appendChild(note);
  }

  const link = document.createElement("a");
  link.className = "claim-url";
  link.href = claim.url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = claim.url.replace(/^https?:\/\//, "");
  div.appendChild(link);

  return div;
}

function appendClaimsFromAnswer(container, answerText) {
  let added = 0;
  for (const line of answerText.split("\n")) {
    const claim = parseClaimLine(line);
    if (claim) {
      container.appendChild(renderClaim(claim));
      added++;
    }
  }
  return added;
}

const $ = (id) => document.getElementById(id);
let state = "checking";
let scanResults = [];

function setStatus(msg, cls = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status" + (cls ? " " + cls : "");
}

function setButton(label, handler, enabled = true) {
  const b = $("primary");
  b.textContent = label;
  b.disabled = !enabled;
  b.onclick = enabled ? handler : null;
}

function setOutput(html) {
  const o = $("output");
  if (!html) {
    o.hidden = true;
    o.innerHTML = "";
    return;
  }
  o.hidden = false;
  o.innerHTML = html;
}

function appendOutput(html) {
  const o = $("output");
  o.hidden = false;
  o.insertAdjacentHTML("beforeend", html);
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Live-page text capture (runs in active tab)
// ---------------------------------------------------------------------------

async function captureLivePage() {
  // Trigger any lazy-loaded content by scrolling through the page before
  // capturing. Stops scrolling when scrollHeight stops growing (nothing left
  // to load) or after a hard cap.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const originalY = window.scrollY;
  let lastHeight = -1;
  for (let i = 0; i < 30; i++) {
    const h = document.documentElement.scrollHeight || document.body.scrollHeight;
    if (h === lastHeight) break;
    lastHeight = h;
    window.scrollTo({ top: h, behavior: "instant" });
    await sleep(350);
  }
  // Scroll back so anything that hides once below-fold (sticky headers, etc.)
  // still has a chance to be in the captured text.
  window.scrollTo({ top: 0, behavior: "instant" });
  await sleep(150);
  window.scrollTo({ top: originalY, behavior: "instant" });

  const title =
    (document.querySelector("title") || {}).textContent ||
    document.title ||
    location.href;
  const text = document.body ? document.body.innerText : "";
  return { url: location.href, title: (title || "").trim(), text: (text || "").trim() };
}

// ---------------------------------------------------------------------------
// Server-side text capture (runs in popup, parses fetched HTML)
// ---------------------------------------------------------------------------

function captureFromHtml(html, url) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, noscript, template").forEach((e) => e.remove());
  doc.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li, blockquote, br, div, section, article, header, footer, nav, aside, tr, td, th, dt, dd, hr, pre").forEach((e) => {
    e.appendChild(doc.createTextNode("\n"));
  });
  let text = (doc.body || doc.documentElement).textContent || "";
  text = text.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const titleEl = doc.querySelector("title");
  return { url, title: titleEl ? titleEl.textContent.trim() : url, text };
}

function extractLinks(doc, origin, baseUrl) {
  const links = [];
  doc.querySelectorAll("a[href]").forEach((a) => {
    try {
      const u = new URL(a.getAttribute("href"), baseUrl);
      if (u.origin !== origin) return;
      u.hash = "";
      const path = u.pathname.toLowerCase();
      if (/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|mp4|mp3|css|js|xml|json)$/i.test(path)) return;
      if (u.href !== baseUrl && !links.includes(u.href)) links.push(u.href);
    } catch (e) {}
  });
  return links;
}

// ---------------------------------------------------------------------------
// Crawl
// ---------------------------------------------------------------------------

async function crawl(seedUrl) {
  const origin = new URL(seedUrl).origin;
  const visited = new Set();
  const queue = [seedUrl];
  const results = [];

  // Sitemap (best-effort)
  for (const path of ["/sitemap.xml", "/sitemap_index.xml"]) {
    try {
      const r = await fetch(origin + path);
      if (!r.ok) continue;
      const t = await r.text();
      for (const m of t.matchAll(/<loc[^>]*>\s*(.*?)\s*<\/loc>/gi)) {
        try {
          const u = new URL(m[1].trim());
          if (u.origin === origin && !queue.includes(u.href)) queue.push(u.href);
        } catch (e) {}
      }
      break;
    } catch (e) {}
  }

  while (queue.length && results.length < MAX_PAGES) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    if (new URL(url).origin !== origin) { visited.add(url); continue; }
    visited.add(url);
    setStatus(`Crawling page ${results.length + 1}…`);
    try {
      const r = await fetch(url, { redirect: "follow" });
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("text/html")) continue;
      const finalUrl = r.url || url;
      if (new URL(finalUrl).origin !== origin) continue;
      const html = await r.text();
      const page = captureFromHtml(html, finalUrl);
      if (page.text.length < 50) continue;
      results.push(page);
      const doc = new DOMParser().parseFromString(html, "text/html");
      for (const link of extractLinks(doc, origin, finalUrl)) {
        if (!visited.has(link) && !queue.includes(link)) queue.push(link);
      }
    } catch (e) {}
  }
  return results;
}

// ---------------------------------------------------------------------------
// Send to NotebookLM
// ---------------------------------------------------------------------------

function pagesToSource(pages, startIndex) {
  // Strong page boundaries so the LLM can locate any quoted text back to a
  // specific page by walking forward or backward to the nearest BEGIN/END
  // PAGE marker. Each page is bookended.
  const bar = "================================================================";
  const parts = pages.map((p, i) => {
    const num = startIndex + i + 1;
    const title = (p.title || "(untitled)").trim();
    const url = (p.url || "").trim();
    const text = (p.text || "").trim();
    return (
      `${bar}\n` +
      `BEGIN PAGE ${num}\n` +
      `URL: ${url}\n` +
      `TITLE: ${title}\n` +
      `${bar}\n\n` +
      `${text}\n\n` +
      `${bar}\n` +
      `END PAGE ${num}\n` +
      `URL: ${url}\n` +
      `${bar}`
    );
  });
  return (
    `# Crawled Pages ${startIndex + 1}–${startIndex + pages.length}\n\n` +
    parts.join("\n\n")
  );
}

async function postJson(path, body) {
  const r = await fetch(HELPER_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

async function runReview() {
  // Chrome's toolbar popup closes on any outside click, killing every
  // in-flight fetch. So before any long-running work starts, detach into
  // a standalone popup window that stays open until the user closes it.
  const params = new URLSearchParams(window.location.search);
  if (!params.has("detached")) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const detachedUrl =
      chrome.runtime.getURL("popup.html") +
      `?detached=1&autorun=1&seedUrl=${encodeURIComponent(tab.url)}&tabId=${tab.id}`;
    await chrome.windows.create({
      url: detachedUrl,
      type: "popup",
      width: 480,
      height: 820,
      focused: true,
    });
    window.close();
    return;
  }

  // We are in the detached window. Pull the original tab info from the URL.
  const seedUrl = params.get("seedUrl");
  const originalTabId = parseInt(params.get("tabId") || "0", 10) || null;

  state = "running";
  setOutput("");
  setButton("Working…", null, false);

  try {
    setStatus("Crawling site…");

    // Capture the live page first to pick up JS-rendered content. Use the
    // ORIGINAL tab (not this detached popup) for the executeScript target.
    let livePage;
    try {
      const targetTabId =
        originalTabId ||
        (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id;
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: captureLivePage,
      });
      livePage = result;
    } catch (e) {
      // The original tab may have been closed. Fall back to fetch-only.
      livePage = null;
    }

    scanResults = [];
    const seenUrls = new Set();
    if (livePage && livePage.text) {
      scanResults.push(livePage);
      seenUrls.add(livePage.url);
    }

    // Crawl the rest of the site (server-side fetch).
    const crawlSeed = seedUrl || (livePage && livePage.url);
    if (!crawlSeed) throw new Error("No URL to crawl.");
    const more = await crawl(crawlSeed);
    for (const p of more) {
      if (!seenUrls.has(p.url)) {
        scanResults.push(p);
        seenUrls.add(p.url);
      }
    }

    setStatus(`Crawled ${scanResults.length} pages. Sending to NotebookLM…`);

    // Rolling notebook: always one notebook named "Page Crawler" in the
    // user's account. Replacing it each run keeps the count at 1 instead of
    // adding a notebook every time, which would fill the free-tier cap fast.
    const host = new URL(scanResults[0].url).hostname;
    const nbName = `Page Crawler — ${host}`;
    const nb = await postJson("/notebooks/replace", { name: nbName });

    const batches = [];
    for (let i = 0; i < scanResults.length; i += PER_SOURCE) {
      batches.push(scanResults.slice(i, i + PER_SOURCE));
    }
    const sourceIds = [];
    for (let i = 0; i < batches.length; i++) {
      setStatus(`Uploading source ${i + 1}/${batches.length}…`);
      const result = await postJson(`/notebooks/${nb.id}/sources`, {
        name: batches[i].length === 1
          ? (batches[i][0].title || "Page").slice(0, 80)
          : `Pages ${i * PER_SOURCE + 1}–${i * PER_SOURCE + batches[i].length}`,
        text: pagesToSource(batches[i], i * PER_SOURCE),
      });
      if (result && result.id) sourceIds.push(result.id);
    }

    setStatus("Setting review style…");
    await postJson(`/notebooks/${nb.id}/persona`, { custom_prompt: PERSONA_PROMPT });

    // Per-source extraction. Asking the LLM one source at a time forces
    // it to actually walk the content rather than summarizing across the
    // whole notebook. Each claim parses into a card.
    const [, prompt] = REVIEW_PROMPTS[0];
    setOutput("");
    appendOutput(
      `<div class="report-head"><h3>Propositions</h3><div class="report-meta" id="report-meta"></div></div>` +
      `<div class="claims" id="props"></div>`
    );
    const propsEl = document.getElementById("props");
    const metaEl = document.getElementById("report-meta");

    let claimsTotal = 0;
    let claimsDirect = 0;
    let claimsImplied = 0;
    let dedupedCount = 0;
    const seenQuotes = new Set();

    const updateMeta = () => {
      const dedupNote = dedupedCount > 0 ? ` · ${dedupedCount} duplicates merged` : "";
      metaEl.textContent =
        `${claimsTotal} total — ${claimsDirect} direct, ${claimsImplied} implied${dedupNote}`;
    };

    const normalizeQuote = (q) =>
      q
        .toLowerCase()
        .replace(/[‘’“”"'`]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    for (let s = 0; s < sourceIds.length; s++) {
      const sid = sourceIds[s];
      setStatus(`Extracting from source ${s + 1}/${sourceIds.length}…`);
      try {
        const data = await postJson(`/notebooks/${nb.id}/ask`, {
          question: prompt,
          source_ids: [sid],
        });
        const answer = stripCitationMarkers(data.answer || "");
        if (answer) {
          const before = propsEl.children.length;
          for (const line of answer.split("\n")) {
            const claim = parseClaimLine(line);
            if (!claim) continue;
            // Dedup site-wide quotes (boilerplate repeated on every page).
            // The same exact quote text is treated as one claim no matter
            // how many pages it appears on.
            const key = normalizeQuote(claim.quote);
            if (seenQuotes.has(key)) {
              dedupedCount++;
              continue;
            }
            seenQuotes.add(key);

            propsEl.appendChild(renderClaim(claim));
            claimsTotal++;
            if (claim.isImplied) claimsImplied++;
            else claimsDirect++;
          }
          if (propsEl.children.length === before && !seenQuotes.size) {
            const note = document.createElement("div");
            note.className = "claim-rawnote";
            note.textContent = answer;
            propsEl.appendChild(note);
          }
          updateMeta();
        }
      } catch (e) {
        const err = document.createElement("div");
        err.className = "claim-error";
        err.textContent = `Source ${s + 1} failed: ${e.message}`;
        propsEl.appendChild(err);
      }
    }

    // Clean up: delete the notebook now that the review is complete.
    // Keeps the user's NotebookLM account at zero leftover notebooks.
    try {
      await fetch(`${HELPER_BASE}/notebooks/${nb.id}`, { method: "DELETE" });
    } catch (e) {
      console.warn("Notebook cleanup failed:", e);
    }

    setStatus(
      `Done. ${scanResults.length} pages, ${sourceIds.length} sources, ${claimsTotal} claims. Notebook cleaned up.`,
      "ready",
    );
    state = "done";
    setButton("Review another site", () => location.reload(), true);
  } catch (e) {
    setStatus(`Error: ${e.message}`, "error");
    state = "error";
    setButton("Try again", runReview, true);
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function openInstaller() {
  chrome.tabs.create({ url: chrome.runtime.getURL("installer.html") });
}

// ---------------------------------------------------------------------------
// Initial state machine
// ---------------------------------------------------------------------------

function looksLikeAuthSessionError(msg) {
  if (!msg) return false;
  const m = String(msg).toLowerCase();
  return (
    m.includes("authentication expired") ||
    m.includes("accountchooser") ||
    m.includes("accounts.google.com/signin") ||
    m.includes("notebooklm.google.com/login") ||
    m.includes("redirect")
  );
}

async function openNotebookLMAndRetry() {
  // Open NotebookLM in a new tab so the user can establish a session.
  await chrome.tabs.create({ url: "https://notebooklm.google.com/", active: true });
  setStatus("Sign in to NotebookLM, then come back and click Recheck.");
  setButton("Recheck", check, true);
}

async function refreshHelperAuth() {
  setStatus("Refreshing cookies from Chrome…");
  setButton("Working…", null, false);
  try {
    await fetch(`${HELPER_BASE}/refresh`, { method: "POST" });
  } catch (e) {}
  await check();
}

async function check() {
  try {
    const r = await fetch(`${HELPER_BASE}/status`);
    const data = await r.json();
    if (data.ready) {
      state = "ready";
      setStatus("Ready.", "ready");
      setButton("Review this site", runReview, true);
      return;
    }

    // Helper is reachable but auth isn't valid. The most common cause is
    // that the user is signed in to Google generally but doesn't have a
    // NotebookLM session cookie. One visit to notebooklm.google.com fixes it.
    if (looksLikeAuthSessionError(data.error)) {
      state = "needs_nlm_session";
      setStatus("Sign in to NotebookLM in Chrome first.", "error");
      setButton("Open NotebookLM", openNotebookLMAndRetry, true);
      return;
    }

    state = "setup_needed";
    setStatus(data.error ? `Setup needed. ${data.error.slice(0, 80)}` : "Setup needed.");
    setButton("Set up", openInstaller, true);
  } catch (e) {
    state = "setup_needed";
    setStatus("Setup needed.");
    setButton("Set up", openInstaller, true);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await check();
  // If this is the detached popup window opened with ?autorun=1, kick off
  // the review the moment status comes back ready.
  const params = new URLSearchParams(window.location.search);
  if (params.get("autorun") === "1" && state === "ready") {
    runReview();
  }
});
