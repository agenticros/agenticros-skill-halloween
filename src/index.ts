/**
 * AgenticROS Creep or Treat skill.
 * Tools: start_haunt, stop_haunt, haunt_status.
 * Config: config.skills.halloween
 * The robot does not move. YOLO gates visits; depth/approach speed pick the line.
 */

import type { AgenticROSConfig } from "@agenticros/core";
import type { SkillContext, SkillPluginApi } from "./types.js";
import { registerHauntTools } from "./tools/haunt.js";

export function registerSkill(
  api: SkillPluginApi,
  config: AgenticROSConfig,
  context: SkillContext,
): void {
  registerHauntTools(api, config, context);
}
