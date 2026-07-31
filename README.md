# 📧 Email Sender

A fully standalone, JSON-driven email sender.
Edit `content.json` to change cards, links and attachments. Add recipients to `recipients.csv`. Run one command.

---

## Prerequisites

Before you start, make sure you have the following:

### 1. Node.js (v18 or higher)
Download and install from [nodejs.org](https://nodejs.org).
Verify it's installed:
```bash
node --version   # should print v18.x.x or higher
npm --version
```

### 2. A Gmail account with an App Password
Gmail blocks regular passwords for SMTP. You need an **App Password**:
1. Go to your Google account → **Security**
2. Enable **2-Step Verification** (required)
3. Go to **Security → App Passwords**
4. Create a new app password → select **Mail** → copy the 16-character password
5. Paste it into `.env` as `GOOGLE_SMTP_PASS`

> ⚠️ Never commit `.env` to git — it's already in `.gitignore`

### 3. Avatar assets
The email template uses avatar images referenced as `cid:avatar-1.png` … `cid:avatar-6.png`.
Place your images in the `assets/` folder with those exact names:
```
assets/
  avatar-1.png
  avatar-2.png
  avatar-3.png
  avatar-4.png
  avatar-5.png
  avatar-6.png
```
> 📁 `assets/` is in `.gitignore` — add images manually after cloning.

---

## Folder Structure

```
EmailSender/
├── .env                      ← SMTP credentials            [gitignored]
├── .env.example              ← Safe template to copy from
│
├── content.json              ← Your cards, links, attachments [gitignored]
├── content.example.json      ← Safe template to copy from
│
├── recipients.csv            ← Real recipient emails         [gitignored]
├── recipients.example.csv    ← Safe template to copy from
│
├── template.html             ← Outer email shell (rarely needs editing)
├── send.js                   ← The script you run
│
├── assets/                   ← Avatar images (png/jpg)       [gitignored]
└── logs/                     ← Auto-created; one log per run [gitignored]
```

---

## Setup (after cloning)

```bash
# 1. Install dependencies
npm install

# 2. Copy example files and fill in your real data
cp .env.example .env
cp content.example.json content.json
cp recipients.example.csv recipients.csv

# 3. Add your avatar images to assets/

# 4. Edit content.json with your real cards, links, attachments
# 5. Edit recipients.csv with real email addresses
# 6. Fill in your SMTP credentials in .env
```

---

## Quick Start

```bash
node send.js                             # Send to everyone in recipients.csv
node send.js --dry-run                   # Preview without sending
node send.js --subject="My Subject"      # Override the subject line
```

---

## Editing `content.json`

This is your **single source of truth** for the email content. No code changes needed.

### Cards
Each card object in the `cards` array:
```json
{
  "title": "1. Hii,",
  "body": "Let me introduce myself...",
  "background": "#e8f5ff",
  "avatar": "avatar-1.png",
  "side": "left"
}
```

| Key          | Description                              |
|--------------|------------------------------------------|
| `title`      | Card heading (supports cursive font)     |
| `body`       | Main text content                        |
| `background` | Card background color (hex)              |
| `avatar`     | Image filename from `assets/`            |
| `side`       | `"left"` or `"right"` — avatar position |

### Links (optional, per card)
Add a `links` array to any card to render clickable buttons:
```json
"links": [
  { "label": "LinkedIn",  "url": "https://linkedin.com/in/you", "color": "#0077b5" },
  { "label": "GitHub",    "url": "https://github.com/you",      "color": "#24292e" },
  { "label": "Portfolio", "url": "https://yoursite.com",         "color": "#6c47ff" }
]
```

### Attachments
Add file paths to the `attachments` array.
**If a file doesn't exist it is silently skipped** — no errors.
```json
"attachments": [
  { "label": "Resume",              "emoji": "📄", "path": "C:\\Users\\You\\Resume.pdf" },
  { "label": "Cover Letter",        "emoji": "✉️", "path": "attachments/cover-letter.pdf" },
  { "label": "Recommendation",      "emoji": "🏅", "path": "attachments/recommendation.pdf" }
]
```
Attached files also appear as a **📎 Attached Documents** section inside the email body.

### Personalisation Placeholders
Use `{{columnName}}` anywhere in `content.json` values or the subject line.
Column names come from the headers in `recipients.csv`.

| Placeholder     | CSV column   |
|-----------------|--------------|
| `{{firstName}}` | `firstName`  |
| `{{company}}`   | `company`    |
| `{{role}}`      | `role`       |
| `{{email}}`     | `email`      |
| `{{custom1}}`   | `custom1`    |

Example:
```json
"subject": "Application for {{role}} at {{company}}"
```

---

## Editing `recipients.csv`

```csv
email,firstName,company,role,custom1,custom2
someone@example.com,Alex,Acme Corp,Product Designer,,
another@example.com,Sam,Northstar,UX Lead,,
```
- Add one row per recipient
- Column names become `{{placeholder}}` variables
- Invalid emails are automatically skipped with a warning

---

## Logs

Every run creates a timestamped log in `logs/`:
```
logs/send-2026-08-01T02-08-16.log
```

| Prefix      | Meaning                              |
|-------------|--------------------------------------|
| `✅ SENT`   | Delivered — includes message ID      |
| `❌ FAILED` | Error — includes reason              |
| `⏭ SKIPPED`| Invalid email address                |
| `⚠️ WARN`   | Attachment file not found (skipped)  |

---

## `.env` Reference

```env
GOOGLE_SMTP_USER=you@gmail.com
GOOGLE_SMTP_PASS=xxxx xxxx xxxx xxxx   # 16-char Gmail App Password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SEND_DELAY_MS=1200                     # Delay between sends (avoids spam filters)
MAX_RETRIES=2                          # Retry attempts on failure
EMAIL_SUBJECT=Application for Designer # Default subject (overridden by --subject=)
```

---

## What's safe to commit to GitHub

| File                    | Commit? | Reason                              |
|-------------------------|---------|-------------------------------------|
| `send.js`               | ✅ Yes  | No personal data                   |
| `template.html`         | ✅ Yes  | No personal data                   |
| `content.example.json`  | ✅ Yes  | Placeholder data only              |
| `recipients.example.csv`| ✅ Yes  | Dummy emails only                  |
| `package.json`          | ✅ Yes  | No personal data                   |
| `README.md`             | ✅ Yes  | Docs only                          |
| `.gitignore`            | ✅ Yes  | Config only                        |
| `.env`                  | ❌ No   | Contains SMTP password             |
| `content.json`          | ❌ No   | Contains your personal links       |
| `recipients.csv`        | ❌ No   | Contains real email addresses      |
| `assets/`               | ❌ No   | Large binary files                 |
| `logs/`                 | ❌ No   | Auto-generated runtime output      |
| `node_modules/`         | ❌ No   | Run `npm install` to restore       |
