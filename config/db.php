<?php


define('DB_HOST', 'localhost');
define('DB_NAME', 'votenova');
define('DB_USER', 'root');   // XAMPP default username
define('DB_PASS', '');       // XAMPP default password (empty)
define('DB_CHARSET', 'utf8mb4');

function getDB(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', DB_HOST, DB_NAME, DB_CHARSET);
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            http_response_code(500);
            header('Content-Type: application/json');
            die(json_encode(['ok' => false, 'error' => 'Database connection failed. Is MySQL running in XAMPP?']));
        }
    }
    return $pdo;
}
