'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var global$1 = (typeof global !== "undefined" ? global :
            typeof self !== "undefined" ? self :
            typeof window !== "undefined" ? window : {});

// shim for using process in browser
// based off https://github.com/defunctzombie/node-process/blob/master/browser.js

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
var cachedSetTimeout = defaultSetTimout;
var cachedClearTimeout = defaultClearTimeout;
if (typeof global$1.setTimeout === 'function') {
    cachedSetTimeout = setTimeout;
}
if (typeof global$1.clearTimeout === 'function') {
    cachedClearTimeout = clearTimeout;
}

function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}
function nextTick(fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
}
// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};

// from https://github.com/kumavis/browser-process-hrtime/blob/master/index.js
var performance = global$1.performance || {};
performance.now        ||
  performance.mozNow     ||
  performance.msNow      ||
  performance.oNow       ||
  performance.webkitNow  ||
  function(){ return (new Date()).getTime() };

/**
 * loadScript(baseURI, fileName, cb)
 * loadScript(scriptUrl, cb)
 */
//language=JS
var loadScriptTemplate = `
    function loadScript() {
        var url;
        var cb = arguments[arguments.length - 1];
        if (typeof cb !== "function") {
            throw new Error("last argument should be a function");
        }
        if (arguments.length === 2) {
            url = arguments[0];
        } else if (arguments.length === 3) {
            url = new URL(arguments[1], arguments[0]).toString();
        } else {
            throw new Error("invalid number of arguments");
        }
      if(global.webpackChunkLoad){
        global.webpackChunkLoad(url).then(function(resp){
          return resp.text();
        }).then(function(rawData){
          cb(null, rawData);
        }).catch(function(err){
          console.error('Federated Chunk load failed', error);
          return cb(error)
        });
      } else {
        //TODO https support
        let request = (url.startsWith('https') ? require('https') : require('http')).get(url, function (resp) {
          if (resp.statusCode === 200) {
            let rawData = '';
            resp.setEncoding('utf8');
            resp.on('data', chunk => {
              rawData += chunk;
            });
            resp.on('end', () => {
              cb(null, rawData);
            });
          } else {
            cb(resp);
          }
        });
        request.on('error', error => {
          console.error('Federated Chunk load failed', error);
          return cb(error)
        });
      }
    }
`;

/*
	MIT License http://www.opensource.org/licenses/mit-license.php
*/

const RuntimeGlobals$1 = require("webpack/lib/RuntimeGlobals");
const RuntimeModule = require("webpack/lib/RuntimeModule");
const Template = require("webpack/lib/Template");
const compileBooleanMatcher = require("webpack/lib/util/compileBooleanMatcher");
const { getUndoPath } = require("webpack/lib/util/identifier");

class ReadFileChunkLoadingRuntimeModule extends RuntimeModule {
  constructor(runtimeRequirements, options, context) {
    super("readFile chunk loading", RuntimeModule.STAGE_ATTACH);
    this.runtimeRequirements = runtimeRequirements;
    this.options = options;
    this.context = context;
  }

  /**
   * @private
   * @param {Chunk} chunk chunk
   * @param {string} rootOutputDir root output directory
   * @returns {string} generated code
   */
  _generateBaseUri(chunk, rootOutputDir) {
    const options = chunk.getEntryOptions();
    if (options && options.baseUri) {
      return `${RuntimeGlobals$1.baseURI} = ${JSON.stringify(options.baseUri)};`;
    }

    return `${RuntimeGlobals$1.baseURI} = require("url").pathToFileURL(${
      rootOutputDir
        ? `__dirname + ${JSON.stringify("/" + rootOutputDir)}`
        : "__filename"
    });`;
  }

