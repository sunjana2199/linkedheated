(() => {
  if (window.__linkedinScraperRunning) return;
  window.__linkedinScraperRunning = true;

  const CUTOFF = new Date();
  CUTOFF.setFullYear(CUTOFF.getFullYear() - 1);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ─── Wait until posts appear in DOM ────────────────── */
  async function waitForPosts(timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const posts = document.querySelectorAll('div.feed-shared-update-v2');
      if (posts.length > 0) return true;
      await sleep(1000);
    }
    return false;
  }

  /* ─── Parse count ────────────────────────────────────── */
  function parseCount(text) {
    if (!text) return 0;
    text = text.replace(/,/g, '').trim();
    if (/k$/i.test(text)) return Math.round(parseFloat(text) * 1000);
    const n = parseInt(text, 10);
    return isNaN(n) ? 0 : n;
  }

  /* ─── Exact date from URN (id >> 22 = Unix ms) ──────── */
  function urnToDate(urn) {
    const match = (urn || '').match(/activity[:\-](\d+)/);
    if (!match) return null;
    try {
      return new Date(Number(BigInt(match[1]) >> 22n));
    } catch (_) { return null; }
  }

  /* ─── Extract fields from a post element ────────────── */
  function getPostUrl(el) {
    const urn = el.getAttribute('data-urn') || '';
    return urn ? `https://www.linkedin.com/feed/update/${urn}/` : '';
  }

  function getDate(el) {
    // Exact timestamp encoded in the URN: id >> 22 = Unix ms
    return urnToDate(el.getAttribute('data-urn') || '');
  }

  function getLikes(el) {
    const span = el.querySelector('span.social-details-social-counts__social-proof-fallback-number');
    if (span) { const n = parseCount(span.textContent); if (n > 0) return n; }

    const btn = el.querySelector('button[aria-label*="others"], button[aria-label*="reaction"]');
    if (btn) {
      const label = btn.getAttribute('aria-label') || '';
      const youAnd = label.match(/you and (\d[\d,]*)\s+other/i);
      if (youAnd) return parseCount(youAnd[1]) + 1;
      const others = label.match(/^(\d[\d,]*)\s+other/i);
      if (others) return parseCount(others[1]);
    }
    return 0;
  }

  function getComments(el) {
    const btn = el.querySelector('button[aria-label*="comment"]');
    if (btn) {
      const m = (btn.getAttribute('aria-label') || '').match(/^(\d[\d,]*)\s+comment/i);
      if (m) return parseCount(m[1]);
    }
    return 0;
  }

  function getReposts(el) {
    const btn = el.querySelector('button[aria-label*="repost"]');
    if (btn) {
      const m = (btn.getAttribute('aria-label') || '').match(/^(\d[\d,]*)\s+repost/i);
      if (m) return parseCount(m[1]);
    }
    return 0;
  }

  /* ─── Get impressions via control menu ──────────────── */
  async function getImpressions(el) {
    const controlBtn = el.querySelector('button[aria-label*="control menu"], button[aria-label*="Open control"]');
    if (!controlBtn) return 0;
    try {
      controlBtn.click();
      await sleep(1000);

      // Find "View analytics" or "Analytics" in the dropdown
      const analyticsItem = [...document.querySelectorAll(
        '[role="listitem"] button, [role="menuitem"], .artdeco-dropdown__content li button, .feed-shared-control-menu__content li button'
      )].find(b => (b.textContent || '').toLowerCase().includes('analytic'));

      if (!analyticsItem) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(300);
        return 0;
      }

      analyticsItem.click();
      await sleep(2500);

      let impressions = 0;
      // Search for impression count in modal
      const allNodes = document.querySelectorAll('dd, [class*="analytics"] span, [class*="insight"] span, strong');
      for (const node of allNodes) {
        const siblings = [node.previousElementSibling, node.parentElement?.previousElementSibling].filter(Boolean);
        for (const sib of siblings) {
          if ((sib.textContent || '').toLowerCase().includes('impression')) {
            const n = parseCount(node.textContent);
            if (n > 0) { impressions = n; break; }
          }
        }
        if (impressions) break;
      }

      // Close modal
      const closeBtn = document.querySelector('button[aria-label="Dismiss"], button[aria-label="Close"]');
      closeBtn ? closeBtn.click() : document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(500);
      return impressions;
    } catch (_) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return 0;
    }
  }

  /* ─── Click "Show more results" ─────────────────────── */
  async function loadMore() {
    const btn = [...document.querySelectorAll('button')].find(
      b => b.textContent.trim().toLowerCase().includes('show more results')
    );
    if (!btn) return false;
    btn.scrollIntoView({ block: 'center' });
    await sleep(400);
    btn.click();
    await sleep(3500);
    return true;
  }

  /* ─── Main scrape loop ───────────────────────────────── */
  async function scrape() {
    sendUpdate('progress', 0, []);

    // Wait up to 30s for posts to appear
    const loaded = await waitForPosts(30000);
    if (!loaded) {
      sendUpdate('error', 0, []);
      window.__linkedinScraperRunning = false;
      return;
    }

    // Extra wait to let all initial posts render
    await sleep(2000);

    const posts = [];
    const seenUrns = new Set();
    let reachedCutoff = false;
    let noNewCount = 0;

    while (!reachedCutoff && noNewCount < 5) {
      const containers = document.querySelectorAll('div.feed-shared-update-v2');
      let foundNew = false;

      for (const el of containers) {
        if (el.dataset.liScraped) continue;
        el.dataset.liScraped = '1';
        foundNew = true;

        const urn = el.getAttribute('data-urn') || '';
        if (urn && seenUrns.has(urn)) continue;
        if (urn) seenUrns.add(urn);

        const date = getDate(el);
        if (date && date < CUTOFF) { reachedCutoff = true; break; }

        const post = {
          date: date ? date.toISOString().split('T')[0] : '',
          post_url: getPostUrl(el),
          likes: getLikes(el),
          comments: getComments(el),
          reposts: getReposts(el),
          impressions: await getImpressions(el),
        };

        posts.push(post);
        sendUpdate('progress', posts.length, posts);
        await sleep(200);
      }

      if (reachedCutoff) break;
      noNewCount = foundNew ? 0 : noNewCount + 1;

      const moreLoaded = await loadMore();
      if (!moreLoaded) noNewCount++;
    }

    await chrome.storage.local.set({ linkedinPosts: posts, scrapeStatus: 'done' });
    sendUpdate('done', posts.length, posts);
    window.__linkedinScraperRunning = false;
  }

  function sendUpdate(type, count, posts) {
    try { chrome.runtime.sendMessage({ type, count, posts }); } catch (_) {}
    chrome.storage.local.set({ scraperState: { type, count, posts } });
  }

  scrape().catch((err) => {
    try { chrome.runtime.sendMessage({ type: 'error', message: err.message }); } catch (_) {}
    chrome.storage.local.set({ scraperState: { type: 'error', message: err.message } });
    window.__linkedinScraperRunning = false;
  });
})();
