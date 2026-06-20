<?php

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/app.php';

applyCors();
startSession();
header('Content-Type: application/json');

$action = $_GET['action'] ?? null;
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;

if ($action === 'vote') {
    castVote();
    exit;
}
if ($action === 'results') {
    getResults($id);
    exit;
}
if ($action === 'receipt') {
    verifyReceipt();
    exit;
}
if ($action === 'all_for_voter') {
    listForVoterDashboard();
    exit;
}
if ($action === 'all_candidates') {
    listAllCandidates();
    exit;
}
if ($id) {
    getElection($id);
    exit;
}

listElections();

function listAllCandidates(): void
{
    $db   = getDB();
    $stmt = $db->query(
        "SELECT c.id, c.full_name, c.party, c.tagline, c.bio, c.photo, c.platform,
                e.id AS election_id, e.title AS election_title
         FROM candidates c
         JOIN elections e ON e.id = c.election_id
         WHERE c.status = 'approved'
           AND e.is_open = 1
           AND e.opens_at <= NOW() AND e.closes_at >= NOW()
         ORDER BY e.closes_at ASC, c.id ASC"
    );
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['photo_url'] = $r['photo'] ? (UPLOAD_URL . $r['photo']) : null;
        $r['platform']  = json_decode($r['platform'] ?? '[]', true);
    }
    jsonOk($rows);
}
// ── List all currently open (live) elections — public ────────
function listElections(): void
{
    $db   = getDB();
    $stmt = $db->query(
        "SELECT id, title, description, opens_at, closes_at,
                (SELECT COUNT(*) FROM votes WHERE election_id = elections.id) AS vote_count
         FROM elections
         WHERE is_open = 1 AND opens_at <= NOW() AND closes_at >= NOW()
         ORDER BY closes_at ASC"
    );
    jsonOk($stmt->fetchAll());
}

// ── Elections list for a logged-in voter's dashboard ──────────
// Includes whether THIS voter has already voted in each one.
function listForVoterDashboard(): void
{
    requireVoter();
    $voterId = (int)$_SESSION['voter_id'];
    $db = getDB();
    $stmt = $db->prepare(
        "SELECT e.id, e.title, e.description, e.opens_at, e.closes_at, e.is_open,
                (SELECT COUNT(*) FROM votes WHERE election_id = e.id) AS vote_count,
                EXISTS(SELECT 1 FROM votes WHERE election_id = e.id AND voter_id = ?) AS has_voted
         FROM elections e
         WHERE e.is_open = 1 AND e.opens_at <= NOW() AND e.closes_at >= NOW()
         ORDER BY e.closes_at ASC"
    );
    $stmt->execute([$voterId]);
    $rows = $stmt->fetchAll();
    // MySQL returns EXISTS(...) as the string "0" or "1" through PDO, and
    // the string "0" is TRUTHY in JavaScript — this was the bug causing
    // "already voted" to show even with zero rows in the votes table.
    // Casting explicitly to a real boolean here fixes it permanently.
    foreach ($rows as &$r) {
        $r['has_voted'] = (bool)((int)$r['has_voted']);
    }
    jsonOk($rows);
}

// ── Single election + approved candidates ────────────────────
function getElection(int $id): void
{
    $db   = getDB();
    $stmt = $db->prepare(
        "SELECT id, title, description, opens_at, closes_at,
                (SELECT COUNT(*) FROM votes WHERE election_id = elections.id) AS vote_count
         FROM elections WHERE id = ? AND is_open = 1"
    );
    $stmt->execute([$id]);
    $election = $stmt->fetch();
    if (!$election) jsonError('Election not found or not open.', 404);

    $cStmt = $db->prepare(
        "SELECT id, full_name, party, tagline, bio, photo, platform
         FROM candidates WHERE election_id = ? AND status = 'approved'
         ORDER BY id ASC"
    );
    $cStmt->execute([$id]);
    $candidates = $cStmt->fetchAll();

    foreach ($candidates as &$c) {
        $c['platform']  = json_decode($c['platform'] ?? '[]', true);
        $c['photo_url'] = $c['photo'] ? (UPLOAD_URL . $c['photo']) : null;
    }

    // If a voter is logged in, tell the frontend whether they already voted
    $hasVoted = false;
    if (!empty($_SESSION['voter_id'])) {
        $vStmt = $db->prepare('SELECT id FROM votes WHERE election_id = ? AND voter_id = ?');
        $vStmt->execute([$id, $_SESSION['voter_id']]);
        $hasVoted = (bool)$vStmt->fetch();
    }

    jsonOk(['election' => $election, 'candidates' => $candidates, 'has_voted' => $hasVoted]);
}