  /**
   * @returns {string} runtime code
   */
  generate() {
    const { baseURI, promiseBaseURI, remotes, name } = this.options;
    const { webpack } = this.context;
    const chunkHasJs =
      (webpack && webpack.javascript.JavascriptModulesPlugin.chunkHasJs) ||
      require("webpack/lib/javascript/JavascriptModulesPlugin").chunkHasJs;

    // workaround for next.js
    const getInitialChunkIds = (chunk, chunkGraph) => {
      const initialChunkIds = new Set(chunk.ids);
      for (const c of chunk.getAllInitialChunks()) {
        if (c === chunk || chunkHasJs(c, chunkGraph)) continue;
        for (const id of c.ids) initialChunkIds.add(id);
      }
      return initialChunkIds;
    };

    const { chunkGraph, chunk } = this;
    const { runtimeTemplate } = this.compilation;
    const fn = RuntimeGlobals$1.ensureChunkHandlers;
    const withBaseURI = this.runtimeRequirements.has(RuntimeGlobals$1.baseURI);
    const withExternalInstallChunk = this.runtimeRequirements.has(
      RuntimeGlobals$1.externalInstallChunk
    );
    const withOnChunkLoad = this.runtimeRequirements.has(
      RuntimeGlobals$1.onChunksLoaded
    );
    const withLoading = this.runtimeRequirements.has(
      RuntimeGlobals$1.ensureChunkHandlers
    );
    const withHmr = this.runtimeRequirements.has(
      RuntimeGlobals$1.hmrDownloadUpdateHandlers
    );
    const withHmrManifest = this.runtimeRequirements.has(
      RuntimeGlobals$1.hmrDownloadManifest
    );

    const conditionMap = chunkGraph.getChunkConditionMap(chunk, chunkHasJs);
    const hasJsMatcher = compileBooleanMatcher(conditionMap);
    const initialChunkIds = getInitialChunkIds(chunk, chunkGraph);

    const outputName = this.compilation.getPath(
      (
        (webpack &&
          webpack.javascript.JavascriptModulesPlugin
            .getChunkFilenameTemplate) ||
        require("webpack/lib/javascript/JavascriptModulesPlugin")
          .getChunkFilenameTemplate
      )(chunk, this.compilation.outputOptions),
      {
        chunk,
        contentHashType: "javascript",
      }
    );
    const rootOutputDir = getUndoPath(
      outputName,
      this.compilation.outputOptions.path,
      false
    );

    const stateExpression = withHmr
      ? `${RuntimeGlobals$1.hmrRuntimeStatePrefix}_readFileVm`
      : undefined;

    return Template.asString([
      withBaseURI
        ? this._generateBaseUri(chunk, rootOutputDir)
        : "// no baseURI",
      "",
      "// object to store loaded chunks",
      '// "0" means "already loaded", Promise means loading',
      `var installedChunks = ${
        stateExpression ? `${stateExpression} = ${stateExpression} || ` : ""
      }{`,
      Template.indent(
        Array.from(initialChunkIds, (id) => `${JSON.stringify(id)}: 0`).join(
          ",\n"
        )
      ),
      "};",
      "",
      withOnChunkLoad
        ? `${
            RuntimeGlobals$1.onChunksLoaded
          }.readFileVm = ${runtimeTemplate.returningFunction(
            "installedChunks[chunkId] === 0",
            "chunkId"
          )};`
        : "// no on chunks loaded",
      "",
      withLoading || withExternalInstallChunk
        ? `var installChunk = ${runtimeTemplate.basicFunction("chunk", [
            "var moreModules = chunk.modules, chunkIds = chunk.ids, runtime = chunk.runtime;",
            "for(var moduleId in moreModules) {",
            Template.indent([
              `if(${RuntimeGlobals$1.hasOwnProperty}(moreModules, moduleId)) {`,
              Template.indent([
                `${RuntimeGlobals$1.moduleFactories}[moduleId] = moreModules[moduleId];`,
              ]),
              "}",
            ]),
            "}",
            `if(runtime) runtime(__webpack_require__);`,
            "for(var i = 0; i < chunkIds.length; i++) {",
            Template.indent([
              "if(installedChunks[chunkIds[i]]) {",
              Template.indent(["installedChunks[chunkIds[i]][0]();"]),
              "}",
              "installedChunks[chunkIds[i]] = 0;",
            ]),
            "}",
            withOnChunkLoad ? `${RuntimeGlobals$1.onChunksLoaded}();` : "",
          ])};`
        : "// no chunk install function needed",
      "",
      withLoading
        ? Template.asString([
            "// ReadFile + VM.run chunk loading for javascript",
            `${fn}.readFileVm = function(chunkId, promises) {`,
            hasJsMatcher !== false
              ? Template.indent([
                  "",
                  "var installedChunkData = installedChunks[chunkId];",
                  'if(installedChunkData !== 0) { // 0 means "already installed".',
                  Template.indent([
                    '// array of [resolve, reject, promise] means "currently loading"',
                    "if(installedChunkData) {",
                    Template.indent(["promises.push(installedChunkData[2]);"]),
                    "} else {",
                    Template.indent([
                      hasJsMatcher === true
                        ? "if(true) { // all chunks have JS"
                        : `if(${hasJsMatcher("chunkId")}) {`,
                      Template.indent([
                        "// load the chunk and return promise to it",
                        "var promise = new Promise(async function(resolve, reject) {",
                        Template.indent([
                          "installedChunkData = installedChunks[chunkId] = [resolve, reject];",
                          `var filename = require('path').join(__dirname, ${JSON.stringify(
                            rootOutputDir
                          )} + ${
                            RuntimeGlobals$1.getChunkScriptFilename
                          }(chunkId));`,
                          "var fs = require('fs');",
                          "if(fs.existsSync(filename)) {",
                          Template.indent([
                            'console.log(filename,"exists locally")',
                            "fs.readFile(filename, 'utf-8', function(err, content) {",
                            Template.indent([
                              "if(err) return reject(err);",
                              "var chunk = {};",
                              "require('vm').runInThisContext('(function(exports, require, __dirname, __filename) {' + content + '\\n})', filename)" +
                                "(chunk, require, require('path').dirname(filename), filename);",
                              "installChunk(chunk);",
                            ]),
                            "});",
                          ]),
                          "} else {",
                          Template.indent([
                            loadScriptTemplate,

                            "console.log('needs to load remote script');",

                            `console.log('before remote var creation')`,
                            `console.log('before remote var creation', ${JSON.stringify(
                              remotes
                            )})`,
                            `var remotes = ${JSON.stringify(remotes)};`,

                            `console.log('remotes in chunk load',remotes)`,

                            `console.log('global.REMOTE_CONFIG',global.REMOTE_CONFIG)`,

                            `if(global.REMOTE_CONFIG && !global.REMOTE_CONFIG[${JSON.stringify(
                              name
                            )}]) {
                            if(global.loadedRemotes){
                              for (const property in global.loadedRemotes) {
                                global.REMOTE_CONFIG[property] = global.loadedRemotes[property].path
                              }
                            }`,
                            Template.indent([
                              `Object.assign(global.REMOTE_CONFIG, remotes)`,
                            ]),
                            "}",

                            `var requestedRemote = global.REMOTE_CONFIG[${JSON.stringify(
                              name
                            )}]`,

                            `if(typeof requestedRemote === 'function'){
                              requestedRemote = await requestedRemote()
                            }`,
                            `console.log('requestedRemote',requestedRemote);`,

                            `var scriptUrl = new URL(requestedRemote.split("@")[1]);`,

                            `var chunkName = ${RuntimeGlobals$1.getChunkScriptFilename}(chunkId);`,

                            `console.log('remotes global',global.REMOTE_CONFIG);`,

                            `console.log('chunkname to request',chunkName);`,
                            `var fileToReplace = require('path').basename(scriptUrl.pathname);`,
                            `scriptUrl.pathname = scriptUrl.pathname.replace(fileToReplace, chunkName);`,
                            `console.log('will load remote chunk', scriptUrl.toString());`,
                            `loadScript(scriptUrl.toString(), function(err, content) {`,
                            Template.indent([
                              "if(err) {console.error('error loading remote chunk', scriptUrl.toString(),'got',content); return reject(err);}",
                              "var chunk = {};",
                              "require('vm').runInThisContext('(function(exports, require, __dirname, __filename) {' + content + '\\n})', filename)" +
                                "(chunk, require, require('path').dirname(filename), filename);",
                              "installChunk(chunk);",
                            ]),
                            "});",
                          ]),
                          "}",
                        ]),
                        "});",
                        "promises.push(installedChunkData[2] = promise);",
                      ]),
                      "} else installedChunks[chunkId] = 0;",
                    ]),
                    "}",
                  ]),
                  "}",
                ])
              : Template.indent(["installedChunks[chunkId] = 0;"]),
            "};",
          ])
        : "// no chunk loading",
      "",
      withExternalInstallChunk
        ? Template.asString([
            "module.exports = __webpack_require__;",
            `${RuntimeGlobals$1.externalInstallChunk} = installChunk;`,
          ])
        : "// no external install chunk",
      "",
      withHmr
        ? Template.asString([
            "function loadUpdateChunk(chunkId, updatedModulesList) {",
            Template.indent([
              "return new Promise(function(resolve, reject) {",
              Template.indent([
                `var filename = require('path').join(__dirname, ${JSON.stringify(
                  rootOutputDir
                )} + ${RuntimeGlobals$1.getChunkUpdateScriptFilename}(chunkId));`,
                "require('fs').readFile(filename, 'utf-8', function(err, content) {",
                Template.indent([
                  "if(err) return reject(err);",
                  "var update = {};",
                  "require('vm').runInThisContext('(function(exports, require, __dirname, __filename) {' + content + '\\n})', filename)" +
                    "(update, require, require('path').dirname(filename), filename);",
                  "var updatedModules = update.modules;",
                  "var runtime = update.runtime;",
                  "for(var moduleId in updatedModules) {",
                  Template.indent([
                    `if(${RuntimeGlobals$1.hasOwnProperty}(updatedModules, moduleId)) {`,
                    Template.indent([
                      `currentUpdate[moduleId] = updatedModules[moduleId];`,
                      "if(updatedModulesList) updatedModulesList.push(moduleId);",
                    ]),
                    "}",
                  ]),
                  "}",
                  "if(runtime) currentUpdateRuntime.push(runtime);",
                  "resolve();",
                ]),
                "});",
              ]),
              "});",
            ]),
            "}",
            "",
            Template.getFunctionContent(
              require("../hmr/JavascriptHotModuleReplacement.runtime.js")
            )
              .replace(/\$key\$/g, "readFileVm")
              .replace(/\$installedChunks\$/g, "installedChunks")
              .replace(/\$loadUpdateChunk\$/g, "loadUpdateChunk")
              .replace(/\$moduleCache\$/g, RuntimeGlobals$1.moduleCache)
              .replace(/\$moduleFactories\$/g, RuntimeGlobals$1.moduleFactories)
              .replace(
                /\$ensureChunkHandlers\$/g,
                RuntimeGlobals$1.ensureChunkHandlers
              )
              .replace(/\$hasOwnProperty\$/g, RuntimeGlobals$1.hasOwnProperty)
              .replace(/\$hmrModuleData\$/g, RuntimeGlobals$1.hmrModuleData)
              .replace(
                /\$hmrDownloadUpdateHandlers\$/g,
                RuntimeGlobals$1.hmrDownloadUpdateHandlers
              )
              .replace(
                /\$hmrInvalidateModuleHandlers\$/g,
                RuntimeGlobals$1.hmrInvalidateModuleHandlers
              ),
          ])
        : "// no HMR",
      "",
      withHmrManifest
        ? Template.asString([
            `${RuntimeGlobals$1.hmrDownloadManifest} = function() {`,
            Template.indent([
              "return new Promise(function(resolve, reject) {",
              Template.indent([
                `var filename = require('path').join(__dirname, ${JSON.stringify(
                  rootOutputDir
                )} + ${RuntimeGlobals$1.getUpdateManifestFilename}());`,
                "require('fs').readFile(filename, 'utf-8', function(err, content) {",
                Template.indent([
                  "if(err) {",
                  Template.indent([
                    'if(err.code === "ENOENT") return resolve();',
                    "return reject(err);",
                  ]),
                  "}",
                  "try { resolve(JSON.parse(content)); }",
                  "catch(e) { reject(e); }",
                ]),
                "});",
              ]),
              "});",
            ]),
            "}",
          ])
        : "// no HMR manifest",
    ]);
  }
}

const RuntimeGlobals = require("webpack/lib/RuntimeGlobals");
const StartupChunkDependenciesPlugin = require("webpack/lib/runtime/StartupChunkDependenciesPlugin");
// const ChunkLoadingRuntimeModule = require('webpack/lib/node/ReadFileChunkLoadingRuntimeModule')
class CommonJsChunkLoadingPlugin {
  constructor(options, context) {
    this.options = options || {};
    this._asyncChunkLoading = this.options.asyncChunkLoading;
    this.context = context || {};
  }

