<?php

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/app.php';

applyCors();
startSession();
header('Content-Type: application/json');

$action = $_GET['action'] ?? '';

// Public admin endpoints (no auth needed to attempt these)
if ($action === 'login')  { adminLogin();  exit; }
if ($action === 'logout') { adminLogout(); exit; }
if ($action === 'me')     { adminMe();     exit; }

// Every other action below requires a valid admin session
requireAdmin();

match ($action) {
    'elections'         => listElections(),
    'create_election'   => createElection(),
    'update_election'   => updateElection((int)($_GET['id'] ?? 0)),
    'toggle_election'   => toggleElection((int)($_GET['id'] ?? 0)),
    'delete_election'   => deleteElection((int)($_GET['id'] ?? 0)),
    'candidates'        => listCandidates((int)($_GET['election_id'] ?? 0)),
    'add_candidate'     => addCandidate(),
    'update_candidate'  => updateCandidate((int)($_GET['id'] ?? 0)),
    'approve_candidate' => approveCandidate((int)($_GET['id'] ?? 0)),
    'remove_candidate'  => removeCandidate((int)($_GET['id'] ?? 0)),
    'voters'            => listVoters(),
    'results'           => adminResults((int)($_GET['election_id'] ?? 0)),
    default              => jsonError('Unknown action.', 404),
};

// ══════════════════════════════════════════════════════════════
//  ADMIN AUTH
// ══════════════════════════════════════════════════════════════

function adminLogin(): void {
    $b        = body();
    $username = trim($b['username'] ?? '');
    $password = $b['password'] ?? '';
    if (!$username || !$password) jsonError('Username and password required.');

    $db   = getDB();
    $stmt = $db->prepare('SELECT * FROM admins WHERE username = ?');
    $stmt->execute([$username]);
    $admin = $stmt->fetch();

    // Cryptographic password check — wrong password ALWAYS fails here.
    if (!$admin || !password_verify($password, $admin['password'])) {
        audit('admin_login_fail', "username=$username");
        jsonError('Invalid credentials.', 401);
    }

    session_regenerate_id(true);
    $_SESSION['admin_id']   = $admin['id'];
    $_SESSION['admin_user'] = $admin['username'];
    audit('admin_login', "username=$username", 'admin', (int)$admin['id']);
    jsonOk(['username' => $admin['username']]);
}

function adminLogout(): void {
    $_SESSION = [];
    session_destroy();
    jsonOk(['message' => 'Logged out.']);
}

function adminMe(): void {
    if (empty($_SESSION['admin_id'])) jsonError('Not authenticated.', 401);
    jsonOk(['username' => $_SESSION['admin_user']]);
}

// ══════════════════════════════════════════════════════════════
//  ELECTIONS
// ══════════════════════════════════════════════════════════════

function listElections(): void {
    $db   = getDB();
    $stmt = $db->query(
        "SELECT e.*,
                (SELECT COUNT(*) FROM votes WHERE election_id = e.id) AS total_votes,
                (SELECT COUNT(*) FROM candidates WHERE election_id = e.id AND status='approved') AS candidate_count
         FROM elections e ORDER BY e.created_at DESC"
    );
    jsonOk($stmt->fetchAll());
}

function createElection(): void {
    $b = body();
    $title   = trim($b['title']       ?? '');
    $desc    = trim($b['description'] ?? '');
    $opens   = trim($b['opens_at']    ?? '');
    $closes  = trim($b['closes_at']   ?? '');
    if (!$title || !$opens || !$closes) jsonError('title, opens_at, closes_at are required.');
    if ($closes <= $opens)              jsonError('Closing time must be after opening time.');

    $db   = getDB();
    $stmt = $db->prepare(
        'INSERT INTO elections (title, description, opens_at, closes_at, is_open, results_public, created_by)
         VALUES (?,?,?,?,0,0,?)'
    );
    $stmt->execute([$title, $desc, $opens, $closes, $_SESSION['admin_id']]);
    $id = $db->lastInsertId();
    audit('election_created', "id=$id title=$title", 'admin', (int)$_SESSION['admin_id']);
    jsonOk(['id' => $id], 201);
}

