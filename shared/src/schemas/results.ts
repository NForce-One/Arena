import { z } from 'zod';

const playerScoreEntrySchema = z.object({
  userId: z.string().min(1),
  runs: z.number().int().min(0).max(999),
  wickets: z.number().int().min(0).max(10),
});

export const enterResultSchema = z.object({
  homeScore: z.string().trim().min(1, 'Home score is required').max(60),
  awayScore: z.string().trim().min(1, 'Away score is required').max(60),
  winnerTeamId: z.string().min(1).nullish(),
  homeRunsTotal: z.number().int().min(0).max(9999).nullish(),
  awayRunsTotal: z.number().int().min(0).max(9999).nullish(),
  homePlayerScores: z.array(playerScoreEntrySchema).max(30).nullish(),
  awayPlayerScores: z.array(playerScoreEntrySchema).max(30).nullish(),
});
export type EnterResultInput = z.infer<typeof enterResultSchema>;
