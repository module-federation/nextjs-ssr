import loadScriptTemplate from "../templates/loadScript";
const executeLoadTemplate = `
    ${loadScriptTemplate}
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
        })
        });
    }
`;

const processRemoteLoadTemplate = (mfConfig) => `
  function processRemoteLoad(remote, name, path) {
     return Promise.all(Object.keys(remote.chunkMap.federatedModules[0].exposes).map(c=>{
        return remote.get(c).then(f=>{
          try {f()} catch(e) {}
        })
     })).then(()=>{
        const prox= {
        get: remote.get,
        chunkMap: remote.chunkMap,
        path: path,
        init:(arg)=>{try {return remote.init({
            ...arg,
            ${Object.keys(mfConfig.shared || {})
  .filter(
    (item) =>
      mfConfig.shared[item].singleton &&
      mfConfig.shared[item].requiredVersion
  )
  .map(function (item) {
    return `"${item}": {
                      ["${mfConfig.shared[item].requiredVersion}"]: {
                        get: () => Promise.resolve().then(() => () => require("${item}"))
                      }
                  }`;
  })
  .join(",")}
        })} catch(e){console.log('remote container already initialized')}}}
        return prox
     })
    }
`;

function buildRemotes(mfConf) {
  const builtinsTemplate = `
    ${executeLoadTemplate}
    ${processRemoteLoadTemplate(mfConf)}
  `;

  return Object.entries(mfConf.remotes || {}).reduce(
    (acc, [name, config]) => {
      const template = `new Promise(function(res) {
        ${builtinsTemplate}
        global.loadedRemotes = global.loadedRemotes || {};
        if(global.loadedRemotes[${JSON.stringify(name)}]) {
          res(global.loadedRemotes[${JSON.stringify(name)}])
        return 
        }
        global.loadedRemotes[${JSON.stringify(name)}] = executeLoad("${config}").then(function(remote){return processRemoteLoad(remote,${JSON.stringify(
        name
      )},"${config}")})
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
    const { buildTime, runtime, hot } = buildRemotes(this.options);
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
