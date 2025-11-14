#!/usr/bin/env node
/**
 * Build Lambda deployment package
 * Pure Node.js implementation - no PowerShell dependency
 * 
 * Usage: node build-lambda.js
 * Builds the unified VWC Lambda with all routes
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PACKAGE_DIR = path.join(DIST_DIR, 'lambda-package');
const INFRA_DIR = path.resolve(ROOT_DIR, '..', 'infra');
const ZIP_PATH = path.join(INFRA_DIR, 'lambda-vwc.zip');

console.log('Building unified VWC Lambda deployment package...\n');

// Clean previous build
if (fs.existsSync(DIST_DIR)) {
  console.log('Cleaning previous build...');
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}

// Build TypeScript
console.log('Compiling TypeScript...');
execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });

// Create package directory
console.log('Creating package directory...');
fs.mkdirSync(PACKAGE_DIR, { recursive: true });

// Copy compiled files
console.log('Copying compiled files...');
const distFiles = fs.readdirSync(DIST_DIR);
for (const file of distFiles) {
  if (file !== 'lambda-package') {
    const src = path.join(DIST_DIR, file);
    const dest = path.join(PACKAGE_DIR, file);
    if (fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}

// Copy package.json for production dependency install
console.log('Installing production dependencies...');
fs.copyFileSync(
  path.join(ROOT_DIR, 'package.json'),
  path.join(PACKAGE_DIR, 'package.json')
);

execSync('npm install --omit=dev --no-package-lock', {
  cwd: PACKAGE_DIR,
  stdio: 'inherit'
});

// Create ZIP archive
console.log('Creating deployment archive...');
if (fs.existsSync(ZIP_PATH)) {
  fs.unlinkSync(ZIP_PATH);
}

const output = fs.createWriteStream(ZIP_PATH);
const archive = archiver('zip', { zlib: { level: 9 } });

archive.on('error', (err) => {
  throw err;
});

output.on('close', () => {
  const sizeInMB = (archive.pointer() / (1024 * 1024)).toFixed(2);
  console.log(`\n✅ VWC Lambda package created: ${ZIP_PATH} (${sizeInMB} MB)`);
  console.log('   Includes: Router + all route handlers (CRUD + AI Chat)');
});

archive.pipe(output);
archive.directory(PACKAGE_DIR, false);
archive.finalize();
