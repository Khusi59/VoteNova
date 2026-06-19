
let currentVoter = null;   // { id, name, email } when logged in, else null
let currentAdmin = null;   // { username } when logged in, else null

// ── Demo candidate data (used only for the public Candidates/Results
//    preview pages until real elections exist in the database) ──────────
const CANDIDATES = [
  { initials: 'JK', name: 'James Kim', party: 'Student Progress Party', tagline: 'Affordable housing & mental health resources for every student.', photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&h=160&fit=crop&crop=faces' },
  { initials: 'MA', name: 'Maria Alvarez', party: 'Independent', tagline: 'Transparent governance and a stronger student voice on curriculum.', photo: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=160&h=160&fit=crop&crop=faces' },
  { initials: 'TN', name: 'Tom Nakamura', party: 'Future Forward', tagline: 'Technology-first infrastructure and international partnerships.', photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&h=160&fit=crop&crop=faces' },
];
const RESULTS = [
  { name: 'Sarah Reynolds', party: 'Progressive Alliance', votes: 4197, pct: 51.0, color: '#6C47FF' },
  { name: 'David Okafor', party: 'United Community', votes: 2803, pct: 34.1, color: '#3D2FA0' },
  { name: 'Ingrid Holm', party: 'Independent', votes: 1230, pct: 14.9, color: '#00C896' },
];
const FAQS = [
  { q: 'How do I register to vote?', a: 'Click "Register" at the top of the page. Fill in your name, email address, and create a password. Once registered, you can log in immediately and participate in any election you are eligible for.' },
  { q: 'When will I be able to see election results?', a: 'Results are published automatically the moment an election closes, or earlier if the admin chooses to make them public. Results are visible to everyone, logged in or not.' },
  { q: 'How is my vote kept private?', a: 'Your vote is stored separately from your identity. Only the fact that you voted is recorded against your account — never which candidate you chose in a way anyone else can see.' },
  { q: 'Can I change my vote after submitting?', a: 'No. To preserve the integrity of the election, votes are final once submitted. Please review your selection carefully on the confirmation screen before confirming.' },
  { q: 'What is a vote receipt?', a: 'After voting, you receive a unique receipt code. You can use this code to verify your vote was counted — without revealing your selection to anyone else.' },
  { q: 'How do I know an election result is genuine?', a: 'Every election on VoteNova produces a complete, timestamped audit log reviewable by administrators, and the one-vote-per-person rule is enforced directly by the database.' },
  { q: 'Who can create an election?', a: 'Elections are created and managed by administrators only, through a separate restricted Admin Portal accessible from the footer.' },
  { q: 'Is VoteNova free to use?', a: 'Yes. Voting is always free for voters.' },
];

// ── Page routing ──────────────────────────────────────────────────────────
function showPage(id) {
  // Gate: dashboard / vote / results / candidates require a logged-in voter.
  // (Results and Candidates are intentionally public per project requirements —
  // only Dashboard and Vote require login.)
  const voterOnlyPages = ['dashboard', 'vote'];
  if (voterOnlyPages.includes(id) && !currentVoter) {
    showPage('login');
    return;
  }
  // Gate: the admin panel itself requires an active admin session.
  if (id === 'admin' && !currentAdmin) {
    showPage('admin-login');
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + id);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
  updateNav(id);

  // Lazy-load real data when entering certain pages
  if (id === 'dashboard') loadDashboard();
  if (id === 'admin') loadAdminElections();
}

function updateNav(id) {
  const nav = document.getElementById('main-nav');
  const links = document.getElementById('nav-links');
  const adminPages = ['admin', 'admin-login'];
  const loggedInPages = ['dashboard', 'vote', 'results', 'candidates'];

  if (adminPages.includes(id)) {
    nav.style.display = 'none';
    return;
  }
  nav.style.display = 'flex';

  if (loggedInPages.includes(id) && currentVoter) {
    // ── Logged-in nav: Dashboard, Candidates, Vote, Results + avatar + logout
    const initials = currentVoter.name
      .split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
    links.innerHTML = `
      <a onclick="showPage('dashboard')">Dashboard</a>
      <a onclick="showPage('candidates')">Candidates</a>
      <a onclick="showPage('vote')">Vote</a>
      <a onclick="showPage('results')">Results</a>
      <div class="avatar-circle" style="cursor:pointer;" title="${currentVoter.name}">${initials}</div>
      <button class="btn btn-sm btn-outline" style="color:var(--coral);border-color:var(--coral);" onclick="doLogout()">Log out</button>
    `;
  } else {
    // ── Public nav: Home, About + Login, Register
    links.innerHTML = `
      <a onclick="showPage('home')">Home</a>
      <a onclick="showPage('about')">About</a>
      <button class="btn-login btn btn-sm btn-outline" onclick="showPage('login')">Log in</button>
      <button class="btn-register btn btn-sm btn-primary" onclick="showPage('register')">Register</button>
    `;
  }
}

// ════════════════════════════════════════════════════════════════════════
//  VOTER AUTH — register / login / logout / session check
// ════════════════════════════════════════════════════════════════════════

async function doRegister() {
  const firstName = document.getElementById('register-firstname').value.trim();
  const lastName = document.getElementById('register-lastname').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  const confirm = document.getElementById('register-confirm').value;
  const agreed = document.getElementById('register-terms').checked;

  const errEl = document.getElementById('register-error');
  const okEl = document.getElementById('register-success');
  errEl.style.display = 'none';
  okEl.style.display = 'none';

  if (!firstName || !lastName || !email || !password || !confirm) {
    return showFormError(errEl, 'Please fill in every field.');
  }
  if (password.length < 8) {
    return showFormError(errEl, 'Password must be at least 8 characters.');
  }
  if (password !== confirm) {
    return showFormError(errEl, 'Passwords do not match.');
  }
  if (!agreed) {
    return showFormError(errEl, 'Please agree to the Terms of Service to continue.');
  }

  const btn = document.getElementById('register-submit-btn');
  setButtonLoading(btn, 'Creating account...');

  try {
    const res = await fetch('api/auth.php?action=register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        first_name: firstName, last_name: lastName,
        email, password, confirm
      })
    });
    const data = await res.json();

    if (data.ok) {
      showFormSuccess(okEl, 'Account created! You can now log in below.');
      document.getElementById('register-firstname').value = '';
      document.getElementById('register-lastname').value = '';
      document.getElementById('register-email').value = '';
      document.getElementById('register-password').value = '';
      document.getElementById('register-confirm').value = '';
      document.getElementById('register-terms').checked = false;
      setTimeout(() => showPage('login'), 1400);
    } else {
      showFormError(errEl, data.error);
    }
  } catch (e) {
    showFormError(errEl, 'Could not reach the server. Is Apache running in XAMPP?');
  } finally {
    resetButton(btn, 'Create account →');
  }
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  if (!email || !password) {
    return showFormError(errEl, 'Please enter your email and password.');
  }

  const btn = document.getElementById('login-submit-btn');
  setButtonLoading(btn, 'Logging in...');

  try {
    const res = await fetch('api/auth.php?action=login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (data.ok) {
      currentVoter = data.data;   // { id, name, email }
      document.getElementById('login-email').value = '';
      document.getElementById('login-password').value = '';
      showPage('dashboard');
    } else {
      // This is the gate: wrong password or unregistered email -> always rejected.
      showFormError(errEl, data.error);
    }
  } catch (e) {
    showFormError(errEl, 'Could not reach the server. Is Apache running in XAMPP?');
  } finally {
    resetButton(btn, 'Log in');
  }
}

