const fs = require("fs");
const fsPromises = require("fs/promises");
const mime = require("mime");
const nullthrows = require("nullthrows");
const path = require("path");

const {
  getLatestUpdateBundlePathForRuntimeVersionAsync,
  getMetadataAsync,
} = require("../../common/helpers");

async function assetsEndpoint(req, res) {
  const { asset: assetName, runtimeVersion, platform } = req.query;

  console.warn("--- Asset Request Received ---");
  console.warn({
    asset: assetName,
    runtimeVersion,
    platform,
  });

  if (!assetName || typeof assetName !== "string") {
    res.statusCode = 400;
    res.json({ error: "No asset name provided." });
    return;
  }

  if (platform !== "android") {
    res.statusCode = 400;
    res.json({ error: 'No platform provided. Expected "android".' });
    return;
  }

  if (!runtimeVersion || typeof runtimeVersion !== "string") {
    res.statusCode = 400;
    res.json({ error: "No runtimeVersion provided." });
    return;
  }

  let updateBundlePath;
  try {
    updateBundlePath = await getLatestUpdateBundlePathForRuntimeVersionAsync(
      runtimeVersion
    );
  } catch (error) {
    res.statusCode = 404;
    res.json({
      error: error.message,
    });
    return;
  }

  const { metadataJson } = await getMetadataAsync({
    updateBundlePath,
    runtimeVersion,
  });

  const assetPath = path.resolve(assetName);
  const assetMetadata = metadataJson.fileMetadata[platform].assets.find(
    (asset) => asset.path === assetName.replace(`${updateBundlePath}/`, "")
  );
  const isLaunchAsset =
    metadataJson.fileMetadata[platform].bundle ===
    assetName.replace(`${updateBundlePath}/`, "");

  if (!fs.existsSync(assetPath)) {
    res.statusCode = 404;
    res.json({ error: `Asset "${assetName}" does not exist.` });
    return;
  }

  try {
    const asset = await fsPromises.readFile(assetPath, null);

    res.statusCode = 200;
    res.setHeader(
      "content-type",
      isLaunchAsset
        ? "application/javascript"
        : nullthrows(mime.getType(assetMetadata.ext))
    );
    res.end(asset);
  } catch (error) {
    console.log(error);
    res.statusCode = 500;
    res.json({ error });
  }
}

module.exports = assetsEndpoint;
