# Module Federation For Next.js, with SSR support

This plugin enables Module Federation on Next.js, both client-side and server-side.

Module Federation on the server utilizes proprietary software, commonly known as "Software Streaming"

This is the only _stable_ and continuously supported solution for Module Federation on Next.js.

It is also the only Federated SSR solution in existence that is supported by the creator of Module Federation.

#### This is currently in beta, and should be considered experimental till v1 is released.

Software Streams have been tested extensively in other federated server applications, the underlying tech is proven to be reliable.
However, software streams in Next.js is experimental, while in the beta phase.

Companies have used streams with next.js in the past - but those streaming plugins were based on a leaked alpha we created before Webpack 5 was released.

This is the first time the Federation Group has made its proprietary technology available to others. Our technology is the most stable in existence.

This is because of our proximity to the Webpack Foundation & deep understanding

### Supports

- next ^11.x.x || ^12.x.x
- SSR & CSR

## What's shared by default?

Under the hood we share some next internals automatically
You do not need to share these packages, sharing next internals yourself will cause errors.

```js
const sharedDefaults = {
  "next/dynamic": {
    requiredVersion: false,
    singleton: true,
  },
  "styled-jsx": {
    requiredVersion: false,
    singleton: true,
  },
  "next/link": {
    requiredVersion: false,
    singleton: true,
  },
  "next/router": {
    requiredVersion: false,
    singleton: true,
  },
  "next/script": {
    requiredVersion: false,
    singleton: true,
  },
  "next/head": {
    requiredVersion: false,
    singleton: true,
  },
};
```

## Important note about security!

This plugin creates a remote container for the server-side. By default, it is written to `_next/static/ssr`.
It is highly recommended that network access to `_next/static/ssr/*` is restricted to servers/machines inside the VPN or internal infrastructure.

If access to that route is not restricted, you could risk exposing server code to the public internet!

Since the ssr directory is built for server-side, webpack will not tree-shake `process.browser` conditionals.

If you currently use `if(process.browser)` as a way to prevent private code or keys from showing up in bundled code, that will not work - this is becuse we are building both a client and server target and are exposing it via `static` directory which is accessible over networks.

**Why would we put it in static?!?**

The goal of this software is to make federation "just work" with one single plugin and as little setup as possible.

To provide a built-in protected route would require additional setup and complexity, like middleware, or a custom server.

How assets are protected should be up to the consumer, who might use the CDN, NGIX, middleware to implement a restricted route.

## Using The Plugin

I now support the top-level API as well as the low-level API

Federated modules can be used in these various methods

Static, synchronous imports

```js
import SomeComponent from "next2/SomeComponent";
// OR
const SomeComponent = require("next2/ScomeComponent");
```

This plugin can be used for any piece of code, not just React Components.

Hooks, Middleware, Context, utilities, anything.

Async imports are recommended, whenever possible

```js
const SampleComponent = dynamic(() => import("next2/SampleComponent"));

// alternatively the low-level api can be used as well
// using the low-level api requires the remote to already be injected
const SampleComponent = dynamic(
  () => window.next2.get("./sampleComponent").then((factory) => factory()),
  {
    ssr: false,
  }
);
```

Make sure you are using `mini-css-extract-plugin@2` - version 2 supports resolving assets through `publicPath:'auto'`

## Options

