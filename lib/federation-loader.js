const shareNextInternals = `if (process.browser) {
  Object.assign(__webpack_share_scopes__.default, {
    "next/link": {
      [next.version]: {
        loaded: true,
        get: () => Promise.resolve(() => require("next/link")),
      },
    },
    "next/script": {
      [next.version]: {
        loaded: true,
        get: () => Promise.resolve(() => require("next/script")),
      },
    },
    "next/router": {
      [next.version]: {
        loaded: true,
        get: () => Promise.resolve(() => require("next/router")),
      },
    },
    "next/head": {
      [next.version]: {
        loaded: true,
        get: () => Promise.resolve(() => require("next/head")),
      },
    },
    "next/dynamic": {
      [next.version]: {
        loaded: true,
        get: () => Promise.resolve(() => require("next/dynamic")),
      },
    },
  });
} else {
  if(process.env.NEXT_PHASE !== 'phase-production-build') {
     __webpack_init_sharing__('default');
  }
  
  if(!__webpack_share_scopes__.default) {
      __webpack_share_scopes__.default = {}
  }

  if(!__webpack_share_scopes__.default.react) {
    Object.assign(__webpack_share_scopes__.default, {
      "react": {
        0: {
          loaded: true,
          get: () => Promise.resolve(() => require("react")),
        },
     },
    })
  }
  Object.assign(__webpack_share_scopes__.default, {
    "next/link": {
      0: {
        loaded: true,
        get: () => Promise.resolve(() => require("next/link")),
      },
    },
    "next/script": {
     0: {
        loaded: true,
        get: () => Promise.resolve(() => require("next/script")),
      },
    },
    "next/router": {
      0: {
        loaded: true,
        get: () => Promise.resolve(() => require("next/router")),
      },
    },
    "next/head": {
      0: {
        loaded: true,
        get: () => Promise.resolve(() => require("next/head")),
      },
    },
    "next/dynamic": {
      0: {
        loaded: true,
        get: () => Promise.resolve(() => require("next/dynamic")),
      },
    },
  })
  
  try {
    global.REMOTE_CONFIG = process.env.REMOTE_CONFIG
  } catch(e) {
    // do nothing
  }
}
`;

module.exports = function (source) {
  const FederationPluginInstance = this._compiler.options.plugins.find(
    (plugin) => {
      if (
        plugin.constructor &&
        plugin.constructor.name === "ModuleFederationPlugin"
      ) {
        return true;
      }
    }
  );
  let manualInitializationString = [];
  if (FederationPluginInstance && FederationPluginInstance._options.remotes) {
    manualInitializationString.push("if (process.browser) {");
    Object.keys(FederationPluginInstance._options.remotes).forEach((remote) => {
      manualInitializationString.push(
        `window.${remote}?.init(__webpack_share_scopes__.default);`
      );
    });
    manualInitializationString.push("};");
  }
  manualInitializationString = manualInitializationString.join("\n");
  return shareNextInternals + manualInitializationString + source;
};
