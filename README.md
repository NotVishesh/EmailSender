# 📧 Email Sender

A fully standalone email sender. Edit the template, add recipients, and run one command.

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
The email template uses 6 avatar images referenced as `cid:avatar-1.png` … `cid:avatar-6.png`.
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
├── .env              ← SMTP credentials (do NOT share/commit)
├── recipients.csv    ← Add all recipient emails here
├── template.html     ← Edit this to change the email design
├── send.js           ← The script you run
├── assets/           ← Avatar images used in the email
│   ├── avatar-1.png
│   ├── avatar-2.png
│   └── ...
└── logs/             ← Auto-created; one log file per send run
```

---

## Quick Start

### 1. Install dependencies (one time only)
```bash
npm install
```

### 2. Edit recipients
Open `recipients.csv` and add your recipients:
```csv
email,firstName,company,role
someone@example.com,Alex,Acme Corp,Product Designer
another@example.com,Sam,Northstar,UX Lead
```

### 3. Edit the email template (optional)
Open `template.html` — each card section is clearly commented.
You can change text, colors, layout, or add/remove cards freely.

### 4. Send emails
```bash
node send.js
```

### Dry run (preview without sending)
```bash
node send.js --dry-run
```

### Custom subject line
```bash
node send.js --subject="Application for UX Designer"
```

Or set it permanently in `.env`:
```
EMAIL_SUBJECT=Application for UX Designer
```

---

## Template Placeholders

Use `{{columnName}}` anywhere in `template.html` or the subject line.
Column names come from the headers in `recipients.csv`.

| Placeholder     | Source column in CSV |
|-----------------|----------------------|
| `{{firstName}}` | `firstName`          |
| `{{company}}`   | `company`            |
| `{{role}}`      | `role`               |
| `{{email}}`     | `email`              |
| `{{custom1}}`   | `custom1`            |

Example usage in template:
```html
<p>Hi {{firstName}}, I'd love to join {{company}} as a {{role}}.</p>
```

---

## Logs

Every run creates a timestamped log in the `logs/` folder:
```
logs/send-2026-08-01T01-40-00.log
```

Each line shows:
- `✅ SENT` — email delivered with message ID
- `❌ FAILED` — error message
- `⏭ SKIPPED` — invalid email address

---

## .env Reference

| Key                | Description                          | Default         |
|--------------------|--------------------------------------|-----------------|
| `GOOGLE_SMTP_USER` | Your Gmail address                   | —               |
| `GOOGLE_SMTP_PASS` | Gmail App Password                   | —               |
| `SMTP_HOST`        | SMTP server                          | smtp.gmail.com  |
| `SMTP_PORT`        | SMTP port                            | 465             |
| `SMTP_SECURE`      | Use TLS                              | true            |
| `SEND_DELAY_MS`    | Delay between sends (ms)             | 1200            |
| `MAX_RETRIES`      | Retry attempts on failure            | 2               |
| `EMAIL_SUBJECT`    | Default subject (override with CLI)  | —               |