  /**
   * Apply the plugin
   * @param {Compiler} compiler the compiler instance
   * @returns {void}
   */
  apply(compiler) {
    const chunkLoadingValue = this._asyncChunkLoading
      ? "async-node"
      : "require";
    new StartupChunkDependenciesPlugin({
      chunkLoading: chunkLoadingValue,
      asyncChunkLoading: this._asyncChunkLoading,
    }).apply(compiler);
    compiler.hooks.thisCompilation.tap(
      "CommonJsChunkLoadingPlugin",
      (compilation) => {
        const onceForChunkSet = new WeakSet();
        const handler = (chunk, set) => {
          if (onceForChunkSet.has(chunk)) return;
          onceForChunkSet.add(chunk);
          set.add(RuntimeGlobals.moduleFactoriesAddOnly);
          set.add(RuntimeGlobals.hasOwnProperty);
          compilation.addRuntimeModule(
            chunk,
            new ReadFileChunkLoadingRuntimeModule(set, this.options, this.context)
          );
        };

        compilation.hooks.runtimeRequirementInTree
          .for(RuntimeGlobals.ensureChunkHandlers)
          .tap("CommonJsChunkLoadingPlugin", handler);
        compilation.hooks.runtimeRequirementInTree
          .for(RuntimeGlobals.hmrDownloadUpdateHandlers)
          .tap("CommonJsChunkLoadingPlugin", handler);
        compilation.hooks.runtimeRequirementInTree
          .for(RuntimeGlobals.hmrDownloadManifest)
          .tap("CommonJsChunkLoadingPlugin", handler);
        compilation.hooks.runtimeRequirementInTree
          .for(RuntimeGlobals.baseURI)
          .tap("CommonJsChunkLoadingPlugin", handler);
        compilation.hooks.runtimeRequirementInTree
          .for(RuntimeGlobals.externalInstallChunk)
          .tap("CommonJsChunkLoadingPlugin", handler);
        compilation.hooks.runtimeRequirementInTree
          .for(RuntimeGlobals.onChunksLoaded)
          .tap("CommonJsChunkLoadingPlugin", handler);

        compilation.hooks.runtimeRequirementInTree
          .for(RuntimeGlobals.ensureChunkHandlers)
          .tap("CommonJsChunkLoadingPlugin", (chunk, set) => {
            set.add(RuntimeGlobals.getChunkScriptFilename);
          });
        compilation.hooks.runtimeRequirementInTree
          .for(RuntimeGlobals.hmrDownloadUpdateHandlers)
          .tap("CommonJsChunkLoadingPlugin", (chunk, set) => {
            set.add(RuntimeGlobals.getChunkUpdateScriptFilename);
            set.add(RuntimeGlobals.moduleCache);
            set.add(RuntimeGlobals.hmrModuleData);
            set.add(RuntimeGlobals.moduleFactoriesAddOnly);
          });
        compilation.hooks.runtimeRequirementInTree
          .for(RuntimeGlobals.hmrDownloadManifest)
          .tap("CommonJsChunkLoadingPlugin", (chunk, set) => {
            set.add(RuntimeGlobals.getUpdateManifestFilename);
          });
      }
    );
  }
}

class NodeSoftwareStreamRuntime {
  constructor(options, context) {
    this.options = options || {};
    this.context = context || {};
  }