function updateElection(int $id): void {
    if (!$id) jsonError('Election id required.');
    $b = body();
    $fields = [];
    $vals   = [];
    foreach (['title','description','opens_at','closes_at','results_public'] as $f) {
        if (isset($b[$f])) { $fields[] = "$f = ?"; $vals[] = $b[$f]; }
    }
    if (!$fields) jsonError('Nothing to update.');
    $vals[] = $id;
    getDB()->prepare('UPDATE elections SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($vals);
    audit('election_updated', "id=$id", 'admin', (int)$_SESSION['admin_id']);
    jsonOk(['message' => 'Election updated.']);
}

function toggleElection(int $id): void {
    if (!$id) jsonError('Election id required.');
    $db   = getDB();
    $stmt = $db->prepare('SELECT is_open FROM elections WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) jsonError('Election not found.', 404);

    $newState = $row['is_open'] ? 0 : 1;
    $db->prepare('UPDATE elections SET is_open = ? WHERE id = ?')->execute([$newState, $id]);
    audit('election_toggled', "id=$id is_open=$newState", 'admin', (int)$_SESSION['admin_id']);
    jsonOk(['is_open' => $newState]);
}

function deleteElection(int $id): void {
    if (!$id) jsonError('Election id required.');
    $db = getDB();
    $vStmt = $db->prepare('SELECT COUNT(*) AS n FROM votes WHERE election_id = ?');
    $vStmt->execute([$id]);
    if ((int)$vStmt->fetch()['n'] > 0) jsonError('Cannot delete an election that has votes.', 409);

    $db->prepare('DELETE FROM elections WHERE id = ?')->execute([$id]);
    audit('election_deleted', "id=$id", 'admin', (int)$_SESSION['admin_id']);
    jsonOk(['message' => 'Election deleted.']);
}

// ══════════════════════════════════════════════════════════════
//  CANDIDATES
// ══════════════════════════════════════════════════════════════

function listCandidates(int $electionId): void {
    if (!$electionId) jsonError('election_id required.');
    $db   = getDB();
    $stmt = $db->prepare(
        'SELECT * FROM candidates WHERE election_id = ? ORDER BY status ASC, id ASC'
    );
    $stmt->execute([$electionId]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['photo_url'] = $r['photo'] ? (UPLOAD_URL . $r['photo']) : null;
        $r['platform']  = json_decode($r['platform'] ?? '[]', true);
    }
    jsonOk($rows);
}

function addCandidate(): void {
    $electionId = (int)($_POST['election_id'] ?? 0);
    $fullName   = trim($_POST['full_name'] ?? '');
    $party      = trim($_POST['party']     ?? '');
    $tagline    = trim($_POST['tagline']   ?? '');
    $bio        = trim($_POST['bio']       ?? '');
    $platform   = $_POST['platform'] ?? '[]';

    if (!$electionId || !$fullName) jsonError('election_id and full_name required.');

    $photoFilename = null;
    if (!empty($_FILES['photo']['tmp_name'])) {
        $photoFilename = uploadPhoto($_FILES['photo']);
    }

    $db   = getDB();
    $stmt = $db->prepare(
        'INSERT INTO candidates (election_id, full_name, party, tagline, bio, photo, platform, status)
         VALUES (?,?,?,?,?,?,?,?)'
    );
    $stmt->execute([
        $electionId, $fullName, $party, $tagline, $bio,
        $photoFilename, $platform, 'approved'
    ]);
    $id = $db->lastInsertId();
    audit('candidate_added', "id=$id election=$electionId", 'admin', (int)$_SESSION['admin_id']);
    jsonOk(['id' => $id, 'photo_url' => $photoFilename ? UPLOAD_URL . $photoFilename : null], 201);
}

function updateCandidate(int $id): void {
    if (!$id) jsonError('Candidate id required.');
    $fields = [];
    $vals   = [];
    foreach (['full_name','party','tagline','bio','platform','status'] as $f) {
        if (isset($_POST[$f])) { $fields[] = "$f = ?"; $vals[] = $_POST[$f]; }
    }
    if (!empty($_FILES['photo']['tmp_name'])) {
        $fn = uploadPhoto($_FILES['photo']);
        $fields[] = 'photo = ?';
        $vals[]   = $fn;
    }
    if (!$fields) jsonError('Nothing to update.');
    $vals[] = $id;
    getDB()->prepare('UPDATE candidates SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($vals);
    audit('candidate_updated', "id=$id", 'admin', (int)$_SESSION['admin_id']);
    jsonOk(['message' => 'Candidate updated.']);
}

function approveCandidate(int $id): void {
    if (!$id) jsonError('Candidate id required.');
    $b      = body();
    $status = $b['status'] ?? 'approved';
    if (!in_array($status, ['approved','rejected'])) jsonError('Invalid status.');
    getDB()->prepare('UPDATE candidates SET status = ? WHERE id = ?')->execute([$status, $id]);
    audit("candidate_$status", "id=$id", 'admin', (int)$_SESSION['admin_id']);
    jsonOk(['message' => "Candidate $status."]);
}

function removeCandidate(int $id): void {
    if (!$id) jsonError('Candidate id required.');
    $db   = getDB();
    $stmt = $db->prepare('SELECT photo FROM candidates WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if ($row && $row['photo']) {
        @unlink(UPLOAD_DIR . $row['photo']);
    }
    $db->prepare('DELETE FROM candidates WHERE id = ?')->execute([$id]);
    audit('candidate_removed', "id=$id", 'admin', (int)$_SESSION['admin_id']);
    jsonOk(['message' => 'Candidate removed.']);
}

// ══════════════════════════════════════════════════════════════
//  VOTERS
// ══════════════════════════════════════════════════════════════

function listVoters(): void {
    $db   = getDB();
    $search = '%' . trim($_GET['q'] ?? '') . '%';
    $stmt = $db->prepare(
        "SELECT id, first_name, last_name, email, is_verified, created_at,
                (SELECT COUNT(*) FROM votes WHERE voter_id = voters.id) AS votes_cast
         FROM voters WHERE email LIKE ? OR first_name LIKE ? OR last_name LIKE ?
         ORDER BY created_at DESC LIMIT 200"
    );
    $stmt->execute([$search, $search, $search]);
    jsonOk($stmt->fetchAll());
}

// ══════════════════════════════════════════════════════════════
//  RESULTS
// ══════════════════════════════════════════════════════════════

function adminResults(int $electionId): void {
    if (!$electionId) jsonError('election_id required.');
    $db = getDB();

    $eStmt = $db->prepare(
        'SELECT id, title, closes_at,
                (SELECT COUNT(*) FROM votes WHERE election_id = elections.id) AS total_votes
         FROM elections WHERE id = ?'
    );
    $eStmt->execute([$electionId]);
    $election = $eStmt->fetch();
    if (!$election) jsonError('Election not found.', 404);

    $rStmt = $db->prepare(
        "SELECT c.id, c.full_name, c.party, c.photo,
                COUNT(v.id) AS vote_count
         FROM candidates c
         LEFT JOIN votes v ON v.candidate_id = c.id AND v.election_id = ?
         WHERE c.election_id = ? AND c.status = 'approved'
         GROUP BY c.id ORDER BY vote_count DESC"
    );
    $rStmt->execute([$electionId, $electionId]);
    $rows  = $rStmt->fetchAll();
    $total = (int)$election['total_votes'];

    foreach ($rows as &$r) {
        $r['percentage'] = $total > 0 ? round(($r['vote_count'] / $total) * 100, 1) : 0;
        $r['photo_url']  = $r['photo'] ? UPLOAD_URL . $r['photo'] : null;
    }

    jsonOk(['election' => $election, 'results' => $rows, 'total_votes' => $total]);
}

// ══════════════════════════════════════════════════════════════
//  PHOTO UPLOAD HELPER
// ══════════════════════════════════════════════════════════════

function uploadPhoto(array $file): string {
    $allowed  = ['image/jpeg', 'image/png', 'image/webp'];
    $maxBytes = MAX_PHOTO_MB * 1024 * 1024;

    if (!in_array($file['type'], $allowed))   jsonError('Photo must be JPEG, PNG, or WebP.');
    if ($file['size'] > $maxBytes)            jsonError('Photo must be under ' . MAX_PHOTO_MB . 'MB.');
    if ($file['error'] !== UPLOAD_ERR_OK)     jsonError('File upload error.');
    if (!getimagesize($file['tmp_name']))     jsonError('Uploaded file is not a valid image.');

    $ext = match($file['type']) {
        'image/png'  => 'png',
        'image/webp' => 'webp',
        default      => 'jpg',
    };
    $filename = bin2hex(random_bytes(12)) . '.' . $ext;
    $dest     = UPLOAD_DIR . $filename;

    if (!is_dir(UPLOAD_DIR)) mkdir(UPLOAD_DIR, 0755, true);
    if (!move_uploaded_file($file['tmp_name'], $dest)) jsonError('Failed to save photo.');

    return $filename;
}
