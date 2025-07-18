const crypto = require("crypto");
const fsSync = require("fs");
const fs = require("fs/promises");
const mime = require("mime");
const path = require("path");

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
  if (!privateKeyPath) {
    return null;
  }

  const pemBuffer = await fs.readFile(path.resolve(privateKeyPath));
  return pemBuffer.toString("utf8");
}

async function getLatestUpdateBundlePathForRuntimeVersionAsync(runtimeVersion) {
  const updatesDirectoryForRuntimeVersion = `updates/${runtimeVersion}`;
  if (!fsSync.existsSync(updatesDirectoryForRuntimeVersion)) {
    throw new Error("Unsupported runtime version");
  }

  const filesInUpdatesDirectory = await fs.readdir(
    updatesDirectoryForRuntimeVersion
  );
  const directoriesInUpdatesDirectory = (
    await Promise.all(
      filesInUpdatesDirectory.map(async (file) => {
        const fileStat = await fs.stat(
          path.join(updatesDirectoryForRuntimeVersion, file)
        );
        return fileStat.isDirectory() ? file : null;
      })
    )
  )
    .filter(truthy)
    .sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
  return path.join(
    updatesDirectoryForRuntimeVersion,
    directoriesInUpdatesDirectory[0]
  );
}

async function getAssetMetadataAsync(arg) {
  const assetFilePath = `${arg.updateBundlePath}/${arg.filePath}`;
  const asset = await fs.readFile(path.resolve(assetFilePath), null);
  const assetHash = getBase64URLEncoding(createHash(asset, "sha256", "base64"));
  const key = createHash(asset, "md5", "hex");
  const keyExtensionSuffix = arg.isLaunchAsset ? "bundle" : arg.ext;
  const contentType = arg.isLaunchAsset
    ? "application/javascript"
    : mime.getType(arg.ext);

  return {
    hash: assetHash,
    key,
    fileExtension: `.${keyExtensionSuffix}`,
    contentType,
    url: `${arg.serverAddress}/api/assets?asset=${assetFilePath}&runtimeVersion=${arg.runtimeVersion}&platform=${arg.platform}`,
  };
}

async function createRollBackDirectiveAsync(updateBundlePath) {
  try {
    const rollbackFilePath = `${updateBundlePath}/rollback`;
    const rollbackFileStat = await fs.stat(rollbackFilePath);
    return {
      type: "rollBackToEmbedded",
      parameters: {
        commitTime: new Date(rollbackFileStat.birthtime).toISOString(),
      },
    };
  } catch (error) {
    throw new Error(`No rollback found. Error: ${error}`);
  }
}

async function createNoUpdateAvailableDirectiveAsync() {
  return {
    type: "noUpdateAvailable",
  };
}

async function getMetadataAsync({ updateBundlePath, runtimeVersion }) {
  try {
    const metadataPath = `${updateBundlePath}/metadata.json`;
    const updateMetadataBuffer = await fs.readFile(
      path.resolve(metadataPath),
      null
    );
    const metadataJson = JSON.parse(updateMetadataBuffer.toString("utf-8"));

    return {
      metadataJson,
      id: createHash(updateMetadataBuffer, "sha256", "hex"),
    };
  } catch (error) {
    throw new Error(
      `No update found with runtime version: ${runtimeVersion}. Error: ${error}`
    );
  }
}

async function getExpoConfigAsync({ updateBundlePath, runtimeVersion }) {
  try {
    const expoConfigPath = `${updateBundlePath}/expoConfig.json`;
    const expoConfigBuffer = await fs.readFile(
      path.resolve(expoConfigPath),
      null
    );
    const expoConfigJson = JSON.parse(expoConfigBuffer.toString("utf-8"));
    return expoConfigJson;
  } catch (error) {
    throw new Error(
      `No expo config json found with runtime version: ${runtimeVersion}. Error: ${error}`
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
