import { setupObservability } from "langwatch/observability/node";
import { applyPatches } from "./patch-n8n.js";

/**
 * CommonJS backend hooks file for n8n (used via EXTERNAL_HOOK_FILES)
 *
 * This initializes LangWatch observability and applies the n8n patches
 * during the `n8n.ready` lifecycle hook so context is set up before any
 * workflow executes.
 */
const hooks = {
  n8n: {
    ready: [
      async function (_app: unknown) {
        try {
          const serviceName = process.env.N8N_OTEL_SERVICE_NAME || process.env.OTEL_SERVICE_NAME || "n8n";
          setupObservability({
            serviceName,
            debug: process.env.N8N_OTEL_DEBUG ? { consoleLogging: true, logLevel: "info" } : undefined,
          });
        } catch (err) {
          console.warn("[@langwatch/n8n-observability] setupObservability failed:", (err as Error)?.message || err);
        }

        try {
          await applyPatches();
          console.log("[@langwatch/n8n-observability] observability ready and patches applied");
        } catch (err) {
          console.warn("[@langwatch/n8n-observability] patching failed:", (err as Error)?.message || err);
        }
      },
    ],
  },
};

export = hooks;
