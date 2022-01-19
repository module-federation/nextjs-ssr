const chalk = require("chalk");
const path = require("path");
import {
  StreamingFederation,
  NodeSoftwareStreamRuntime,
} from "../streaming/src/index";
let isProd = process.env.NODE_ENV === "production";
const logPrefix = chalk.rgb(165, 232, 217)("[next-mf]");
const log = (...args) => console.log(logPrefix, ...args);
log.error = (...args) => console.error(logPrefix, chalk.red("error"), ...args);
log.warning = (...args) =>
  console.warning(logPrefix, chalk.yellow("warning"), ...args);

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
      removePlugins = [
        "BuildManifestPlugin",
        "ReactLoadablePlugin",
        "DropClientPage",
        "WellKnownErrorsPlugin",
        "ModuleFederationPlugin",
        "NextJsRequireCacheHotReloader",
        "PagesManifestPlugin",
        "ReactFreshWebpackPlugin",
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

      console.log(filteredPlugins);

      // attach defaults that always need to be shared
      Object.assign(federationPluginOptions.shared, {
        "next/dynamic": {
          requiredVersion: false,
          singleton: true,
          // import: false
        },
        "styled-jsx": {
          requiredVersion: false,
          singleton: true,
        },
        "next/link": {
          requiredVersion: false,
          singleton: true,
          // import: false
        },
        "next/router": {
          requiredVersion: false,
          singleton: true,
          // import: false
        },
        "next/script": {
          requiredVersion: false,
          singleton: true,
          // import: false
        },
        "next/head": {
          requiredVersion: false,
          singleton: true,
          // import: false
        },
        react: {
          singleton: true,
          import: false,
        },
      });

      if (options.isServer) {
        filteredPlugins.push(
          new webpack.container.ModuleFederationPlugin(federationPluginOptions),
          new NodeSoftwareStreamRuntime(federationPluginOptions, options)
        );
      } else {
        filteredPlugins.push(
          new webpack.container.ModuleFederationPlugin(federationPluginOptions)
        );
      }

      /** @type {import("webpack").WebpackOptionsNormalized} */
      const webpackOptions = {
        cache: false,
        ...compilation.options,
        output: {
          ...compilation.options.output,
          chunkLoadingGlobal: undefined,
          devtoolNamespace: undefined,
          uniqueName: federationPluginOptions.name,
          hotUpdateGlobal: "webpackHotUpdate_" + federationPluginOptions.name,
          publicPath,
        },
        entry: {
          noop: { import: [path.resolve(__dirname, "noop.js")] },
        },
        plugins: [...filteredPlugins],
        optimization: {
          ...compilation.options.optimization,
          runtimeChunk: false,
          splitChunks: undefined,
        },
      };

      if (!options.isServer) {
        Object.assign(webpackOptions.output, {
          library: Object.assign(webpackOptions.output.library, {
            name: federationPluginOptions.name,
          }),
        });
      } else {
        webpackOptions.externals = [
          "next",
          "react",
          "react/jsx-runtime",
          "react/jsx-dev-runtime",
          "styled-jsx",
        ];
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
          compilation.options.output.chunkFilename.replace(".js", "-fed.js");
      }
      if (typeof webpackOptions.output.filename === "string") {
        webpackOptions.output.filename =
          compilation.options.output.filename.replace(".js", "-fed.js");
      }

      if (isProd) {
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
        log("compiled!");

        if (err) {
          log.error("error:");
          log.error(err.stack || err);
          if (err.details) {
            log.error(err.details);
          }
          return;
        }

        const info = stats.toJson();

        if (stats.hasErrors()) {
          log.error("error:");
          log.error(info.errors);
        }

        if (logLevel === "warn" && stats.hasWarnings()) {
          log.warning("warning:");
          log.warning(info.warnings);
        }

        // done is only present in a full build (production), not in a watch build
        if (typeof done === "function") {
          done(err);
        }
      };

      if (isProd) {
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
        const federationPluginOptions = Object.create(
          federationPluginOptionsOrig
        );
        if (typeof federationPluginOptions.remotes === "function") {
          federationPluginOptions.remotes = federationPluginOptionsOrig.remotes(
            options.isServer
          );
        }
        if (options.isServer) {
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

        const clientRemotes = Object.entries(
          federationPluginOptions.remotes || {}
        ).reduce((acc, [name, config]) => {
          const scriptUrl = config.split("@")[1];
          const moduleName = config.split("@")[0];
          // generate two flavours of remote modules
          // one for build time, federation to reference
          if (!acc.buildTime) {
            acc.buildTime = {};
          }
          // another for runtime and dynamic remotes
          if (!acc.runtime) {
            acc.runtime = {};
          }
          // TODO: get args from function caller scope, dont use arrow func
          const remotePromiseLoad = `new Promise((res,rej)=>{
          console.log('share scope from runtime args',arguments[2].I);
          // if webpack require does not exist, create it from module args
          var ${webpack.RuntimeGlobals.require} = ${
            webpack.RuntimeGlobals.require
          } ? ${webpack.RuntimeGlobals.require} : arguments[2]
       
    
          var d = document, script = d.createElement('script');
    script.type = 'text/javascript';
    script.setAttribute("data-webpack", ${JSON.stringify(name)});
    script.async = true;
    script.onerror = function(error){rej(error)};
    script.onload = function(){
      if(!${moduleName}.__initialized) {
          Promise.resolve(${moduleName}.init(${
            webpack.RuntimeGlobals.shareScopeMap
          }.default)).then(function(){
            ${moduleName}.__initialized = true;
            console.log('resolved', JSON.stringify(${moduleName}));
            res(${moduleName});
          });
      } else {
        ${moduleName}.__initialized = true;
        res(${moduleName});
      }
    };
    script.src = '${scriptUrl}';
    d.getElementsByTagName('head')[0].appendChild(script);
          })`;

          acc.runtime[name] = `()=> ${remotePromiseLoad}`;
          acc.buildTime[name] = `promise ${remotePromiseLoad}`;
          return acc;
        }, {});
        // TODO: needs to use buildRemotes to generate for both ends.
        if (!options.isServer) {
          config.plugins.push(
            new webpack.DefinePlugin({
              "process.env.REMOTES": clientRemotes.runtime,
            })
          );
        }
        config.devtool = false;
        config.plugins.push(
          new FederationPlugin({
            remotes: options.isServer
              ? federationPluginOptions.remotes
              : clientRemotes.buildTime,
            shared: { ...hostFedSharing, "styled-jsx": { eager: true } },
          })
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
            if (isProd) {
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
