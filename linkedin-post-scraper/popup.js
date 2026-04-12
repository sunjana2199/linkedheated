let scrapedPosts = [];

const startBtn = document.getElementById('startBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusBox = document.getElementById('statusBox');
const progressBar = document.getElementById('progressBar');
const statusText = document.getElementById('statusText');
const latestPost = document.getElementById('latestPost');
const doneMsg = document.getElementById('doneMsg');
const errorMsg = document.getElementById('errorMsg');

// Restore state if popup was reopened mid-scrape
chrome.storage.local.get(['scraperState', 'linkedinPosts'], (result) => {
  if (result.scraperState) handleMessage(result.scraperState);
  if (result.linkedinPosts) scrapedPosts = result.linkedinPosts;
});

// Listen for live updates from content script
chrome.runtime.onMessage.addListener((message) => {
  handleMessage(message);
});

// Also poll storage every 2s in case messages are missed
let pollInterval = null;
function startPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(() => {
    chrome.storage.local.get(['scraperState', 'linkedinPosts'], (result) => {
      if (result.linkedinPosts) scrapedPosts = result.linkedinPosts;
      if (result.scraperState) {
        handleMessage(result.scraperState);
        if (result.scraperState.type === 'done' || result.scraperState.type === 'error') {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      }
    });
  }, 2000);
}

startBtn.addEventListener('click', async () => {
  // Clear previous state
  await chrome.storage.local.remove(['scraperState', 'linkedinPosts']);
  scrapedPosts = [];
  doneMsg.style.display = 'none';
  errorMsg.style.display = 'none';
  downloadBtn.style.display = 'none';
  statusBox.style.display = 'block';
  startBtn.disabled = true;
  startPolling();
  statusText.textContent = 'Opening LinkedIn activity page...';
  progressBar.style.width = '5%';

  // Open the user's own recent activity page — /me/ redirects to your profile
  const tab = await chrome.tabs.create({
    url: 'https://www.linkedin.com/in/me/recent-activity/all/',
    active: true,
  });

  // Inject content script (in case it didn't auto-inject)
  setTimeout(() => {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    }).catch(() => {
      // Already injected via content_scripts — that's fine
    });
  }, 3000);
});

downloadBtn.addEventListener('click', () => {
  if (!scrapedPosts.length) return;
  downloadCSV(scrapedPosts);
});

function handleMessage(msg) {
  if (!msg) return;

  statusBox.style.display = 'block';

  if (msg.type === 'started') {
    statusText.textContent = 'Scraping posts...';
    progressBar.style.width = '10%';
  }

  if (msg.type === 'progress') {
    const count = msg.count || 0;
    scrapedPosts = msg.posts || scrapedPosts;
    statusText.textContent = `Found ${count} post${count !== 1 ? 's' : ''} so far...`;
    // Animate progress bar — cap at 90% until done
    const pct = Math.min(10 + count * 2, 90);
    progressBar.style.width = pct + '%';

    const last = scrapedPosts[scrapedPosts.length - 1];
    if (last) {
      latestPost.textContent = `Latest: ${last.date} — ${last.post_url.slice(0, 50)}...`;
    }
  }

  if (msg.type === 'done') {
    scrapedPosts = msg.posts || scrapedPosts;
    progressBar.style.width = '100%';
    progressBar.style.background = '#057642';
    statusText.textContent = `Done! ${scrapedPosts.length} posts collected.`;
    latestPost.textContent = '';
    doneMsg.style.display = 'block';
    doneMsg.textContent = `✓ ${scrapedPosts.length} posts ready to download.`;
    startBtn.disabled = false;
    downloadBtn.style.display = 'block';
  }

  if (msg.type === 'error') {
    progressBar.style.background = '#b00';
    statusText.textContent = 'An error occurred.';
    errorMsg.style.display = 'block';
    errorMsg.textContent = `Error: ${msg.message}`;
    startBtn.disabled = false;
  }
}

function downloadCSV(posts) {
  const headers = ['date', 'post_url', 'likes', 'comments', 'reposts', 'impressions'];
  const rows = posts.map((p) =>
    headers.map((h) => {
      const val = String(p[h] ?? '');
      // Escape quotes and wrap in quotes if needed
      return val.includes(',') || val.includes('"') || val.includes('\n')
        ? `"${val.replace(/"/g, '""')}"`
        : val;
    }).join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `linkedin_posts_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
