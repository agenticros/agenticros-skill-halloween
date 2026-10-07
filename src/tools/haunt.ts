import { Type } from "@sinclair/typebox";
import type { AgenticROSConfig } from "@agenticros/core";
import type { SkillContext, SkillPluginApi } from "../types.js";
import { formatHauntStatus, getHauntStatus, startHaunt, stopHaunt } from "../loop.js";

function text(message: string, details?: unknown) {
  return {
    content: [{ type: "text" as const, text: message }],
    ...(details === undefined ? {} : { details }),
  };
}

export function registerHauntTools(
  api: SkillPluginApi,
  config: AgenticROSConfig,
  context: SkillContext,
): void {
  api.registerTool({
    name: "start_haunt",
    label: "Start Creep or Treat",
    description:
      "Start the Halloween porch host. The robot stays still on wall power and does not drive. " +
      "A candy bowl sits at its feet. RealSense depth decides the line, and how fast a kid approaches " +
      "decides a creep, a normal voice, or a scream. Leave it running for the evening. " +
      "Use this when someone says the kids are coming, start Halloween, or start the haunt.",
    parameters: Type.Object({}),
    async execute() {
      const message = startHaunt(config, context);
      return text(message, getHauntStatus());
    },
  });

  api.registerTool({
    name: "stop_haunt",
    label: "Stop Creep or Treat",
    description:
      "Stop the Halloween porch host. The robot goes quiet and does not move. " +
      "Use this when the night is over or someone says stop haunting.",
    parameters: Type.Object({}),
    async execute() {
      const message = stopHaunt(context);
      return text(message, getHauntStatus());
    },
  });

  api.registerTool({
    name: "haunt_status",
    label: "Creep or Treat status",
    description:
      "Report the Halloween porch host: whether it is running, how far the closest kid is, " +
      "which zone they are in, how fast they are approaching, how many visitors have been greeted, " +
      "and the last line the robot said.",
    parameters: Type.Object({}),
    async execute() {
      const status = getHauntStatus();
      return text(formatHauntStatus(status), status);
    },
  });
}
