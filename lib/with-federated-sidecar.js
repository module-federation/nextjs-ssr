const chalk = require("chalk");
const path = require("path");
const fs = require("fs");
const fse = require("fs-extra");
import NodeModuleFederation from "../streaming/src/NodeModuleFederation";
import NodeAsyncHttpRuntime from "../streaming/src/NodeAsyncHttpRuntime";
// import {
//   StreamingFederation,
//   NodeSoftwareStreamRuntime,
// } from "../streaming/src/index";
const FederatedStatsPlugin = require("webpack-federated-stats-plugin");

// const webpackBase = require('next/')
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
  console.warning(logPrefix, chalk.yellow("warning"), ...args);

const buildClientRemotes = (federationPluginOptions, webpack) => {
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
          var existingScript = document.querySelector("[data-webpack=${name}")    
    
          var d = document, script = d.createElement('script');
          script.type = 'text/javascript';
          script.setAttribute("data-webpack", ${JSON.stringify(name)});
          script.async = true;
          script.onerror = function(error){rej(error)};
          script.onload = function(){
      if(!window.${moduleName}.__initialized) {
      console.log('share scope not initialized');
        window.${moduleName}.init(${
      webpack.RuntimeGlobals.shareScopeMap
    }.default)
    
          console.log('share scope initialized');
          window.${moduleName}.__initialized = true;
          console.log('resolved', JSON.stringify(${moduleName}));
          res(window.${moduleName});
       
      } else {
      console.log('scope already initialized');
        window.${moduleName}.__initialized = true;
        res(window.${moduleName});
      }
    };
    let remoteUrl = ${JSON.stringify(scriptUrl)}
    try {
      const remote = new URL(remoteUrl);
      remote.searchParams.set("cbust", Date.now());
      remoteUrl = remote.href
    } catch (e) {
      console.log("Module Federation: remote",${JSON.stringify(
        moduleName
      )},"url isn't valid url, falling back",e);
    }
    

    script.src = remoteUrl;
    if(existingScript) {
    console.log('found existing script')
      if(window.${moduleName}) {
        console.log('calling load function')
        script.onload()
      } else {
      console.log('needs to call load function')
      }
      
      existingScript.onload = script.onload
      existingScript.onerror = script.onerror
    } else {
      d.getElementsByTagName('head')[0].appendChild(script);
    }
          })`;

    acc.runtime[name] = `()=> ${remotePromiseLoad}`;
    acc.buildTime[name] = `promise ${remotePromiseLoad}`;
    // acc.buildTime[name] = config;
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
        if (!options.isServer) {
          // reset host from _N_E to remote name
          // otherwise chunk loading globals will have collisions
          config.output.library = "next" + federationPluginOptions.name;

          config.output.publicPath = "auto";
        }
        Object.assign(federationPluginOptions.shared, {
          "@module-federation/nextjs-ssr/lib/noop.js": {
            singleton: true,
          },
        });

        if (typeof federationPluginOptions.remotes === "function") {
          federationPluginOptions.remotes = federationPluginOptionsOrig.remotes(
            options.isServer
          );
        }
        if (options.isServer) {
          config.target = false;
          // take original externals rergex
          const backupExternals = config.externals[0];
          // get share keys from user, filter out ones that need to be external
          const internalizableKeys = Object.keys(
            federationPluginOptions.shared
          );

          const originalExternals = config.externals[0]; // maybe not the best way to 'find' the handleExternal function
          config.externals[0] = ({
            context,
            request,
            dependencyType,
            getResolve,
          }) => {
            if (request == "chakra-ui") {
              // example with react-intl, you probably want to fix all shares here
              /// return something empty to prevent bailing (it is a bit more complicated, but this works)
              return Promise.resolve();
            }
            return originalExternals({
              context,
              request,
              dependencyType,
              getResolve,
            });
          };

          // replace externals function with short-cirut, or fall back to original algo
          config.externals[0] = (mod, callback) => {
            if (!internalizableKeys.some((v) => mod.request.includes(v))) {
              if (
                mod.request.includes("chakra-ui") ||
                mod.context.includes("chakra-ui")
              ) {
                callback();
                return;
              }

              return backupExternals(mod, callback);
            }
            callback();
          };
          Object.assign(federationPluginOptions, {
            filename: "remoteEntry.js",
            library: {
              type: "commonjs",
              name: federationPluginOptions.name,
            },
          });
        }

        const FederationPlugin = options.isServer
          ? NodeModuleFederation
          : webpack.container.ModuleFederationPlugin;

        const hostFedSharing = Object.entries(
          federationPluginOptions.shared || {}
        ).reduce((acc, item) => {
          if (item && item[0]) {
            acc[item[0]] = Object.assign({}, item[1] || {});
          }
          return acc;
        }, {});

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
            (compiler) => {
              compiler.hooks.thisCompilation.tap("fed", (comp) => {
                comp.options.devtool = false;
              });
            },
            new webpack.DefinePlugin({
              "process.env.REMOTES": clientRemotes.runtime,
            }),
            new FederatedStatsPlugin({
              filename: "static/federated-stats.json",
            })
          );
        } else {
          config.plugins.push((compiler) => {
            compiler.hooks.done.tap("NextFederation", (stats) => {
              console.log(config.output.path);
              const statPath = config.mode === 'production' ? "../../static/federated-stats.json" : "../static/federated-stats.json"

              const statContent = JSON.stringify(
                require(path.join(
                  config.output.path,
                  statPath
                ))
              );
              const locationOfRemote = path.join(
                config.output.path,
                federationPluginOptions.filename
              );
              let remoteContent = fs.readFileSync(locationOfRemote, "utf-8");
              if(!remoteContent.includes('sharedModules')) {
                remoteContent = remoteContent
                  .replace(
                    "init: () => (init)",
                    `init: () => (init), chunkMap: () => (${statContent})`
                  )
                  .replace(
                    "init: function() { return init; }",
                    `init: function() { return init; }, chunkMap: function() { return ${statContent} }`
                  );
              }

              if (!remoteContent.includes("chunkMap:")) {
                console.warn(
                  "chunkmap was not found on remote container please contact ScriptedAlchemy"
                );
              }
              fs.writeFileSync(locationOfRemote, remoteContent, (err) => {
                if (err) console.error(err);
              });

              fse.copySync(
                config.output.path,
                path.join(config.output.path, "../static/ssr"),
                { overwrite: true },
                function (err) {
                  if (err) {
                    console.error(err);
                  } else {
                    console.log("copied federated stuff");
                  }
                }
              );
            });
          });
        }

        // console.log(      Object.assign(
        //   {
        //     runtime: false,
        //     filename: federationPluginOptions.filename,
        //     name: federationPluginOptions.name,
        //     exposes: federationPluginOptions.exposes,
        //     remotes: options.isServer
        //       ? federationPluginOptions.remotes
        //       : clientRemotes.buildTime,
        //     shared: { ...hostFedSharing, "styled-jsx": { eager: true } },
        //   },
        //   options.isServer ? { experiments } : {}
        // ))

        config.plugins.push(
          options.isServer
            ? new NodeAsyncHttpRuntime(
                {
                  // runtime: false,
                  filename: federationPluginOptions.filename,
                  name: federationPluginOptions.name,
                  exposes: federationPluginOptions.exposes,
                  remotes: federationPluginOptions.remotes,
                  shared: { ...hostFedSharing, "styled-jsx": { eager: true } },
                },
                options
              )
            : () => {},
          new FederationPlugin(
            Object.assign(
              {
                filename: federationPluginOptions.filename,
                name: federationPluginOptions.name,
                exposes: federationPluginOptions.exposes,
                remotes: options.isServer
                  ? federationPluginOptions.remotes
                  : clientRemotes.buildTime,
                shared: {
                  ...hostFedSharing,
                  "styled-jsx": { eager: true },
                  react: {
                    import: options.isServer ? false : "react",
                    singleton: true,
                    eager: true,
                    version: false,
                    requiredVersion: false,
                  },
                },
              },
              federationPluginOptions.name !== "checkout"
                ? { runtime: false }
                : {},
              options.isServer ? { experiments } : {}
            )
          )
        );

        /**
         * @type {{ webpack: import("webpack") }}
         */
        // config.plugins.push({
        //   __NextFederation__: true,
        //   /**
        //    * @param {import("webpack").Compiler} compiler
        //    */
        //   apply(compiler) {
        //     const run = (compilation, done) => {
        //       return startCompiler({
        //         webpack,
        //         federationPluginOptions,
        //         compilation,
        //         removePlugins,
        //         publicPath,
        //         done,
        //         options,
        //         config
        //       });
        //     };
        //
        //     // in production or on server build use tapAsync to wait for the full compilation of the sidecar
        //     if (isProd || compiler.options.mode === "production") {
        //       compiler.hooks.afterCompile.tapAsync(
        //         "NextFederation",
        //         (compilation, done) => {
        //           run(compilation, done);
        //         }
        //       );
        //     } else {
        //       compiler.hooks.afterCompile.tap(
        //         "NextFederation",
        //         (compilation) => {
        //           run(compilation);
        //         }
        //       );
        //     }
        //   },
        // });
        if (typeof nextConfig.webpack === "function") {
          return nextConfig.webpack(config, options);
        }

        return config;
      },
    });
  };

export default withModuleFederation;
