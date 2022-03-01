const executeLoadTemplate = `
    function executeLoad(remoteUrl) {
        const scriptUrl = remoteUrl.split("@")[1];
        const moduleName = remoteUrl.split("@")[0];
        return new Promise(function (resolve, reject) {
        
          fetch(scriptUrl).then(function(res){
            return res.text()
          }).then(function(scriptContent){
          // const remote = eval(scriptContent + '\\n  try{' + moduleName + '}catch(e) { null; };');
            try {
              const remote = eval('let exports = {};' + scriptContent + 'exports')
              resolve(remote[moduleName])
            } catch(e) {
              console.error('problem executing remote module', moduleName);
              reject(e);
            }
          }).catch((e)=>{
            console.error('failed to fetch remote', moduleName, scriptUrl);
            console.error(e);
          })
        });
    }
`;

function buildRemotes(mfConf, webpack) {
  const builtinsTemplate = `
    ${executeLoadTemplate}
  `;

  return Object.entries(mfConf.remotes || {}).reduce(
    (acc, [name, config]) => {
      const template = `new Promise((res) => {
           var requireFunction = ${
        webpack.RuntimeGlobals.require
      } ? ${webpack.RuntimeGlobals.require} : arguments[2]
     
        ${builtinsTemplate}

        global.loadedRemotes = global.loadedRemotes || {};
        if(global.loadedRemotes[${JSON.stringify(name)}]) {
          res(global.loadedRemotes[${JSON.stringify(name)}])
        return 
        }
        console.log('before execute load');
     
        global.loadedRemotes[${JSON.stringify(
          name
        )}] = executeLoad("${config}").then(function(remote){
        var __webpack_require__ = requireFunction
        Object.assign(${webpack.RuntimeGlobals.shareScopeMap}.default, {
        react: global.__webpack_share_scopes__.default.react,
        'next/link': global.__webpack_share_scopes__.default['next/link'],
        'next/script': global.__webpack_share_scopes__.default['next/script'],
        'next/router': global.__webpack_share_scopes__.default['next/router'],
        'next/head': global.__webpack_share_scopes__.default['next/head'],
        'next/dynamic': global.__webpack_share_scopes__.default['next/dynamic'],
        })
        //console.log(remote,remote.init(global.__webpack_share_scopes__.default))
        // remote.init(global.__webpack_share_scopes__.default).then(()=>{
        // console.log('did initialize');
        // })
        //remote.init(${webpack.RuntimeGlobals.shareScopeMap}.default)
        console.log('in thennable');
           const proxy= {
            get: remote.get,
            chunkMap: remote.chunkMap,
            path: "${config}",
            init:(arg)=>{
            console.log('in init phase');
            try {
            console.log('arg',arg);

            return remote.init(${webpack.RuntimeGlobals.shareScopeMap}.default)
            } catch(e){console.log('remote container already initialized')}}
          }
          Object.assign(global.loadedRemotes,{${JSON.stringify(name)}: proxy});
     
          return global.loadedRemotes[${JSON.stringify(name)}]
        })

        res(global.loadedRemotes[${JSON.stringify(name)}])
      })`;
      acc.runtime[name] = `()=> ${template}`;
      acc.buildTime[name] = `promise ${template}`;
      acc.hot[name] = `"${config}"`;
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
      Object.assign(defs, {
        "process.env.REMOTE_CONFIG": hot,
      });
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
