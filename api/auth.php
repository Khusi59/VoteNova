<?php


require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/app.php';

applyCors();
startSession();
header('Content-Type: application/json');

$action = $_GET['action'] ?? '';

match ($action) {
    'register' => handleRegister(),
    'login'    => handleLogin(),
    'logout'   => handleLogout(),
    'me'       => handleMe(),
    default    => jsonError('Unknown action.', 404),
};

// ── Register ─────────────────────────────────────────────────
function handleRegister(): void {
    $b = body();
    $firstName = trim($b['first_name'] ?? '');
    $lastName  = trim($b['last_name']  ?? '');
    $email     = strtolower(trim($b['email']    ?? ''));
    $password  = $b['password']  ?? '';
    $confirm   = $b['confirm']   ?? '';

    if (!$firstName || !$lastName || !$email || !$password) {
        jsonError('All fields are required.');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonError('Invalid email address.');
    }
    if (strlen($password) < 8) {
        jsonError('Password must be at least 8 characters.');
    }
    if ($password !== $confirm) {
        jsonError('Passwords do not match.');
    }

    $db = getDB();
    $exists = $db->prepare('SELECT id FROM voters WHERE email = ?');
    $exists->execute([$email]);
    if ($exists->fetch()) {
        jsonError('An account with this email already exists.');
    }

    $hash  = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    $token = bin2hex(random_bytes(32));

    $stmt = $db->prepare(
        'INSERT INTO voters (first_name, last_name, email, password, is_verified, verify_token) VALUES (?,?,?,?,?,?)'
    );
    // NOTE: is_verified is set to 1 directly here ONLY because this project
    // has no live SMTP mail server configured for local/XAMPP testing.
    // In a production deployment, set is_verified to 0 and require the
    // voter to click the link sent by includes/mailer.php (see verify.php).
    $stmt->execute([$firstName, $lastName, $email, $hash, 1, $token]);
    $voterId = $db->lastInsertId();

    audit('voter_registered', "email=$email", 'voter', (int)$voterId);

    jsonOk(['message' => 'Account created successfully. You can now log in.'], 201);
}

// ── Login ────────────────────────────────────────────────────
function handleLogin(): void {
    $b        = body();
    $email    = strtolower(trim($b['email']    ?? ''));
    $password = $b['password'] ?? '';

    if (!$email || !$password) jsonError('Email and password required.');

    $db   = getDB();
    $stmt = $db->prepare('SELECT * FROM voters WHERE email = ?');
    $stmt->execute([$email]);
    $voter = $stmt->fetch();

    // (a) Must exist AND (b) password must cryptographically match the
    // stored bcrypt hash. password_verify returns false for ANY wrong
    // password — there is no bypass, no master password, no fallback.
    if (!$voter || !password_verify($password, $voter['password'])) {
        audit('voter_login_fail', "email=$email");
        jsonError('Invalid email or password.', 401);
    }

    // (c) Must be a verified account.
    if (!$voter['is_verified']) {
        jsonError('Please verify your email before logging in.', 403);
    }

    session_regenerate_id(true);
    $_SESSION['voter_id']    = $voter['id'];
    $_SESSION['voter_name']  = $voter['first_name'] . ' ' . $voter['last_name'];
    $_SESSION['voter_email'] = $voter['email'];

    audit('voter_login', "email=$email", 'voter', (int)$voter['id']);
    jsonOk([
        'id'    => $voter['id'],
        'name'  => $_SESSION['voter_name'],
        'email' => $voter['email'],
    ]);
}

// ── Logout ───────────────────────────────────────────────────
function handleLogout(): void {
    $_SESSION = [];
    session_destroy();
    jsonOk(['message' => 'Logged out.']);
}

// ── Me — used by the frontend to check "am I still logged in?" ─
function handleMe(): void {
    if (empty($_SESSION['voter_id'])) {
        jsonError('Not authenticated.', 401);
    }
    jsonOk([
        'id'    => $_SESSION['voter_id'],
        'name'  => $_SESSION['voter_name'],
        'email' => $_SESSION['voter_email'],
    ]);
}
