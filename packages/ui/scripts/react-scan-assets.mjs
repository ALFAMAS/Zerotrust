import { mkdir, readFile, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const uiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(uiRoot, "node_modules/react-scan/dist/auto.global.js");
const targetDirectory = resolve(uiRoot, "public/~react-scan");
const target = resolve(targetDirectory, "auto.global.js");
const versionCheckUrl = "https://www.react-grab.com/api/version";

function removeExternalVersionCheck(asset) {
  const urlIndex = asset.indexOf(versionCheckUrl);
  const checkStart = asset.lastIndexOf("(()=>{", urlIndex);
  const checkEnd = asset.indexOf("})();", urlIndex);

  if (urlIndex < 0 || checkStart < 0 || checkEnd < 0) {
    throw new Error(
      "React Scan's version-check signature changed; review the vendored development asset before copying it."
    );
  }

  return `${asset.slice(0, checkStart)}${asset.slice(checkEnd + 5)}`;
}

async function copyAsset() {
  await mkdir(targetDirectory, { recursive: true });
  const asset = await readFile(source, "utf8");
  await writeFile(target, removeExternalVersionCheck(asset), "utf8");
  console.log(`React Scan development asset copied to: ${target}`);
}

async function cleanAsset() {
  await rm(target, { force: true });
  try {
    if ((await readdir(targetDirectory)).length === 0) {
      await rmdir(targetDirectory);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  console.log("React Scan development asset removed from public output.");
}

const command = process.argv[2];

if (command === "copy") {
  await copyAsset();
} else if (command === "clean") {
  await cleanAsset();
} else {
  throw new Error("Expected `copy` or `clean`.");
}
