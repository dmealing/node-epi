/**
 * EPI - Enterprise Proxy Integration
 * @author Doug Mealing <doug@bluegnosis.com>
 */
var httpProxy = require('http-proxy');

exports.createProxy = function createProxy(port, server, baseUrl, path, templateEngine) {

    //templateEngine = undefined;

    /**
     * Unwind.
     */
    function previous(code, headers, res, context, body, encoding) {
        res.writeHead = context.writeHead;
        res.writeHead(code, headers);
        if (body) {
            res.write = context.write;
            res.end = context.end;
            res.end(body, encoding);
        }
    };

    var handler = function (req, res, next) {

        var context = {
            originalHost: req.headers.host,
            originalUrl: req.url,
            writeHead: res.writeHead,
            write: res.write,
            end: res.end
        };

        req.headers.host = server + (port ? ":" + port : "");
        if (baseUrl) {
            req.url = baseUrl + req.url;
        }

        console.log("host=" + req.headers.host + ", url=" + req.url);

        req.headers['x-db-user'] = 'demodb';
        req.headers['x-user'] = 'demo';
        req.headers['x-groups'] = 'acme';
        req.headers['x-roles'] = 'manager,user';
        req.headers['x-display-name'] = 'Demo User';

        req.headers['Accept-Encoding'] = '';

        // proxy
        res.writeHead = function(code, headers) {

            var type = headers['content-type'] || '';

            req.url = context.originalUrl;
            if (code === 200 && type.toLowerCase().split(';')[0] === 'text/html' ) {
                var body = '';
                res.write = function(chunk, encoding) { body += chunk; }
                res.end = function(data, encoding) {
                    if (data) body += data;
                    //body = context.callback + '(' + body + ')';
                    body = body.replace( new RegExp('href="~?/'+baseUrl,'g'), 'href="'+path+'/' );
                    body = body.replace( new RegExp('src="~?/'+baseUrl,'g'), 'src="'+path+'/' );
                    if ( templateEngine ) {
                        body = templateEngine('header') + body + templateEngine('footer');
                    }
                    headers['content-type'] = 'text/html';
                    headers['content-length'] = Buffer.byteLength(body, encoding || "utf8");
                    previous(code, headers, res, context, body, encoding);
                };
            } else {
                previous(code, headers, res, context);
            }
        };

        next();
    }

    return httpProxy.createServer(handler, port, server);
};

