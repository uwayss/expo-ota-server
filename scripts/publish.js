const ExpoConfig = require('@expo/config');
const fs = require('fs-extra');
const path =require('path');
const { execSync } = require('child_process');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv)).options({
  'project-path': {
    alias: 'p',
    type: 'string',
    demandOption: true,
    describe: 'Path to the Expo project to publish.',
  },
  'runtime-version': {
    alias: 'r',
    type: 'string',
    demandOption: true,
    describe: 'The runtime version for the update.',
  },
}).argv;

function publish() {
  const { projectPath, runtimeVersion } = argv;

  if (!fs.existsSync(projectPath)) {
    console.error(`Error: Project path does not exist: ${projectPath}`);
    process.exit(1);
  }

  const projectDir = path.resolve(projectPath);
  const serverDir = path.resolve(__dirname, '..');

  console.log(`Publishing update for project: ${projectDir}`);
  console.log(`Runtime Version: ${runtimeVersion}`);

  console.log('\nRunning "npx expo export" in project directory...');
  execSync('npx expo export -p android', { cwd: projectDir, stdio: 'inherit' });

  const exportDistPath = path.join(projectDir, 'dist');
  if (!fs.existsSync(exportDistPath)) {
    console.error(`Error: "dist" folder not found after export. Check for errors above.`);
    process.exit(1);
  }

  const timestamp = Date.now();
  const updateDirectory = path.join(serverDir, 'updates', runtimeVersion, String(timestamp));

  console.log(`\nCreating update directory: ${updateDirectory}`);
  fs.ensureDirSync(updateDirectory);

  console.log(`Copying exported files from ${exportDistPath} to ${updateDirectory}`);
  fs.copySync(exportDistPath, updateDirectory);

  console.log('Extracting public Expo config...');
  const { exp } = ExpoConfig.getConfig(projectDir, {
    skipSDKVersionRequirement: true,
    isPublicConfig: true,
  });
  const expoConfigPath = path.join(updateDirectory, 'expoConfig.json');
  fs.writeJsonSync(expoConfigPath, exp, { spaces: 2 });
  console.log(`Saved public config to ${expoConfigPath}`);

  console.log('\n✅ Publish complete!');
}

publish();