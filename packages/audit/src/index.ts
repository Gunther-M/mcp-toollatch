export type AuditDecision = "allow" | "ask" | "block";

export interface AuditEvent {
  id: string;
  timestamp: string;
  toolName: string;
  decision: AuditDecision;
  reason?: string;
}

export const auditModule = {
  name: "audit",
  purpose: "Record local audit events for MCP tool-call decisions.",
} as const;
