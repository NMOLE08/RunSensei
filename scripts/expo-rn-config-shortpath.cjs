const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const projectRoot = path.resolve(process.cwd(), '..');
  const physicalRoot = await fs.promises.realpath(projectRoot);
  const result = spawnSync(
    process.execPath,
    [
      '--no-warnings',
      '--eval',
      "require('expo/bin/autolinking')",
      'expo-modules-autolinking',
      'react-native-config',
      '--platform',
      'android',
      '--project-root',
      physicalRoot,
      '--json',
    ],
    { cwd: physicalRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }

  const physicalPrefix = physicalRoot.toLowerCase() + path.sep;
  const shortProjectPrefix = projectRoot.replace(/[\\/]+$/, '');
  const physicalForwardRoot = physicalRoot.replaceAll('\\', '/');
  const shortForwardPrefix = shortProjectPrefix.replaceAll('\\', '/');
  const physicalForwardPrefix = physicalForwardRoot.toLowerCase() + '/';
  function shorten(value) {
    if (typeof value === 'string') {
      if (value.toLowerCase() === physicalRoot.toLowerCase()) return projectRoot;
      if (value.toLowerCase().startsWith(physicalPrefix)) {
        return shortProjectPrefix + value.slice(physicalRoot.length);
      }
      if (value.toLowerCase().startsWith(physicalForwardPrefix)) {
        return shortForwardPrefix + value.slice(physicalForwardRoot.length);
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(shorten);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shorten(item)]));
    }
    return value;
  }

  process.stdout.write(JSON.stringify(shorten(JSON.parse(result.stdout))));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