  apply(compiler) {
    if (compiler.options.target) {
      console.warn(
        `target should be set to false while using NodeSoftwareStreamRuntime plugin, actual target: ${compiler.options.target}`
      );
    }

    // When used with Next.js, context is needed to use Next.js webpack
    const { webpack } = this.context;

    // This will enable CommonJsChunkFormatPlugin
    compiler.options.output.chunkFormat = "commonjs";
    // This will force async chunk loading
    compiler.options.output.chunkLoading = "async-node";
    // Disable default config
    compiler.options.output.enabledChunkLoadingTypes = false;

    new ((webpack && webpack.node && webpack.node.NodeEnvironmentPlugin) ||
      require("webpack/lib/node/NodeEnvironmentPlugin"))({
      infrastructureLogging: compiler.options.infrastructureLogging,
    }).apply(compiler);
    new ((webpack && webpack.node && webpack.node.NodeTargetPlugin) ||
      require("webpack/lib/node/NodeTargetPlugin"))().apply(compiler);
    new CommonJsChunkLoadingPlugin(
      {
        asyncChunkLoading: true,
        name: this.options.name,
        remotes: this.options.remotes,
        baseURI: compiler.options.output.publicPath,
        promiseBaseURI: this.options.promiseBaseURI,
      },
      this.context
    ).apply(compiler);
  }
}

const executeLoadTemplate = `
    function executeLoad(remoteUrl) {
        const scriptUrl = remoteUrl.split("@")[1];
        const moduleName = remoteUrl.split("@")[0];
        console.log("executing remote load", scriptUrl);
        return new Promise(function (resolve, reject) {
   
         (global.webpackChunkLoad || fetch)(scriptUrl).then(function(res){
            return res.text();
          }).then(function(scriptContent){
         
          // const remote = eval(scriptContent + '\\n  try{' + moduleName + '}catch(e) { null; };');
            try {
              const remote = eval('let exports = {};' + scriptContent + 'exports');
              resolve(remote[moduleName])
            } catch(e) {
              console.error('problem executing remote module', moduleName);
              reject(e);
            }
          }).catch((e)=>{
            console.error('failed to fetch remote', moduleName, scriptUrl);
            console.error(e);
            reject(null)
          })
        }).catch((e)=>{
        console.error('error',e);
          console.warn(moduleName,'is offline, returning fake remote')
          return {
            fake: true,
            get:(arg)=>{
              console.log('faking', arg,'module on', moduleName);

              return ()=> Promise.resolve();
            },
            init:()=>{}
          }
        })
    }
`;

function buildRemotes(mfConf, webpack) {
  return Object.entries(mfConf.remotes || {}).reduce(
    (acc, [name, config]) => {
      const hasMiddleware = config.startsWith("middleware ");
      let middleware;
      if (hasMiddleware) {
        middleware = config.split("middleware ")[1];
      } else {
        middleware = `Promise.resolve(${JSON.stringify(config)})`;
      }

      const templateStart = `
              var ${webpack.RuntimeGlobals.require} = ${
        webpack.RuntimeGlobals.require
      } ? ${
        webpack.RuntimeGlobals.require
      } : typeof arguments !== 'undefined' ? arguments[2] : false;
               ${executeLoadTemplate}
        global.loadedRemotes = global.loadedRemotes || {};
        if (global.loadedRemotes[${JSON.stringify(name)}]) {
          return global.loadedRemotes[${JSON.stringify(name)}]
        }
        // if using modern output, then there are no arguments on the parent function scope, thus we need to get it via a window global.

      var shareScope = (${webpack.RuntimeGlobals.require} && ${
        webpack.RuntimeGlobals.shareScopeMap
      }) ? ${
        webpack.RuntimeGlobals.shareScopeMap
      } : global.__webpack_share_scopes__
      var name = ${JSON.stringify(name)}
      `;
      const template = `(remotesConfig) => new Promise((res) => {
      console.log('in template promise',JSON.stringify(remotesConfig))
        executeLoad(remotesConfig).then((remote) => {

          return Promise.resolve(remote.init(shareScope.default)).then(() => {
            return remote
          })
        })
          .then(function (remote) {
            const proxy = {
              get: remote.get,
              chunkMap: remote.chunkMap,
              path: remotesConfig.toString(),
              init: (arg) => {
                try {
                  return remote.init(shareScope.default)
                } catch (e) {
                  console.log('remote container already initialized')
                }
              }
            }
            if (remote.fake) {
              res(proxy);
              return null
            }

            Object.assign(global.loadedRemotes, {
              [name]: proxy
            });

            res(global.loadedRemotes[name])
          })


      })`;

      acc.runtime[name] = `()=> ${middleware}.then((remoteConfig)=>{
    console.log('remoteConfig runtime',remoteConfig);
    global.REMOTE_CONFIG[${JSON.stringify(name)}] = remoteConfig;
    ${templateStart}
    const loadTemplate = ${template};
    return loadTemplate(remoteConfig)
    })`;

      acc.buildTime[name] = `promise ${middleware}.then((remoteConfig)=>{
    console.log('remoteConfig buildtime',remoteConfig);
    global.REMOTE_CONFIG[${JSON.stringify(name)}] = remoteConfig;
    ${templateStart};
    const loadTemplate = ${template};
    return loadTemplate(remoteConfig)
    })`;

      acc.hot[name] = `()=> ${middleware}`;

      return acc;
    },
    { runtime: {}, buildTime: {}, hot: {} }
  );
}

class StreamingFederation {
  constructor({ experiments, ...options }, context) {
    this.options = options || {};
    this.context = context || {};
    this.experiments = experiments || {};
  }

