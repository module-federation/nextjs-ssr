/**
 * loadScript(baseURI, fileName, cb)
 * loadScript(scriptUrl, cb)
 */
//language=JS
export default `
    function loadScript() {
        console.log('in load script funcrion')
        var url;
        var cb = arguments[arguments.length - 1];
        if (typeof cb !== "function") {
            throw new Error("last argument should be a function");
        }
        if (arguments.length === 2) {
            url = arguments[0];
        } else if (arguments.length === 3) {
            url = new URL(arguments[1], arguments[0]).toString();
        } else {
            throw new Error("invalid number of arguments");
        }
        console.log('attemting to load url', url)
        //TODO https support
        let request = (url.startsWith('https') ? require('https') : require('http')).get(url, function(resp) {
            if (resp.statusCode === 200) {
                let rawData = '';
                resp.setEncoding('utf8');
                resp.on('data', chunk => { rawData += chunk; });
                resp.on('end', () => {
                    cb(null, rawData);
                });
            } else {
                cb(resp);
            }
        });
        request.on('error', error => {
          console.log('CHUNK LOAD FAILED', error);
          return cb(error)
        });
    }
`;
