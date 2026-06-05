export type RiskSeverity = "low" | "medium" | "high";

export interface RiskRuleDescriptor {
  id: string;
  title: string;
  severity: RiskSeverity;
  description: string;
}

export const plannedRiskRules: RiskRuleDescriptor[] = [
  {
    id: "sensitive-file-access",
    title: "Sensitive file access",
    severity: "high",
    description: "Detect tool calls that may read private keys, certificates, tokens, or env files.",
  },
  {
    id: "dangerous-shell-command",
    title: "Dangerous shell command",
    severity: "high",
    description: "Detect shell commands that may delete files, exfiltrate data, or alter system state.",
  },
];
