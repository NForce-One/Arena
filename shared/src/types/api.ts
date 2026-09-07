import type { RoleName } from './roles';
import type { PaymentStatusValue } from '../schemas/registrations';
import type {
  BattingStyle,
  BowlingStyle,
  Gender,
  HeightUnit,
  JerseySize,
  PlayingRole,
  WeightUnit,
} from '../schemas/sportsProfile';

export interface ApiErrorDetail {
  path: string;
  message: string;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[] | unknown;
    requestId?: string;
  };
}

export interface AuthUserDto {
  id: string;
  name: string;
  email: string;
  verified: boolean;
  roles: RoleName[];
}

export interface AdminUserDto extends AuthUserDto {
  createdAt: string;
  clubId: string | null;
}

export interface ProfileDto {
  id: string;
  name: string;
  email: string;
  dateOfBirth: string | null;
  photoUrl: string | null;
  clubId: string | null;
  academyName: string | null;
  state: string | null;
  notifyPublishStates: string[];
  phone: string | null;
  school: string | null;
  jerseyNumber: number | null;
  jerseyName: string | null;
  jerseySize: JerseySize | null;
  battingStyle: BattingStyle | null;
  battingStyleOther: string | null;
  bowlingStyle: BowlingStyle | null;
  bowlingStyleOther: string | null;
  playingRole: PlayingRole | null;
  heightValue: number | null;
  heightUnit: HeightUnit | null;
  weightValue: number | null;
  weightUnit: WeightUnit | null;
  gender: Gender | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  consentConfirmed: boolean;
  consentDate: string | null;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface TournamentAgeGroupDto {
  id: string;
  ageGroupId: string;
  name: string;
  bornAfter: string | null;
  bornBefore: string | null;
  genderCategory: 'mens' | 'womens' | 'mixed';
  registrationStartDate: string;
  registrationEndDate: string;
  capacity: number | null;
  registeredCount: number;
  format: string;
  entryFee: number | null;
  oversPerInnings: number | null;
}

export interface PublicTournamentSummaryDto {
  id: string;
  name: string;
  description: string | null;
  structure: 'round_robin' | 'knockout' | 'round_robin_knockout';
  teamSelectionMode: 'prebuilt_rosters' | 'draft_based';
  ageGroups: TournamentAgeGroupDto[];
  startDate: string;
  endDate: string;
  rules: string | null;
  rulesDocumentUrl: string | null;
  prizePoolAmount: number | null;
  prizePoolDescription: string | null;
  locationCity: string | null;
  locationState: string | null;
  surfaceTypeName: string | null;
  maxMarqueePlayers: number | null;
  capacity: number | null;
  registeredCount: number;
  status: 'published' | 'closed' | 'draft';
  organizerName: string;
  organizerAcademyName: string | null;
  teamsCount: number;
  fixtureDates: string[];
}

export interface PlayerInningsScoreDto {
  userId: string;
  playerName: string;
  runs: number;
  wickets: number;
}

export interface PublicFixtureDto {
  id: string;
  homeTeam: string;
  awayTeam: string;
  ground: string | null;
  startsAt: string;
  durationMinutes: number;
  result: {
    homeScore: string;
    awayScore: string;
    winnerTeam: string | null;
    homeRunsTotal: number | null;
    awayRunsTotal: number | null;
    homePlayerScores: PlayerInningsScoreDto[];
    awayPlayerScores: PlayerInningsScoreDto[];
  } | null;
}

export interface ChildFixtureEntryDto {
  fixture: PublicFixtureDto;
  tournamentName: string;
  perspective: string;
}

export interface PublicStandingDto {
  team: string;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  points: number;
}

export interface PublicTournamentDetailDto extends PublicTournamentSummaryDto {
  fixtures: PublicFixtureDto[];
  standings: PublicStandingDto[];
}

export interface OrganizerTournamentDto {
  id: string;
  name: string;
  description: string | null;
  structure: 'round_robin' | 'knockout' | 'round_robin_knockout';
  teamSelectionMode: 'prebuilt_rosters' | 'draft_based';
  ageGroups: TournamentAgeGroupDto[];
  startDate: string;
  endDate: string;
  capacity: number | null;
  registeredCount: number;
  rules: string | null;
  rulesDocumentUrl: string | null;
  prizePoolAmount: number | null;
  prizePoolDescription: string | null;
  locationCity: string | null;
  locationState: string | null;
  surfaceTypeId: string | null;
  maxMarqueePlayers: number | null;
  notifyOnPublish: boolean;
  notifyAudiences: ('everyone' | 'last_year_players' | 'last_year_managers' | 'state')[];
  notifyState: string | null;
  status: 'draft' | 'published' | 'closed';
  organizerId: string;
  createdAt: string;
}

export interface SurfaceTypeDto {
  id: string;
  name: string;
  organizerId: string | null;
}

export interface RosterMemberDto {
  userId: string;
  name: string;
  email: string;
  isManagedChild: boolean;
  managedByParentName: string | null;
  roleInTeam: 'captain' | 'player';
  status: 'invited' | 'requested' | 'accepted' | 'declined';
  joinedAt: string;
}

export interface TeamDto {
  id: string;
  name: string;
  managerId: string;
  managerName: string;
  roster: RosterMemberDto[];
}

export interface TeamSearchResultDto {
  id: string;
  name: string;
  managerName: string;
}

export interface PlayerSearchResultDto {
  id: string;
  name: string;
  managedByParentName: string | null;
}

export interface RecruitablePlayerDto {
  userId: string;
  name: string;
  email: string;
  isManagedChild: boolean;
  managedByParentName: string | null;
}

export interface RecruitingTeamDto {
  teamId: string;
  name: string;
}

export interface RosterStatusEntryDto {
  userId: string;
  name: string;
  roleInTeam: 'captain' | 'player';
  status: 'invited' | 'requested' | 'accepted' | 'declined';
  eligible: boolean;
  paymentStatus: PaymentStatusValue;
  paymentAmountPaid: number | null;
}

export interface TeamRegistrationDetailDto {
  registrationId: string;
  teamId: string;
  teamName: string;
  managerName: string;
  managerAcademyName: string | null;
  status: 'active' | 'withdrawn';
  roster: RosterStatusEntryDto[];
  tournamentAgeGroupId: string;
  capacityOverridden: boolean;
  teamPaymentStatus: PaymentStatusValue;
  teamPaymentAmountPaid: number | null;
}

export interface PlayerRegistrationDetailDto {
  registrationId: string;
  userId: string;
  name: string;
  paymentStatus: PaymentStatusValue;
  paymentAmountPaid: number | null;
  eligible: boolean;
  tournamentAgeGroupId: string;
  capacityOverridden: boolean;
}

export interface OrganizerRegistrationsDto {
  teams: TeamRegistrationDetailDto[];
  players: PlayerRegistrationDetailDto[];
}

export interface MyRosterInvitationDto {
  teamId: string;
  teamName: string;
  roleInTeam: 'captain' | 'player';
}

export interface RegistrationDto {
  id: string;
  entityType: 'player' | 'team';
  entityId: string;
  entityName: string;
  status: 'active' | 'withdrawn';
  tournamentAgeGroupId: string;
  ageGroupLabel: string;
  createdAt: string;
  capacityOverridden: boolean;
  eligible?: boolean;
}

export interface TournamentInvitationDto {
  id: string;
  tournamentId: string;
  tournamentName: string;
  entityType: 'team' | 'player';
  entityId: string;
  entityName: string;
  tournamentAgeGroupId: string;
  ageGroupLabel: string;
  status: 'invited' | 'accepted' | 'declined';
  createdAt: string;
  capacityOverridden: boolean;
}

export interface ExternalInviteDto {
  id: string;
  email: string;
  role: 'player' | 'team_manager';
  tournamentId: string | null;
  tournamentName: string | null;
  tournamentAgeGroupId: string | null;
  ageGroupLabel: string | null;
  status: 'pending' | 'fulfilled';
  createdAt: string;
}

export interface PendingManagerInviteDto {
  tournamentId: string;
  tournamentName: string;
  organizerName: string;
}

export interface ExternalInvitePreviewDto {
  email: string;
  role: 'player' | 'team_manager';
  organizerName: string;
  tournamentName: string | null;
  ageGroupLabel: string | null;
}

export type SendExternalInviteResultDto =
  | { outcome: 'invited_by_email' }
  | { outcome: 'invited_directly'; name: string }
  | { outcome: 'access_granted'; name: string };

export interface FixtureUmpireDto {
  umpireId: string;
  umpireName: string;
  status: 'applied' | 'invited' | 'accepted' | 'declined' | 'withdrawn';
}

export interface FixtureDto {
  id: string;
  tournamentId: string;
  homeTeamId: string;
  homeTeam: string;
  awayTeamId: string;
  awayTeam: string;
  groundId: string | null;
  ground: string | null;
  groundBookingStatus: 'requested' | 'confirmed' | 'declined' | 'cancelled' | null;
  startsAt: string;
  durationMinutes: number;
  umpires: FixtureUmpireDto[];
  ageGroupId: string | null;
  ageGroupLabel: string | null;
}

export interface UmpireDirectoryEntryDto {
  id: string;
  name: string;
  email: string;
  verified: boolean;
}

export interface OpenFixtureDto {
  id: string;
  tournamentId: string;
  tournamentName: string;
  homeTeam: string;
  awayTeam: string;
  ground: string | null;
  startsAt: string;
  durationMinutes: number;
  myStatus: 'applied' | 'invited' | 'accepted' | 'declined' | 'withdrawn' | null;
}

export interface UmpireScheduleEntryDto {
  fixtureId: string;
  tournamentName: string;
  homeTeam: string;
  awayTeam: string;
  ground: string | null;
  startsAt: string;
  durationMinutes: number;
}

export interface TeamRosterOptionDto {
  teamId: string;
  players: { userId: string; name: string }[];
}
export interface FixtureRostersDto {
  home: TeamRosterOptionDto;
  away: TeamRosterOptionDto;
}

export interface ResultDto {
  fixtureId: string;
  homeScore: string;
  awayScore: string;
  winnerTeamId: string | null;
  enteredByName: string;
  enteredAt: string;
  homeRunsTotal: number | null;
  awayRunsTotal: number | null;
  homePlayerScores: PlayerInningsScoreDto[];
  awayPlayerScores: PlayerInningsScoreDto[];
}

export interface AvailabilityRuleDto {
  days: string;
  from: string;
  to: string;
  startDate?: string | null;
  endDate?: string | null;
}

export interface GroundDto {
  id: string;
  name: string;
  location: string;
  capacity: number | null;
  facilities: string[];
  availabilityRules: AvailabilityRuleDto[];
  ownerId: string;
}

export interface GroundSearchResultDto {
  id: string;
  name: string;
  location: string;
  capacity: number | null;
  facilities: string[];
  availabilityRules: AvailabilityRuleDto[];
}

export interface GroundBookingDto {
  id: string;
  groundId: string;
  groundName: string;
  requesterId: string;
  requesterName: string;
  fixtureId: string | null;
  startsAt: string;
  endsAt: string;
  status: 'requested' | 'confirmed' | 'declined' | 'cancelled';
}

export interface AgeGroupDto {
  id: string;
  name: string;
  minAge: number | null;
  maxAge: number | null;
  organizerId: string | null;
}

export interface PlayerTournamentStatDto {
  tournamentId: string;
  tournamentName: string;
  teamName: string;
  roleInTeam: 'captain' | 'player';
  played: number;
  won: number;
  lost: number;
  runsScored: number;
}

export interface PublicPlayerProfileDto {
  id: string;
  name: string;
  photoUrl: string | null;
  tournaments: PlayerTournamentStatDto[];
  school: string | null;
  jerseyNumber: number | null;
  jerseyName: string | null;
  jerseySize: JerseySize | null;
  battingStyle: BattingStyle | null;
  battingStyleOther: string | null;
  bowlingStyle: BowlingStyle | null;
  bowlingStyleOther: string | null;
  playingRole: PlayingRole | null;
  heightValue: number | null;
  heightUnit: HeightUnit | null;
  weightValue: number | null;
  weightUnit: WeightUnit | null;
  gender: Gender | null;
  consentConfirmed: boolean;
  consentDate: string | null;
}

export interface OrganizerPlayerProfileDto extends PublicPlayerProfileDto {
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

export interface RoleRequestDto {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  requestedRole: RoleName;
  status: 'pending' | 'approved' | 'denied';
  createdAt: string;
  decidedAt: string | null;
}

export interface ContactMessageDto {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  message: string;
  status: 'open' | 'resolved';
  createdAt: string;
  resolvedAt: string | null;
}

export interface ChildDto {
  id: string;
  name: string;
  dateOfBirth: string;
  age: number;
  isMinor: boolean;
  approachingAdulthood: boolean;
  claimInviteSentAt: string | null;
  photoUrl: string | null;
  consentConfirmed: boolean;
  jerseyNumber: number | null;
  jerseyName: string | null;
  clubId: string | null;
}

export interface AdminChildDto extends ChildDto {
  parentId: string;
  parentName: string;
  parentEmail: string;
}

export interface FamilyRegistrationDto {
  registrationId: string;
  childId: string;
  childName: string;
  tournamentId: string;
  tournamentName: string;
  tournamentAgeGroupId: string;
  ageGroupLabel: string;
  status: 'active' | 'withdrawn';
  createdAt: string;
}

export interface AuditEntryDto {
  id: string;
  action: string;
  actorName: string | null;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
  meta: unknown;
  metaLabels: Record<string, string>;
  ip: string | null;
  createdAt: string;
}
