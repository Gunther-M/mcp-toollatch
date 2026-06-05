import { z } from "zod";

export const policyActionSchema = z.enum(["allow", "ask", "block"]);
export const policyModeSchema = z.enum(["observe", "enforce"]);

export const policyRuleSchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  match: z.record(z.unknown()).default({}),
  action: policyActionSchema,
});

export const policySchema = z.object({
  version: z.literal(1),
  mode: policyModeSchema.default("observe"),
  rules: z.array(policyRuleSchema).default([]),
});

export type PolicyAction = z.infer<typeof policyActionSchema>;
export type PolicyMode = z.infer<typeof policyModeSchema>;
export type PolicyRule = z.infer<typeof policyRuleSchema>;
export type ToolLatchPolicy = z.infer<typeof policySchema>;
