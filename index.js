const withFederatedSidecar = require("./lib/with-federated-sidecar");
const { NodeSoftwareStreamRuntime, StreamingFederation } = require("./streaming/src");
module.exports = {
  withFederatedSidecar,
  StreamingFederation,
  NodeSoftwareStreamRuntime
};
