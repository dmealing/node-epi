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

var testUser = {
    username: 'jdoe',
    firstname: 'John',
    lastname: 'Doe',
    email: 'jdoe@demo.bluegnosis.com',
    groups: 'Group1,Group2',
    roles: 'Role1,Role2'
}

var templates = [];

// Load the two different templates
for( var i = 1; i <=2; i++ ) {
    templates[i]={
        thick: jade.compile(fs.readFileSync(__dirname + "/views/templates/"+i+"/thick.jade"),
            {filename: __dirname + "/views/templates/"+i+"/thick.jade"})
    };
}

/**
 * @function Perform the template wrapping
 */
var template = function (req, type, block) {

    if ( !req.clientInfo ) return [];

    var id = req.clientInfo.templateId;

    var jadePage = type === "thin" ? templates[id].thin : templates[id].thick;

    var t = jadePage({
        title:"Test!",
        user:req.user,
        clientInfo:req.clientInfo,
        menu: menu,
        content:"<--SPLIT-->"
    });

    var out = "";
    if (block === 'header') {
        out = t.split("<!--START_BODY-->")[0];
    }
    else if (block === 'footer') {
        out = t.split("<!--END_BODY-->")[1];
    }
    return out;
};

/**
 * @function
 * @param proxyOptions
 * @param requestOptions
 * @param req
 * @param res
 * @param next
 */
var beforeProxy = function( proxyOptions, requestOptions, req, res, next ) {

    // NOTE:  This should come from some authentication mechanism (ex. Passport)
    req.user = testUser;

    // If a user exists, then set the user information headers
    if ( req.user ) {
        requestOptions.headers['x-user'] = req.user.username;
        requestOptions.headers['x-groups'] = req.user.groups;
        requestOptions.headers['x-roles'] = req.user.roles;
        requestOptions.headers['x-display-name'] = req.user.firstname + ' ' + req.user.lastname;
        requestOptions.headers['x-email'] = req.user.email;
    };

    // Manipulate the cookies
    if ( requestOptions.headers['cookie'] ) {
        var cookies = requestOptions.headers['cookie'].split(';');
        cookies.forEach( function( c, i ) {
            var x = c.split('=');
            if ( x[0] === 'connect.sid' ) {
                // TODO:  Strip out the connect session cookie
                cookies.splice(i,1);
            }
        });

        // Reset the cookies
        if ( cookies.length === 0 ) delete requestOptions.headers['cookie'];
        else requestOptions.headers['cookie'] = cookies.join(';');
    }

    // Continue handling the proxy
    next();
};

var demoProxy = epi.createProxy(80, 'www.bluegnosis.com', "/epi-demo", template);

/** Setup any page scope variables for Express */
function setupPageVars(req, res, next) {

    res.locals.user = testUser;

    next();
};

var app = express();

app.configure(function () {
    app.set('port', process.env.PORT || 5000);
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.favicon());
    app.use(express.logger('dev'));
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser());
    app.use(express.session({ secret:'N0de EP1 Demo' }));

    app.use('/demo', demoProxy);

    app.use(setupPageVars);
    app.use(app.router);
    app.use(express.static(path.join(__dirname, 'public')));
});


app.configure('development', function () {
    app.use(express.errorHandler());
});

app.get('/', routes.index);
app.get('/users', user.list);

http.createServer(app).listen(app.get('port'), function () {
    console.log("Express server listening on port " + app.get('port'));
});