async function doLogout() {
  try {
    await fetch('api/auth.php?action=logout', {
      method: 'POST',
      credentials: 'include'
    });
  } catch (e) { /* ignore network errors on logout */ }
  currentVoter = null;
  showPage('home');
}

// Called once on page load to restore a session after a refresh.
async function checkVoterSession() {
  try {
    const res = await fetch('api/auth.php?action=me', { credentials: 'include' });
    const data = await res.json();
    if (data.ok) currentVoter = data.data;
  } catch (e) { /* not logged in / server not reachable yet */ }
}

// ════════════════════════════════════════════════════════════════════════
//  ADMIN AUTH — login / logout / session check
// ════════════════════════════════════════════════════════════════════════

async function doAdminLogin() {
  const username = document.getElementById('admin-username').value.trim();
  const password = document.getElementById('admin-password').value;
  const errEl = document.getElementById('admin-login-error');
  errEl.style.display = 'none';

  if (!username || !password) {
    return showFormError(errEl, 'Please enter username and password.');
  }

  const btn = document.getElementById('admin-login-btn');
  setButtonLoading(btn, 'Checking...');

  try {
    const res = await fetch('admin/api.php?action=login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.ok) {
      currentAdmin = data.data;   // { username }
      document.getElementById('admin-username').value = '';
      document.getElementById('admin-password').value = '';
      showPage('admin');
    } else {
      showFormError(errEl, data.error || 'Invalid username or password.');
    }
  } catch (e) {
    showFormError(errEl, 'Could not reach the server. Is Apache running in XAMPP?');
  } finally {
    resetButton(btn, 'Access admin panel →');
  }
}

