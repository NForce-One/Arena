import { NFORCE_LOGO_BASE64 } from './logoBase64';

const RED = '#e11b22';
const INK = '#14161a';
const TEXT = '#1a1c20';
const MUTED = '#6b7280';
const LINE = '#e7e5e3';
const OUTER_BG = '#f3f1ef';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${TEXT};">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`,
    )
    .join('');
}

export interface EmailInfoCardRow {
  label: string;
  value: string;
}

export interface EmailLayoutParams {
  preheader: string;
  heading: string;
  bodyText: string;
  infoCard?: { title: string; rows: EmailInfoCardRow[] };
  cta?: { label: string; url: string };
  note?: string;
}

function renderInfoCard(card: NonNullable<EmailLayoutParams['infoCard']>): string {
  const rowsHtml = card.rows
    .map(
      (row, i) => `<tr>
          <td style="padding:11px 18px;${i < card.rows.length - 1 ? `border-bottom:1px solid ${LINE};` : ''}">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${MUTED};white-space:nowrap;">${escapeHtml(row.label)}</td>
                <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:13.5px;font-weight:700;color:${TEXT};padding-left:16px;">${escapeHtml(row.value)}</td>
              </tr>
            </table>
          </td>
        </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 24px;border:1px solid ${LINE};border-radius:12px;overflow:hidden;">
      <tr>
        <td style="background:#faf9f8;padding:11px 18px;border-bottom:1px solid ${LINE};border-top:3px solid ${RED};">
          <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};">${escapeHtml(card.title)}</span>
        </td>
      </tr>
      ${rowsHtml}
    </table>`;
}

export function renderEmail({
  preheader,
  heading,
  bodyText,
  infoCard,
  cta,
  note,
}: EmailLayoutParams): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:${OUTER_BG};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${OUTER_BG};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${LINE};">
            <tr>
              <td style="background:${INK};padding:24px 32px;border-bottom:3px solid ${RED};">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right:12px;vertical-align:middle;">
                      <img src="data:image/png;base64,${NFORCE_LOGO_BASE64}" width="36" height="41" alt="" style="display:block;border:0;">
                    </td>
                    <td style="vertical-align:middle;">
                      <span style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:800;letter-spacing:0.04em;color:#ffffff;">
                        NFORCE <span style="font-weight:400;color:#ffffff;">ARENA</span>
                      </span>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10.5px;font-weight:700;letter-spacing:0.18em;color:rgba(255,255,255,0.65);margin-top:4px;">
                        HOST. COMPETE. WIN.
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px 8px;">
                <h1 style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;color:${TEXT};">
                  ${escapeHtml(heading)}
                </h1>
                <div style="font-family:Arial,Helvetica,sans-serif;">
                  ${paragraphs(bodyText)}
                </div>
                ${infoCard ? renderInfoCard(infoCard) : ''}
                ${
                  cta
                    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
                  <tr>
                    <td style="border-radius:10px;background:${RED};">
                      <a href="${cta.url}" style="display:inline-block;padding:13px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
                        ${escapeHtml(cta.label)}
                      </a>
                    </td>
                  </tr>
                </table>`
                    : ''
                }
                ${note ? `<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${MUTED};">${escapeHtml(note)}</p>` : ''}
                ${
                  cta
                    ? `<p style="margin:20px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:${MUTED};word-break:break-all;">
                  Button not working? Paste this link into your browser:<br>
                  <a href="${cta.url}" style="color:${RED};">${escapeHtml(cta.url)}</a>
                </p>`
                    : ''
                }
              </td>
            </tr>
            <tr>
              <td style="height:24px;"></td>
            </tr>
          </table>
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
            <tr>
              <td style="padding:20px 8px 0;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${MUTED};">
                © 2026 NForceOne. NForce Arena: cricket tournament management.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