// ── Cast a vote — voter must be logged in ──────────────────────
function castVote(): void
{
    requireVoter();
    $b           = body();
    $electionId  = (int)($b['election_id']  ?? 0);
    $candidateId = (int)($b['candidate_id'] ?? 0);
    $voterId     = (int)$_SESSION['voter_id'];

    if (!$electionId || !$candidateId) jsonError('election_id and candidate_id are required.');

    $db = getDB();

    $eStmt = $db->prepare(
        "SELECT id FROM elections
         WHERE id = ? AND is_open = 1 AND opens_at <= NOW() AND closes_at >= NOW()"
    );
    $eStmt->execute([$electionId]);
    if (!$eStmt->fetch()) jsonError('This election is not currently open for voting.', 403);

    $cStmt = $db->prepare(
        "SELECT id FROM candidates WHERE id = ? AND election_id = ? AND status = 'approved'"
    );
    $cStmt->execute([$candidateId, $electionId]);
    if (!$cStmt->fetch()) jsonError('Invalid candidate.', 400);

    $vStmt = $db->prepare('SELECT id FROM votes WHERE election_id = ? AND voter_id = ?');
    $vStmt->execute([$electionId, $voterId]);
    if ($vStmt->fetch()) jsonError('You have already voted in this election.', 409);

    $receipt = strtoupper(bin2hex(random_bytes(8)));
    $insert  = $db->prepare(
        'INSERT INTO votes (election_id, candidate_id, voter_id, receipt) VALUES (?,?,?,?)'
    );
    $insert->execute([$electionId, $candidateId, $voterId, $receipt]);

    audit('vote_cast', "election=$electionId candidate=$candidateId", 'voter', $voterId);
    jsonOk(['receipt' => 'VN-' . $receipt], 201);
}

// ── Get results (closed election OR admin made them public) ──
function getResults(?int $id): void
{
    if (!$id) jsonError('Election id required.');
    $db   = getDB();
    $eStmt = $db->prepare(
        "SELECT id, title, description, closes_at, results_public,
                (SELECT COUNT(*) FROM votes WHERE election_id = elections.id) AS total_votes
         FROM elections WHERE id = ?"
    );
    $eStmt->execute([$id]);
    $election = $eStmt->fetch();
    if (!$election) jsonError('Election not found.', 404);

    $isClosed = $election['closes_at'] < date('Y-m-d H:i:s');
    $isPublic = (bool)$election['results_public'];
    if (!$isClosed && !$isPublic) jsonError('Results are not yet available.', 403);

    $rStmt = $db->prepare(
        "SELECT c.id, c.full_name, c.party, c.photo,
                COUNT(v.id) AS vote_count
         FROM candidates c
         LEFT JOIN votes v ON v.candidate_id = c.id AND v.election_id = ?
         WHERE c.election_id = ? AND c.status = 'approved'
         GROUP BY c.id
         ORDER BY vote_count DESC"
    );
    $rStmt->execute([$id, $id]);
    $results = $rStmt->fetchAll();

    $total = (int)$election['total_votes'];
    foreach ($results as &$r) {
        $r['percentage'] = $total > 0 ? round(($r['vote_count'] / $total) * 100, 1) : 0;
        $r['photo_url']  = $r['photo'] ? (UPLOAD_URL . $r['photo']) : null;
    }

    jsonOk(['election' => $election, 'results' => $results, 'total_votes' => $total]);
}

// ── List all elections with public results — for Results page ─
function verifyReceipt(): void
{
    $code = strtoupper(trim($_GET['code'] ?? ''));
    $code = str_replace('VN-', '', $code);
    if (!$code) jsonError('Receipt code required.');

    $db   = getDB();
    $stmt = $db->prepare(
        "SELECT v.receipt, v.voted_at, e.title AS election_title, c.full_name AS candidate_name
         FROM votes v
         JOIN elections e ON e.id = v.election_id
         JOIN candidates c ON c.id = v.candidate_id
         WHERE v.receipt = ?"
    );
    $stmt->execute([$code]);
    $row = $stmt->fetch();
    if (!$row) jsonError('Receipt not found.', 404);

    jsonOk([
        'receipt'        => 'VN-' . $row['receipt'],
        'voted_at'       => $row['voted_at'],
        'election_title' => $row['election_title'],
        'message'        => 'Your vote was successfully recorded in this election.',
    ]);
}
