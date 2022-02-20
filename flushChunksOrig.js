const React = require("react");
const {Head} = require("next/document");
const path = require("path");
const crypto = require("crypto");

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
const loadableManifest = requireMethod(requestPath);
const flushChunks = async (remoteEnvVar = process.env.REMOTES) => {
  const remoteKeys = Object.keys(remoteEnvVar);
  const remotes = {};
  const preload = [];

  // for (const key in remoteEnvVar) {
  //   const remoteContainer = await remoteEnvVar[key]();
  //   if (
  //     remoteContainer &&
  //     remoteContainer.chunkMap &&
  //     remoteContainer.chunkMap.federatedModules
  //   ) {
  //     remoteContainer.chunkMap.federatedModules.forEach((federatedRemote) => {
  //       Object.keys(federatedRemote.exposes).forEach((m) => {
  //         preload.push(
  //           remoteContainer.get(m).then((f) => {
  //             try {
  //               return f();
  //             } catch (e) {}
  //           })
  //         );
  //       });
  //     });
  //   }
  // }
  // const preloaded = await Promise.all(preload);

  try {
    for (const key in loadableManifest) {
      const [where, what] = key.split("->");
      const request = what.trim();
      const foundFederatedImport = remoteKeys.find((remoteKey) => {
        return request.startsWith(`${remoteKey}/`);
      });
      if (foundFederatedImport) {
        const remotePreload = remoteEnvVar[foundFederatedImport]().then(remoteContainer => {

          const [name, path] = remoteContainer.path.split("@");
          const remoteUrl = new URL(path.replace("ssr", "chunks"));
          remoteUrl.searchParams.set("cbust", Date.now());
          remotes[name] = React.createElement("script", {
            "data-webpack": name,
            src: remoteUrl.toString(),
            async: true,
            key: name,
          });
          if (
            remoteContainer &&
            remoteContainer.chunkMap &&
            remoteContainer.chunkMap.federatedModules
          ) {
            const path = remoteContainer.path.split("@")[1];
            const [baseurl] = path.split("static/ssr");
            remoteContainer.chunkMap.federatedModules.map((federatedRemote) => {
              const inferRequest = what.split(`${foundFederatedImport}/`)[1]
              const request = `./${inferRequest}`;
              federatedRemote.exposes[request].forEach((remoteChunks) => {
                remoteChunks.chunks.map((chunk) => {
                  if (
                    !loadableManifest[key].files.includes(
                      new URL(chunk, baseurl).href
                    )
                  ) {
                    loadableManifest[key].files.push(
                      new URL(chunk, baseurl).href
                    );
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
        })
        preload.push(remotePreload)
      }
    }
    await Promise.all(preload)
    return Object.values(remotes);
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
    return cssLinks.map((chunk) => {
      if (!chunk) return null;
      const [prefix,asset] = chunk.props.href.split(this.context.assetPrefix)
      if (chunk.props.href && chunk.props.href.startsWith("/") && chunk.props.href.includes("http")) {
        return React.cloneElement(chunk, {
          ...chunk.props,
          href: `http${chunk.props.href.split("http")[1]}`,
        });
      } else if (chunk.props.href && chunk.props.href.includes("-fed.") && this.context.assetPrefix) {
        const replacedArg = this.context.assetPrefix.endsWith("/")
          ? chunk.props.href.replace(`${this.context.assetPrefix}_next/`, "")
          : chunk.props.href.replace(`${this.context.assetPrefix}/_next/`, "");
        return React.cloneElement(chunk, {
          ...chunk.props,
          href: replacedArg,
        });
      } else if(asset.includes('http') && asset.startsWith('/')) {
        return React.cloneElement(chunk, {
          ...chunk.props,
          href: `http${asset.split("http")[1]}`,
        });
      } else
      return chunk;
    });
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
      } else if (chunk.props.src.includes("-fed.") && this.context.assetPrefix) {
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

const hashmap = {};
const revalidate = () => {
  if (global.REMOTE_CONFIG) {
    new Promise((res) => {
      console.log("fetching remote again");
      for (const property in global.REMOTE_CONFIG) {
        const [name, url] = global.REMOTE_CONFIG[property].split("@");
        fetch(url)
          .then((re) => re.text())
          .then((contents) => {
            var hash = crypto.createHash("md5").update(contents).digest("hex");

            if (hashmap[name]) {
              if (hashmap[name] !== hash) {
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
      global.loadedRemotes = {};
      Object.keys(req.cache).forEach((k) => {
        if (
          k.includes("remote") ||
          k.includes("runtime") ||
          k.includes("server")
        ) {
          delete req.cache[k];
          // require(k);
        }
      });
    });
  }
};

module.exports = {flushChunks, ExtendedHead, revalidate};
