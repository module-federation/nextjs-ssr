// language=JS
const shareNextInternals = `if (process.browser) {
  if(!__webpack_share_scopes__.default) {
     __webpack_init_sharing__('default');
  }
    window.__webpack_share_scopes__ = __webpack_share_scopes__
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
  global.__webpack_share_scopes__ = __webpack_share_scopes__
  const reactRequire = require("react");
  const nextLink = require("next/link");
  const nextScript = require("next/script");
  const nextRouter = require("next/router");
  const nextHead = require("next/head");
  const nextDynamic = require("next/dynamic");
  if(!__webpack_share_scopes__.default.react) {
    Object.assign(__webpack_share_scopes__.default, {
      "react": {
        0: {
          loaded: true,
          eager:true,
          get:()=> ()=> reactRequire,
        },
     },
    })
  }
  Object.assign(__webpack_share_scopes__.default, {
    "next/link": {
      0: {
        loaded: true,
        get: () => () => nextLink,
      },
    },
    "next/script": {
     0: {
        loaded: true,
        get: () => () => nextScript,
     },
    },
    "next/router": {
      0: {
        loaded: true,
        get: () => ()=> nextRouter,
      },
    },
    "next/head": {
      0: {
        loaded: true,
        get: () => ()=> nextHead,
      },
    },
    "next/dynamic": {
      0: {
        loaded: true,
        get: () => ()=> nextDynamic,
      },
    },
  })
  
  try {
    global.REMOTE_CONFIG = Object.assign(global.REMOTE_CONFIG || {},process.env.REMOTE_CONFIG)
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
