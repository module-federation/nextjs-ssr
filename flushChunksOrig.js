const { createElement } = require("react");
const loadableManifest = __non_webpack_require__(
  "../../react-loadable-manifest.json"
);

const flushChunksOrig = async () => {
  const remotes = {};
  try {
    const asyncChunks = Object.keys(loadableManifest).map(async (key) => {
      const [where, what] = key.split("->");
      const request = what.trim();
      const foundFederatedImport = Object.keys(process.env.REMOTES).find(
        (remoteKey) => {
          return request.startsWith(`${remoteKey}/`);
        }
      );
      const remoteContainer = await process.env.REMOTES[foundFederatedImport]();
      const path = remoteContainer.path.split("@")[1];
      const [baseurl] = path.split("static/ssr");
      if (
        remoteContainer &&
        remoteContainer.chunkMap &&
        remoteContainer.chunkMap.federatedModules
      ) {
        remoteContainer.chunkMap.federatedModules.map((federatedRemote) => {
          remotes[federatedRemote.remote] = createElement("script", {
            "data-webpack": federatedRemote.remote,
            src: path.replace("ssr", "chunks"),
            async: true,
          });
          const request = `.${what.split(foundFederatedImport)[1]}`;
          federatedRemote.exposes[request].forEach((remoteChunks) => {
            remoteChunks.chunks.map((chunk) => {
              if (
                !loadableManifest[key].files.includes(
                  new URL(chunk, baseurl).href
                )
              ) {
                loadableManifest[key].files.push(new URL(chunk, baseurl).href);
              }
            });
          });
        });
      } else {
        console.warn("Module Federation:", "no federated modules in chunk map");
      }
    });

    await Promise.all(asyncChunks);
    return Object.values(remotes);
  } catch (e) {
    console.error("Module Federation: Could not flush chunks", e);
  }
  return [];
};

module.exports = flushChunksOrig;
