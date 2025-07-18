const mime = require("mime");
const fetch = require("node-fetch");
const nullthrows = require("nullthrows");

const UPDATES_REPO_OWNER = "uwayss";
const UPDATES_REPO_NAME = "easyweather-updates";
const GITHUB_RAW_URL = "https://raw.githubusercontent.com";

async function assetsEndpoint(req, res) {
  const { asset } = req.query;

  if (!asset || typeof asset !== "string") {
    res.statusCode = 400;
    res.json({ error: "No asset name provided." });
    return;
  }

  const assetPath = Buffer.from(asset, "base64").toString("utf-8");
  const isLaunchAsset = assetPath.endsWith(".bundle");
  const ext = assetPath.split(".").pop();

  const assetUrl = `${GITHUB_RAW_URL}/${UPDATES_REPO_OWNER}/${UPDATES_REPO_NAME}/main/${assetPath}`;

  try {
    const response = await fetch(assetUrl);
    if (!response.ok) {
      res.statusCode = response.status;
      res.json({
        error: `Failed to fetch asset from GitHub: ${response.statusText}`,
      });
      return;
    }

    const contentType = isLaunchAsset
      ? "application/javascript"
      : nullthrows(mime.getType(ext));

    res.statusCode = 200;
    res.setHeader("content-type", contentType);
    response.body.pipe(res);
  } catch (error) {
    console.log(error);
    res.statusCode = 500;
    res.json({ error: error.message });
  }
}

module.exports = assetsEndpoint;
