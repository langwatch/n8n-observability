import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { getLangWatchTracer } from "langwatch";
import { SemConvAttributes } from "langwatch/observability";
import {
  AttributeValue,
  SpanStatusCode,
  type Exception,
} from "@opentelemetry/api";
import { flatten } from "flat";
import type { IExecuteData, INodeExecutionData } from "n8n-workflow";

type AnyFunction = (...args: unknown[]) => unknown;

type WorkflowMeta = { id?: string; name?: string };

type WorkflowExecutePatchable = {
  processRunExecutionData?: AnyFunction;
  processRunData?: AnyFunction;
  runNode?: AnyFunction;
};

type WorkflowExecuteInstance = {
  workflow?: WorkflowMeta;
};

const patchedFunctions = new WeakSet<AnyFunction>();

export async function applyPatches(): Promise<void> {
  // Track if any patch attempt succeeded; avoid early returns so we can patch the exact instance n8n uses
  let patchedAny = false;

  // First, try patching relative to the n8n main module entry (most reliable to match running instance)
  try {
    const localRequire = makeLocalRequire();
    const n8nEntry = localRequire.resolve("n8n");
    const requireFromN8n = createRequire(n8nEntry);
    const resolvedCorePath = requireFromN8n.resolve("n8n-core");

    debug(`Attempting to patch via n8n entry: ${resolvedCorePath}`);

    const coreFromN8n = requireFromN8n("n8n-core");

    if (coreFromN8n && typeof coreFromN8n === "object") {
      if (patchWorkflowExecute(coreFromN8n)) patchedAny = true;
    }
  } catch (e) {
    debug("Patch via n8n entry failed:", errorMessage(e));
  }

  // Second, try to find n8n installation and patch it directly
  const n8nPaths = [
    // Common global locations
    "/usr/local/lib/node_modules/n8n",
    "/usr/lib/node_modules/n8n",
    // From CLI path
    process.argv?.[1] ? path.resolve(process.argv[1], "..", "..") : null,
    // Current working directory
    path.resolve(process.cwd(), "node_modules", "n8n"),
    path.resolve(process.cwd(), "..", "node_modules", "n8n"),
  ].filter((p): p is string => Boolean(p));

  for (const n8nPath of n8nPaths) {
    try {
      if (fs.existsSync(path.join(n8nPath, "package.json"))) {
        const packageJson = JSON.parse(
          fs.readFileSync(path.join(n8nPath, "package.json"), "utf8")
        );
        if (packageJson.name === "n8n") {
          debug(`Found n8n installation at: ${n8nPath}`);

          // Try to patch n8n directly using the specific dist/index.js file
          try {
            const n8nIndexPath = path.join(n8nPath, "dist", "index.js");
            if (fs.existsSync(n8nIndexPath)) {
              const n8nModule = await import(n8nIndexPath);
              if (n8nModule && typeof n8nModule === "object") {
                debug(`Attempting to patch n8n directly from: ${n8nIndexPath}`);
                debug(`n8n module keys:`, Object.keys(n8nModule));

                // Try to patch the main module
                if (patchWorkflowExecute(n8nModule)) {
                  return;
                }

                // Try to patch the default export
                if (
                  n8nModule.default &&
                  typeof n8nModule.default === "object"
                ) {
                  debug(
                    `Trying default export, keys:`,
                    Object.keys(n8nModule.default)
                  );
                  if (patchWorkflowExecute(n8nModule.default)) {
                    return;
                  }
                }
              }
            }
          } catch (e) {
            debug(
              `Failed to patch n8n directly from ${n8nPath}/dist/index.js:`,
              errorMessage(e)
            );
          }

          // Try to find WorkflowExecute in n8n-core
          // Look for n8n-core/dist/execution-engine/workflow-execute.js
          const workflowExecutePaths = [
            path.join(
              n8nPath,
              "node_modules",
              "n8n-core",
              "dist",
              "execution-engine",
              "workflow-execute.js"
            ),
            path.join(
              n8nPath,
              "..",
              "node_modules",
              "n8n-core",
              "dist",
              "execution-engine",
              "workflow-execute.js"
            ),
            path.join(
              n8nPath,
              "..",
              "..",
              "node_modules",
              "n8n-core",
              "dist",
              "execution-engine",
              "workflow-execute.js"
            ),
            path.join(
              n8nPath,
              "node_modules",
              "n8n-core",
              "dist",
              "execution-engine",
              "workflow-execute.mjs"
            ),
            path.join(
              n8nPath,
              "..",
              "node_modules",
              "n8n-core",
              "dist",
              "execution-engine",
              "workflow-execute.mjs"
            ),
            path.join(
              n8nPath,
              "..",
              "..",
              "node_modules",
              "n8n-core",
              "dist",
              "execution-engine",
              "workflow-execute.mjs"
            ),
            // Also try the main n8n-core index
            path.join(n8nPath, "node_modules", "n8n-core", "dist", "index.js"),
            path.join(
              n8nPath,
              "..",
              "node_modules",
              "n8n-core",
              "dist",
              "index.js"
            ),
            path.join(
              n8nPath,
              "..",
              "..",
              "node_modules",
              "n8n-core",
              "dist",
              "index.js"
            ),
            // Try lib directory
            path.join(
              n8nPath,
              "node_modules",
              "n8n-core",
              "lib",
              "execution-engine",
              "workflow-execute.js"
            ),
            path.join(
              n8nPath,
              "..",
              "node_modules",
              "n8n-core",
              "lib",
              "execution-engine",
              "workflow-execute.js"
            ),
            path.join(
              n8nPath,
              "..",
              "..",
              "node_modules",
              "n8n-core",
              "lib",
              "execution-engine",
              "workflow-execute.js"
            ),
          ];

          for (const corePath of workflowExecutePaths) {
            try {
              debug(
                `Checking path: ${corePath}, exists: ${fs.existsSync(corePath)}`
              );

              if (fs.existsSync(corePath)) {
                debug(`Trying to import WorkflowExecute from: ${corePath}`);
                const core = await import(corePath);
                if (core && typeof core === "object") {
                  debug(`Successfully imported from: ${corePath}`);
                  if (patchWorkflowExecute(core)) {
                    patchedAny = true;
                  }
                }
              }
            } catch (e) {
              debug(`Failed to load from ${corePath}:`, errorMessage(e));
            }
          }

          // Try to find n8n-core in pnpm structure
          const pnpmPaths = [
            path.join(n8nPath, "node_modules", ".pnpm"),
            path.join(n8nPath, "..", ".pnpm"),
            path.join(n8nPath, "..", "..", ".pnpm"),
          ];

          for (const pnpmPath of pnpmPaths) {
            if (fs.existsSync(pnpmPath)) {
              try {
                const pnpmDirs = fs.readdirSync(pnpmPath);
                const n8nCoreDir = pnpmDirs.find((dir) =>
                  dir.includes("n8n-core@")
                );
                if (n8nCoreDir) {
                  debug(`Found n8n-core directory: ${n8nCoreDir}`);
                  const corePath = path.join(
                    pnpmPath,
                    n8nCoreDir,
                    "node_modules",
                    "n8n-core"
                  );
                  const workflowExecutePath = path.join(
                    corePath,
                    "dist",
                    "execution-engine",
                    "workflow-execute.js"
                  );
                  debug(
                    `Checking workflow-execute path: ${workflowExecutePath}, exists: ${fs.existsSync(workflowExecutePath)}`
                  );
                  if (fs.existsSync(workflowExecutePath)) {
                    const core = await import(workflowExecutePath);
                    if (core && typeof core === "object") {
                      debug(`Found WorkflowExecute at: ${workflowExecutePath}`);
                      if (patchWorkflowExecute(core)) {
                        patchedAny = true;
                      }
                    }
                  }
                }
              } catch (e) {
                debug(
                  `Failed to search pnpm path ${pnpmPath}:`,
                  errorMessage(e)
                );
              }
            }
          }

          // Try to find n8n-core package in node_modules
          const nodeModulesPaths = [
            path.join(n8nPath, "node_modules", "n8n-core"),
            path.join(n8nPath, "..", "node_modules", "n8n-core"),
            path.join(n8nPath, "..", "..", "node_modules", "n8n-core"),
          ];

          for (const corePath of nodeModulesPaths) {
            try {
              if (fs.existsSync(corePath)) {
                const coreIndexPath = path.join(corePath, "dist", "index.js");
                if (fs.existsSync(coreIndexPath)) {
                  debug(`Trying to import n8n-core from: ${coreIndexPath}`);
                  const core = await import(coreIndexPath);
                  if (core && typeof core === "object") {
                    debug(
                      `Successfully imported n8n-core from: ${coreIndexPath}`
                    );
                    if (patchWorkflowExecute(core)) {
                      patchedAny = true;
                    }
                  }
                }
              }
            } catch (e) {
              debug(
                `Failed to load n8n-core from ${corePath}:`,
                errorMessage(e)
              );
            }
          }
        }
      }
    } catch (e) {
      debug(`Failed to check n8n path ${n8nPath}:`, errorMessage(e));
    }
  }

  // Third, try direct approach as fallback
  try {
    try {
      const resolved = makeLocalRequire().resolve("n8n-core");
      debug("Dynamic import resolving to:", resolved);
    } catch {}
    const core = await import("n8n-core");
    if (core && typeof core === "object") {
      debug("Found n8n-core via dynamic import");
      if (patchWorkflowExecute(core)) {
        patchedAny = true;
      }
    }
  } catch (e) {
    debug("Dynamic import of n8n-core failed:", errorMessage(e));
  }

  // Fourth, try require as fallback
  try {
    const req = makeLocalRequire();
    debug("Require resolving to:", req.resolve("n8n-core"));
    const core = req("n8n-core");
    if (core && typeof core === "object") {
      debug("Found n8n-core via require");
      if (patchWorkflowExecute(core)) {
        patchedAny = true;
      }
    }
  } catch (e) {
    debug("Require of n8n-core failed:", errorMessage(e));
  }

  if (!patchedAny) {
    console.warn(
      "No n8n-core instance patched, so observability has not been enabled. Set N8N_OTEL_DEBUG=1 for more details."
    );
  }
}

