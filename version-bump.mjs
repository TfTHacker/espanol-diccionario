import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;

if (!targetVersion) {
  console.error("Error: npm_package_version not set. Run via 'npm version <patch|minor|major>'.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
const lockfile = JSON.parse(readFileSync("package-lock.json", "utf8"));

manifest.version = targetVersion;
versions[manifest.minAppVersion] = targetVersion;
lockfile.version = targetVersion;
if (lockfile.packages && lockfile.packages[""]) {
  lockfile.packages[""].version = targetVersion;
}

writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");
writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");
writeFileSync("package-lock.json", JSON.stringify(lockfile, null, 2) + "\n");

console.log(`Aligned manifest.json, versions.json, and package-lock.json to ${targetVersion}`);