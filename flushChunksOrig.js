const React = require("react");
const { Head } = require("next/document");
const path = require("path");
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
  try {
    for (const key in loadableManifest) {
      const [where, what] = key.split("->");
      const request = what.trim();
      const foundFederatedImport = remoteKeys.find((remoteKey) => {
        return request.startsWith(`${remoteKey}/`);
      });
      if (!foundFederatedImport) {
        return null;
      }
      const remoteContainer = await remoteEnvVar[foundFederatedImport]();
      const path = remoteContainer.path.split("@")[1];
      const [baseurl] = path.split("static/ssr");
      if (
        remoteContainer &&
        remoteContainer.chunkMap &&
        remoteContainer.chunkMap.federatedModules
      ) {
        remoteContainer.chunkMap.federatedModules.map((federatedRemote) => {
          remotes[federatedRemote.remote] = React.createElement("script", {
            "data-webpack": federatedRemote.remote,
            src: path.replace("ssr", "chunks"),
            async: true,
            key: federatedRemote.remote,
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
        console.warn(
          "Module Federation:",
          "no federated modules in chunk map OR experiments.flushChunks is disabled"
        );
      }
    }
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

  getDynamicChunks(files) {
    const dynamicChunks = super.getDynamicChunks(files);
    return dynamicChunks.map((chunk) => {
      if (chunk.props.src.startsWith("/") && chunk.props.src.includes("http")) {
        return React.cloneElement(chunk, {
          ...chunk.props,
          src: `http${chunk.props.src.split("http")[1]}`,
        });
      }
      return chunk;
    });
  }
}

module.exports = { flushChunks, ExtendedHead };
