import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const composeFile = path.resolve('examples/e2e/docker-compose.yml');
// When LW_DEBUG and N8N_OTEL_DEBUG are enabled, we validate by console logs (docker up output)

function sh(cmd, args, opts={}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
    p.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
  });
}

async function main() {
  // Build and pack a fresh tarball, then place it under packages/n8n-observability for the compose install
  await sh('pnpm', ['-F', '@langwatch/n8n-observability', 'build']);
  const rootDir = process.cwd();
  const pkgDir = path.resolve('packages/n8n-observability');
  // Clean old tarballs in both locations
  for (const f of await fs.promises.readdir(pkgDir)) {
    if (f.endsWith('.tgz')) await fs.promises.unlink(path.join(pkgDir, f));
  }
  for (const f of await fs.promises.readdir(rootDir)) {
    if (f.startsWith('langwatch-n8n-observability-') && f.endsWith('.tgz')) {
      await fs.promises.unlink(path.join(rootDir, f));
    }
  }
  await sh('pnpm', ['-F', '@langwatch/n8n-observability', 'pack']);
  // Find the newly created tarball at repo root and move it to the package dir
  const rootFiles = await fs.promises.readdir(rootDir);
  const tarballName = rootFiles.find(f => f.startsWith('langwatch-n8n-observability-') && f.endsWith('.tgz'));
  if (!tarballName) throw new Error('Tarball not found after pack');
  await fs.promises.rename(path.join(rootDir, tarballName), path.join(pkgDir, tarballName));

  // Clean old data
  try { await fs.promises.unlink(dataFile); } catch {}

  // Up once (build)
  await sh('docker', ['compose', '-f', composeFile, 'build']);

  // Run the one-shot workflow container and stream logs
  // We'll capture output to a buffer to make assertions
  await new Promise((resolve, reject) => {
    const p = spawn('docker', ['compose', '-f', composeFile, 'up', '--abort-on-container-exit', '--exit-code-from', 'n8n-e2e']);
    let buf = '';
    p.stdout.on('data', (d) => { process.stdout.write(d); buf += d.toString(); });
    p.stderr.on('data', (d) => { process.stderr.write(d); buf += d.toString(); });
    p.on('exit', (code) => {
      if (code !== 0) return reject(new Error(`docker exited ${code}`));
      try {
        // Check for our debug logs from the hooks
        if (!buf.includes('[LangWatch Observability SDK]')) {
          throw new Error('Expected LangWatch SDK logs not found');
        }
        if (!buf.includes('[@langwatch/n8n-observability] [PATCH]')) {
          throw new Error('Expected patch debug logs not found');
        }
        console.log('E2E OK: SDK and patch logs present');
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
