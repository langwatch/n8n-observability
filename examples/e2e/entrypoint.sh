#!/bin/sh
set -eu

# Install the local tarball (and its deps) into /tmp so Node can resolve requires
npm i --prefix /tmp /workspace/packages/n8n-observability/*.tgz

# Import and execute the sample workflow
n8n import:workflow --input /workspace/examples/e2e/workflow.json
n8n export:workflow --all --separate --output /tmp/exports

# Determine a workflow ID and execute it
ID=$(find /tmp/exports -name "*.json" -exec grep -ho "\"id\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" {} \; | head -n1 | sed -E "s/.*\"([^\"]+)\"/\1/")
if [ -z "$ID" ]; then
  echo "Could not determine workflow ID, trying to list workflows..."
  n8n list:workflow
  echo "Trying to execute with ID 1..."
  n8n execute --id 1 || echo "Execution failed"
else
  echo "Executing workflow with ID: $ID"
  n8n execute --id "$ID"
fi

# Allow some time for spans to flush
sleep 6
