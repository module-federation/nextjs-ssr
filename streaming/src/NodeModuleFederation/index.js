const executeLoadTemplate = `
    function executeLoad(remoteUrl) {
        const scriptUrl = remoteUrl.split("@")[1];
        const moduleName = remoteUrl.split("@")[0];
        return new Promise(function (resolve, reject) {
        console.log('fetching',scriptUrl);
          fetch(scriptUrl).then(function(res){
          console.log('got response', moduleName);
            return res.text()
          }).then(function(scriptContent){
          console.log('will eval remote');
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
          reject(null)
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
      var ${webpack.RuntimeGlobals.require} = ${
        webpack.RuntimeGlobals.require
      } ? ${
        webpack.RuntimeGlobals.require
      } : typeof arguments !== 'undefined' ? arguments[2] : false
    // if using modern output, then there are no arguments on the parent function scope, thus we need to get it via a window global. 
          var shareScope = ${webpack.RuntimeGlobals.require} ? ${
        webpack.RuntimeGlobals.shareScopeMap
      } : global.__webpack_share_scopes__

        ${builtinsTemplate}

        global.loadedRemotes = global.loadedRemotes || {};

        if(global.loadedRemotes[${JSON.stringify(name)}]) {
          res(global.loadedRemotes[${JSON.stringify(name)}])
          return 
        }
        
        console.log('share scope before execute load', shareScope)
     
        executeLoad("${config}").then((remote)=>{
          return Promise.resolve(remote.init(shareScope.default)).then(()=>{
            return remote
          })
        })
        .then(function(remote){
        
        console.log(remote);
   
        console.log('in thennable');
           const proxy= {
            get: remote.get,
            chunkMap: remote.chunkMap,
            path: "${config}",
            init:(arg)=>{
            console.log('in init phase');
            try {
            console.log('arg',arg);
            console.log('before init', shareScope);
            return remote.init(shareScope.default)
            } catch(e){console.log('remote container already initialized')}}
          }
          Object.assign(global.loadedRemotes,{${JSON.stringify(name)}: proxy});
     
          res(global.loadedRemotes[${JSON.stringify(name)}])
        })

     
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