async function doAdminLogout() {
  try {
    await fetch('admin/api.php?action=logout', {
      method: 'POST',
      credentials: 'include'
    });
  } catch (e) { /* ignore */ }
  currentAdmin = null;
  showPage('home');
}

// ════════════════════════════════════════════════════════════════════════
//  DASHBOARD — load real elections for the logged-in voter
// ════════════════════════════════════════════════════════════════════════

async function loadDashboard() {
  if (!currentVoter) return;
  try {
    const res = await fetch('api/elections.php?action=all_for_voter', { credentials: 'include' });
    const data = await res.json();
    if (!data.ok) return;

    const elections = data.data;
    const listEl = document.querySelector('#page-dashboard .card .heading')?.closest('.card')?.querySelector('div[style*="flex-direction:column"]');
    if (!listEl) return;

    if (elections.length === 0) {
      listEl.innerHTML = `<p style="font-size:.875rem;color:var(--ink-muted);">No open elections right now. Check back soon.</p>`;
      return;
    }

    listEl.innerHTML = elections.map(e => `
      <div style="display:flex;align-items:center;gap:1rem;padding:1rem;border:1.5px solid ${e.has_voted ? 'var(--border)' : 'var(--violet)'};border-radius:var(--radius-md);background:${e.has_voted ? 'transparent' : 'var(--violet-soft)'};">
        <div style="flex:1;">
          <div style="font-weight:600;font-size:.9rem;">${escapeHtml(e.title)}</div>
          <div style="font-size:.78rem;color:var(--ink-muted);margin-top:3px;">Closes ${formatDate(e.closes_at)}</div>
        </div>
        <span class="tag ${e.has_voted ? 'tag-mint' : 'tag-coral'}">${e.has_voted ? 'Voted' : 'Not voted'}</span>
        ${e.has_voted
        ? `<button class="btn btn-sm btn-outline" onclick="showPage('results')">Results</button>`
        : `<button class="btn btn-sm btn-primary" onclick="openElectionToVote(${e.id})">Vote →</button>`}
      </div>
    `).join('');
  } catch (e) { /* server not reachable */ }
}

let activeElectionId = null;

async function openElectionToVote(electionId) {
  activeElectionId = electionId;
  showPage('vote');
  await loadVoteCandidates(electionId);
}

async function loadVoteCandidates(electionId) {
  try {
    const res = await fetch(`api/elections.php?id=${electionId}`, { credentials: 'include' });
    const data = await res.json();
    if (!data.ok) { alert(data.error); showPage('dashboard'); return; }

    if (data.data.has_voted) {
      alert('You have already voted in this election.');
      showPage('results');
      return;
    }

    buildVoteCards(data.data.candidates, electionId);
  } catch (e) { /* server not reachable */ }
}

// ════════════════════════════════════════════════════════════════════════
//  FAQ accordion
// ════════════════════════════════════════════════════════════════════════
function buildFAQ() {
  const list = document.getElementById('faq-list');
  if (!list) return;
  list.innerHTML = FAQS.map((f, i) => `
    <div class="faq-item" id="faq-${i}">
      <div class="faq-q" onclick="toggleFAQ(${i})">
        <span>${f.q}</span>
        <span class="faq-arrow">▾</span>
      </div>
      <div class="faq-a">${f.a}</div>
    </div>
  `).join('');
}
function toggleFAQ(i) {
  document.getElementById('faq-' + i).classList.toggle('open');
}

