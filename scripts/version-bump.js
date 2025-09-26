#!/usr/bin/env node

/**
 * Version Bump Script for PwnChat
 * Automatically bumps version across all package.json files and electron-builder config
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Define all files that contain version numbers
const VERSION_FILES = [
  'package.json',
  'backend/package.json',
  'electron-builder.json5'
];

/**
 * Parse semantic version string
 */
function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) throw new Error(`Invalid version format: ${version}`);

  return {
    major: parseInt(match[1]),
    minor: parseInt(match[2]),
    patch: parseInt(match[3]),
    prerelease: match[4] || null
  };
}

/**
 * Format version object back to string
 */
function formatVersion(version) {
  let versionString = `${version.major}.${version.minor}.${version.patch}`;
  if (version.prerelease) {
    versionString += `-${version.prerelease}`;
  }
  return versionString;
}

/**
 * Bump version according to type
 */
function bumpVersion(currentVersion, bumpType) {
  const version = parseVersion(currentVersion);

  switch (bumpType) {
    case 'major':
      version.major++;
      version.minor = 0;
      version.patch = 0;
      version.prerelease = null;
      break;
    case 'minor':
      version.minor++;
      version.patch = 0;
      version.prerelease = null;
      break;
    case 'patch':
      version.patch++;
      version.prerelease = null;
      break;
    case 'prerelease':
      if (version.prerelease) {
        // Increment existing prerelease
        const match = version.prerelease.match(/^(.+?)\.?(\d+)$/);
        if (match) {
          version.prerelease = `${match[1]}.${parseInt(match[2]) + 1}`;
        } else {
          version.prerelease = `${version.prerelease}.1`;
        }
      } else {
        // Create new prerelease
        version.patch++;
        version.prerelease = 'beta.0';
      }
      break;
    default:
      throw new Error(`Invalid bump type: ${bumpType}. Use major, minor, patch, or prerelease`);
  }

  return formatVersion(version);
}

/**
 * Get current version from main package.json
 */
function getCurrentVersion() {
  const packagePath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  return packageJson.version || '0.0.0';
}

/**
 * Update version in package.json files
 */
function updatePackageVersion(filePath, newVersion) {
  const fullPath = path.join(process.cwd(), filePath);

  if (!fs.existsSync(fullPath)) {
    console.warn(`⚠️  File not found: ${filePath}`);
    return false;
  }

  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    const packageJson = JSON.parse(content);

    const oldVersion = packageJson.version;
    packageJson.version = newVersion;

    fs.writeFileSync(fullPath, JSON.stringify(packageJson, null, 2) + '\n');
    console.log(`✅ Updated ${filePath}: ${oldVersion} → ${newVersion}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to update ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Update version in electron-builder.json5
 */
function updateElectronBuilderVersion(newVersion) {
  const filePath = path.join(process.cwd(), 'electron-builder.json5');

  if (!fs.existsSync(filePath)) {
    console.warn('⚠️  electron-builder.json5 not found');
    return false;
  }

  try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Update buildVersion field
    const buildVersionRegex = /"buildVersion":\s*"[^"]*"/;
    if (buildVersionRegex.test(content)) {
      content = content.replace(buildVersionRegex, `"buildVersion": "${newVersion}"`);
    } else {
      // Add buildVersion if it doesn't exist
      content = content.replace(
        /("electronVersion":\s*"[^"]*")/,
        `$1,\n\n  // Build Configuration\n  "buildVersion": "${newVersion}"`
      );
    }

    fs.writeFileSync(filePath, content);
    console.log(`✅ Updated electron-builder.json5 buildVersion: ${newVersion}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to update electron-builder.json5:', error.message);
    return false;
  }
}

/**
 * Create git tag for the new version
 */
function createGitTag(version, message) {
  try {
    const tagName = `v${version}`;

    // Check if tag already exists
    try {
      execSync(`git rev-parse ${tagName}`, { stdio: 'ignore' });
      console.warn(`⚠️  Tag ${tagName} already exists`);
      return false;
    } catch {
      // Tag doesn't exist, continue
    }

    // Create and push tag
    execSync(`git tag -a ${tagName} -m "${message || `Release ${tagName}`}"`, { stdio: 'inherit' });
    console.log(`✅ Created git tag: ${tagName}`);

    // Ask user if they want to push the tag
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('Push tag to remote? (y/N): ', (answer) => {
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        try {
          execSync(`git push origin ${tagName}`, { stdio: 'inherit' });
          console.log(`✅ Pushed tag ${tagName} to remote`);
        } catch (error) {
          console.error('❌ Failed to push tag:', error.message);
        }
      }
      readline.close();
    });

    return true;
  } catch (error) {
    console.error('❌ Failed to create git tag:', error.message);
    return false;
  }
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  const bumpType = args[0];
  const message = args[1];

  if (!bumpType || !['major', 'minor', 'patch', 'prerelease'].includes(bumpType)) {
    console.error('Usage: node scripts/version-bump.js <major|minor|patch|prerelease> [tag-message]');
    console.error('');
    console.error('Examples:');
    console.error('  node scripts/version-bump.js patch');
    console.error('  node scripts/version-bump.js minor "Add new features"');
    console.error('  node scripts/version-bump.js major "Breaking changes in v2.0"');
    console.error('  node scripts/version-bump.js prerelease');
    process.exit(1);
  }

  console.log('🚀 PwnChat Version Bump');
  console.log('=====================\n');

  // Get current version and calculate new version
  const currentVersion = getCurrentVersion();
  const newVersion = bumpVersion(currentVersion, bumpType);

  console.log(`Current version: ${currentVersion}`);
  console.log(`New version: ${newVersion}`);
  console.log(`Bump type: ${bumpType}\n`);

  // Update all version files
  let success = true;

  // Update package.json files
  for (const file of VERSION_FILES.filter(f => f.endsWith('.json'))) {
    if (!updatePackageVersion(file, newVersion)) {
      success = false;
    }
  }

  // Update electron-builder.json5
  if (!updateElectronBuilderVersion(newVersion)) {
    success = false;
  }

  if (!success) {
    console.error('\n❌ Some files failed to update');
    process.exit(1);
  }

  console.log('\n✨ Version bump complete!');
  console.log('\nNext steps:');
  console.log('1. Review the changes');
  console.log('2. Commit the version bump');
  console.log('3. Create and push a git tag to trigger release');
  console.log('');
  console.log('Commands:');
  console.log(`  git add -A`);
  console.log(`  git commit -m "bump version to ${newVersion}"`);
  console.log(`  git tag v${newVersion}`);
  console.log(`  git push origin main --tags`);

  // Optionally create git tag
  if (process.argv.includes('--tag')) {
    createGitTag(newVersion, message);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseVersion,
  formatVersion,
  bumpVersion,
  getCurrentVersion,
  updatePackageVersion,
  updateElectronBuilderVersion
};