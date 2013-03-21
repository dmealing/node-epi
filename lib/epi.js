/**
 * EPI - Enterprise Proxy Integration
 * @author Doug Mealing <doug@bluegnosis.com>
 */
var http = require('http'),
    httpProxy = require('http-proxy'),
    agent,
    lastDump = '',
    TIMEOUT_INC = 1000,
    TIMEOUT_MAX = 120 * 1000,
    MAX_RETRY = 5;

// Setup a new custom Agent
agent = new http.Agent;
// Set the max sockets much higher (100)
agent.maxSockets=100;

// TODO:  Add support for an Agent per session

// TODO:  Buffer input to disk on uploads (especially if there are long delays on connections)

/**
 * @function Create a Proxy middleware to handle proxy requests
 */
exports.createProxy = function createProxy(port, server, baseUrl, path, templateEngine, before ) {

    var handler = function (req, res, next) {

        var options = {
            server: server,
            port: port,
            baseUrl: baseUrl,
            path: path,
            templateEngine: templateEngine,
            beforeCallback: before,
            connectTimeout: TIMEOUT_INC,
            retries: 0,
        }

        proxyRequest( options, req, res, next );
    }

    return handler;
};

function proxyRequest( options, req, res, next ) {

    var newPath = req.url;
    if (options.baseUrl) {
        newPath = options.baseUrl + req.url;
    }

    if ( options.retries > 0 ) {
        console.log("PROXY:  host=" + req.headers.host + ", url=" + req.url);
    }

    var headers = {};
    for ( var key in req.headers ) {
        headers[key.toLowerCase()] = req.headers[key];
    }

    headers['host'] = options.server + (options.port ? ":" + options.port : "");
    headers['accept-encoding'] = '';

    var requestOptions = {
        method: req.method,
        host: options.server,
        port: options.port,
        path: newPath,
        headers: headers,
        agent: agent
    };

    // TODO: Make sure this works for retries
    if ( options.beforeCallback ) {
        options.beforeCallback( req, res, headers, requestOptions );
    }

    // Perform the get request
    var request = http.request( requestOptions );
    request.isConnected = false;
    // request.end();

    // Handle the response when it arrives
    request.on('response', function(resp) {

        if ( options.retries > 0 ) {
            console.log( "RESPONSE: " + JSON.stringify( headers ));
        }

        // Copy the headers
        var resHeaders = {};
        for ( var key in resp.headers ) {
            resHeaders[key.toLowerCase()] = resp.headers[key];
        }

        if ( options.retries > 0 ) {
            console.log("> code=" + resp.statusCode + ", content-type=" + resHeaders['content-type'] );
        }

        // If it's text/html then handle it differently
        if ( resp.statusCode === 200 && resHeaders['content-type'].toLowerCase().split(';')[0] === 'text/html' ) {

            var body = '';

            resp.on('data', function(chunk){
                body += chunk;
            });

            resp.on('end', function() {

                //body = body.replace( new RegExp('href="~?/'+options.baseUrl,'g'), 'href="'+options.path+'/' );
                //body = body.replace( new RegExp('src="~?/'+options.baseUrl,'g'), 'src="'+options.path+'/' );

                if ( options.templateEngine ) {
                    body = options.templateEngine(req,'header')
                        + body
                        + options.templateEngine(req,'footer');
                }

                // Write the data to the response
                resHeaders['content-type'] = 'text/html';
                // delete this as it's not accurate and it forces chunked encoding
                delete resHeaders['content-length']; // = body.length;
                res.writeHead( 200, resHeaders );
                res.write( body );
                res.end();
            });
        }

        // If it's not text/html, then send everything
        else {
            // delete this to force chunked encoding on text..?
//            if ( resHeaders['content-type'] && resHeaders['content-type'].indexOf('text')==0) {
//                delete resHeaders['content-length'];
//            }
            res.writeHead( resp.statusCode, resHeaders );

            resp.on('data', function(chunk){
                res.write( chunk );
            });

            resp.on('end', function() {
                res.end();
            });
        }

    }).on("error", function(e){

            console.log("Got error on [http://"+options.server+":"+options.port+req.url+ "] -- " + e.message);

            // If we timed out, let's increase the timeout increment
            if ( request.timedOut ) {
                options.connectTimeout += TIMEOUT_INC;
            }

            // If we haven't exceed the max retries, let's try to proxy it again
            if ( options.retries < MAX_RETRY && !request.isConnected ) {
                options.retries++;
                console.log( "RETRY #"+options.retries+" on [http://"+options.server+":"+options.port+req.url+ "]");
                proxyRequest( options, req, res, next );
            }

            // If we are done retrying, then send a failure
            else {
                res.writeHead( 504 );
                res.end();
            }
        });

    // Set the timeout to be false (in case requests are pooled)
    request.timedOut = false;

    // Handle shorter timeouts
    request.on('socket', function(socket){

        request.socket = socket;

        socket.setTimeout( options.connectTimeout );

        socket.on('connect', function() {

            request.isConnected = true;

            // Set the timeout to 2 minutes
            socket.setTimeout( 120*1000 );

            // If there is data to write, then write it
            if ( options.outBuffer ) {
                request.write( options.outBuffer );
                delete options.outBuffer;
            }

            // End the request if that event was already called
            if ( options.needToEndRequest ) {
                request.end();
            }

            // Resume retrieving events
            req.resume();
        });

        socket.on('timeout', function() {

            if ( !request.isConnected ) {

                // Only abort if still trying to connect
                request.abort();
                request.timedOut = true;

                // Send a retry?
                console.log( "WARN: Socket connection timeout on  [http://"+options.server+":"+options.port+req.url+ "]");
            }
        });
    });

    // Forward any data from the original request
    req.on('data', function(chunk){

        // TODO:  Handle when the outBuffer gets too large
        if ( !request.isConnected ) {
            if ( !options.outBuffer ) options.outBuffer = chunk;
            else options.outBuffer += chunk;
        }
        else {
            if ( options.outBuffer ) {
                request.write( options.outBuffer );
                delete options.outBuffer;
            }
            //console.log( "WROTE: " + chunk );
            request.write( chunk );
        }
    });

    // Close it up
    req.on('end', function() {
        if ( !request.isConnected ) {
            options.needToEndRequest = true;
        }
        else {
            // Start reading data from the proxy
            request.end();
        }
    });

    req.pause();
};

