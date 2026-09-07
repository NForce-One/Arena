import { logger } from '../../lib/logger';
import type { EmailAdapter, EmailSendResult } from './EmailAdapter';

export class ConsoleEmailAdapter implements EmailAdapter {
  private print(kind: string, to: string, lines: string[]): void {
    const box = [
      '',
      `┌─── 📧 ${kind} ` + '─'.repeat(Math.max(1, 58 - kind.length)),
      `│ To: ${to}`,
      ...lines.map((l) => `│ ${l}`),
      '└' + '─'.repeat(64),
    ].join('\n');
    logger.info(box);
  }

  async sendVerificationEmail(params: {
    to: string;
    name: string;
    verifyUrl: string;
  }): Promise<void> {
    this.print('Verify your email', params.to, [
      `Hi ${params.name}, confirm your NForce Arena account:`,
      params.verifyUrl,
      '(link valid for 24 hours)',
    ]);
  }

  async sendPasswordResetEmail(params: {
    to: string;
    name: string;
    resetUrl: string;
  }): Promise<void> {
    this.print('Reset your password', params.to, [
      `Hi ${params.name}, reset your NForce Arena password:`,
      params.resetUrl,
      '(link valid for 60 minutes. Ignore this email if you did not ask)',
    ]);
  }

  async sendAccountClaimEmail(params: {
    to: string;
    childName: string;
    claimUrl: string;
  }): Promise<void> {
    this.print('Set up your own NForce Arena login', params.to, [
      `${params.childName}'s parent invited them to graduate to their own account:`,
      params.claimUrl,
      '(link valid for 7 days)',
    ]);
  }

  async sendEmailChangeEmail(params: {
    to: string;
    name: string;
    confirmUrl: string;
  }): Promise<void> {
    this.print('Confirm your new email', params.to, [
      `Hi ${params.name}, confirm this address as your new NForce Arena login email:`,
      params.confirmUrl,
      '(link valid for 24 hours. Ignore this email if you did not ask)',
    ]);
  }

  async sendExternalInviteEmail(params: {
    to: string;
    role: 'player' | 'team_manager';
    organizerName: string;
    organizerAcademyName: string | null;
    signupUrl: string;
    tournament: {
      name: string;
      structureLabel: string;
      ageGroupLabel: string;
      formatLabel: string;
      dateRange: string;
      location: string | null;
      entryFee: number | null;
    };
  }): Promise<void> {
    const { tournament: t } = params;
    const roleLabel = params.role === 'team_manager' ? 'Team Manager' : 'Player';
    this.print(`Join NForce Arena as a ${roleLabel}`, params.to, [
      params.role === 'team_manager'
        ? `${params.organizerName} invited you to manage a team for ${t.name}:`
        : `${params.organizerName} invited you to play in ${t.name}:`,
      `  ${t.formatLabel} · ${t.structureLabel} · ${t.ageGroupLabel}`,
      `  ${t.dateRange}${t.location ? ` · ${t.location}` : ''}`,
      `  Entry fee: ${t.entryFee != null ? t.entryFee.toLocaleString('en-US') : 'Free'}`,
      params.signupUrl,
      '(link valid for 7 days)',
    ]);
  }

  async sendNotificationEmail(params: {
    to: string;
    subject: string;
    body: string;
    infoCard?: { title: string; rows: { label: string; value: string }[] };
  }): Promise<EmailSendResult> {
    const cardLines = params.infoCard
      ? [
          `  ${params.infoCard.title}:`,
          ...params.infoCard.rows.map((r) => `    ${r.label}: ${r.value}`),
        ]
      : [];
    this.print(params.subject, params.to, [params.body, ...cardLines]);
    return { ok: true };
  }
}
