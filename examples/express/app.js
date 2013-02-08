
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , user = require('./routes/user')
  , http = require('http')
  , path = require('path')
  , epi = require('../../lib/epi.js')
  , jade = require('jade')
  , fs = require('fs');

var thick = jade.compile( fs.readFileSync( __dirname + "/views/layout.jade" ))

var template = function( type, req ) {
  var t = thick( {title: "Test!", content: "<--SPLIT-->" });
  var out = "";
  if (type === 'header') {
    out = t.split("<!--START_BODY-->")[0];
  }
  else if (type === 'footer') {
    out = t.split("<!--END_BODY-->")[1];
  }
  return out;
};

var demoProxy = epi.createProxy( 80, 'www.bluegnosis.com', "/epi-demo", template );

var app = express();

app.configure(function(){
  app.set('port', process.env.PORT || 5000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use('/demo', demoProxy);
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});


app.configure('development', function(){
  app.use(express.errorHandler());
});

app.get('/', routes.index);
app.get('/users', user.list);

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
