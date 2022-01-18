import rpcLoadTemplate from "../templates/rpcLoad";
const rpcPerformTemplate = `
    ${rpcLoadTemplate}
    function rpcPerform(remoteUrl) {
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
            //   rpcLoad(scriptUrl, function(error, scriptContent) {
            //     if (error) { reject(error); }
            //     //TODO using vm??
            //     const remote = eval(scriptContent + '\\n  try{' + moduleName + '}catch(e) { null; };');
            //     if (!remote) {
            //       reject("remote library " + moduleName + " is not found at " + scriptUrl);
            //     } else if (remote instanceof Promise) {
            //         return remote;
            //     } else {
            //         resolve(remote);
            //     }
            // });
        });
    }
`;

const rpcProcessTemplate = (mfConfig) => `
    function rpcProcess(remote) {
    console.log(remote);
        console.log('remote',remote.get);
        return {get:(request)=> remote.get(request),init:(arg)=>{try {return remote.init({
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
    ${rpcPerformTemplate}
    ${rpcProcessTemplate(mfConf)}
  `;
  return Object.entries(mfConf.remotes || {}).reduce((acc, [name, config]) => {
    acc[name] = {
      external: `external (function() {
        ${builtinsTemplate}
        return rpcPerform("${config}").then(rpcProcess)
      }())`,
    };
    return acc;
  }, {});
}

class StreamingFederation {
  constructor(options, context) {
    this.options = options || {};
    this.context = context || {};
  }
  apply(compiler) {
    // When used with Next.js, context is needed to use Next.js webpack
    const { webpack } = this.context;

    new (webpack?.container.ModuleFederationPlugin ||
      require("webpack/lib/container/ModuleFederationPlugin"))({
      ...this.options,
      remotes: buildRemotes(this.options),
    }).apply(compiler);
  }
}

export default StreamingFederation;