  apply(compiler) {
    // When used with Next.js, context is needed to use Next.js webpack
    const { webpack } = this.context;

    const { buildTime, runtime, hot } = buildRemotes(
      this.options,
      webpack || require("webpack")
    );
    const defs = {
      "process.env.REMOTES": runtime,
      "process.env.REMOTE_CONFIG": hot,
    };

    new ((webpack && webpack.DefinePlugin) || require("webpack").DefinePlugin)(
      defs
    ).apply(compiler);
    new ((webpack && webpack.container.ModuleFederationPlugin) ||
      require("webpack/lib/container/ModuleFederationPlugin"))({
      ...this.options,
      remotes: buildTime,
    }).apply(compiler);
  }
}

const crypto = require("crypto");
const chalk = require("chalk");
const path = require("path");
const fs = require("fs");
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
      },
      ssr = true,
      removePlugins = [
        "BuildManifestPlugin",
        "DropClientPage",
        "WellKnownErrorsPlugin",
        "ModuleFederationPlugin",
        "NextJsRequireCacheHotReloader",
        "PagesManifestPlugin",
        "ReactFreshWebpackPlugin",
        "ReactLoadablePlugin",
        "NextMedusaPlugin"
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

      const DashboardPlugin = compilation.options.plugins.find(
          (plugin) => {
            return plugin.constructor.name === "NextMedusaPlugin";
          }
      );
      if(DashboardPlugin) {
        filteredPlugins.push(new DashboardPlugin.constructor({
          ...DashboardPlugin._options,
          filename: `sidecar-${DashboardPlugin._options.filename}`
        }));
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
        experiments: {
          ...compilation.options.experiments,
          lazyCompilation: false,
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
              (webpackOptions.mode === "production")
              ? "[contenthash]-fed.js"
              : "-fed.js"
          );
      }

      if (typeof webpackOptions.output.filename === "string") {
        webpackOptions.output.filename =
          compilation.options.output.filename.replace(
            ".js",
            !compilation.options.output.chunkFilename.includes("contenthash") &&
              (webpackOptions.mode === "production")
              ? "[contenthash]-fed.js"
              : "-fed.js"
          );
      }

      if (webpackOptions.mode === "production") {
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
        const { chunks } = info;
        const distPath = nextConfig.distDir ? path.join(
            compilation.options.context,
            nextConfig.distDir
        ) : compilation.options.output.path;

        const hasStats = fs.existsSync(
          path.join(distPath, "static/federated-stats.json")
        );
        const hasRemote = fs.existsSync(
          path.join(distPath, "static/ssr/remoteEntry.js")
        );
        if (hasRemote && hasStats && experiments.flushChunks) {
          let remoteEntry = path.join(distPath, "static/ssr/remoteEntry.js");

          const statContent = require(path.join(
            distPath,
            "static/federated-stats.json"
          ));

          let loadableContent;
          if (
            fs.existsSync(
              path.join(distPath, "federated-loadable-manifest.json")
            )
          ) {
            loadableContent = require(path.join(
              distPath,
              "federated-loadable-manifest.json"
            ));
          } else {
            log(
              "no federated loadable manifest found, it doesnt look like there are any local dynamic imports"
            );
            loadableContent = {};
          }
          statContent.loadable = loadableContent;

          const remoteContentPromise = new Promise((resolve, reject) => {
            fs.readFile(remoteEntry, "utf-8", function (err, data) {
              if (err) {
                reject(err);
                complete();
              }
              resolve(data);
            });
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

            nextTick(() => {
              fs.rmSync(remoteEntry);
              fs.writeFile(remoteEntry, newSource, (err) => {
                log("emitted!");
                if (typeof done === "function") {
                  complete();
                  pending.then(() => {
                    done(err);
                  });
                }
              });
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

      if (webpackOptions.mode === "production") {
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
        if (!ssr && options.isServer) {
          log("SSR Disabled");
          if (typeof nextConfig.webpack === "function") {
            return nextConfig.webpack(config, options);
          }

          return config;
        }
        const { webpack } = options;
        Object.assign(config.experiments, {
          topLevelAwait: true,
          layers: true
        });

        const federationPluginOptions = Object.assign(
          { remotes: {}, shared: {} },
          clone(federationPluginOptionsOrig)
        );
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
          log.warning("serverless targets are not supported, build may fail");
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
            if (compiler.options.mode === "production") {
              if (
                compiler.options.name === "server" ||
                compiler.options.name === "client"
              ) {
                compiler.hooks.afterCompile.tapAsync(
                  "NextFederation",
                  (compilation, done) => {
                    run(compilation, done);
                  }
                );
              }
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

exports.NodeSoftwareStreamRuntime = NodeSoftwareStreamRuntime;
exports.StreamingFederation = StreamingFederation;
exports.withFederatedSidecar = withModuleFederation;
