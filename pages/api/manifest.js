const FormData = require('form-data');
const fs = require('fs/promises');
const { serializeDictionary } = require('structured-headers');

const {
  getAssetMetadataAsync,
  getMetadataAsync,
  convertSHA256HashToUUID,
  convertToDictionaryItemsRepresentation,
  signRSASHA256,
  getPrivateKeyAsync,
  getExpoConfigAsync,
  getLatestUpdateBundlePathForRuntimeVersionAsync,
  createRollBackDirectiveAsync,
  NoUpdateAvailableError,
  createNoUpdateAvailableDirectiveAsync,
} = require('../../common/helpers');

const UpdateType = {
  NORMAL_UPDATE: 0,
  ROLLBACK: 1,
};

async function getTypeOfUpdateAsync(updateBundlePath) {
  const directoryContents = await fs.readdir(updateBundlePath);
  return directoryContents.includes('rollback') ? UpdateType.ROLLBACK : UpdateType.NORMAL_UPDATE;
}

async function putUpdateInResponseAsync(
  req,
  res,
  updateBundlePath,
  runtimeVersion,
  platform,
  protocolVersion,
  serverAddress
) {
  const currentUpdateId = req.headers['expo-current-update-id'];
  const { metadataJson, createdAt, id } = await getMetadataAsync({
    updateBundlePath,
    runtimeVersion,
  });

  if (currentUpdateId === convertSHA256HashToUUID(id) && protocolVersion === 1) {
    throw new NoUpdateAvailableError();
  }

  const expoConfig = await getExpoConfigAsync({
    updateBundlePath,
    runtimeVersion,
  });
  const platformSpecificMetadata = metadataJson.fileMetadata[platform];
  const manifest = {
    id: convertSHA256HashToUUID(id),
    createdAt,
    runtimeVersion,
    assets: await Promise.all(
      platformSpecificMetadata.assets.map((asset) =>
        getAssetMetadataAsync({
          updateBundlePath,
          filePath: asset.path,
          ext: asset.ext,
          runtimeVersion,
          platform,
          isLaunchAsset: false,
          serverAddress,
        })
      )
    ),
    launchAsset: await getAssetMetadataAsync({
      updateBundlePath,
      filePath: platformSpecificMetadata.bundle,
      isLaunchAsset: true,
      runtimeVersion,
      platform,
      ext: null,
      serverAddress,
    }),
    metadata: {},
    extra: {
      expoClient: expoConfig,
    },
  };

  let signature = null;
  const expectSignatureHeader = req.headers['expo-expect-signature'];
  if (expectSignatureHeader) {
    const privateKey = await getPrivateKeyAsync();
    if (!privateKey) {
      res.statusCode = 400;
      res.json({
        error: 'Code signing requested but no key supplied when starting server.',
      });
      return;
    }
    const manifestString = JSON.stringify(manifest);
    const hashSignature = signRSASHA256(manifestString, privateKey);
    const dictionary = convertToDictionaryItemsRepresentation({
      sig: hashSignature,
      keyid: 'main',
    });
    signature = serializeDictionary(dictionary);
  }

  const assetRequestHeaders = {};
  [...manifest.assets, manifest.launchAsset].forEach((asset) => {
    assetRequestHeaders[asset.key] = {
      'test-header': 'test-header-value',
    };
  });

  const form = new FormData();
  form.append('manifest', JSON.stringify(manifest), {
    contentType: 'application/json',
    header: {
      'content-type': 'application/json; charset=utf-8',
      ...(signature ? { 'expo-signature': signature } : {}),
    },
  });
  form.append('extensions', JSON.stringify({ assetRequestHeaders }), {
    contentType: 'application/json',
  });

  res.statusCode = 200;
  res.setHeader('expo-protocol-version', protocolVersion);
  res.setHeader('expo-sfv-version', 0);
  res.setHeader('cache-control', 'private, max-age=0');
  res.setHeader('content-type', `multipart/mixed; boundary=${form.getBoundary()}`);
  res.write(form.getBuffer());
  res.end();
}