// ════════════════════════════════════════════════════════════════════════
//  VOTE SELECTION — real candidates, real vote submission
// ════════════════════════════════════════════════════════════════════════
let selectedCandidateId = null;
let selectedCandidateName = null;

function buildVoteCards(candidates, electionId) {
  const grid = document.getElementById('vote-cards');
  if (!grid) return;

  if (!candidates || candidates.length === 0) {
    grid.innerHTML = `<p style="color:var(--ink-muted);">No candidates have been added to this election yet.</p>`;
    return;
  }

  grid.innerHTML = candidates.map(c => {
    const initials = c.full_name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
    const photoTag = c.photo_url
      ? `<img class="candidate-avatar" src="${c.photo_url}" alt="${escapeHtml(c.full_name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="candidate-avatar-placeholder" style="display:none;">${initials}</div>`
      : `<div class="candidate-avatar-placeholder">${initials}</div>`;
    return `
      <div class="candidate-vote-card" id="vc-${c.id}" onclick="selectCandidate(${c.id}, '${escapeHtml(c.full_name)}')">
        ${photoTag}
        <div style="font-weight:700;font-size:1rem;color:var(--ink);margin-bottom:4px;">${escapeHtml(c.full_name)}</div>
        <div class="tag tag-indigo" style="margin-bottom:.75rem;">${escapeHtml(c.party || 'Independent')}</div>
        <p style="font-size:.82rem;color:var(--ink-muted);line-height:1.6;">"${escapeHtml(c.tagline || '')}"</p>
      </div>
    `;
  }).join('');

  selectedCandidateId = null;
  const submitBtn = document.getElementById('submit-vote-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.5';
    submitBtn.style.cursor = 'not-allowed';
  }
}

function selectCandidate(candidateId, name) {
  selectedCandidateId = candidateId;
  selectedCandidateName = name;
  document.querySelectorAll('.candidate-vote-card').forEach(c => {
    c.classList.toggle('selected', c.id === `vc-${candidateId}`);
  });
  const btn = document.getElementById('submit-vote-btn');
  btn.disabled = false;
  btn.style.opacity = '1';
  btn.style.cursor = 'pointer';
}

function submitVote() {
  if (!selectedCandidateId) return;
  document.getElementById('modal-candidate-name').textContent = selectedCandidateName;
  document.getElementById('vote-modal').classList.add('open');
}

async function confirmVote() {
  document.getElementById('vote-modal').classList.remove('open');

  try {
    const res = await fetch('api/elections.php?action=vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ election_id: activeElectionId, candidate_id: selectedCandidateId })
    });
    const data = await res.json();

    if (data.ok) {
      const receiptEl = document.querySelector('#vote-success-modal [style*="font-family:monospace"]');
      if (receiptEl) receiptEl.textContent = 'Receipt: ' + data.data.receipt;
      document.getElementById('vote-success-modal').classList.add('open');
    } else {
      alert(data.error);
    }
  } catch (e) {
    alert('Could not reach the server. Is Apache running in XAMPP?');
  }
}

function closeModal() {
  document.getElementById('vote-modal').classList.remove('open');
}
function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
}

// ════════════════════════════════════════════════════════════════════════
//  CANDIDATES PAGE (public preview — demo data)
// ════════════════════════════════════════════════════════════════════════
function buildCandidateGrid() {
  const grid = document.getElementById('candidate-grid');
  if (!grid) return;
  const bios = [
    'Third-year Politics student and current VP of Student Welfare. James has campaigned on expanding mental health services and reducing on-campus housing costs by 15% through partnerships with local councils.',
    'Sociology graduate student and founder of the Campus Equity Project. Maria is running on a platform of greater curriculum diversity, transparent budget reporting, and weekly open office hours for all students.',
    'Computer Science PhD candidate and organiser of the annual TechFest. Tom proposes a full digital transformation of student services and new international exchange agreements with 12 universities.'
  ];
  grid.innerHTML = CANDIDATES.map((c, i) => `
    <div class="candidate-card">
      <div class="candidate-card-top"></div>
      <div class="candidate-card-body">
        <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:1rem;">
          <div class="candidate-photo-wrap" style="background:none;overflow:hidden;">
            <img src="${c.photo}" alt="${c.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none'" />
          </div>
          <span class="tag tag-indigo">${c.party}</span>
        </div>
        <h3 style="font-weight:700;font-size:1.05rem;margin-bottom:.25rem;color:var(--ink);">${c.name}</h3>
        <p style="font-size:.825rem;color:var(--ink-muted);line-height:1.65;">${bios[i]}</p>
      </div>
    </div>
  `).join('');
}

