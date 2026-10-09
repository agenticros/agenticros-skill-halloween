/**
 * Minimal skill contract types so this package can build against @agenticros/core.
 * At runtime the plugin passes the real api and context matching this shape.
 */

import type { RosTransport } from "@agenticros/core";

export interface DepthSampleResult {
  distance_m: number;
  valid: boolean;
  topic: string;
  encoding: string;
  width: number;
  height: number;
  sample_count: number;
  min_m: number;
  max_m: number;
}

export interface DepthSectorsResult {
  left_m: number;
  center_m: number;
  right_m: number;
  valid: boolean;
  topic: string;
}

export interface SkillContext {
  getTransport(): RosTransport;
  getDepthDistance(
    transport: RosTransport,
    topic: string,
    timeoutMs?: number,
  ): Promise<DepthSampleResult>;
  getDepthSectors(
    transport: RosTransport,
    topic: string,
    timeoutMs?: number,
  ): Promise<DepthSectorsResult>;
  /** Optional host helper; unused when PersonWatch falls back to workspace paths. */
  importRosCamera?: () => Promise<unknown>;
  logger: { info(msg: string): void; warn(msg: string): void; error(msg: string): void };
}

export interface AgentTool {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<{ content: { type: string; text: string }[]; details?: unknown }>;
}

export interface SkillPluginApi {
  registerTool(tool: AgentTool): void;
  logger: SkillContext["logger"];
}
