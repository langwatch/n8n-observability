# @langwatch/n8n-observability

Observability for [n8n](https://n8n.io) powered by [LangWatch](https://langwatch.ai).  
Instruments workflows and nodes via OpenTelemetry and sends spans to LangWatch.

> [!TIP]
> **Complete LangWatch Integration**: You can pair this with the [LangWatch n8n nodes](https://github.com/langwatch/n8n-nodes-langwatch) to get a complete LangWatch integration, including Prompt Management, Evaluation, Datasets, and more.

## Features
- Workflow + node spans with errors and metadata
- Safe JSON I/O capture (toggleable)
- Include/Exclude nodes
- Works with Docker, bare metal, or programmatic init
- Node.js ≥ 18

---

## Setup Options

### A) Docker — **custom image installs the npm package**
```dockerfile
# Dockerfile
FROM n8nio/n8n:latest
USER root
WORKDIR /usr/local/lib/node_modules/n8n
RUN npm install @langwatch/n8n-observability
ENV EXTERNAL_HOOK_FILES=/usr/local/lib/node_modules/n8n/node_modules/@langwatch/n8n-observability/dist/hooks.cjs
USER node
```

```bash
docker build -t my-n8n-langwatch .
docker run -p 5678:5678 \
  -e LANGWATCH_API_KEY=your_api_key \
  -e N8N_OTEL_SERVICE_NAME=my-n8n \
  my-n8n-langwatch
```

---

### B) Docker — **no custom image**, mount the hook file from host
```yaml
# docker-compose.yml
services:
  n8n:
    image: n8nio/n8n:latest
    environment:
      - LANGWATCH_API_KEY=${LANGWATCH_API_KEY}
      - N8N_OTEL_SERVICE_NAME=my-n8n
      - EXTERNAL_HOOK_FILES=/data/langwatch-hooks.cjs
    volumes:
      - ./node_modules/@langwatch/n8n-observability/dist/hooks.cjs:/data/langwatch-hooks.cjs:ro
      - n8n_data:/home/node/.n8n
    ports:
      - "5678:5678"
volumes:
  n8n_data:
```

> Ensure `@langwatch/n8n-observability` is installed on the host (e.g., `pnpm i` in your repo) so the mounted `dist/hooks.cjs` exists.

---

### C) Bare metal / npm terminal
```bash
# install globally OR locally
npm install -g @langwatch/n8n-observability

export LANGWATCH_API_KEY=your_api_key
export N8N_OTEL_SERVICE_NAME=my-n8n
export EXTERNAL_HOOK_FILES=$(node -e "console.log(require.resolve('@langwatch/n8n-observability/hooks'))")

n8n start
```

---

### D) Programmatic (custom runner)
```ts
// init.mjs or your bootstrap
import { setupN8nObservability } from '@langwatch/n8n-observability';

await setupN8nObservability({
  serviceName: process.env.N8N_OTEL_SERVICE_NAME ?? 'n8n',
  debug: process.env.N8N_OTEL_DEBUG === '1',
});

// then start n8n (your normal start chain)
```

---

## Configuration

| Variable                  | Purpose                                | Default |
| ------------------------- | -------------------------------------- | ------- |
| `LANGWATCH_API_KEY`       | **Required**                           | —       |
| `N8N_OTEL_SERVICE_NAME`   | Service name                           | `n8n`   |
| `N8N_OTEL_NODE_INCLUDE`   | Only trace listed nodes (name/type)    | —       |
| `N8N_OTEL_NODE_EXCLUDE`   | Exclude listed nodes (name/type)       | —       |
| `N8N_OTEL_CAPTURE_INPUT`  | Capture node I/O (`false` disables)    | true    |
| `N8N_OTEL_CAPTURE_OUTPUT` | Capture node output (`false` disables) | true    |
| `LW_DEBUG`                | LangWatch SDK debug logs               | off     |
| `N8N_OTEL_DEBUG`          | Hook patching diagnostics              | off     |
| `EXTERNAL_HOOK_FILES`     | Path to `dist/hooks.cjs` (hook modes)  | —       |

Examples:
```bash
export N8N_OTEL_NODE_INCLUDE=OpenAI,HTTP\ Request
export N8N_OTEL_NODE_EXCLUDE=Wait,Set
```

---

## Verify
```bash
node -e "console.log(require.resolve('@langwatch/n8n-observability/hooks'))"
```
Expected startup log:
```text
[@langwatch/n8n-observability] observability ready and patches applied
```

---

## More Info
See technical details and troubleshooting in:
[`packages/n8n-observability/README.md`](./packages/n8n-observability/README.md)

## License
MIT
