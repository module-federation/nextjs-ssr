const React = require("react");
const { Head } = require("next/document");
const path = require("path");
const crypto = require("crypto");
const existingChunks = new Set()
const generateDynamicRemoteScript = (remoteContainer) => {
  const [name, path] = remoteContainer.path.split("@");
  const remoteUrl = new URL(path.replace("ssr", "chunks"));
  remoteUrl.searchParams.set("cbust", Date.now());
  return {
    [name]: React.createElement("script", {
      "data-webpack": name,
      src: remoteUrl.toString(),
      async: true,
      key: name,
    }),
  };
};

const extractChunkCorrelation = (remoteContainer, lookup, request) => {
  if (
    remoteContainer &&
    remoteContainer.chunkMap &&
    remoteContainer.chunkMap.federatedModules
  ) {
    const path = remoteContainer.path.split("@")[1];
    const [baseurl] = path.split("static/ssr");
    remoteContainer.chunkMap.federatedModules.map((federatedRemote) => {
      federatedRemote.exposes[request].forEach((remoteChunks) => {
        remoteChunks.chunks.map((chunk) => {
          if(lookup.files.includes(chunk) || existingChunks.has(chunk) || lookup.files.includes(new URL(chunk, baseurl).href)) {

          } else {
            lookup.files.push(new URL(chunk, baseurl).href);
          }
        });
      });
    });
  } else {
    console.warn(
      "Module Federation:",
      "no federated modules in chunk map OR experiments.flushChunks is disabled"
    );
  }
};
const requireMethod =
  typeof __non_webpack_require__ !== "undefined"
    ? __non_webpack_require__
    : require;
const requestPath = path.join(
  process.cwd(),
  ".next",
  "server/pages",
  "../../react-loadable-manifest.json"
);
let remotes = {};
const loadableManifest = requireMethod(requestPath);
requireMethod.cache[requestPath].exports = new Proxy(loadableManifest, {
  get(target, prop, receiver) {
    if (!target[prop]) {
      let remoteImport = prop.split("->")[1];

      if (remoteImport) {
        remoteImport = remoteImport.trim();
        const [remote, module] = remoteImport.split("/");

        if (!remotes[remote]) {
          Object.assign(
            remotes,
            generateDynamicRemoteScript(global.loadedRemotes.get(remote))
          );
        }
        console.log(prop);

        const dynamicLoadableManifestItem = {
          id: prop,
          files: [],
        };
        // TODO: figure out who is requesting module
        let remoteModuleContainerId;

        const remoteMapIterator = global.loadedRemotes


        for (const [key, remoteContainer] of remoteMapIterator.entries()) {
          if (
            remoteContainer.chunkMap &&
            remoteContainer.chunkMap.federatedModules[0] &&
            remoteContainer.chunkMap.federatedModules[0].remote === remote
          ) {
            // console.log('located container chunkmap for', remote);
            // console.log('looking for', module, 'inside', remote);
            //TODO need to get maps for production
            // dynamicLoadableManifestItem.files = remoteContainer.chunkMap.federatedModules[0].exposes[`./${module}`]
          }
        }

        if (remoteModuleContainerId && process.env.NODE_ENV !== "development") {
          dynamicLoadableManifestItem.id = remoteModuleContainerId;
        }
        extractChunkCorrelation(
          global.loadedRemotes.get(remote),
          dynamicLoadableManifestItem,
          `./${module}`
        );
        return dynamicLoadableManifestItem;
      }
    }
    return target[prop];
  },
});

const flushChunks = async (remoteEnvVar = process.env.REMOTES) => {
  remotes = {};
  const remoteKeys = Object.keys(remoteEnvVar);
  const preload = [];

  try {
    for (const key in loadableManifest) {
      loadableManifest[key].files.forEach((hostChunk)=>{
        existingChunks.add(hostChunk)
      });
      const [where, what] = key.split("->");
      const request = what.trim();
      const foundFederatedImport = remoteKeys.find((remoteKey) => {
        return request.startsWith(`${remoteKey}/`);
      });
      if (foundFederatedImport) {
        const remotePreload = remoteEnvVar[foundFederatedImport]().then(
          (remoteContainer) => {
            Object.assign(
              remotes,
              generateDynamicRemoteScript(remoteContainer)
            );

            const inferRequest = what.split(`${foundFederatedImport}/`)[1];
            const request = `./${inferRequest}`;
            extractChunkCorrelation(
              remoteContainer,
              loadableManifest[key],
              request
            );
          }
        );
        preload.push(remotePreload);
      }
    }
    await Promise.all(preload);
    return remotes;
  } catch (e) {
    console.error("Module Federation: Could not flush chunks", e);
  }
  return [];
};

