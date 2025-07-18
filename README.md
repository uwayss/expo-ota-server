# Custom Expo Updates Server

This repo contains a server that implements the [Expo Updates protocol specification](https://docs.expo.dev/technical-specs/expo-updates-0).

> [!IMPORTANT]
> This repo exists to provide a basic demonstration of how the protocol might be translated to code. It is not guaranteed to be complete, stable, or performant enough to use as a full-fledged backend for expo-updates. Expo does not provide hands-on technical support for custom expo-updates server implementations, including what is in this repo. Issues within the expo-updates client library itself (independent of server) may be reported at https://github.com/expo/expo/issues/new/choose.

## Why

Expo provides a set of services named EAS (Expo Application Services), one of which is EAS Update which can host and serve updates for an Expo app using the [`expo-updates`](https://github.com/expo/expo/tree/main/packages/expo-updates) library.

In some cases more control of how updates are sent to an app may be needed, and one option is to implement a custom updates server that adheres to the specification in order to serve update manifests and assets.

## How it works

To serve an update, you must first export your Expo app's bundle and assets using `npx expo export`. The resulting `dist` folder should be copied into the `updates/<runtime-version>/<timestamp>/` directory of this server project.

The server will then serve the latest update for a given `runtime-version` and `platform` when an app requests a manifest.

## Running the server

First, install dependencies:

```bash
npm install
```

To run the development server:

```bash
npm run dev
```

The server will start on `http://localhost:3000`. You can configure your Expo app's `app.json` to point to this URL.

## About this server

This server was created with NextJS. You can find the API endpoints in **pages/api/manifest.ts** and **pages/api/assets.ts**.

The code signing keys and certificates were generated using https://github.com/expo/code-signing-certificates.
