const crypto = require("crypto");
const chalk = require("chalk");
const path = require("path");
const fs = require("fs");

import {
  StreamingFederation,
  NodeSoftwareStreamRuntime,
} from "../streaming/src/index";
const FederatedStatsPlugin = require("webpack-federated-stats-plugin");

function clone(target) {
  if (typeof target === "object") {
    let cloneTarget = {};
    for (const key in target) {
      cloneTarget[key] = clone(target[key]);
    }
    return cloneTarget;
  } else {
    return target;
  }
}
let isProd = process.env.NODE_ENV === "production";
const logPrefix = chalk.rgb(165, 232, 217)("[next-mf]");
const log = (...args) => console.log(logPrefix, ...args);
log.error = (...args) => console.error(logPrefix, chalk.red("error"), ...args);
log.warning = (...args) =>
  console.warn(logPrefix, chalk.yellow("warning"), ...args);

const buildClientRemotes = (federationPluginOptions, webpack) => {
  const clientRemotes = Object.entries(
    federationPluginOptions.remotes || {}
  ).reduce((acc, [name, config]) => {
    const hasMiddleware = config.startsWith("middleware ");
    // generate two flavours of remote modules
    // one for build time, federation to reference
    if (!acc.buildTime) {
      acc.buildTime = {};
    }
    // another for runtime and dynamic remotes
    if (!acc.runtime) {
      acc.runtime = {};
    }
    let middleware;
    if (hasMiddleware) {
      middleware = config.split("middleware ")[1];
    } else {
      middleware = `Promise.resolve(${JSON.stringify(config)})`;
    }
    // TODO: get args from function caller scope, dont use arrow func

    const template = `(remotesConfig) => new Promise((res,rej)=>{ 
           const scriptUrl = remotesConfig.split("@")[1]
           const moduleName = remotesConfig.split("@")[0]
       
          // if webpack require does not exist, create it from module args
          var ${webpack.RuntimeGlobals.require} = ${
      webpack.RuntimeGlobals.require
    } ? ${
      webpack.RuntimeGlobals.require
    } : typeof arguments !== 'undefined' && arguments[2]
    // if using modern output, then there are no arguments on the parent function scope, thus we need to get it via a window global. 
          var shareScope = ${webpack.RuntimeGlobals.require} ? ${
      webpack.RuntimeGlobals.shareScopeMap
    } : window.__webpack_share_scopes__
          var existingScript = document.querySelector('[data-webpack=${JSON.stringify(
            name
          )}]')    
    
          var d = document, script = d.createElement('script');
          script.type = 'text/javascript';
          script.setAttribute("data-webpack", ${JSON.stringify(name)});
          script.async = true;
          script.onerror = function(error){rej(error)};
          script.onload = function(){
      if(!window[moduleName].__initialized) {
      console.log(JSON.stringify(moduleName),'needs to be initialized')
        Promise.resolve(window[moduleName].init(shareScope.default)).then(function(){
          window[moduleName].__initialized = true;
          console.log('resolved', JSON.stringify(moduleName));
          res(window[moduleName]);
        });
      } else {
        window[moduleName].__initialized = true;
        res(window[moduleName]);
      }
    };
    let remoteUrl = scriptUrl;
    try {
      const remote = new URL(remoteUrl);
      remote.searchParams.set("cbust", Date.now());
      remoteUrl = remote.href
    } catch (e) {
      console.log("Module Federation: remote",moduleName,"url isn't valid url, falling back",e);
    }
    

    script.src = remoteUrl;
    if(existingScript) {
      if(window[moduleName]) {
        script.onload()
      }
      existingScript.onload = script.onload
      existingScript.onerror = script.onerror
    } else {
      d.getElementsByTagName('head')[0].appendChild(script);
    }
          })`;

    acc.runtime[name] = `()=> ${middleware}.then((remoteConfig)=>{
        const loadTemplate = ${template};
    return loadTemplate(remoteConfig)

    })`;
    acc.buildTime[name] = `promise ${middleware}.then((remoteConfig)=>{
    const loadTemplate = ${template};
    return loadTemplate(remoteConfig)
    })`;

    return acc;
  }, {});
  return clientRemotes;
};
const nextInternals = {
  "next/dynamic": {
    requiredVersion: false,
    singleton: true,
    import: false,
  },
  "styled-jsx": {
    requiredVersion: false,
    singleton: true,
    import: false,
  },
  "next/link": {
    requiredVersion: false,
    version: false,
    singleton: true,
    import: false,
  },
  "next/router": {
    requiredVersion: false,
    singleton: true,
    import: false,
  },
  "next/script": {
    requiredVersion: false,
    singleton: true,
    import: false,
  },
  "next/head": {
    requiredVersion: false,
    singleton: true,
    import: false,
  },
  react: {
    singleton: true,
    import: false,
  },
};

