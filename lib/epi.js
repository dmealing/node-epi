/** 
 * EPI - Enterprise Proxy Integration 
 * @author Doug Mealing <doug@bluegnosis.com>
 */
var httpProxy = require('http-proxy');

exports.createProxy = function createProxy( port, server, baseUrl, templateEngine ) {

  var handler = function (req, res, next) {

    req.headers.host = server+(port?":"+port:"");
    if ( baseUrl ) {
      req.url = baseUrl + req.url;
    }

    console.log( "host=" + req.headers.host + ", url=" + req.url );

    req.headers['x-user']='demo';

    // console.log('Handling new request, statusCode='+res.statusCode);

    var writeHead = res.writeHead,
      defaults = {};

    ['write', 'end'].forEach(function(name) {
      defaults[name] = res[name];
      res[name] = function() {
        // Make sure headers are setup if they haven't been called yet
        if (res.writeHead !== writeHead) {
          res.writeHead(res.statusCode);
        }
        res[name].apply(this, arguments);
      };
    });

    res.writeHead = function(code) {

      var args = arguments,
        write = defaults.write,
        end = defaults.end,
        headers, key, accept, type, encoding, gzip, ua,
        wroteHeader=false;

      ua = req.headers['user-agent'] || '';
      accept = req.headers['accept-encoding'] || '';
      type = res.getHeader('content-type') || '';
      encoding = res.getHeader('content-encoding');

      // console.log('Agent: '+ua);

      if (req.method === 'HEAD' || code !== 200 ||
        encoding || (~ua.indexOf('MSIE 6') && !~ua.indexOf('SV1'))) {

        console.log('Unsupported: ' + code );

        res.write = write;
        res.end = end;
        return finish();
      }

      res.setHeader('Content-Type', 'text/html');
      res.removeHeader('Content-Length');

      res.write = function(chunk, encoding) {
        if ( !wroteHeader ) {
          //write.call(res, '<html><head><title>WII!</title></head><body><h1>Header</h1><hr/>' );
          if ( templateEngine ) {
            write.call( res, templateEngine( 'header' ));
          }
          wroteHeader = true;
        }
        write.call(res, chunk);
      };

      res.end = function(chunk, encoding) {
        if (chunk) {
          res.write(chunk, encoding);
        }
        //write.call(res, '<hr/><h1>Footer</h1></body></html>' );
        if ( templateEngine ) {
          write.call( res, templateEngine( 'footer' ));
        }
        res.write = write;
        res.end = end;
        res.end();
      };

      finish();

      function finish() {
        res.writeHead = writeHead;
        //res.writeHead.apply(res, args);
      }
    };

    next();
  }

  return httpProxy.createServer( handler, port, server );
};
