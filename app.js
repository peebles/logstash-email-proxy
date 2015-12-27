var express = require('express');
var path = require('path');
var favicon = require('static-favicon');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var winston = require( "winston" );
var async = require( 'async' );
var _ = require( 'lodash' );
require( 'json-lucene-like-query' );

process.on( 'uncaughtException', function( err ) {
    if ( err.stack && typeof err.stack == 'object' ) {
	console.log( err.stack.join('') );
    }
    else {
	console.log( require( 'util' ).inspect( err ), err.stack );
    }
    process.exit(1);
});

var app = express();
app.config = require( './config.json' );

app.config.resolve = function( path ) {
    var val = _.get( this, path );
    if ( ! val ) return val;
    if ( ! val.match( /^ENV:/ ) ) return val;
    var envvar = val.split(':')[1];
    var defvar = val.split(':')[2];
    var v = ( process.env[ envvar ] || defvar );
    if ( v.match( /^\d+$/ ) ) v = Number( v );
    else if ( v == 'true' ) v = true;
    else if ( v == 'false' ) v = false;
    else if ( v == 'null' ) v = null;
    _.set( this, path, v );
    return v;
}

// proxy port mappings can be passed in as arguments of the form:
//
//   from-port/proto,to-server:to-port
//
// ex.:
//
//   554/udp,54.64.120.134:554
//
for( var i=2; i<process.argv.length; i++ ) {
    var arg = process.argv[i];
    var m = arg.match(/^(\d+)\/([^,]{3}),([^:]+):(\d+)/);
    if ( m ) {
	app.config.proxy.push({
	    from: Number( m[1] ), protocol: m[2],
	    to: { host: m[3], port: Number( m[4] ) },
	    ignore: false
	});
    }
}

app.log = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({ 
            colorize: true, 
            level: app.config.logger.level
        }),
        new (winston.transports.File)({ 
            json: false, 
            level: app.config.logger.level,
            filename: app.config.logger.filename
        }),
    ],
    exceptionHandlers: [
        new (winston.transports.Console)({ 
            colorize: true, 
            level: app.config.logger.level,
        }),
        new (winston.transports.File)({ 
            json: false, 
            level: app.config.logger.level,
            filename: app.config.logger.filename
        }),
    ],
});

if ( process.env.PROXY_USERNAME ) app.config.auth.username = process.env.PROXY_USERNAME;
if ( process.env.PROXY_PASSWORD ) app.config.auth.username = process.env.PROXY_PASSWORD;

var routes = require('./routes/index')( app );
var utils = require( './utils' );
var DBUtils;

// Incoming messages
var mq = async.queue( function( json, cb ) {
    var fullLine;
    if ( json.appName )
        fullLine = json.time + ' ' + json.host + ' - ' + json.appName + ': ' + json.message;
    else
        fullLine = json.time + ' ' + json.host + ' - ' + json.message;
    app.log.debug( fullLine );
    app.get( 'lineQueue' ).add( json );
    DBUtils.handle_line( fullLine, json, cb );
}, 1 );

async.series([
    function( cb ) {
	utils.setupDatabase( app.log, app.config.db, function( err, db ) {
	    if ( err ) return cb( err );
	    app.set( 'db', db );
	    cb();
	});
    },
    function( cb ) {
	utils.setupProxyServers( app.log, app.config.proxy, mq, function( err ) {
	    if ( err ) return cb( err );
	    cb();
	});
    },
], function( err ) {
    if ( err ) {
	app.log.error( err );
	process.exit(1);
    }
    
    DBUtils = require( './db' )( app );
    app.set( 'lineQueue', require( './line-queue' )( app ) );

    // view engine setup
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'ejs');

    app.use(favicon());
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded());
    app.use(cookieParser());
    app.use(express.static(path.join(__dirname, 'public')));

    app.use('/', routes);

    /// catch 404 and forward to error handler
    app.use(function(req, res, next) {
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
    });

    app.use(function(err, req, res, next) {
	res.status(err.status || 500);
	res.render('error', {
            message: err.message,
            error: err
	});
    });

    app.set('port', process.env.PORT || app.config.webserver_port || 3000);

    app.listen(app.get('port'), function() {
	app.log.info( 'webserver listening on port ' + app.get( 'port' ) );
    });
});
