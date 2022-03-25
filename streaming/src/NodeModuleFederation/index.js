"use strict";

const executeLoadTemplate = `
    function executeLoad(remoteUrl) {
        const scriptUrl = remoteUrl.split("@")[1];
        const moduleName = remoteUrl.split("@")[0];
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
        middleware = Promise.resolve(config);
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
          return global.loadedRemotes[${JSON.stringify(name)}])
        }
        // if using modern output, then there are no arguments on the parent function scope, thus we need to get it via a window global.

      var shareScope = (${webpack.RuntimeGlobals.require} && ${
        webpack.RuntimeGlobals.shareScopeMap
      }) ? ${
        webpack.RuntimeGlobals.shareScopeMap
      } : global.__webpack_share_scopes__
      var name = ${JSON.stringify(name)}
      `;
      const template = (remotesConfig) => `new Promise((res) => {
        executeLoad("${remotesConfig}").then((remote) => {

          return Promise.resolve(remote.init(shareScope.default)).then(() => {
            return remote
          })
        })
          .then(function (remote) {
            const proxy = {
              get: remote.get,
              chunkMap: remote.chunkMap,
              path: "${remotesConfig}",
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

      acc.runtime[name] = `()=> ${hasMiddleware ? middleware : middleware.toString()}.then((remoteConfig)=>{
    console.log('remoteConfig',remoteConfig);
    global.REMOTE_CONFIG[${JSON.stringify(name)}] = remoteConfig;
    ${templateStart}
    return ${template}(remoteConfig)
    })`;
      acc.buildTime[name] = `promise ${hasMiddleware ? middleware : middleware.toString()}.then((remoteConfig)=>{
    console.log('remoteConfig',remoteConfig);
    global.REMOTE_CONFIG[${JSON.stringify(name)}] = remoteConfig;
    ${templateStart};
    return  ${template}(remoteConfig)
    })`;

      if (!hasMiddleware) {
        console.log("has no middleware");
        acc.hot[name] = `()=> ${JSON.stringify(config)}`;
      } else {
        console.log("has middl");
        acc.hot[name] = `()=> ${middleware.toString()}`;
      }
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
    };
    if (this.experiments.hot) {
      defs["process.env.REMOTE_CONFIG"] = hot;
    }
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

export default StreamingFederation;
