// FILE: pages/api/assets.js
const mime = require("mime");
const fetch = require("node-fetch");

const {
  getLatestUpdateBundlePathForRuntimeVersionAsync,
  getMetadataAsync,
} = require("../../common/helpers");

const UPDATES_REPO_OWNER = "uwayss";
const UPDATES_REPO_NAME = "easyweather-updates";
const GITHUB_RAW_URL = "https://raw.githubusercontent.com";

async function assetsEndpoint(req, res) {
  const { asset, platform, runtimeVersion } = req.query;

  if (!asset || typeof asset !== "string") {
    res.statusCode = 400;
    res.json({ error: "No asset name provided." });
    return;
  }

  if (!runtimeVersion || typeof runtimeVersion !== "string") {
    res.statusCode = 400;
    res.json({ error: "No runtimeVersion provided." });
    return;
  }

  try {
    const assetPath = Buffer.from(asset, "base64").toString("utf-8");
    const updateBundlePath =
      await getLatestUpdateBundlePathForRuntimeVersionAsync(runtimeVersion);
    const { metadataJson } = await getMetadataAsync({
      updateBundlePath,
      runtimeVersion,
    });

    const assetMetadata = metadataJson.fileMetadata[platform].assets.find((a) =>
      assetPath.endsWith(a.path)
    );

    const isLaunchAsset = assetPath.endsWith(
      metadataJson.fileMetadata[platform].bundle
    );

    let contentType;
    if (isLaunchAsset) {
      contentType = "application/javascript";
    } else if (assetMetadata) {
      contentType =
        mime.getType(assetMetadata.ext) || "application/octet-stream";
    } else {
      contentType = "application/octet-stream";
    }

    const assetUrl = `${GITHUB_RAW_URL}/${UPDATES_REPO_OWNER}/${UPDATES_REPO_NAME}/main/${assetPath}`;

    const response = await fetch(assetUrl);
    if (!response.ok) {
      res.statusCode = response.status;
      res.json({
        error: `Failed to fetch asset from GitHub: ${response.statusText}`,
      });
      return;
    }

    res.statusCode = 200;
    res.setHeader("content-type", contentType);
    response.body.pipe(res);
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.json({ error: error.message });
  }
}

module.exports = assetsEndpoint;
