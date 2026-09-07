import { z } from 'zod';
import {
  dateOnly,
  notifyAudiencesSchema,
  teamSelectionModeSchema,
  toTitleCase,
  tournamentStructureSchema,
} from './tournaments';

export const wizardBasicsFormatSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(150),
  description: z.string().trim().max(4000).nullish(),
  structure: tournamentStructureSchema,
  locationCity: z.string().trim().min(1, 'City is required').max(100).transform(toTitleCase),
  locationState: z.string().trim().min(1, 'State is required').max(100).transform(toTitleCase),
});
export type WizardBasicsFormatInput = z.infer<typeof wizardBasicsFormatSchema>;

export const wizardSetupScheduleSchema = z
  .object({
    teamSelectionMode: teamSelectionModeSchema,
    startDate: dateOnly('Start date'),
    endDate: dateOnly('End date'),
    capacity: z.number().int().positive().nullish(),
    surfaceTypeId: z.string().min(1).nullish(),
    maxMarqueePlayers: z.number().int().positive().max(50).nullish(),
  })
  .refine((v) => new Date(v.startDate) <= new Date(v.endDate), {
    message: 'Start date must not be after the end date',
    path: ['endDate'],
  });
export type WizardSetupScheduleInput = z.infer<typeof wizardSetupScheduleSchema>;

export const wizardAgeGroupSelectSchema = z.object({
  ageGroupIds: z.array(z.string()).min(1, 'Select at least one age group'),
});
export type WizardAgeGroupSelectInput = z.infer<typeof wizardAgeGroupSelectSchema>;

export const wizardExtrasSchema = z
  .object({
    prizePoolAmount: z.number().nonnegative().nullish(),
    prizePoolDescription: z.string().trim().max(1000).nullish(),
    rules: z.string().trim().max(10000).nullish(),
    notifyOnPublish: z.boolean(),
    notifyAudiences: notifyAudiencesSchema,
    notifyState: z.string().trim().max(100).nullish(),
  })
  .refine((v) => !v.notifyOnPublish || v.notifyAudiences.length >= 1, {
    message: 'Choose who to notify',
    path: ['notifyAudiences'],
  })
  .refine((v) => !v.notifyOnPublish || !v.notifyAudiences.includes('state') || !!v.notifyState, {
    message: 'Choose a state to notify',
    path: ['notifyState'],
  });
export type WizardExtrasInput = z.infer<typeof wizardExtrasSchema>;
