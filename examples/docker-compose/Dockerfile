FROM n8nio/n8n:latest

USER root
WORKDIR /usr/local/lib/node_modules/n8n
RUN npm install @langwatch/n8n-observability

ENV EXTERNAL_HOOK_FILES=/usr/local/lib/node_modules/n8n/node_modules/@langwatch/n8n-observability/dist/hooks.cjs

USER node
