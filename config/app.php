<?php

define('APP_NAME',    'VoteNova');
// For local XAMPP testing this can stay as-is. Change only when deploying live.
define('APP_URL',     'http://localhost/votenova');
define('UPLOAD_DIR',  __DIR__ . '/../uploads/candidates/');
define('UPLOAD_URL',  APP_URL . '/uploads/candidates/');
define('MAX_PHOTO_MB', 2);

// ── CORS (allows the frontend to call this API with cookies) ──
function applyCors(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin) {
        header("Access-Control-Allow-Origin: $origin");
    }
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

// ── Session ──────────────────────────────────────────────────
function startSession(): void {
    if (session_status() === PHP_SESSION_NONE) {
        session_name('vn_sess');
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'secure'   => false,   // set true once deployed on HTTPS
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
    }
}

// ── Auth guards ──────────────────────────────────────────────
// Only a logged-in, verified voter may pass this check.
function requireVoter(): void {
    startSession();
    if (empty($_SESSION['voter_id'])) {
        jsonError('Not authenticated. Please log in.', 401);
    }
}

// Only a logged-in admin may pass this check.
function requireAdmin(): void {
    startSession();
    if (empty($_SESSION['admin_id'])) {
        jsonError('Admin access required.', 403);
    }
}

// ── Response helpers ─────────────────────────────────────────
function jsonOk(mixed $data = [], int $code = 200): never {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode(['ok' => true, 'data' => $data]);
    exit;
}

function jsonError(string $message, int $code = 400): never {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'error' => $message]);
    exit;
}

// ── Sanitise input ───────────────────────────────────────────
function clean(string $val): string {
    return htmlspecialchars(trim($val), ENT_QUOTES, 'UTF-8');
}

function body(): array {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? [];
}

// ── Audit logger ─────────────────────────────────────────────
function audit(string $action, string $detail = '', string $actorType = 'system', ?int $actorId = null): void {
    try {
        $db = getDB();
        $stmt = $db->prepare(
            'INSERT INTO audit_log (actor_type, actor_id, action, detail, ip_address) VALUES (?,?,?,?,?)'
        );
        $stmt->execute([$actorType, $actorId, $action, $detail, $_SERVER['REMOTE_ADDR'] ?? null]);
    } catch (Throwable) { /* non-fatal */ }
}
