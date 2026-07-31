// ─────────────────────────────────────────────────────────────
//  send.js  —  Email Sender Script
//  Usage:  node send.js
//          node send.js --dry-run        (preview without sending)
//          node send.js --subject="My Subject"
// ─────────────────────────────────────────────────────────────

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { parse } from 'csv-parse/sync';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CLI args ──────────────────────────────────────────────────
const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const subjectArg = args.find((a) => a.startsWith('--subject='));

// ── Config from .env ──────────────────────────────────────────
const SMTP_HOST   = process.env.SMTP_HOST    || 'smtp.gmail.com';
const SMTP_PORT   = Number(process.env.SMTP_PORT   || 465);
const SMTP_SECURE = (process.env.SMTP_SECURE || 'true') === 'true';
const SMTP_USER   = process.env.GOOGLE_SMTP_USER;
const SMTP_PASS   = process.env.GOOGLE_SMTP_PASS;
const DELAY_MS    = Number(process.env.SEND_DELAY_MS || 1200);
const MAX_RETRIES = Number(process.env.MAX_RETRIES   || 2);

// ── Paths ─────────────────────────────────────────────────────
const CSV_FILE      = path.join(__dirname, 'recipients.csv');
const TEMPLATE_FILE = path.join(__dirname, 'template.html');
const CONTENT_FILE  = path.join(__dirname, 'content.json');
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
function personalize(text, recipient) {
  return text.replace(/{{\s*(\w+)\s*}}/g, (_, key) => String(recipient[key] ?? 'there'));
}
function escape(str) {
  return String(str).replace(/[&<>'"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])
  );
}
function log(level, message) {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase().padEnd(5)}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// ── Build one card's HTML from a card object ──────────────────
function buildCardHtml(card) {
  const { title, body, background, avatar, side, links = [] } = card;

  const avatarImg = `<img src="cid:${escape(avatar)}" width="205" alt=""
    style="display:block;width:205px;max-width:100%;height:auto;border:0;" />`;

  // Render link buttons if any
  const linksHtml = links.length
    ? `<div style="margin-top:14px;">
        ${links.map((l) => `
          <a href="${escape(l.url)}"
             style="display:inline-block;margin:4px 6px 4px 0;padding:8px 18px;
                    border-radius:20px;background:${escape(l.color || '#1d4f91')};
                    color:#fff;font-size:14px;font-weight:600;
                    text-decoration:none;font-family:Arial,sans-serif;">
            ${escape(l.label)}
          </a>`).join('')}
       </div>`
    : '';

  const textCell = `
    <td style="padding:24px 16px 20px;font-family:Arial,sans-serif;vertical-align:middle;">
      <div style="font-family:cursive;font-size:27px;line-height:1.15;font-weight:700;color:#1d4f91;">
        ${escape(title)}
      </div>
      <p style="margin:13px 0 0;font-size:17px;line-height:1.5;color:#171717;">
        ${escape(body)}
      </p>
      ${linksHtml}
    </td>`;

  const avatarCell = `<td width="42%" style="vertical-align:bottom;">${avatarImg}</td>`;
  const avatarCellRight = `<td width="42%" style="vertical-align:bottom;text-align:right;">${avatarImg}</td>`;

  const row = side === 'left'
    ? `${avatarCell}${textCell}`
    : `${textCell}${avatarCellRight}`;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="margin:0 0 22px;border-radius:30px;background:${escape(background)};overflow:hidden;">
      <tr>${row}</tr>
    </table>`;
}

// ── Build attachments section HTML ────────────────────────────
function buildAttachmentsSectionHtml(resolvedAttachments) {
  if (!resolvedAttachments.length) return '';

  const items = resolvedAttachments.map((a) => `
    <tr>
      <td style="padding:6px 0;font-size:16px;color:#333;font-family:Arial,sans-serif;">
        ${escape(a.emoji || '📎')} <strong>${escape(a.label)}</strong>
        <span style="font-size:13px;color:#888;margin-left:8px;">— attached</span>
      </td>
    </tr>`).join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="margin:22px 0;border-radius:20px;background:#f9f9f7;
                  border:1px solid #e8e4df;overflow:hidden;">
      <tr>
        <td style="padding:18px 22px;">
          <div style="font-family:cursive;font-size:20px;font-weight:700;
                      color:#1d4f91;margin-bottom:10px;">
            📎 Attached Documents
          </div>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            ${items}
          </table>
        </td>
      </tr>
    </table>`;
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
if (!fs.existsSync(CONTENT_FILE)) {
  console.error(`❌  content.json not found at: ${CONTENT_FILE}`);
  process.exit(1);
}
fs.mkdirSync(LOGS_DIR, { recursive: true });

// ── Load content.json ─────────────────────────────────────────
const content = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
const SUBJECT = subjectArg
  ? subjectArg.split('=').slice(1).join('=')
  : (process.env.EMAIL_SUBJECT || content.subject || 'Hello');

// ── Build cards HTML ──────────────────────────────────────────
const cardsHtml = (content.cards || []).map(buildCardHtml).join('');

// ── Resolve attachments (skip missing files) ──────────────────
const resolvedAttachments = (content.attachments || []).filter((a) => {
  const exists = fs.existsSync(a.path);
  if (!exists) {
    console.warn(`⚠️  Attachment not found, skipping: [${a.label}] ${a.path}`);
  }
  return exists;
});

const attachmentsSectionHtml = buildAttachmentsSectionHtml(resolvedAttachments);

// Nodemailer attachment objects for the files that exist
const fileAttachments = resolvedAttachments.map((a) => ({
  filename: path.basename(a.path),
  path: a.path,
}));

// ── Build footer HTML ─────────────────────────────────────────
const footerText = (content.footer || 'Looking forward to connecting!\nVishe')
  .split('\n')
  .map(escape)
  .join('<br>');

// ── Load avatar CID attachments ───────────────────────────────
const avatarAttachments = fs.existsSync(ASSETS_DIR)
  ? fs.readdirSync(ASSETS_DIR)
      .filter((f) => /\.(png|jpg|jpeg|gif|webp)$/i.test(f))
      .map((filename) => ({
        filename,
        path: path.join(ASSETS_DIR, filename),
        cid: filename,
      }))
  : [];

// ── Load template and inject static parts ────────────────────
const templateShell = fs.readFileSync(TEMPLATE_FILE, 'utf8');
const baseHtml = templateShell
  .replace('{{CARDS}}', cardsHtml)
  .replace('{{ATTACHMENTS_SECTION}}', attachmentsSectionHtml)
  .replace('{{FOOTER}}', footerText);

// ── Load recipients ───────────────────────────────────────────
const csvText    = fs.readFileSync(CSV_FILE, 'utf8');
const recipients = parse(csvText, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
  bom: true,
});

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
  console.log(`  Subject    : ${SUBJECT}`);
  console.log(`  Recipients : ${recipients.length}`);
  console.log(`  Cards      : ${(content.cards || []).length}`);
  console.log(`  Attachments: ${fileAttachments.length} (${resolvedAttachments.map((a) => a.label).join(', ') || 'none'})`);
  console.log(`  Mode       : ${DRY_RUN ? '🔍 DRY RUN (no emails sent)' : '🚀 LIVE'}`);
  console.log(`  Log file   : ${LOG_FILE}`);
  console.log('══════════════════════════════════════════\n');

  log('info', `Started — subject: "${SUBJECT}", recipients: ${recipients.length}, dry-run: ${DRY_RUN}`);
  log('info', `Attachments: ${fileAttachments.map((a) => a.filename).join(', ') || 'none'}`);

  for (const recipient of recipients) {
    const email = (recipient.email || '').trim();

    if (!emailPattern.test(email)) {
      log('warn', `SKIPPED  ${email || '(empty)'} — invalid email address`);
      stats.skipped++;
      continue;
    }

    const personalizedSubject = personalize(SUBJECT, recipient);
    const personalizedHtml    = personalize(baseHtml, recipient);

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
          attachments: [...avatarAttachments, ...fileAttachments],
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

    await sleep(DELAY_MS);
  }

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
