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
        return {
        get:(request)=> remote.get(request)
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
        res(executeLoad("${config}").then(function(remote){return processRemoteLoad(remote,${JSON.stringify(
        name
      )},"${config}")}))
      })`;
      acc.runtime[name] = `()=> ${template}`;
      acc.buildTime[name] = `promise ${template}`;
      return acc;
    },
    { runtime: {}, buildTime: {} }
  );
}

class StreamingFederation {
  constructor(options, context) {
    this.options = options || {};
    this.context = context || {};
  }
  apply(compiler) {
    // When used with Next.js, context is needed to use Next.js webpack
    const { webpack } = this.context;
    const { buildTime, runtime } = buildRemotes(this.options);

    new ((webpack && webpack.DefinePlugin) || require("webpack").DefinePlugin)({
      "process.env.REMOTES": runtime,
    }).apply(compiler);
    new ((webpack && webpack.container.ModuleFederationPlugin) ||
      require("webpack/lib/container/ModuleFederationPlugin"))({
      ...this.options,
      remotes: buildTime,
    }).apply(compiler);
  }
}

export default StreamingFederation;
