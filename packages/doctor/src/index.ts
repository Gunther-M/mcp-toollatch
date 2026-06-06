import path from "node:path";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import { readAuditEvents } from "@mcp-toollatch/audit";
import { AppError, type RiskLevel } from "@mcp-toollatch/core";
import { defaultAuditLogPath, defaultPolicyFileName, loadPolicyFile } from "@mcp-toollatch/policy";
import { scanMcpConfigs, type ClientId, type ScanReport } from "@mcp-toollatch/scanner";

export type DoctorIssueSeverity = "info" | "warning" | "error";

export interface DoctorIssue {
  id: string;
  severity: DoctorIssueSeverity;
  category: "policy" | "scanner" | "audit" | "config";
  title: string;
  detail: string;
  suggestion: string;
  suggestedCommand?: string;
  docLink?: string;
}

export interface DoctorOptions {
  cwd?: string;
  policyPath?: string;
  auditLogPath?: string;
  clients?: ClientId[];
  deep?: boolean;
  homeDir?: string;
  appDataDir?: string;
  platform?: NodeJS.Platform;
}

export interface DoctorReport {
  generatedAt: string;
  policyPath: string;
  auditLogPath: string;
  clientsFound: number;
  serversFound: number;
  highRiskServers: Array<{ client: ClientId; name: string; riskLevel: RiskLevel; warnings: string[] }>;
  auditEventsFound: number;
  issues: DoctorIssue[];
  scan: ScanReport;
}

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorReport> {
  const cwd = options.cwd ?? process.cwd();
  const policyPath = path.resolve(cwd, options.policyPath ?? defaultPolicyFileName);
  const issues: DoctorIssue[] = [];
  const scan = await scanMcpConfigs({
    clients: options.clients,
    deep: options.deep === true,
    homeDir: options.homeDir,
    appDataDir: options.appDataDir,
    platform: options.platform,
  });

  let auditLogPath = path.resolve(cwd, options.auditLogPath ?? defaultAuditLogPath);
  try {
    const policy = await loadPolicyFile(policyPath);
    auditLogPath = path.resolve(cwd, options.auditLogPath ?? policy.audit.path);
    if (policy.mode === "observe") {
      issues.push({
        id: "POLICY_OBSERVE_MODE",
        severity: "warning",
        category: "policy",
        title: "Policy is in observe mode",
        detail: "Tool calls will be allowed even when a blocking rule matches.",
        suggestion: "Run toollatch init --profile balanced --force or strict after reviewing current policy.",
        suggestedCommand: "toollatch init --profile strict --force",
        docLink: "docs/policy-reference.md",
      });
    }
  } catch (error) {
    issues.push(policyIssue(policyPath, error));
  }

  const highRiskServers = scan.servers
    .filter((server) => server.riskLevel === "high" || server.riskLevel === "critical")
    .map((server) => ({
      client: server.client,
      name: server.name,
      riskLevel: server.riskLevel,
      warnings: server.warnings,
    }));

  for (const server of highRiskServers) {
    issues.push({
      id: "HIGH_RISK_SERVER",
      severity: server.riskLevel === "critical" ? "error" : "warning",
      category: "scanner",
      title: `High-risk MCP server: ${server.name}`,
      detail: `${server.client} server "${server.name}" is classified as ${server.riskLevel}.`,
      suggestion: `Run toollatch apply --client ${server.client} --server ${server.name} --dry-run and review the wrapped config.`,
      suggestedCommand: `toollatch apply --client ${server.client} --server ${server.name} --dry-run`,
      docLink: "docs/client-setup.md",
    });
  }

  if (scan.servers.length === 0) {
    issues.push({
      id: "NO_SERVERS_FOUND",
      severity: "info",
      category: "scanner",
      title: "No MCP servers found",
      detail: "No configured MCP servers were discovered in common client config paths.",
      suggestion: "Run toollatch scan --json or pass explicit config paths in tests to verify scanner fixtures.",
      suggestedCommand: "toollatch scan --json",
      docLink: "docs/client-setup.md",
    });
  }

  const auditWritableIssue = await checkAuditLogWritable(auditLogPath);
  if (auditWritableIssue !== undefined) {
    issues.push(auditWritableIssue);
  }

  const auditEvents = await readAuditEvents(auditLogPath, { limit: 5 });
  if (auditEvents.length === 0) {
    issues.push({
      id: "NO_AUDIT_EVENTS",
      severity: "warning",
      category: "audit",
      title: "No audit events found",
      detail: `No recent audit events were found at ${auditLogPath}.`,
      suggestion: "Run a wrapped MCP server and then call toollatch logs --json.",
      suggestedCommand: "toollatch logs --json",
      docLink: "docs/policy-reference.md",
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    policyPath,
    auditLogPath,
    clientsFound: scan.clients.filter((client) => client.status === "found").length,
    serversFound: scan.servers.length,
    highRiskServers,
    auditEventsFound: auditEvents.length,
    issues,
    scan,
  };
}

export function summarizeDoctorReport(report: DoctorReport): string {
  const lines = [
    `MCP ToolLatch doctor report (${report.generatedAt})`,
    `Policy: ${report.policyPath}`,
    `Audit log: ${report.auditLogPath}`,
    `Clients found: ${report.clientsFound}`,
    `Servers found: ${report.serversFound}`,
    `Audit events found: ${report.auditEventsFound}`,
    "",
  ];

  for (const issue of report.issues) {
    lines.push(`${issue.severity.toUpperCase()} ${issue.category} ${issue.id}: ${issue.title}`);
    lines.push(`  ${issue.detail}`);
    lines.push(`  suggestion: ${issue.suggestion}`);
    if (issue.suggestedCommand !== undefined) {
      lines.push(`  command: ${issue.suggestedCommand}`);
    }
    if (issue.docLink !== undefined) {
      lines.push(`  docs: ${issue.docLink}`);
    }
  }

  return lines.join("\n").trimEnd();
}

function policyIssue(policyPath: string, error: unknown): DoctorIssue {
  if (error instanceof AppError && error.code === "CONFIG_INVALID") {
    return {
      id: "POLICY_INVALID",
      severity: "error",
      category: "policy",
      title: "Policy file is invalid",
      detail: error.message,
      suggestion: `Fix the YAML and run toollatch policy check ${policyPath}.`,
      suggestedCommand: `toollatch policy check ${policyPath}`,
      docLink: "docs/policy-reference.md",
    };
  }

  return {
    id: "POLICY_MISSING",
    severity: "error",
    category: "policy",
    title: "Policy file is missing",
    detail: `No readable policy file was found at ${policyPath}.`,
    suggestion: "Run toollatch init --profile balanced or toollatch init --profile strict.",
    suggestedCommand: "toollatch init --profile strict",
    docLink: "docs/policy-reference.md",
  };
}

async function checkAuditLogWritable(auditLogPath: string): Promise<DoctorIssue | undefined> {
  const parent = await findExistingParent(path.dirname(auditLogPath));
  try {
    await fs.access(parent, fsConstants.W_OK);
    return undefined;
  } catch (error) {
    return {
      id: "AUDIT_LOG_UNWRITABLE",
      severity: "error",
      category: "audit",
      title: "Audit log directory is not writable",
      detail: `MCP ToolLatch may be unable to write audit events under ${auditLogPath}: ${formatUnknownError(error)}`,
      suggestion: "Choose a writable audit.path in toollatch.policy.yaml or fix directory permissions.",
      suggestedCommand: "toollatch policy check",
      docLink: "docs/policy-reference.md",
    };
  }
}

async function findExistingParent(dir: string): Promise<string> {
  let current = path.resolve(dir);
  while (true) {
    try {
      await fs.access(current);
      return current;
    } catch {
      const next = path.dirname(current);
      if (next === current) {
        return current;
      }
      current = next;
    }
  }
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
