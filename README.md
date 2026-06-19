# VoteNova — Complete Project (index.html + style.css + main.js)

This package matches your VS Code project structure exactly. Everything is wired together — registration, login, voting, and the admin panel are all connected to real PHP + MySQL, not demo placeholders.

---

## What changed from the previous version

1. **Project structure** — split into `index.html`, `style.css`, `main.js` (matching your VS Code setup) instead of one combined `votenova.html` file.
2. **Relative API paths** — every `fetch()` call now uses a relative path like `api/auth.php` instead of `/admin/api.php`. This means it works regardless of what folder name you use (`votenova`, `vote-app`, anything) — no more "Could not connect to server" from a wrong absolute path.
3. **Real authentication enforced** — the admin login and voter login both now call the actual PHP backend and use `password_verify()` against the bcrypt hash stored in MySQL. No password "just works" anymore — only the correct one does.
4. **Real Create Election** — the button now sends data to `admin/api.php?action=create_election`, which inserts a row into the `elections` table.
5. **Navbar fixed** — public visitors see Home / About / Log in / Register. After logging in, voters see Dashboard / Candidates / Vote / Results, matching what you asked for.
6. **uploads/candidates/ folder included** — with a placeholder file so the empty folder survives zipping/unzipping.

---

## File structure

```
votenova/
├── index.html              ← the whole site (all 10 pages, one file)
├── style.css                ← all styling
├── main.js                  ← all behaviour + backend connection
├── .htaccess                 ← minimal Apache config (kept simple, no mod_rewrite needed)
├── config/
│   ├── db.php                ← MySQL connection — already set for XAMPP defaults (root / no password)
│   ├── app.php                ← session + security helpers
│   └── schema.sql              ← run this once in phpMyAdmin to create everything
├── api/
│   ├── auth.php                ← voter register / login / logout / session check
│   └── elections.php            ← elections list, candidates, voting, results
├── admin/
│   └── api.php                  ← admin login + full election/candidate/voter management
└── uploads/
    └── candidates/                ← candidate photos save here automatically
```

---

## Setup — quick version (full detail is in the other guide documents)

1. Copy the entire `votenova` folder into `C:\xampp\htdocs\votenova\`
2. Start Apache + MySQL in XAMPP Control Panel
3. Go to `http://localhost/phpmyadmin` → Databases tab → create a database named `votenova`
4. Click into `votenova` → SQL tab → paste the contents of `config/schema.sql` → Go
5. Open `http://localhost/votenova/index.html`
6. Click the small **Admin Portal** link in the footer
7. Log in with username `admin`, password `Admin@1234`
8. **Change that password immediately** (see "Changing the admin password" below)

No changes are needed in `config/db.php` if you are using a fresh XAMPP install — it is already configured for `root` with no password, which is the XAMPP default.

---

## How login security actually works now

### Voter login
`api/auth.php?action=login` runs:
```php
$stmt = $db->prepare('SELECT * FROM voters WHERE email = ?');
$stmt->execute([$email]);
$voter = $stmt->fetch();

if (!$voter || !password_verify($password, $voter['password'])) {
    jsonError('Invalid email or password.', 401);
}
```
`password_verify()` does a true cryptographic comparison against the bcrypt hash stored in the database. There is no way for an incorrect password to pass this check — every wrong password is rejected, every time.

### Admin login
Exactly the same mechanism, against the `admins` table, in `admin/api.php`.

### Registration → login flow
When someone registers via `api/auth.php?action=register`:
1. Their password is hashed with bcrypt (`password_hash()`, cost 12) before being stored — the plaintext password is never saved anywhere.
2. A new row is inserted into the `voters` table.
3. **For local/XAMPP testing only**, the account is marked `is_verified = 1` immediately (no real email server is available on localhost). This means a newly registered voter can log in right away with the email and password they just chose.
4. Only that registered email + matching password combination will ever succeed at login. Anyone who has not registered, or who registered with a different email, cannot log in — there is no fallback or bypass.

---

## Changing the admin password

1. Go to `https://bcrypt-generator.com`, type your new password, click Generate, copy the hash.
2. Go to phpMyAdmin → `votenova` → SQL tab.
3. Run:
```sql
UPDATE admins SET password = 'PASTE_YOUR_HASH_HERE' WHERE username = 'admin';
```

---

## Going live (production) — one important change

In `api/auth.php`, registration currently sets `is_verified = 1` automatically (see the comment in the code marked **NOTE**). This is only acceptable for local testing because there is no mail server on localhost.

Before deploying to a real server:
1. Change `is_verified` in the INSERT statement back to `0`.
2. Configure `includes/mailer.php` with real SMTP credentials (Mailgun, SendGrid, etc.).
3. Voters will then need to click the verification link emailed to them before they can log in — exactly as a real voting system should work.

Also update `config/app.php`:
- Set `APP_URL` to your real domain
- Set `'secure' => true` in the session cookie settings (requires HTTPS)
