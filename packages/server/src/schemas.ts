import { z } from 'zod';

export const UserPromptSubmittedSchema = z.object({
  type: z.literal('user_prompt_submitted'),
  content: z.string(),
  parentId: z.string().optional(),
});

export const BranchRequestedSchema = z.object({
  type: z.literal('branch_requested'),
  fromNodeId: z.string(),
  content: z.string(),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  UserPromptSubmittedSchema,
  BranchRequestedSchema,
]);

export type ParsedClientMessage = z.infer<typeof ClientMessageSchema>;
