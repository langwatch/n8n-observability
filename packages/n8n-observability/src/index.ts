// Main entry point for the package
export { applyPatches } from "./patch-n8n.js";
export { setupObservability } from "langwatch/observability/node";

// For programmatic setup
export async function setupN8nObservability(options?: { serviceName?: string; debug?: boolean }) {
  const { setupObservability } = await import("langwatch/observability/node");
  const { applyPatches } = await import("./patch-n8n.js");

  try {
    setupObservability({
      serviceName: options?.serviceName || process.env.N8N_OTEL_SERVICE_NAME || "n8n",
      debug: options?.debug || process.env.N8N_OTEL_DEBUG ? { consoleLogging: true, logLevel: "info" } : void 0,
    });
  } catch (err) {
    console.warn("[@langwatch/n8n-observability] setupObservability failed:", (err as Error)?.message || err);
  }

  try {
    await applyPatches();
  } catch (err) {
    console.warn("[@langwatch/n8n-observability] patching failed:", (err as Error)?.message || err);
  }
}
