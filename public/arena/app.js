const API_BASE = 'https://daemon-pro-api-production.up.railway.app';

const listEl = document.getElementById('submissions-list');
const emptyEl = document.getElementById('submissions-empty');
const metaEl = document.getElementById('contest-meta');
const holderCopyEl = document.getElementById('holder-copy');

function formatRelative(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function renderContest(contest, count) {
  if (!contest) return;
  metaEl.textContent = `${contest.name} · ${contest.duration} · ${count} live submission${count === 1 ? '' : 's'}`;
}

function renderHolderAccess(price) {
  if (!holderCopyEl || !price?.holderMint || !price?.holderMinAmount) return;
  holderCopyEl.textContent =
    `Hold ${Number(price.holderMinAmount).toLocaleString()} DAEMON in a local wallet to claim Pro in the app. Everyone else can subscribe with ${price.priceUsdc} USDC via x402.`;
}

function renderSubmissions(submissions) {
  if (!submissions.length) {
    emptyEl.textContent = 'No submissions yet. Be the first team on the board.';
    return;
  }

  emptyEl.hidden = true;
  listEl.hidden = false;
  listEl.innerHTML = '';

  for (const sub of submissions) {
    const card = document.createElement('article');
    card.className = 'submission-card';
    card.innerHTML = `
      <div class="submission-top">
        <div>
          <h3 class="submission-title"></h3>
          <div class="submission-pitch"></div>
        </div>
        <span class="status-pill">${sub.status}</span>
      </div>
      <div class="meta-row">
        <span class="meta-pill">${sub.category}</span>
        ${sub.themeWeek ? `<span class="meta-pill">${sub.themeWeek}</span>` : ''}
        <span class="meta-pill">${sub.votes} votes</span>
        <span class="meta-pill">${formatRelative(sub.submittedAt)}</span>
      </div>
      <p class="submission-description"></p>
      <div class="submission-links"></div>
    `;

    card.querySelector('.submission-title').textContent = sub.title;
    card.querySelector('.submission-pitch').textContent = sub.pitch || '';
    card.querySelector('.submission-description').textContent = sub.description || '';

    const links = card.querySelector('.submission-links');
    const candidates = [
      sub.githubUrl ? { label: 'GitHub', href: sub.githubUrl } : null,
      sub.demoUrl ? { label: 'Demo', href: sub.demoUrl } : null,
      sub.xHandle ? { label: `@${sub.xHandle}`, href: `https://x.com/${String(sub.xHandle).replace(/^@/, '')}` } : null,
    ].filter(Boolean);

    for (const item of candidates) {
      const a = document.createElement('a');
      a.href = item.href;
      a.target = '_blank';
      a.rel = 'noreferrer';
      a.textContent = item.label;
      links.appendChild(a);
    }

    listEl.appendChild(card);
  }
}

async function main() {
  try {
    const [arenaRes, priceRes] = await Promise.all([
      fetch(`${API_BASE}/v1/arena/public`),
      fetch(`${API_BASE}/v1/subscribe/price`),
    ]);
    const [arenaBody, priceBody] = await Promise.all([arenaRes.json(), priceRes.json()]);
    if (!arenaRes.ok || arenaBody.ok === false) {
      throw new Error(arenaBody.error || `HTTP ${arenaRes.status}`);
    }
    renderContest(arenaBody.contest, arenaBody.data.length);
    renderSubmissions(arenaBody.data);
    if (priceRes.ok && priceBody.ok !== false) {
      renderHolderAccess(priceBody.data ?? priceBody);
    }
  } catch (error) {
    emptyEl.textContent = `Could not load submissions: ${error instanceof Error ? error.message : String(error)}`;
  }
}

void main();
