import path from "node:path";
import { readAuditEvents } from "@mcp-toollatch/audit";
import { AppError, type RiskLevel } from "@mcp-toollatch/core";
import { defaultAuditLogPath, defaultPolicyFileName, loadPolicyFile } from "@mcp-toollatch/policy";
import { scanMcpConfigs, type ClientId, type ScanReport } from "@mcp-toollatch/scanner";

export type DoctorIssueSeverity = "info" | "warning" | "error";

export interface DoctorIssue {
  id: string;
  severity: DoctorIssueSeverity;
  title: string;
  detail: string;
  suggestion: string;
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
        title: "Policy is in observe mode",
        detail: "Tool calls will be allowed even when a blocking rule matches.",
        suggestion: "Run toollatch init --profile balanced --force or strict after reviewing current policy.",
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
      title: `High-risk MCP server: ${server.name}`,
      detail: `${server.client} server "${server.name}" is classified as ${server.riskLevel}.`,
      suggestion: `Run toollatch apply --client ${server.client} --server ${server.name} --dry-run and review the wrapped config.`,
    });
  }

  if (scan.servers.length === 0) {
    issues.push({
      id: "NO_SERVERS_FOUND",
      severity: "info",
      title: "No MCP servers found",
      detail: "No configured MCP servers were discovered in common client config paths.",
      suggestion: "Run toollatch scan --json or pass explicit config paths in tests to verify scanner fixtures.",
    });
  }

  const auditEvents = await readAuditEvents(auditLogPath, { limit: 5 });
  if (auditEvents.length === 0) {
    issues.push({
      id: "NO_AUDIT_EVENTS",
      severity: "warning",
      title: "No audit events found",
      detail: `No recent audit events were found at ${auditLogPath}.`,
      suggestion: "Run a wrapped MCP server and then call toollatch logs --json.",
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
    lines.push(`${issue.severity.toUpperCase()} ${issue.id}: ${issue.title}`);
    lines.push(`  ${issue.detail}`);
    lines.push(`  suggestion: ${issue.suggestion}`);
  }

  return lines.join("\n").trimEnd();
}

function policyIssue(policyPath: string, error: unknown): DoctorIssue {
  if (error instanceof AppError && error.code === "CONFIG_INVALID") {
    return {
      id: "POLICY_INVALID",
      severity: "error",
      title: "Policy file is invalid",
      detail: error.message,
      suggestion: `Fix the YAML and run toollatch policy check ${policyPath}.`,
    };
  }

  return {
    id: "POLICY_MISSING",
    severity: "error",
    title: "Policy file is missing",
    detail: `No readable policy file was found at ${policyPath}.`,
    suggestion: "Run toollatch init --profile balanced or toollatch init --profile strict.",
  };
}
