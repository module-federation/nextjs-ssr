'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var global$1 = (typeof global !== "undefined" ? global :
            typeof self !== "undefined" ? self :
            typeof window !== "undefined" ? window : {});

const React = require("react");
const { Head } = require("next/document");
const path = require("path");
const crypto = require("crypto");
const generateDynamicRemoteScript = (remoteContainer) => {
  const [name, path] = remoteContainer.path.split("@");
  const remoteUrl = new URL(path);
  remoteUrl.pathname = remoteUrl.pathname.replace("ssr", "chunks");
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
          if (!lookup.files.includes(new URL(chunk, baseurl).href)) {
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

const extractLocalRemoteImport = (remoteContainer, lookup, request) => {
  if (
    remoteContainer &&
    remoteContainer.chunkMap &&
    remoteContainer.chunkMap.loadable &&
    remoteContainer.chunkMap.loadable[request]
  ) {
    const path = remoteContainer.path.split("@")[1];
    const [baseurl] = path.split("static/ssr");
    remoteContainer.chunkMap.loadable[request].files.map((chunk) => {
      if (!lookup.files.includes(new URL(chunk, baseurl).href)) {
        lookup.files.push(new URL(chunk, baseurl).href);
      }
    });
  } else {
    console.warn(
      "Module Federation:",
      "unable to understand local remote import OR experiments.flushChunks is disabled"
    );
  }
};
const requireMethod =
  typeof __non_webpack_require__ !== "undefined"
    ? __non_webpack_require__
    : require;

let foundNextFolder = null;
if (!foundNextFolder) {
  foundNextFolder = Object.keys(requireMethod.cache).find((key) => {
    if (key.includes(".next")) {
      return true;
    }
  });
}
const manifestPath = path.join(
  foundNextFolder.split(".next")[0],
  ".next/react-loadable-manifest.json"
);
let remotes = {};
const loadableManifest = requireMethod(manifestPath);
requireMethod.cache[manifestPath].exports = new Proxy(loadableManifest, {
  get(target, prop, receiver) {
    if (!target[prop]) {
      let remoteImport = prop.split("->")[1];

      if (remoteImport) {
        let isLocalImportLike = false;
        remoteImport = remoteImport.trim();
        const [remote, module] = remoteImport.split("/");
        if (!global$1.loadedRemotes[remote]) {
          isLocalImportLike = true;
          console.log("needs to search for a local import", prop);
        }
        if (!remotes[remote] && global$1.loadedRemotes[remote]) {
          Object.assign(
            remotes,
            generateDynamicRemoteScript(global$1.loadedRemotes[remote])
          );
        }

        const dynamicLoadableManifestItem = {
          id: prop,
          files: [],
        };
        // TODO: figure out who is requesting module
        let remoteModuleContainerId;
        Object.values(global$1.loadedRemotes).find((remote) => {
          if (
            remote.chunkMap &&
            remote.chunkMap.federatedModules[0] &&
            remote.chunkMap.federatedModules[0].remoteModules
          ) {
            if (
              remote.chunkMap.federatedModules[0].remoteModules[remoteImport]
            ) {
              remoteModuleContainerId =
                remote.chunkMap.federatedModules[0].remoteModules[remoteImport];
              return true;
            }
          }
          if (
            remote.chunkMap &&
            remote.chunkMap.loadable &&
            remote.chunkMap.loadable[prop]
          ) {
            console.log("extracting local import from this loadable map", prop);
            extractLocalRemoteImport(remote, dynamicLoadableManifestItem, prop);
            return true;
          }
        });

        if (!isLocalImportLike) {
          if (
            remoteModuleContainerId &&
            process.env.NODE_ENV !== "development"
          ) {
            dynamicLoadableManifestItem.id = remoteModuleContainerId;
          }
          extractChunkCorrelation(
            global$1.loadedRemotes[remote],
            dynamicLoadableManifestItem,
            `./${module}`
          );
        }
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

class ExtendedHead extends Head {
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
    return dynamicChunks.map((chunk) => {
      if (!chunk) return null;
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
  }
}
var interval;
const hashmap = {};
const revalidate = (options) => {
  if (global$1.REMOTE_CONFIG) {
    return new Promise(async (res) => {
      const { poll, timeout } = Object.assign(
        {
          poll: false,
          timeout: 3000,
        },
        options
      );

      if (poll && interval) {
        clearInterval(interval);
      }

      if (poll) {
        interval = setInterval(() => {
          revalidate(options);
        }, timeout);
      }
      for (const property in global$1.REMOTE_CONFIG) {
        let remote = global$1.REMOTE_CONFIG[property];
        if (typeof remote === "function") {
          remote = await remote();
        }
        console.log("flush chunks: ", remote);
        const [name, url] = remote.split("@");
        (global$1.webpackChunkLoad || fetch)(url)
          .then((re) => re.text())
          .then((contents) => {
            var hash = crypto.createHash("md5").update(contents).digest("hex");
            if (hashmap[name]) {
              if (hashmap[name] !== hash) {
                hashmap[name] = hash;
                console.log(name, "hash is different - must hot reload server");
                res(true);
              }
            } else {
              hashmap[name] = hash;
              res(false);
            }
          })
          .catch((e) => {
            console.error(
              "Remote",
              name,
              url,
              "Failed to load or is not online",
              e
            );
            res(true);
          });
      }
    }).then((shouldReload) => {
      if (!shouldReload) {
        return false;
      }
      let req;
      if (typeof __non_webpack_require__ === "undefined") {
        req = require;
      } else {
        req = __non_webpack_require__;
      }

      if (global$1.hotLoad) {
        global$1.hotLoad();
      }
      global$1.loadedRemotes = {};
      Object.keys(req.cache).forEach((k) => {
        if (
          k.includes("remote") ||
          k.includes("runtime") ||
          k.includes("server") ||
          k.includes("flushChunks") ||
          k.includes("react-loadable-manifest")
        ) {
          delete req.cache[k];
        }
      });
    });
  }
  return true;
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

exports.ExtendedHead = ExtendedHead;