function patchWorkflowExecute(core: unknown): boolean {
  const WorkflowExecute =
    core && typeof core === "object" && "WorkflowExecute" in core
      ? (core as { WorkflowExecute?: unknown }).WorkflowExecute
      : void 0;

  if (
    !WorkflowExecute ||
    typeof (WorkflowExecute as { prototype?: unknown }).prototype !== "object"
  ) {
    debug(
      "[@langwatch/n8n-observability] WorkflowExecute missing in this module"
    );
    return false;
  }

  const tracer = getLangWatchTracer("langwatch.n8n");
  const proto = (WorkflowExecute as { prototype: WorkflowExecutePatchable })
    .prototype;

  for (const name of ["processRunExecutionData", "processRunData"] as const) {
    const current = proto?.[name];
    if (!isFunction(current) || patchedFunctions.has(current)) continue;

    proto[name] = function (...args: unknown[]) {
      const self = this as unknown as WorkflowExecuteInstance;
      const workflow: WorkflowMeta =
        (args?.[0] as WorkflowMeta) ?? self?.workflow ?? {};

      debug(
        `[PATCH] ${name} called for workflow: ${workflow?.id || "unknown"}`
      );

      return tracer.withActiveSpan(
        `n8n.workflow.execute (${name})`,
        {
          attributes: {
            "n8n.workflow.id": workflow?.id ?? "",
            "n8n.workflow.name": workflow?.name ?? "",
          },
        },
        async (span) => {
          debug(`[PATCH] Created workflow span: ${name || "unknown"}`);
          try {
            const res: unknown = await current.apply(this, args);
            const err = (
              res as { data?: { resultData?: { error?: unknown } } } | undefined
            )?.data?.resultData?.error;
            if (err) {
              span.recordException(toException(err));
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: errorMessage(err),
              });
            }
            return res;
          } catch (err) {
            debug(`[PATCH] ${name} threw: ${errorMessage(err)}`);
            span.recordException(toException(err));
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: errorMessage(err),
            });
            throw err;
          } finally {
            span.end();
          }
        }
      );
    };

    patchedFunctions.add(proto[name] as AnyFunction);
    debug("patched root:", name);
  }

  for (const name of ["runNode"] as const) {
    const current = proto?.[name];
    if (!isFunction(current) || patchedFunctions.has(current)) continue;

    proto[name] = async function (...args: unknown[]) {
      const workflowArg = args[0] as WorkflowMeta | undefined;
      const executionData = args[1] as IExecuteData | undefined;
      const runIndex = args[3] as number | undefined;

      const node = executionData?.node ?? {};
      const nodeName = (node as { name?: string })?.name ?? "";
      const nodeType = (node as { type?: string })?.type ?? "";

      debug(`[PATCH] ${name} called for node: ${nodeName} (${nodeType})`);

      if (!shouldIncludeNode(nodeName, nodeType)) {
        debug(`[PATCH] Skipping node ${nodeName} due to filtering`);
        return current.apply(this, args);
      }

      const workflowMeta = workflowArg ?? {};
      const attributes: SemConvAttributes = {
        "n8n.workflow.id": workflowMeta.id ?? "unknown",
      };

      const flattenedNode = flatten(node as Record<string, unknown>, {
        delimiter: ".",
      }) as Record<string, unknown>;
      for (const [key, value] of Object.entries(flattenedNode)) {
        attributes[`n8n.node.${key}`] = toAttrValue(value);
      }

      return tracer.startActiveSpan(
        `n8n.node.execute (${name})`,
        { attributes },
        async (span) => {
          try {
            const result: unknown = await current.apply(this, args);

            if (
              process.env.N8N_OTEL_CAPTURE_INPUT !== "false" &&
              typeof runIndex === "number"
            ) {
              const outRaw = (result as { data?: unknown[] } | undefined)
                ?.data?.[runIndex];
              if (Array.isArray(outRaw)) {
                const finalJson = (
                  outRaw as Array<INodeExecutionData | undefined>
                ).map((item) => item?.json);

                const s = safeJSON(finalJson);
                if (s) span.setOutput(s);
              }
            }

            if (process.env.N8N_OTEL_CAPTURE_INPUT !== "false") {
              const main0 = executionData?.data?.main?.[0];
              if (Array.isArray(main0)) {
                const inputData = (
                  main0 as Array<INodeExecutionData | undefined>
                ).map((d) => d?.json);

                const si = safeJSON(inputData);
                if (si) span.setInput(si);
              }
            }

            return result;
          } catch (err) {
            debug(`[PATCH] ${name} threw: ${errorMessage(err)}`);
            span.recordException(toException(err));
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: errorMessage(err),
            });
            throw err;
          } finally {
            span.end();
          }
        }
      );
    };

    patchedFunctions.add(proto[name] as AnyFunction);
    debug("patched node:", name);
  }

  debug("Successfully patched WorkflowExecute");
  return true;
}

