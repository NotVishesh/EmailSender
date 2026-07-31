// ─────────────────────────────────────────────────────────────
//  send.js  —  Email Sender Script
//  Usage:  node send.js
//          node send.js --dry-run        (preview without sending)
//          node send.js --subject "My Subject"
// ─────────────────────────────────────────────────────────────

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { parse } from 'csv-parse/sync';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CLI args ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const subjectArg = args.find((a) => a.startsWith('--subject='));
const SUBJECT   = subjectArg
  ? subjectArg.split('=').slice(1).join('=')
  : (process.env.EMAIL_SUBJECT || 'Application for Product Designer');

// ── Config from .env ──────────────────────────────────────────
const SMTP_HOST    = process.env.SMTP_HOST    || 'smtp.gmail.com';
const SMTP_PORT    = Number(process.env.SMTP_PORT    || 465);
const SMTP_SECURE  = (process.env.SMTP_SECURE  || 'true') === 'true';
const SMTP_USER    = process.env.GOOGLE_SMTP_USER;
const SMTP_PASS    = process.env.GOOGLE_SMTP_PASS;
const DELAY_MS     = Number(process.env.SEND_DELAY_MS || 1200);
const MAX_RETRIES  = Number(process.env.MAX_RETRIES   || 2);

// ── Paths ─────────────────────────────────────────────────────
const CSV_FILE      = path.join(__dirname, 'recipients.csv');
const TEMPLATE_FILE = path.join(__dirname, 'template.html');
const ASSETS_DIR    = path.join(__dirname, 'assets');
const LOGS_DIR      = path.join(__dirname, 'logs');
const LOG_FILE      = path.join(LOGS_DIR, `send-${timestamp()}.log`);

// ── Helpers ───────────────────────────────────────────────────
function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Replace {{key}} placeholders with recipient values */
function personalize(html, recipient) {
  return html.replace(/{{\s*(\w+)\s*}}/g, (_, key) =>
    String(recipient[key] ?? 'there')
  );
}

/** Write to both console and log file */
function log(level, message) {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase().padEnd(5)}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// ── Validate setup ────────────────────────────────────────────
if (!SMTP_USER || !SMTP_PASS) {
  console.error('❌  GOOGLE_SMTP_USER and GOOGLE_SMTP_PASS must be set in .env');
  process.exit(1);
}
if (!fs.existsSync(CSV_FILE)) {
  console.error(`❌  recipients.csv not found at: ${CSV_FILE}`);
  process.exit(1);
}
if (!fs.existsSync(TEMPLATE_FILE)) {
  console.error(`❌  template.html not found at: ${TEMPLATE_FILE}`);
  process.exit(1);
}
fs.mkdirSync(LOGS_DIR, { recursive: true });

// ── Load recipients ───────────────────────────────────────────
const csvText    = fs.readFileSync(CSV_FILE, 'utf8');
const recipients = parse(csvText, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
  bom: true,
});

// ── Load template ─────────────────────────────────────────────
const templateHtml = fs.readFileSync(TEMPLATE_FILE, 'utf8');

// ── Load avatar attachments ───────────────────────────────────
const avatarFiles = fs.existsSync(ASSETS_DIR)
  ? fs.readdirSync(ASSETS_DIR).filter((f) => /\.(png|jpg|jpeg|gif|webp)$/i.test(f))
  : [];

const attachments = avatarFiles.map((filename) => ({
  filename,
  path: path.join(ASSETS_DIR, filename),
  cid: filename,          // matches src="cid:avatar-1.png" in template
}));

// ── SMTP transporter ──────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

// ── Stats ─────────────────────────────────────────────────────
const stats = { sent: 0, failed: 0, skipped: 0 };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Main send loop ────────────────────────────────────────────
async function run() {
  console.log('\n══════════════════════════════════════════');
  console.log(`  📧  Email Sender`);
  console.log(`  Subject  : ${SUBJECT}`);
  console.log(`  Recipients: ${recipients.length}`);
  console.log(`  Mode     : ${DRY_RUN ? '🔍 DRY RUN (no emails sent)' : '🚀 LIVE'}`);
  console.log(`  Log file : ${LOG_FILE}`);
  console.log('══════════════════════════════════════════\n');

  log('info', `Started — subject: "${SUBJECT}", recipients: ${recipients.length}, dry-run: ${DRY_RUN}`);

  for (const recipient of recipients) {
    const email = (recipient.email || '').trim();

    // ── Skip invalid emails ──
    if (!emailPattern.test(email)) {
      log('warn', `SKIPPED  ${email || '(empty)'} — invalid email address`);
      stats.skipped++;
      continue;
    }

    const personalizedSubject = personalize(SUBJECT, recipient);
    const personalizedHtml    = personalize(templateHtml, recipient);

    if (DRY_RUN) {
      log('info', `DRY-RUN  → ${email} | subject: "${personalizedSubject}"`);
      stats.sent++;
      continue;
    }

    // ── Send with retries ──
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
      try {
        const result = await transporter.sendMail({
          from: SMTP_USER,
          to: email,
          subject: personalizedSubject,
          html: personalizedHtml,
          attachments,
        });
        log('info', `✅ SENT     → ${email} | messageId: ${result.messageId}`);
        stats.sent++;
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (attempt <= MAX_RETRIES) {
          log('warn', `RETRY ${attempt}/${MAX_RETRIES} for ${email} — ${err.message}`);
          await sleep(500 * 2 ** (attempt - 1));
        }
      }
    }

    if (lastError) {
      log('error', `❌ FAILED   → ${email} — ${lastError.message}`);
      stats.failed++;
    }

    // ── Delay between sends ──
    await sleep(DELAY_MS);
  }

  // ── Summary ───────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════');
  console.log(`  ✅  Sent    : ${stats.sent}`);
  console.log(`  ❌  Failed  : ${stats.failed}`);
  console.log(`  ⏭️   Skipped : ${stats.skipped}`);
  console.log('══════════════════════════════════════════\n');
  log('info', `Done — sent: ${stats.sent}, failed: ${stats.failed}, skipped: ${stats.skipped}`);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
