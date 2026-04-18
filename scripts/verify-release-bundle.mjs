import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, 'dist');
const entryFile = path.join(distDir, 'simon42-dashboard-strategy.js');

if (!fs.existsSync(distDir)) {
  console.error('dist directory missing (build did not run or failed)');
  process.exit(1);
}

if (!fs.existsSync(entryFile)) {
  console.error('dist/simon42-dashboard-strategy.js missing');
  process.exit(1);
}

const files = fs.readdirSync(distDir);

const requiredChunks = ['core', 'lit', 'views', 'editor'];
for (const chunkName of requiredChunks) {
  const hasChunk = files.some((file) =>
    new RegExp(`^simon42-dashboard-strategy-${chunkName}\.[a-f0-9]{8}\.js$`).test(file)
  );
  if (!hasChunk) {
    console.error(`Missing required chunk file for '${chunkName}' in dist/`);
    process.exit(1);
  }
}

const hasAnyLicenseFile = files.some((file) => file.endsWith('.js.LICENSE.txt'));
if (!hasAnyLicenseFile) {
  console.error('No .js.LICENSE.txt files found in dist/');
  process.exit(1);
}

console.log('Bundle check passed: entry + required hashed chunks + license files present');