async function putRollBackInResponseAsync(req, res, updateBundlePath, protocolVersion) {
  if (protocolVersion === 0) {
    throw new Error('Rollbacks not supported on protocol version 0');
  }

  const embeddedUpdateId = req.headers['expo-embedded-update-id'];
  if (!embeddedUpdateId || typeof embeddedUpdateId !== 'string') {
    throw new Error('Invalid Expo-Embedded-Update-ID request header specified.');
  }

  const currentUpdateId = req.headers['expo-current-update-id'];
  if (currentUpdateId === embeddedUpdateId) {
    throw new NoUpdateAvailableError();
  }

  const directive = await createRollBackDirectiveAsync(updateBundlePath);

  let signature = null;
  const expectSignatureHeader = req.headers['expo-expect-signature'];
  if (expectSignatureHeader) {
    const privateKey = await getPrivateKeyAsync();
    if (!privateKey) {
      res.statusCode = 400;
      res.json({
        error: 'Code signing requested but no key supplied when starting server.',
      });
      return;
    }
    const directiveString = JSON.stringify(directive);
    const hashSignature = signRSASHA256(directiveString, privateKey);
    const dictionary = convertToDictionaryItemsRepresentation({
      sig: hashSignature,
      keyid: 'main',
    });
    signature = serializeDictionary(dictionary);
  }

  const form = new FormData();
  form.append('directive', JSON.stringify(directive), {
    contentType: 'application/json',
    header: {
      'content-type': 'application/json; charset=utf-8',
      ...(signature ? { 'expo-signature': signature } : {}),
    },
  });

  res.statusCode = 200;
  res.setHeader('expo-protocol-version', 1);
  res.setHeader('expo-sfv-version', 0);
  res.setHeader('cache-control', 'private, max-age=0');
  res.setHeader('content-type', `multipart/mixed; boundary=${form.getBoundary()}`);
  res.write(form.getBuffer());
  res.end();
}

async function putNoUpdateAvailableInResponseAsync(req, res, protocolVersion) {
  if (protocolVersion === 0) {
    throw new Error('NoUpdateAvailable directive not available in protocol version 0');
  }

  const directive = await createNoUpdateAvailableDirectiveAsync();

  let signature = null;
  const expectSignatureHeader = req.headers['expo-expect-signature'];
  if (expectSignatureHeader) {
    const privateKey = await getPrivateKeyAsync();
    if (!privateKey) {
      res.statusCode = 400;
      res.json({
        error: 'Code signing requested but no key supplied when starting server.',
      });
      return;
    }
    const directiveString = JSON.stringify(directive);
    const hashSignature = signRSASHA256(directiveString, privateKey);
    const dictionary = convertToDictionaryItemsRepresentation({
      sig: hashSignature,
      keyid: 'main',
    });
    signature = serializeDictionary(dictionary);
  }

  const form = new FormData();
  form.append('directive', JSON.stringify(directive), {
    contentType: 'application/json',
    header: {
      'content-type': 'application/json; charset=utf-8',
      ...(signature ? { 'expo-signature': signature } : {}),
    },
  });

  res.statusCode = 200;
  res.setHeader('expo-protocol-version', 1);
  res.setHeader('expo-sfv-version', 0);
  res.setHeader('cache-control', 'private, max-age=0');
  res.setHeader('content-type', `multipart/mixed; boundary=${form.getBoundary()}`);
  res.write(form.getBuffer());
  res.end();
}

async function manifestEndpoint(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.json({ error: 'Expected GET.' });
    return;
  }
console.warn("got a request")
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['host'];
  const serverAddress = `${protocol}://${host}`;

  const protocolVersionMaybeArray = req.headers['expo-protocol-version'];
  if (protocolVersionMaybeArray && Array.isArray(protocolVersionMaybeArray)) {
    res.statusCode = 400;
    res.json({
      error: 'Unsupported protocol version. Expected either 0 or 1.',
    });
    return;
  }
  const protocolVersion = parseInt(protocolVersionMaybeArray ?? '0', 10);

  const platform = req.headers['expo-platform'] ?? req.query['platform'];
  if (platform !== 'android') {
    res.statusCode = 400;
    res.json({
      error: 'Unsupported platform. Expected "android".',
    });
    return;
  }

  const runtimeVersion = req.headers['expo-runtime-version'] ?? req.query['runtime-version'];
  if (!runtimeVersion || typeof runtimeVersion !== 'string') {
    res.statusCode = 400;
    res.json({
      error: 'No runtimeVersion provided.',
    });
    return;
  }

  let updateBundlePath;
  try {
    updateBundlePath = await getLatestUpdateBundlePathForRuntimeVersionAsync(runtimeVersion);
  } catch (error) {
    res.statusCode = 404;
    res.json({
      error: error.message,
    });
    return;
  }

  const updateType = await getTypeOfUpdateAsync(updateBundlePath);

  try {
    try {
      if (updateType === UpdateType.NORMAL_UPDATE) {
        console.warn("delivered normal update")
        await putUpdateInResponseAsync(
          req,
          res,
          updateBundlePath,
          runtimeVersion,
          platform,
          protocolVersion,
          serverAddress
        );
      } else if (updateType === UpdateType.ROLLBACK) {
        console.warn("delivered rollback update")
        await putRollBackInResponseAsync(req, res, updateBundlePath, protocolVersion);
      }
    } catch (maybeNoUpdateAvailableError) {
      if (maybeNoUpdateAvailableError instanceof NoUpdateAvailableError) {
        await putNoUpdateAvailableInResponseAsync(req, res, protocolVersion);
        return;
      }
      throw maybeNoUpdateAvailableError;
    }
  } catch (error) {
    console.error(error);
    res.statusCode = 404;
    res.json({ error });
  }
}

module.exports = manifestEndpoint;