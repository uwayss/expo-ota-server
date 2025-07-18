// FILE: common/helpers.js
const crypto = require("crypto");
const fsSync = require("fs");
const fs = require("fs/promises");
const mime = require("mime");
const fetch = require("node-fetch");
const path = require("path");

const { GITHUB_TOKEN } = process.env;
const UPDATES_REPO_OWNER = "uwayss";
const UPDATES_REPO_NAME = "easyweather-updates";
const GITHUB_API_URL = "https://api.github.com";
const GITHUB_RAW_URL = "https://raw.githubusercontent.com";

class NoUpdateAvailableError extends Error {}

function createHash(file, hashingAlgorithm, encoding) {
  return crypto.createHash(hashingAlgorithm).update(file).digest(encoding);
}

function getBase64URLEncoding(base64EncodedString) {
  return base64EncodedString
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function convertToDictionaryItemsRepresentation(obj) {
  return new Map(
    Object.entries(obj).map(([k, v]) => {
      return [k, [v, new Map()]];
    })
  );
}

function signRSASHA256(data, privateKey) {
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(data, "utf8");
  sign.end();
  return sign.sign(privateKey, "base64");
}

async function getPrivateKeyAsync() {
  const privateKeyPath = process.env.PRIVATE_KEY_PATH;
  if (!privateKeyPath || !fsSync.existsSync(privateKeyPath)) {
    return null;
  }
  const pemBuffer = await fs.readFile(path.resolve(privateKeyPath));
  return pemBuffer.toString("utf8");
}

async function githubFetch(url) {
  const headers = {
    "User-Agent": "expo-ota-server",
    "Cache-Control": "no-cache",
  };
  if (GITHUB_TOKEN) {
    headers.Authorization = `token ${GITHUB_TOKEN}`;
  }
  const res = await fetch(url, {
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `GitHub API request failed: ${res.status} ${res.statusText}\n${text}`
    );
  }
  return res.json();
}

async function getLatestUpdateBundlePathForRuntimeVersionAsync(runtimeVersion) {
  const contentsUrl = `${GITHUB_API_URL}/repos/${UPDATES_REPO_OWNER}/${UPDATES_REPO_NAME}/contents/updates/${runtimeVersion}`;
  try {
    const directories = await githubFetch(contentsUrl);

    if (!Array.isArray(directories) || directories.length === 0) {
      throw new Error(`Unsupported runtime version: ${runtimeVersion}`);
    }

    const sortedTimestamps = directories
      .filter((dir) => dir.type === "dir")
      .map((dir) => parseInt(dir.name, 10))
      .sort((a, b) => b - a);

    if (sortedTimestamps.length === 0) {
      throw new Error(
        `No valid update directories found for runtime version: ${runtimeVersion}`
      );
    }

    return `updates/${runtimeVersion}/${sortedTimestamps[0]}`;
  } catch {
    throw new Error(`No updates found for runtime version: ${runtimeVersion}`);
  }
}

async function getAssetMetadataAsync(arg) {
  const assetFullPath = `${arg.updateBundlePath}/${arg.filePath}`;
  const rawAssetUrl = `${GITHUB_RAW_URL}/${UPDATES_REPO_OWNER}/${UPDATES_REPO_NAME}/main/${assetFullPath}`;
  const response = await fetch(rawAssetUrl);
  const asset = await response.buffer();

  const assetHash = getBase64URLEncoding(createHash(asset, "sha256", "base64"));
  const key = createHash(asset, "md5", "hex");
  const keyExtensionSuffix = arg.isLaunchAsset ? "bundle" : arg.ext;
  const contentType = arg.isLaunchAsset
    ? "application/javascript"
    : mime.getType(arg.ext) || "application/octet-stream";

  const assetQuery = Buffer.from(assetFullPath).toString("base64");

  return {
    hash: assetHash,
    key,
    fileExtension: `.${keyExtensionSuffix}`,
    contentType,
    url: `${arg.serverAddress}/api/assets?asset=${assetQuery}&platform=${arg.platform}&runtimeVersion=${arg.runtimeVersion}`,
  };
}

async function createRollBackDirectiveAsync(updateBundlePath) {
  const rollbackFileUrl = `${GITHUB_API_URL}/repos/${UPDATES_REPO_OWNER}/${UPDATES_REPO_NAME}/contents/${updateBundlePath}/rollback`;
  try {
    await githubFetch(rollbackFileUrl);
    return {
      type: "rollBackToEmbedded",
      parameters: {
        commitTime: new Date().toISOString(),
      },
    };
  } catch (error) {
    throw new Error(`No rollback found. Error: ${error.message}`);
  }
}

async function createNoUpdateAvailableDirectiveAsync() {
  return {
    type: "noUpdateAvailable",
  };
}

async function fetchFromUpdateBundle(updateBundlePath, fileName) {
  const url = `${GITHUB_RAW_URL}/${UPDATES_REPO_OWNER}/${UPDATES_REPO_NAME}/main/${updateBundlePath}/${fileName}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${fileName}: ${response.statusText}`);
  }
  return response;
}

async function getMetadataAsync({ updateBundlePath, runtimeVersion }) {
  try {
    const response = await fetchFromUpdateBundle(
      updateBundlePath,
      "metadata.json"
    );
    const updateMetadataBuffer = await response.buffer();
    const metadataJson = JSON.parse(updateMetadataBuffer.toString("utf-8"));
    return {
      metadataJson,
      id: createHash(updateMetadataBuffer, "sha256", "hex"),
    };
  } catch (error) {
    throw new Error(
      `No metadata found for runtime version: ${runtimeVersion}. Error: ${error.message}`
    );
  }
}

async function getExpoConfigAsync({ updateBundlePath, runtimeVersion }) {
  try {
    const response = await fetchFromUpdateBundle(
      updateBundlePath,
      "expoConfig.json"
    );
    return await response.json();
  } catch (error) {
    throw new Error(
      `No expo config found for runtime version: ${runtimeVersion}. Error: ${error.message}`
    );
  }
}

function convertSHA256HashToUUID(value) {
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(
    12,
    16
  )}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

function truthy(value) {
  return !!value;
}

module.exports = {
  NoUpdateAvailableError,
  createHash,
  getBase64URLEncoding,
  convertToDictionaryItemsRepresentation,
  signRSASHA256,
  getPrivateKeyAsync,
  getLatestUpdateBundlePathForRuntimeVersionAsync,
  getAssetMetadataAsync,
  createRollBackDirectiveAsync,
  createNoUpdateAvailableDirectiveAsync,
  getMetadataAsync,
  getExpoConfigAsync,
  convertSHA256HashToUUID,
  truthy,
};
