import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const required = ['mongoose', 'zod'];
const missing = [];
for (const name of required) {
  try { require(name); } catch { missing.push(name); }
}
if (missing.length) {
  console.error(`Missing dependencies: ${missing.join(', ')}`);
  console.error('Run: npm install');
  process.exit(1);
}
console.log('Dependency preflight: OK');
