import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const packageJsonPath = fileURLToPath(new URL('../package.json', import.meta.url));
const strategyPath = fileURLToPath(new URL('../src/simon42-dashboard-strategy.ts', import.meta.url));

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const strategySource = fs.readFileSync(strategyPath, 'utf8');

const packageVersion = packageJson.version;
if (!packageVersion || typeof packageVersion !== 'string') {
  console.error('package.json version missing or invalid');
  process.exit(1);
}

const strategyVersionMatch = strategySource.match(/const\s+STRATEGY_VERSION\s*=\s*['\"]([^'\"]+)['\"]/);
if (!strategyVersionMatch) {
  console.error('Could not find STRATEGY_VERSION in src/simon42-dashboard-strategy.ts');
  process.exit(1);
}

const strategyVersion = strategyVersionMatch[1];

if (packageVersion !== strategyVersion) {
  console.error(`Version mismatch: package.json=${packageVersion}, STRATEGY_VERSION=${strategyVersion}`);
  process.exit(1);
}

const refName = process.env.GITHUB_REF_NAME || '';
const refType = process.env.GITHUB_REF_TYPE || '';
const isTagRef = refType === 'tag' || (process.env.GITHUB_REF || '').startsWith('refs/tags/');

if (isTagRef) {
  const expectedTag = `v${packageVersion}`;
  if (refName !== expectedTag) {
    console.error(`Tag/version mismatch: tag=${refName}, expected=${expectedTag}`);
    process.exit(1);
  }
}

console.log(`Version check passed: ${packageVersion}`);