// ════════════════════════════════════════════════════════════════════════
//  RESULTS PAGE (public preview — demo data)
// ════════════════════════════════════════════════════════════════════════
function buildResultBars(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = RESULTS.map((r, i) => `
    <div class="result-bar-wrap">
      <div class="result-bar-meta">
        <span style="font-weight:600;font-size:.875rem;color:var(--ink);">${r.name} <span style="font-weight:400;color:var(--ink-muted);font-size:.8rem;">(${r.party})</span></span>
        <span style="font-weight:700;font-size:.875rem;color:var(--indigo);">${r.votes.toLocaleString()} · ${r.pct}%</span>
      </div>
      <div class="result-bar-track">
        <div class="result-bar-fill" id="bar-${containerId}-${i}" style="width:0%;background:${r.color};"></div>
      </div>
    </div>
  `).join('');
  setTimeout(() => {
    RESULTS.forEach((r, i) => {
      const b = document.getElementById(`bar-${containerId}-${i}`);
      if (b) b.style.width = r.pct + '%';
    });
  }, 200);
}

// ════════════════════════════════════════════════════════════════════════
//  ADMIN PANEL — real elections / candidates / voters / results
// ════════════════════════════════════════════════════════════════════════

async function loadAdminElections() {
  try {
    const res = await fetch('admin/api.php?action=elections', { credentials: 'include' });
    const data = await res.json();
    if (!data.ok) return;

    const tbody = document.querySelector('#admin-elections table tbody');
    if (!tbody) return;

    if (data.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--ink-muted);">No elections yet. Click "+ Create election" to add one.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.data.map(e => {
      const now = new Date();
      const opens = new Date(e.opens_at);
      const closes = new Date(e.closes_at);
      let statusTag;
      if (!e.is_open) statusTag = `<span class="tag" style="background:var(--bg);color:var(--ink-muted);">Closed</span>`;
      else if (now < opens) statusTag = `<span class="tag tag-amber">Upcoming</span>`;
      else if (now > closes) statusTag = `<span class="tag" style="background:var(--bg);color:var(--ink-muted);">Ended</span>`;
      else statusTag = `<span class="tag tag-mint" style="background:var(--mint-soft);color:#00734A;">Live</span>`;

      return `
        <tr>
          <td style="font-weight:600;color:var(--ink);">${escapeHtml(e.title)}</td>
          <td>${statusTag}</td>
          <td>${e.total_votes}</td>
          <td>${formatDate(e.opens_at)}</td>
          <td>${formatDate(e.closes_at)}</td>
          <td><label class="toggle-switch"><input type="checkbox" ${e.is_open ? 'checked' : ''} onchange="toggleElectionOpen(${e.id})" /><span class="toggle-slider"></span></label></td>
          <td style="display:flex;gap:.5rem;">
            <button class="btn btn-sm btn-ghost" onclick="manageCandidatesFor(${e.id}, '${escapeHtml(e.title)}')">Candidates</button>
            <button class="btn btn-sm btn-outline" style="color:var(--coral);" onclick="deleteElectionConfirm(${e.id})">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) { /* server not reachable */ }
}

async function createElection() {
  const title = document.getElementById('election-title').value.trim();
  const desc = document.getElementById('election-desc').value.trim();
  const opensAt = document.getElementById('election-opens').value;
  const closesAt = document.getElementById('election-closes').value;
  const errEl = document.getElementById('election-form-error');
  errEl.style.display = 'none';

  if (!title || !opensAt || !closesAt) {
    return showFormError(errEl, 'Please fill in Title, Opens, and Closes fields.');
  }
  if (closesAt <= opensAt) {
    return showFormError(errEl, 'Closing time must be later than opening time.');
  }

  const btn = document.getElementById('create-election-btn');
  setButtonLoading(btn, 'Creating...');

  try {
    const res = await fetch('admin/api.php?action=create_election', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        title, description: desc,
        opens_at: opensAt.replace('T', ' ') + ':00',
        closes_at: closesAt.replace('T', ' ') + ':00'
      })
    });
    const data = await res.json();

    if (data.ok) {
      document.getElementById('new-election-modal').classList.remove('open');
      document.getElementById('election-title').value = '';
      document.getElementById('election-desc').value = '';
      document.getElementById('election-opens').value = '';
      document.getElementById('election-closes').value = '';
      loadAdminElections();
    } else {
      showFormError(errEl, data.error);
    }
  } catch (e) {
    showFormError(errEl, 'Could not reach the server. Is Apache running in XAMPP?');
  } finally {
    resetButton(btn, 'Create election');
  }
}

async function toggleElectionOpen(electionId) {
  try {
    const res = await fetch(`admin/api.php?action=toggle_election&id=${electionId}`, {
      method: 'POST',
      credentials: 'include'
    });
    const data = await res.json();
    if (!data.ok) { alert(data.error); }
    loadAdminElections();
  } catch (e) {
    alert('Could not reach the server.');
  }
}

async function deleteElectionConfirm(electionId) {
  if (!confirm('Delete this election? This cannot be undone (only works if it has zero votes).')) return;
  try {
    const res = await fetch(`admin/api.php?action=delete_election&id=${electionId}`, {
      method: 'POST',
      credentials: 'include'
    });
    const data = await res.json();
    if (!data.ok) alert(data.error);
    loadAdminElections();
  } catch (e) {
    alert('Could not reach the server.');
  }
}

function manageCandidatesFor(electionId, title) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelector('.admin-tab:nth-child(2)').classList.add('active');
  document.getElementById('admin-candidates').classList.add('active');
  loadAdminCandidates();
}

// ── Add Candidate modal ────────────────────────────────────────────────────
async function openAddCandidateModal() {
  document.getElementById('add-candidate-modal').classList.add('open');
  document.getElementById('candidate-form-error').style.display = 'none';

  // Populate the election dropdown with real elections from the database
  const select = document.getElementById('candidate-election-select');
  select.innerHTML = '<option value="">Loading elections…</option>';
  try {
    const res = await fetch('admin/api.php?action=elections', { credentials: 'include' });
    const data = await res.json();
    if (data.ok && data.data.length > 0) {
      select.innerHTML = data.data.map(e => `<option value="${e.id}">${escapeHtml(e.title)}</option>`).join('');
    } else {
      select.innerHTML = '<option value="">No elections yet — create one first</option>';
    }
  } catch (e) {
    select.innerHTML = '<option value="">Could not load elections</option>';
  }
}

async function submitAddCandidate() {
  const electionId = document.getElementById('candidate-election-select').value;
  const fullName = document.getElementById('candidate-fullname').value.trim();
  const party = document.getElementById('candidate-party').value.trim();
  const tagline = document.getElementById('candidate-tagline').value.trim();
  const bio = document.getElementById('candidate-bio').value.trim();
  const photoFile = document.getElementById('candidate-photo').files[0];
  const errEl = document.getElementById('candidate-form-error');
  errEl.style.display = 'none';

  if (!electionId) return showFormError(errEl, 'Please select an election.');
  if (!fullName) return showFormError(errEl, 'Full name is required.');

  const formData = new FormData();
  formData.append('election_id', electionId);
  formData.append('full_name', fullName);
  formData.append('party', party);
  formData.append('tagline', tagline);
  formData.append('bio', bio);
  formData.append('platform', '[]');
  if (photoFile) formData.append('photo', photoFile);

  const btn = document.getElementById('add-candidate-btn');
  setButtonLoading(btn, 'Adding...');

  try {
    // NOTE: no 'Content-Type' header set manually — the browser sets the
    // correct multipart/form-data boundary automatically for FormData.
    const res = await fetch('admin/api.php?action=add_candidate', {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    const data = await res.json();

    if (data.ok) {
      document.getElementById('add-candidate-modal').classList.remove('open');
      document.getElementById('add-candidate-form').reset();
      loadAdminCandidates();
    } else {
      showFormError(errEl, data.error);
    }
  } catch (e) {
    showFormError(errEl, 'Could not reach the server. Is Apache running in XAMPP?');
  } finally {
    resetButton(btn, 'Add candidate');
  }
}

async function loadAdminCandidates() {
  const tbody = document.getElementById('admin-candidates-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--ink-muted);">Loading…</td></tr>`;

  try {
    // Fetch all elections first, then all candidates per election
    const elRes = await fetch('admin/api.php?action=elections', { credentials: 'include' });
    const elData = await elRes.json();
    if (!elData.ok || elData.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--ink-muted);">No elections yet. Create one in the Elections tab first.</td></tr>`;
      return;
    }

    let allRows = [];
    for (const election of elData.data) {
      const cRes = await fetch(`admin/api.php?action=candidates&election_id=${election.id}`, { credentials: 'include' });
      const cData = await cRes.json();
      if (cData.ok) {
        cData.data.forEach(c => allRows.push({ ...c, election_title: election.title }));
      }
    }

    if (allRows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--ink-muted);">No candidates yet. Click "+ Add candidate" above.</td></tr>`;
      return;
    }

    tbody.innerHTML = allRows.map(c => {
      const initials = c.full_name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
      const avatarTag = c.photo_url
        ? `<img src="${c.photo_url}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" onerror="this.outerHTML='<div class=&quot;avatar-circle&quot; style=&quot;width:32px;height:32px;font-size:.75rem;&quot;>${initials}</div>'" />`
        : `<div class="avatar-circle" style="width:32px;height:32px;font-size:.75rem;">${initials}</div>`;
      const statusTag = c.status === 'approved'
        ? `<span class="tag tag-mint" style="background:var(--mint-soft);color:#00734A;">Approved</span>`
        : c.status === 'rejected'
          ? `<span class="tag" style="background:var(--coral-soft);color:var(--coral);">Rejected</span>`
          : `<span class="tag tag-amber">Pending review</span>`;
      return `
        <tr>
          <td><div style="display:flex;align-items:center;gap:10px;">${avatarTag}<div><div style="font-weight:600;font-size:.875rem;color:var(--ink);">${escapeHtml(c.full_name)}</div><div style="font-size:.75rem;color:var(--ink-muted);">${escapeHtml(c.election_title)}</div></div></div></td>
          <td>${escapeHtml(c.party || 'Independent')}</td>
          <td>${statusTag}</td>
          <td style="display:flex;gap:.5rem;"><button class="btn btn-sm btn-outline" style="color:var(--coral);font-size:.75rem;" onclick="removeCandidateConfirm(${c.id})">Remove</button></td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--coral);">Could not load candidates. Is Apache running?</td></tr>`;
  }
}

async function removeCandidateConfirm(candidateId) {
  if (!confirm('Remove this candidate? This cannot be undone.')) return;
  try {
    const res = await fetch(`admin/api.php?action=remove_candidate&id=${candidateId}`, {
      method: 'POST',
      credentials: 'include'
    });
    const data = await res.json();
    if (!data.ok) alert(data.error);
    loadAdminCandidates();
  } catch (e) {
    alert('Could not reach the server.');
  }
}

// ── Admin tabs ────────────────────────────────────────────────────────────
function switchAdminTab(btn, section) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('admin-' + section).classList.add('active');
  if (section === 'results') buildResultBars('admin-result-bars');
  if (section === 'candidates') loadAdminCandidates();
}

// ════════════════════════════════════════════════════════════════════════
//  Small helpers
// ════════════════════════════════════════════════════════════════════════
function showFormError(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}
function showFormSuccess(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}
function setButtonLoading(btn, text) {
  btn.dataset.originalText = btn.textContent;
  btn.textContent = text;
  btn.disabled = true;
  btn.style.opacity = '0.7';
}
function resetButton(btn, fallbackText) {
  btn.textContent = btn.dataset.originalText || fallbackText;
  btn.disabled = false;
  btn.style.opacity = '1';
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr.replace(' ', 'T'));
  if (isNaN(d)) return isoStr;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ════════════════════════════════════════════════════════════════════════
//  Init — runs once when the page loads
// ════════════════════════════════════════════════════════════════════════
(async function init() {
  buildFAQ();
  buildCandidateGrid();
  buildResultBars('result-bars');

  await checkVoterSession();   // restores login state after a page refresh
  updateNav('home');
})();
