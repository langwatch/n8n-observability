# @langwatch/n8n-observability

This package provides the actual n8n instrumentation for LangWatch observability.  
It is published to npm as **`@langwatch/n8n-observability`**.

For a guide on how to use this package, see the [setup guide](../../README.md) in the other readme.

---

## Development

### Prerequisites
- Node.js ≥ 18
- pnpm ≥ 8

### Build

```bash
pnpm install
pnpm build
```

Build artifacts include:
- `dist/hooks.cjs` → CommonJS entry for `EXTERNAL_HOOK_FILES`
- `dist/index.js` → ESM programmatic API

### Test & Lint

```bash
pnpm test
pnpm lint
```

---

## Internals: How it Works

- Registers LangWatch’s Node SDK (`setupObservability`) → OpenTelemetry tracer provider.
- Locates the active `n8n-core` instance and patches `WorkflowExecute`:
  - `processRunExecutionData` → workflow span
  - `processRunData` → workflow span
  - `runNode` → per-node span
- Patching is idempotent (guarded by `WeakSet`).

### Span Model

- **Workflow spans** (`n8n.workflow.execute.*`)  
  Attributes: `n8n.workflow.id`, `n8n.workflow.name`; errors recorded as exception events.

- **Node spans** (`n8n.node.execute`)  
  Attributes under `n8n.node.*` (type, name, etc.); optional JSON I/O capture; errors recorded as exception events.

### Privacy

Inputs/outputs come from `INodeExecutionData.json`.  
Disable capture with `N8N_OTEL_CAPTURE_INPUT=false`, or configure redaction rules in LangWatch.

---

## Troubleshooting

- **No n8n-core patched**  
  - Set `N8N_OTEL_DEBUG=1` to see search paths.
  - Verify `EXTERNAL_HOOK_FILES` points to `dist/hooks.cjs`.

- **`setupObservability` failed**  
  - Check `LANGWATCH_API_KEY`.
  - Verify network access to LangWatch.

- **No spans**  
  - Look for startup log: `observability ready and patches applied`.
  - Confirm I/O capture isn’t disabled if expecting inputs/outputs.

---

## License

MIT. View the [LICENSE](../../LICENSE) file for details.
