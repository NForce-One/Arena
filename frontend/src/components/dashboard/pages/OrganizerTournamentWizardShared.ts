import type { AgeGroupDto, OrganizerTournamentDto } from '@nforce/shared';
import {
  TEAM_SELECTION_MODE_DESCRIPTIONS,
  TEAM_SELECTION_MODE_LABELS,
  TEAM_SELECTION_MODES,
  TOURNAMENT_GENDER_CATEGORIES,
  TOURNAMENT_GENDER_CATEGORY_LABELS,
  TOURNAMENT_NOTIFY_AUDIENCE_LABELS,
  TOURNAMENT_NOTIFY_AUDIENCES,
  TOURNAMENT_STRUCTURE_DESCRIPTIONS,
  TOURNAMENT_STRUCTURE_LABELS,
  TOURNAMENT_STRUCTURES,
  type TeamSelectionMode,
  type TournamentGenderCategory,
  type TournamentNotifyAudience,
  type TournamentStructure,
} from '@nforce/shared';

export interface AgeGroupDetailValues {
  bornAfter: string;
  bornBefore: string;
  genderCategory: TournamentGenderCategory | '';
  registrationStartDate: string;
  registrationEndDate: string;
  capacity: string;
  format: string;
  entryFee: string;
  oversPerInnings: string;
}

export interface TournamentWizardValues {
  name: string;
  description: string;
  structure: TournamentStructure | '';
  locationCity: string;
  locationState: string;
  teamSelectionMode: TeamSelectionMode | '';
  startDate: string;
  endDate: string;
  capacity: string;
  surfaceTypeId: string;
  maxMarqueePlayers: string;
  ageGroupIds: string[];
  ageGroupDetails: Record<string, AgeGroupDetailValues>;
  prizePoolAmount: string;
  prizePoolNote: string;
  rules: string;
  rulesDocumentFile: { contentType: string; data: string; fileName: string } | null;
  existingRulesDocumentUrl: string | null;
  removeRulesDocument: boolean;
  notifyOnPublish: boolean;
  notifyAudiences: TournamentNotifyAudience[];
  notifyState: string;
}

export function emptyWizardValues(): TournamentWizardValues {
  return {
    name: '',
    description: '',
    structure: '',
    locationCity: '',
    locationState: '',
    teamSelectionMode: '',
    startDate: '',
    endDate: '',
    capacity: '',
    surfaceTypeId: '',
    maxMarqueePlayers: '',
    ageGroupIds: [],
    ageGroupDetails: {},
    prizePoolAmount: '',
    prizePoolNote: '',
    rules: '',
    rulesDocumentFile: null,
    existingRulesDocumentUrl: null,
    removeRulesDocument: false,
    notifyOnPublish: false,
    notifyAudiences: ['everyone'],
    notifyState: '',
  };
}

export function wizardValuesFromTournament(t: OrganizerTournamentDto): TournamentWizardValues {
  const ageGroupIds = t.ageGroups.map((ag) => ag.ageGroupId);
  const ageGroupDetails: Record<string, AgeGroupDetailValues> = {};
  for (const ag of t.ageGroups) {
    ageGroupDetails[ag.ageGroupId] = {
      bornAfter: ag.bornAfter ?? '',
      bornBefore: ag.bornBefore ?? '',
      genderCategory: ag.genderCategory,
      registrationStartDate: ag.registrationStartDate.slice(0, 10),
      registrationEndDate: ag.registrationEndDate.slice(0, 10),
      capacity: ag.capacity != null ? String(ag.capacity) : '',
      format: ag.format,
      entryFee: ag.entryFee != null ? String(ag.entryFee) : '',
      oversPerInnings: ag.oversPerInnings != null ? String(ag.oversPerInnings) : '',
    };
  }
  return {
    name: t.name,
    description: t.description ?? '',
    structure: t.structure,
    locationCity: t.locationCity ?? '',
    locationState: t.locationState ?? '',
    teamSelectionMode: t.teamSelectionMode,
    startDate: t.startDate.slice(0, 10),
    endDate: t.endDate.slice(0, 10),
    capacity: t.capacity != null ? String(t.capacity) : '',
    surfaceTypeId: t.surfaceTypeId ?? '',
    maxMarqueePlayers: t.maxMarqueePlayers != null ? String(t.maxMarqueePlayers) : '',
    ageGroupIds,
    ageGroupDetails,
    prizePoolAmount: t.prizePoolAmount != null ? String(t.prizePoolAmount) : '',
    prizePoolNote: t.prizePoolDescription ?? '',
    rules: t.rules ?? '',
    rulesDocumentFile: null,
    existingRulesDocumentUrl: t.rulesDocumentUrl,
    removeRulesDocument: false,
    notifyOnPublish: t.notifyOnPublish,
    notifyAudiences: t.notifyAudiences,
    notifyState: t.notifyState ?? '',
  };
}

export function defaultAgeGroupDetail(_ageGroup: AgeGroupDto): AgeGroupDetailValues {
  return {
    bornAfter: '',
    bornBefore: '',
    genderCategory: '',
    registrationStartDate: '',
    registrationEndDate: '',
    capacity: '',
    format: 'T20',
    entryFee: '',
    oversPerInnings: '',
  };
}

export const TOURNAMENT_STRUCTURE_OPTIONS = TOURNAMENT_STRUCTURES.map((id) => ({
  id,
  label: TOURNAMENT_STRUCTURE_LABELS[id],
  description: TOURNAMENT_STRUCTURE_DESCRIPTIONS[id],
}));

export const TEAM_SELECTION_MODE_OPTIONS = TEAM_SELECTION_MODES.map((id) => ({
  id,
  label: TEAM_SELECTION_MODE_LABELS[id],
  description: TEAM_SELECTION_MODE_DESCRIPTIONS[id],
}));

export const GENDER_CATEGORY_OPTIONS = TOURNAMENT_GENDER_CATEGORIES.map((id) => ({
  id,
  label: TOURNAMENT_GENDER_CATEGORY_LABELS[id],
}));

export interface WizardStepId {
  id: 'basics' | 'setup' | 'ageGroups' | 'ageGroupDetails' | 'extras' | 'review';
  label: string;
}

export const WIZARD_STEPS: WizardStepId[] = [
  { id: 'basics', label: 'Basics' },
  { id: 'setup', label: 'Setup & Schedule' },
  { id: 'ageGroups', label: 'Age Groups' },
  { id: 'ageGroupDetails', label: 'Age Group Details' },
  { id: 'extras', label: 'Extras' },
  { id: 'review', label: 'Review & Create' },
];

export const FIELD_TO_STEP_INDEX: Record<string, number> = {
  name: 0,
  description: 0,
  structure: 0,
  locationCity: 0,
  locationState: 0,
  teamSelectionMode: 1,
  startDate: 1,
  endDate: 1,
  surfaceTypeId: 1,
  maxMarqueePlayers: 1,
  ageGroups: 2,
  prizePoolAmount: 4,
  prizePoolDescription: 4,
  rules: 4,
  notifyOnPublish: 4,
  notifyAudiences: 4,
  notifyState: 4,
};

export const NOTIFY_AUDIENCE_OPTIONS = TOURNAMENT_NOTIFY_AUDIENCES.map((id) => ({
  id,
  label: TOURNAMENT_NOTIFY_AUDIENCE_LABELS[id],
}));
