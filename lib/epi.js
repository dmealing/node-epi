/**
 * EPI - Enterprise Proxy Integration
 * @author Doug Mealing <doug@bluegnosis.com>
 */
var http = require('http'),
    httpProxy = require('http-proxy');

exports.createProxy = function createProxy(port, server, baseUrl, path, templateEngine, before ) {

    var handler = function (req, res, next) {

        var newPath = req.url;
        if (baseUrl) {
            newPath = baseUrl + req.url;
        }

        // console.log("host=" + req.headers.host + ", url=" + req.url);

        var headers = {};
        for ( var key in req.headers ) {
            headers[key.toLowerCase()] = req.headers[key];
        }

        headers['host'] = server + (port ? ":" + port : "");
        headers['accept-encoding'] = '';

        var options = {
            method: req.method,
            host: server,
            port: port,
            path: newPath,
            headers: headers
        };

        // console.log( "REQUEST: " + JSON.stringify( headers ));
        if ( before ) {
            before( req, res, headers, options );
        }

        // Perform the get request
        var request = http.request(options, function(resp){

            // Copy the headers
            var resHeaders = {};
            for ( var key in resp.headers ) {
                resHeaders[key] = resp.headers[key];
            }

            // If it's text/html then handle it differently
            if ( resp.statusCode === 200 && resp.headers['content-type'].toLowerCase().split(';')[0] === 'text/html' ) {

                var body = '';

                resp.on('data', function(chunk){
                    body += chunk;
                });

                resp.on('end', function() {

                    body = body.replace( new RegExp('href="~?/'+baseUrl,'g'), 'href="'+path+'/' );
                    body = body.replace( new RegExp('src="~?/'+baseUrl,'g'), 'src="'+path+'/' );

                    if ( templateEngine ) {
                        body = templateEngine(req,'header') + body + templateEngine(req,'footer');
                    }

                    // Write the data to the response
                    resHeaders['content-type'] = 'text/html';
                    resHeaders['content-length'] = body.length;
                    res.writeHead( 200, resHeaders );
                    res.write( body );
                    res.end();
                });
            }

            // If it's not text/html, then send everything
            else {
                res.writeHead( resp.statusCode, resHeaders );

                resp.on('data', function(chunk){
                    res.write( chunk );
                });

                resp.on('end', function() {
                    res.end();
                });
            }

        }).on("error", function(e){
                console.log("Got error: " + e.message);
            });

        // Forward any data from the original request
        req.on('data', function(chunk){
            //console.log( "WROTE: " + chunk );
            request.write( chunk );
        });

        // Close it up
        req.on('end', function(){
            request.end();
        });

        // That's it, we are done
    };

    return handler;
};

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