function makeLocalRequire(): NodeJS.Require {
  try {
    // Works in ESM builds
    const meta = import.meta as unknown as { url?: string };
    const url = meta?.url;
    if (url && typeof url === "string" && url.length > 0)
      return createRequire(url);
  } catch {}

  // Fallbacks for CJS builds
  const g = globalThis as unknown as { __filename?: string };
  const filename =
    typeof g.__filename === "string" && g.__filename.length > 0
      ? g.__filename
      : void 0;

  if (filename) return createRequire(filename);

  return createRequire(process.cwd());
}

const debug = (...args: unknown[]) =>
  process.env.N8N_OTEL_DEBUG &&
  console.log("[@langwatch/n8n-observability]", ...args);

function csvSet(name: string): Set<string> {
  return new Set(
    (process.env[name] || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function shouldIncludeNode(nodeName: string, nodeType: string): boolean {
  const include = csvSet("N8N_OTEL_NODE_INCLUDE");
  const exclude = csvSet("N8N_OTEL_NODE_EXCLUDE");

  if (exclude.size && (exclude.has(nodeName) || exclude.has(nodeType)))
    return false;
  if (include.size && !(include.has(nodeName) || include.has(nodeType)))
    return false;

  return true;
}

function safeJSON(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return void 0;
  }
}

function toAttrValue(value: unknown): AttributeValue {
  if (value === null || value === void 0) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;

  const s = safeJSON(value);
  return s ?? String(value);
}

function toException(err: unknown): Exception {
  if (err instanceof Error || typeof err === "string") return err;
  const msg = safeJSON(err) ?? String(err);
  return { message: msg };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isFunction(value: unknown): value is AnyFunction {
  return typeof value === "function";
}
