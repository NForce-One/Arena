import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import type { EmailAdapter, EmailSendResult } from './EmailAdapter';
import { renderEmail } from './emailTemplate';

export class SesEmailAdapter implements EmailAdapter {
  private readonly client: SESv2Client;

  constructor(
    private readonly from: string,
    private readonly logger: { error(obj: unknown, msg?: string): void },
    private readonly webOrigin: string,
  ) {
    this.client = new SESv2Client({});
  }

  private async send(to: string, subject: string, html: string): Promise<EmailSendResult> {
    try {
      await this.client.send(
        new SendEmailCommand({
          FromEmailAddress: this.from,
          Destination: { ToAddresses: [to] },
          Content: {
            Simple: {
              Subject: { Data: subject, Charset: 'UTF-8' },
              Body: { Html: { Data: html, Charset: 'UTF-8' } },
            },
          },
        }),
      );
      return { ok: true };
    } catch (error) {
      this.logger.error({ error, to, subject }, 'SES email send failed');
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async sendVerificationEmail(params: {
    to: string;
    name: string;
    verifyUrl: string;
  }): Promise<void> {
    const html = renderEmail({
      preheader: 'Confirm your email to start browsing and registering for tournaments.',
      heading: `Welcome to Arena, ${params.name}!`,
      bodyText:
        "You're one step from an NForce Arena account. Organize tournaments, register a team, book grounds or take umpire appointments, all in one place.\n\nConfirm your email address to activate your account.",
      cta: { label: 'Verify your email', url: params.verifyUrl },
      note: 'This link is valid for 24 hours. If you didn’t create this account, you can ignore this email.',
    });
    await this.send(params.to, 'Welcome to Arena: confirm your email', html);
  }

  async sendPasswordResetEmail(params: {
    to: string;
    name: string;
    resetUrl: string;
  }): Promise<void> {
    const html = renderEmail({
      preheader: 'Reset your NForce Arena password.',
      heading: `Reset your password, ${params.name}`,
      bodyText:
        'We received a request to reset the password on your NForce Arena account. Choose a new password to continue.',
      cta: { label: 'Reset password', url: params.resetUrl },
      note: 'This link is valid for 60 minutes. If you didn’t request this, you can safely ignore this email. Your password won’t change.',
    });
    await this.send(params.to, 'Reset your NForce Arena password', html);
  }

  async sendAccountClaimEmail(params: {
    to: string;
    childName: string;
    claimUrl: string;
  }): Promise<void> {
    const html = renderEmail({
      preheader: `${params.childName}'s parent invited them to set up their own login.`,
      heading: `Set up ${params.childName}'s own NForce Arena account`,
      bodyText: `${params.childName}'s parent added them as a managed player and has now invited them to graduate to their own independent login. Choose a password to finish setting up the account. Everything already on it (registrations, teams, results) stays exactly as it is.`,
      cta: { label: 'Set up login', url: params.claimUrl },
      note: 'This link is valid for 7 days.',
    });
    await this.send(params.to, `Set up ${params.childName}'s own NForce Arena login`, html);
  }

  async sendEmailChangeEmail(params: {
    to: string;
    name: string;
    confirmUrl: string;
  }): Promise<void> {
    const html = renderEmail({
      preheader: 'Confirm this address as your new NForce Arena login email.',
      heading: 'Confirm your new email',
      bodyText: `Hi ${params.name}, confirm this address as your new NForce Arena login email. Your account won't switch over until you click below.`,
      cta: { label: 'Confirm new email', url: params.confirmUrl },
      note: 'This link is valid for 24 hours. If you didn’t request this, you can safely ignore this email. Your login email won’t change.',
    });
    await this.send(params.to, 'Confirm your new NForce Arena email', html);
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
    const { tournament } = params;
    const roleLabel = params.role === 'team_manager' ? 'Team Manager' : 'Player';
    const organizerDisplay = params.organizerAcademyName
      ? `${params.organizerName} (${params.organizerAcademyName})`
      : params.organizerName;
    const html = renderEmail({
      preheader: `${params.organizerName} invited you to ${
        params.role === 'team_manager' ? 'manage a team for' : 'play in'
      } ${tournament.name}.`,
      heading: `You're invited to ${tournament.name}`,
      bodyText:
        params.role === 'team_manager'
          ? `${params.organizerName} invited you to manage a team for ${tournament.name}. Create your account, then build your squad — your invitation to this tournament will be waiting the moment your team exists.`
          : `${params.organizerName} invited you to play in ${tournament.name}. Create your account to see and accept the invitation.`,
      infoCard: {
        title: 'Tournament details',
        rows: [
          { label: 'Format', value: `${tournament.formatLabel} · ${tournament.structureLabel}` },
          { label: 'Category', value: tournament.ageGroupLabel },
          { label: 'Dates', value: tournament.dateRange },
          ...(tournament.location ? [{ label: 'Location', value: tournament.location }] : []),
          {
            label: 'Entry fee',
            value:
              tournament.entryFee != null ? tournament.entryFee.toLocaleString('en-US') : 'Free',
          },
          { label: 'Organized by', value: organizerDisplay },
        ],
      },
      cta: { label: 'Create your account', url: params.signupUrl },
      note: 'This link is valid for 7 days.',
    });
    await this.send(params.to, `Join NForce Arena as a ${roleLabel}`, html);
  }

  async sendNotificationEmail(params: {
    to: string;
    subject: string;
    body: string;
    infoCard?: { title: string; rows: { label: string; value: string }[] };
  }): Promise<EmailSendResult> {
    const html = renderEmail({
      preheader: params.body.slice(0, 140),
      heading: params.subject,
      bodyText: params.body,
      infoCard: params.infoCard,
      cta: { label: 'Open NForce Arena', url: `${this.webOrigin}/notifications` },
    });
    return this.send(params.to, params.subject, html);
  }
}