```js
const remotes = (isServer) => {
  const location = isServer ? "ssr" : "chunks";
  return {
    next1: `next1@https://someapp.com/_next/static/${location}/remoteEntry.js?${Date.now()}`,
  };
};
withFederatedSidecar(
  {
    name: "next2",
    filename: "static/chunks/remoteEntry.js",
    exposes: {
      "./sampleComponent": "./components/sampleComponent.js",
    },
    remotes,
    shared: {
      react: {
        // Notice shared are NOT eager here
        // we handle eager sharing inside the plugin
        requiredVersion: false,
        singleton: true,
      },
    },
  },
  {
    removePlugins: [
      // optional
      // these are the defaults
      "BuildManifestPlugin",
      "ReactLoadablePlugin",
      "DropClientPage",
      "WellKnownErrorsPlugin",
      "ModuleFederationPlugin",
      "NextJsRequireCacheHotReloader",
      "PagesManifestPlugin",
    ],
    publicPath: "auto", // defaults to 'auto', is optional
  }
);
```

## Demo

You can see it in action here: https://github.com/module-federation/module-federation-examples/tree/master/nextjs-ssr

## How to add a sidecar for exposes to your next.js app

1. Use `withFederatedSidecar` in your `next.config.js` of the app that you wish to expose modules from. We'll call this "next2".

```js
// next.config.js
const { withFederatedSidecar } = require("@module-federation/nextjs-ssr");
const remotes = (isServer) => {
  const location = isServer ? "ssr" : "chunks";
  return {
    next1: `next1@https://someapp.com/_next/static/${location}/remoteEntry.js?${Date.now()}`,
  };
};
module.exports = withFederatedSidecar({
  name: "next2",
  filename: "static/chunks/remoteEntry.js",
  remotes,
  exposes: {
    "./sampleComponent": "./components/sampleComponent.js",
  },
  shared: {
    react: {
      // Notice shared are NOT eager here.
      requiredVersion: false,
      singleton: true,
    },
  },
})({
  webpack(config, options) {
    // your original next.config.js export

    // we attach next internals to share scope at runtime
    config.module.rules.push({
      test: /pages\/_app.[jt]sx?/,
      loader: "@module-federation/nextjs-ssr/lib/federation-loader.js",
    });

    return config;
  },
});
```

Consuming/host applications you must at least add the loader to next.config.js, and ensure you have a [custom Next.js App](https://nextjs.org/docs/advanced-features/custom-app) `pages/_app.js` (or `.tsx`):

```js
module.exports = {
  webpack(config, options) {
    // we attach next internals to share scope at runtime
    config.module.rules.push({
      test: /pages\/_app.[jt]sx?/,
      loader: "@module-federation/nextjs-ssr/lib/federation-loader.js",
    });

    return config;
  },
};
```

### Experiments

**Chunk Flushing**

Chunk Flushing is the mechanism used to _flush_ dynamic imported chunks out of a render and into the HTML of a document.
If you want to SSR the `<script>` tags of federated imports, reducing Round Trip Time (RTT). You can enable the following experiment

1. Enable the flushChunk experiment via the plugin

```js
withFederatedSidecar(
  // normal MF config
  {
    name: "app1",
    filename: "static/chunks/remoteEntry.js",
    exposes: {},
    remotes: {},
    shared: {
      react: {
        requiredVersion: false,
        singleton: true,
      },
    },
  },
  // sidecar specific options
  {
    experiments: {
      flushChunks: true,
    },
  }
);
```

2. Inside `_document.js` do the following

```js
import Document, { Html, Head, Main, NextScript } from "next/document";
import {
  flushChunks,
  ExtendedHead,
} from "@module-federation/nextjs-ssr/flushChunks";

class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx);

    return {
      ...initialProps,
      remoteChunks: await flushChunks(process.env.REMOTES),
    };
  }

  render() {
    return (
      <Html>
        <ExtendedHead>
          <meta name="robots" content="noindex" />
          {this.props.remoteChunks}
        </ExtendedHead>
        <body className="bg-background-grey">
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
```

## Support and Maintenance

This software is maintained by the Module Federation Group.
The primary maintainer is ScriptedAlchemy - the creator of Module Federation & an official member of the Webpack Foundation

Worldwide, there are only about 10 engineers capable of creating reliable and safe extensions of Module Federation.

The Federation Group provides 5 of the 10 engineers capable of creating solid implementations.

Any Federation Package that is not from The Webpack Foundation or Module Federation Group should be used with caution!

This software is actively used in production at our place of employment. It must be maintained at all times otherwise our production applications will fail.

Worries about reliability or contingency plans should not be a concern for end-users.

If this package fails, it will cost our employer millions of dollars a day. It will not be abandoned, it cannot be.

#### What if ScriptedAlchemy is hit by a bus?

While that would be unfortunate, the Federation Group is more than capable of maintaining this package.

All group members have full access to the organization and all its source code, registry authentication.

ScriptedAlchemy is the primary maintainer, not the only maintainer - this software is not dependent on "one person"

## Reliability Testing

This software undergoes significant QA, SRE, Security Audits, Performance testing with our employer.

RUM data and other telemetry is heavily implemented and monitored closely.

Our software is backed with the resources of a multi-billion dollar corporation.

## Contact

If you have any questions or need to report a bug
<a href="https://twitter.com/ScriptedAlchemy"> Reach me on Twitter @ScriptedAlchemy</a>

Or join this discussion thread: https://github.com/module-federation/module-federation-examples/discussions/1482