//function dumpAgent() {
//
//    var dump = '',
//        sockets,
//        requests;
//
//    for( var m in agent.sockets ) {
//
//        sockets = (agent.sockets[m]?agent.sockets[m].length:0),
//        requests = (agent.requests[m]?agent.requests[m].length:0);
//
//        dump += "AGENT ["+m+"]"
//            + " sockets:" + sockets
//            + ", queue:" + requests
//            + "\n";
//
//        agent.sockets[m].forEach( function( s ) {
//           dump += "Socket ["+ s._httpMessage.path+"]:"
//               +" bytesRead="+ s.bytesRead
//               +", _connecting="+ s._connecting
//               +", _headerSent="+ s._httpMessage._headerSent
//               +"\n";
//        });
//    }
//
//    if ( dump === '') dump = "EPI - No sockets found";
//
//    if ( dump != lastDump ) {
//        console.log( dump );
//        lastDump = dump;
//    }
//}
//
//setInterval( dumpAgent, 100 );


//exports.createProxy = function createProxy(port, server, baseUrl, path, templateEngine) {
//
//    //templateEngine = undefined;
//
//    /**
//     * Unwind.
//     */
//    function previous(code, headers, res, context, body, encoding) {
//        res.writeHead = context.writeHead;
//        res.writeHead(code, headers);
//        if (body) {
//            res.write = context.write;
//            res.end = context.end;
//            res.end(body, encoding);
//        }
//    };
//
//    var handler = function (req, res, next) {
//
//        var context = {
//            originalHost: req.headers.host,
//            originalUrl: req.url,
//            writeHead: res.writeHead,
//            write: res.write,
//            end: res.end
//        };
//
//        req.headers.host = server + (port ? ":" + port : "");
//        if (baseUrl) {
//            req.url = baseUrl + req.url;
//        }
//
//        console.log("host=" + req.headers.host + ", url=" + req.url);
//
//        req.headers['x-db-user'] = 'demodb';
//        req.headers['x-user'] = 'demo';
//        req.headers['x-groups'] = 'acme';
//        req.headers['x-roles'] = 'manager,user';
//        req.headers['x-display-name'] = 'Demo User';
//
//        req.headers['Accept-Encoding'] = '';
//
//        // proxy
//        res.writeHead = function(code, headers) {
//
//            var type = headers['content-type'] || '';
//
//            req.url = context.originalUrl;
//            if (code === 200 && type.toLowerCase().split(';')[0] === 'text/html' ) {
//                var body = '';
//                res.write = function(chunk, encoding) { body += chunk; }
//                res.end = function(data, encoding) {
//                    if (data) body += data;
//                    //body = context.callback + '(' + body + ')';
//                    body = body.replace( new RegExp('href="~?/'+baseUrl,'g'), 'href="'+path+'/' );
//                    body = body.replace( new RegExp('src="~?/'+baseUrl,'g'), 'src="'+path+'/' );
//                    if ( templateEngine ) {
//                        body = templateEngine(req,'header') + body + templateEngine(req,'footer');
//                    }
//                    headers['content-type'] = 'text/html';
//                    headers['content-length'] = Buffer.byteLength(body, encoding || "utf8");
//                    previous(code, headers, res, context, body, encoding);
//                };
//            } else {
//                previous(code, headers, res, context);
//            }
//        };
//
//        next();
//    }
//
//    var proxy = httpProxy.createServer(handler, port, server);
//
//    proxy.on('start', function( req, res, target ) {
//        console.log( "START: " + req.path );
//    });
//
//    proxy.on('proxyError', function(err, req, res) {
//        console.log( "PROXY ERROR: " + err );
//    });
//
//    return proxy;
//};
//
