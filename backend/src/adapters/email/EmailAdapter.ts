export type EmailSendResult = { ok: true } | { ok: false; reason: string };

export interface EmailAdapter {
  sendVerificationEmail(params: { to: string; name: string; verifyUrl: string }): Promise<void>;
  sendPasswordResetEmail(params: { to: string; name: string; resetUrl: string }): Promise<void>;
  sendAccountClaimEmail(params: { to: string; childName: string; claimUrl: string }): Promise<void>;
  sendEmailChangeEmail(params: { to: string; name: string; confirmUrl: string }): Promise<void>;
  sendExternalInviteEmail(params: {
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
  }): Promise<void>;
  sendNotificationEmail(params: {
    to: string;
    subject: string;
    body: string;
    infoCard?: { title: string; rows: { label: string; value: string }[] };
  }): Promise<EmailSendResult>;
}