const PLUGIN_NAME = "NextFederationPlugin";

/**
 * @typedef {Object} WithModuleFederationOptions
 * @property {string[]} removePlugins
 * @property {string} publicPath
 * @property {'error' | 'warn'} [logLevel]
 */

// ModuleFederationPluginOptions is not exported, so using ConstructorParameters to get the plugin options type
/** @type {(
 *   federationPluginOptions: ConstructorParameters<typeof import('webpack').container.ModuleFederationPlugin>[0],
 *   options: WithModuleFederationOptions
 *  ): any} */
const withModuleFederation =
  (
    federationPluginOptionsOrig,
    {
      experiments = {
        flushChunks: false,
        hot: false,
      },
      removePlugins = [
        "BuildManifestPlugin",
        "DropClientPage",
        "WellKnownErrorsPlugin",
        "ModuleFederationPlugin",
        "NextJsRequireCacheHotReloader",
        "PagesManifestPlugin",
        "ReactFreshWebpackPlugin",
        "ReactLoadablePlugin",
      ],
      publicPath = "auto",
      logLevel = "error",
    } = {}
  ) =>
  (nextConfig = {}) => {
    /** @type {import('webpack').Compiler} */
    let compiler = {};
    /**
     * @typedef {Object} StartCompileOptions
     * @property {import('webpack')} webpack
     */

    /**
     * @param {StartCompileOptions} options
     */

    function startCompiler({
      webpack,
      federationPluginOptions,
      compilation,
      removePlugins,
      publicPath,
      done,
      options,
    }) {
      if (compiler[options.isServer ? "server" : "client"]) {
        return;
      }
      const toDrop = new Set(removePlugins || []);
      const filteredPlugins = compilation.options.plugins.filter((plugin) => {
        if (
          (plugin.constructor && toDrop.has(plugin.constructor.name)) ||
          plugin.__NextFederation__
        ) {
          return false;
        }

        return true;
      });

      // attach defaults that always need to be shared
      const shared = Object.assign(
        federationPluginOptions.shared,
        nextInternals
      );
      federationPluginOptions.shared = shared;

      if (options.isServer) {
        filteredPlugins.push(
          new webpack.container.ModuleFederationPlugin(federationPluginOptions),
          new NodeSoftwareStreamRuntime(federationPluginOptions, options)
        );
      } else {
        const clientRemotes = buildClientRemotes(
          federationPluginOptions,
          webpack
        );
        federationPluginOptions.remotes = clientRemotes.buildTime;
        const ReactLoadablePlugin = compilation.options.plugins.find(
          (plugin) => {
            return plugin.constructor.name === "ReactLoadablePlugin";
          }
        );
        filteredPlugins.push(
          new webpack.container.ModuleFederationPlugin(federationPluginOptions),
          new ReactLoadablePlugin.constructor({
            ...ReactLoadablePlugin,
            filename: "federated-loadable-manifest.json",
          })
        );
      }
      /** @type {import("webpack").WebpackOptionsNormalized} */
      const webpackOptions = {
        ...compilation.options,
        name: "federated-" + compilation.options.name,
        output: {
          ...compilation.options.output,
          chunkLoadingGlobal: undefined,
          devtoolNamespace: undefined,
          uniqueName: federationPluginOptions.name,
          hotUpdateGlobal: "webpackHotUpdate_" + federationPluginOptions.name,
          publicPath,
        },
        cache: false,
        entry: {
          noop: { import: ["@module-federation/nextjs-ssr/lib/noop.js"] },
        },
        plugins: [...filteredPlugins],
        optimization: {
          ...compilation.options.optimization,
          runtimeChunk: false,
        },
      };
      if (webpackOptions.optimization.splitChunks && options.isServer) {
        webpackOptions.optimization.splitChunks.filename.replace(
          ".js",
          "-[contenthash].js"
        );
      }

      if (!options.isServer) {
        Object.assign(webpackOptions.output, {
          library: Object.assign(webpackOptions.output.library, {
            name: federationPluginOptions.name,
          }),
        });

        webpackOptions.plugins.push(
          new FederatedStatsPlugin({
            filename: "static/federated-stats.json",
          })
        );
      } else {
        // take original externals regex
        const backupExternals = compilation.options.externals[0];
        // if externals is a function (like when you're not running in serverless mode or creating a single build)
        if (typeof backupExternals === "function") {
          webpackOptions.externals = [
            "next",
            { react: "react" },
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
            "styled-jsx",
          ];
        }
        webpackOptions.target = false;
        if (webpackOptions.mode === "development") {
          webpackOptions.output.path = path.resolve(
            webpackOptions.output.path,
            "../static/ssr"
          );
        } else {
          webpackOptions.output.path = path.resolve(
            webpackOptions.output.path,
            "../../static/ssr"
          );
        }
      }

      if (typeof webpackOptions.output.chunkFilename === "string") {
        webpackOptions.output.chunkFilename =
          compilation.options.output.chunkFilename.replace(
            ".js",
            !compilation.options.output.chunkFilename.includes("contenthash") &&
              (isProd || webpackOptions.mode === "production")
              ? "[contenthash]-fed.js"
              : "-fed.js"
          );
      }

      if (typeof webpackOptions.output.filename === "string") {
        webpackOptions.output.filename =
          compilation.options.output.filename.replace(
            ".js",
            !compilation.options.output.chunkFilename.includes("contenthash") &&
              (isProd || webpackOptions.mode === "production")
              ? "[contenthash]-fed.js"
              : "-fed.js"
          );
      }

      if (isProd || webpackOptions.mode === "production") {
        log("compiling...");
      } else {
        log("start watcher...");
      }
      compiler[options.isServer ? "server" : "client"] =
        webpack(webpackOptions);

      const callback = (
        err,
        /** @type {import('webpack').Stats} */
        stats
      ) => {
        let complete;
        const pending = new Promise((res) => {
          complete = res;
        });
        if (err) {
          log.error("error:");
          log.error(err.stack || err);
          if (err.details) {
            log.error(err.details);
          }
          return;
        }

        log("compiled!");

        const info = stats.toJson();

        if (stats.hasErrors()) {
          log.error("error:");
          log.error(info.errors);
        }

        if (logLevel === "warn" && stats.hasWarnings()) {
          log.warning("warning:");
          log.warning(info.warnings);
        }
        const { outputPath, assets, name, chunks } = info;

        if (name === "federated-server" && experiments.flushChunks) {
          const remoteEntry = assets.find((asset) => {
            if (!asset && !asset.name) {
              return false;
            }
            return asset.name.includes("remoteEntry");
          });
          const statContent = require(path.join(
            outputPath,
            "../federated-stats.json"
          ));

          let loadableContent;
          try {
            loadableContent = require(path.join(
              compilation.options.output.path,
              "../../federated-loadable-manifest.json"
            ));
          } catch (e) {
            log(
              "no federated loadable manifest found, it doesnt look like there are any local dynamic imports"
            );
            loadableContent = {};
          }
          statContent.loadable = loadableContent;

          const remoteContentPromise = new Promise((resolve, reject) => {
            fs.readFile(
              path.join(outputPath, remoteEntry.name),
              "utf-8",
              function (err, data) {
                if (err) {
                  reject(err);
                  complete();
                }
                resolve(data);
              }
            );
          });

          const collectedChunkHash = chunks
            .map((chunk) => {
              return chunk.hash;
            })
            .join();

          const hash = crypto
            .createHash("md5")
            .update(collectedChunkHash)
            .digest("hex");

          remoteContentPromise.then((remoteContent) => {
            const newSource = remoteContent.replace(
              "init: () => (init)",
              `init: () => (init), chunkMap: () => (${JSON.stringify(
                statContent
              )}), hash: ()=>(${JSON.stringify(hash)})`
            );
            process.nextTick(() => {
              fs.writeFile(
                path.join(outputPath, remoteEntry.name),
                newSource,
                (err) => {
                  log("emitted!");
                  if (typeof done === "function") {
                    complete();
                    pending.then(() => {
                      done(err);
                    });
                  }
                }
              );
            });
          });
        } else {
          // done is only present in a full build (production), not in a watch build
          if (typeof done === "function") {
            complete();
            pending.then(() => {
              done(err);
            });
          }
        }
      };

      if (isProd || webpackOptions.mode === "production") {
        compiler[options.isServer ? "server" : "client"].run(callback);
      } else {
        compiler[options.isServer ? "server" : "client"].watch(
          {
            aggregateTimeout: 300,
            poll: undefined,
          },
          callback
        );
      }
    }

    return Object.assign({}, nextConfig, {
      /**
       * @param {import("webpack").Configuration} config
       * @param {*} options
       * @returns {import("webpack").Configuration}
       */
      webpack(config, options) {
        const { webpack } = options;
        Object.assign(config.experiments, {
          topLevelAwait: true,
          layers: true,
        });

        const federationPluginOptions = clone(federationPluginOptionsOrig);
        Object.assign(federationPluginOptions.shared, {
          "@module-federation/nextjs-ssr/lib/noop.js": {
            eager: true,
          },
        });
        if (typeof federationPluginOptions.remotes === "function") {
          federationPluginOptions.remotes = federationPluginOptionsOrig.remotes(
            options.isServer
          );
        }
        if (options.isServer) {
          // get share keys from user, filter out ones that need to be external
          const internalizableKeys = Object.keys(
            federationPluginOptions.shared
          ).filter((key) => {
            return key !== "react";
          });
          // take original externals regex
          const backupExternals = config.externals[0];
          // if externals is a function (like when you're not running in serverless mode or creating a single build)
          if (typeof backupExternals === "function") {
            // replace externals function with short-circuit, or fall back to original algo
            config.externals[0] = (mod, callback) => {
              if (!internalizableKeys.some((v) => mod.request.includes(v))) {
                return backupExternals(mod, callback);
              }
              return Promise.resolve();
            };
          }

          Object.assign(federationPluginOptions, {
            filename: "remoteEntry.js",
            library: {
              type: "commonjs",
              name: federationPluginOptions.name,
            },
          });
        }

        const FederationPlugin = options.isServer
          ? StreamingFederation
          : webpack.container.ModuleFederationPlugin;

        const hostFedSharing = Object.entries(
          federationPluginOptionsOrig.shared || {}
        ).reduce((acc, item) => {
          if (item && item[0]) {
            acc[item[0]] = Object.assign({}, item[1] || {}, { eager: true });
          }
          return acc;
        }, {});

        if (options.isServer && options.config.target === "serverless") {
          config.optimization.splitChunks = false;
          log.warning("serverless targets are not supported");
        }

        const clientRemotes = buildClientRemotes(
          federationPluginOptions,
          webpack
        );
        config.plugins.push(
          new webpack.DefinePlugin({
            "process.env.CURRENT_HOST": JSON.stringify(
              federationPluginOptions.name
            ),
          })
        );
        // TODO: needs to use buildRemotes to generate for both ends.
        if (!options.isServer) {
          config.plugins.push(
            new webpack.DefinePlugin({
              "process.env.REMOTES": clientRemotes.runtime,
            })
          );
        }
        config.plugins.push(
          new FederationPlugin(
            Object.assign(
              {
                remotes: options.isServer
                  ? federationPluginOptions.remotes
                  : clientRemotes.buildTime,
                shared: { ...hostFedSharing, "styled-jsx": { eager: true } },
              },
              options.isServer ? { experiments } : {}
            )
          )
        );

        /**
         * @type {{ webpack: import("webpack") }}
         */

        config.plugins.push({
          __NextFederation__: true,
          /**
           * @param {import("webpack").Compiler} compiler
           */
          apply(compiler) {
            const run = (compilation, done) => {
              return startCompiler({
                webpack,
                federationPluginOptions,
                compilation,
                removePlugins,
                publicPath,
                done,
                options,
              });
            };

            // in production or on server build use tapAsync to wait for the full compilation of the sidecar
            if (isProd || compiler.options.mode === "production") {
              compiler.hooks.afterCompile.tapAsync(
                "NextFederation",
                (compilation, done) => {
                  run(compilation, done);
                }
              );
            } else {
              compiler.hooks.afterCompile.tap(
                "NextFederation",
                (compilation) => {
                  run(compilation);
                }
              );
            }
          },
        });

        if (typeof nextConfig.webpack === "function") {
          return nextConfig.webpack(config, options);
        }

        return config;
      },
    });
  };

export default withModuleFederation;