export class ExtendedHead extends Head {
  constructor(props, context) {
    super(props, context);
    this.context = context;
  }
  getCssLinks(files) {
    const cssLinks = super.getCssLinks(files);
    if (Array.isArray(cssLinks)) {
      return cssLinks.map((chunk) => {
        if (!chunk) return null;
        const [prefix, asset] = chunk.props.href.split(
          this.context.assetPrefix
        );
        if (
          chunk.props.href &&
          chunk.props.href.startsWith("/") &&
          chunk.props.href.includes("http")
        ) {
          return React.cloneElement(chunk, {
            ...chunk.props,
            href: `http${chunk.props.href.split("http")[1]}`,
          });
        } else if (
          chunk.props.href &&
          chunk.props.href.includes("-fed.") &&
          this.context.assetPrefix
        ) {
          const replacedArg = this.context.assetPrefix.endsWith("/")
            ? chunk.props.href.replace(`${this.context.assetPrefix}_next/`, "")
            : chunk.props.href.replace(
                `${this.context.assetPrefix}/_next/`,
                ""
              );
          return React.cloneElement(chunk, {
            ...chunk.props,
            href: replacedArg,
          });
        } else if (asset.includes("http") && asset.startsWith("/")) {
          return React.cloneElement(chunk, {
            ...chunk.props,
            href: `http${asset.split("http")[1]}`,
          });
        } else return chunk;
      });
    }
    return cssLinks;
  }
  getDynamicChunks(files) {
    const dynamicChunks = super.getDynamicChunks(files);
    const c= dynamicChunks.map((chunk) => {
      if (!chunk) return null;
      console.log('react render chunk', chunk.props.src);
      if (chunk.props.src.startsWith("/") && chunk.props.src.includes("http")) {
        return React.cloneElement(chunk, {
          ...chunk.props,
          src: `http${chunk.props.src.split("http")[1]}`,
        });
      } else if (
        chunk.props.src.includes("-fed.") &&
        this.context.assetPrefix
      ) {
        const replacedArg = this.context.assetPrefix.endsWith("/")
          ? chunk.props.src.replace(`${this.context.assetPrefix}_next/`, "")
          : chunk.props.src.replace(`${this.context.assetPrefix}/_next/`, "");
        return React.cloneElement(chunk, {
          ...chunk.props,
          src: replacedArg,
        });
      }
      return chunk;
    });

    return c
  }
}

const hashmap = {};
const revalidate = () => {
  if (global.REMOTE_CONFIG) {
    return new Promise((res) => {
      for (const property in global.REMOTE_CONFIG) {
        const [name, url] = global.REMOTE_CONFIG[property].split("@");
        fetch(url)
          .then((re) => re.text())
          .then((contents) => {
            var hash = crypto.createHash("md5").update(contents).digest("hex");

            if (hashmap[name]) {
              if (hashmap[name] !== hash) {
                hashmap[name] = hash;
                console.log(name, "hash is different - must hot reload server");
                res();
              }
            } else {
              hashmap[name] = hash;
            }
          })
          .catch((e) => {
            console.log(
              "Remote",
              name,
              url,
              "Failed to load or is not online",
              e
            );
          });
      }
    }).then(() => {
      let req;
      if (typeof __non_webpack_require__ === "undefined") {
        req = require;
      } else {
        req = __non_webpack_require__;
      }
      if (global.hotLoad) {
        global.hotLoad();
      }
      //global.loadedRemotes.clear()
      Object.keys(req.cache).forEach((k) => {
        if (
          k.includes("remote") ||
          k.includes("runtime") ||
          k.includes("server")
        ) {
          delete req.cache[k];
        }
      });
    });
  }

  return new Promise((res, rej) => {});
};

const DevHotScript = () => {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return /*#__PURE__*/ React.createElement("script", {
    dangerouslySetInnerHTML: {
      __html: `
        let loadTimeout
        const startLoadTimeout = ()=> {loadTimeout = setTimeout(()=>window.location.reload(),1500);}
        const loadAfterHot =()=>{
        fetch(window.location.href,{method:'HEAD'}).then(()=>{clearTimeout(loadTimeout)}).catch(()=>{clearTimeout(loadTimeout); startLoadTimeout(); setTimeout(loadAfterHot,1000)})
        }; 
        window.addEventListener('load', (event) => {
         if(!window.next) {loadAfterHot()}
        });
        `,
    },
  });
};

module.exports = { flushChunks, ExtendedHead, revalidate, DevHotScript };
