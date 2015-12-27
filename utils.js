/*
  log: a logger (ie: log.debug(), log.info(), log.error(), log.warn())

  proxies: array of specifications of what to listen to and where to forward it to
	{ "from": 3030, "to": { "port": 5000, "host": "localhost" }, "protocol": "tcp", "ignore": false },
	{ "from": 3030, "to": { "port": 5000, "host": "localhost" }, "protocol": "udp", "ignore": false },
	{ "from": 3031, "to": { "port": 5001, "host": "localhost" }, "protocol": "tcp", "ignore": false },
	{ "from": 3031, "to": { "port": 5001, "host": "localhost" }, "protocol": "udp", "ignore": false },

  messageQueue: an aync.queue to push parsed messages to, if ignore is false
*/
var async = require( 'async' );

function setupProxyServers( log, proxies, messageQueue, cb ) {
    var syslogParser = require('glossy').Parse;

    function parse( msg ) {
	if ( msg.type ) return msg;
	try {
	    var json = JSON.parse( msg.originalMessage );
	    json.time = new Date().toString();
	    json.severity = json.level;
	    json.appName = json.program;
	    json.message = '[' + json.level + '] ' + json.message +
		(( json.meta && typeof json.meta == 'object' ) ? ' ' + JSON.stringify(json.meta) : '' );
	    return json;
	} catch( err ) {
	    return msg;
	}
    }

    proxies.forEach( function( proxy ) {
	var from = proxy.from + '/' + proxy.to.host + ':' + proxy.to.port + '/' + proxy.protocol;
	if ( proxy.protocol == 'udp' ) {
	    var dgram  = require("dgram");
	    var server = dgram.createSocket("udp4");

	    server.on( 'message', function( raw ) {
		var client = client = dgram.createSocket('udp4');
		client.send( raw, 0, raw.length, proxy.to.port, proxy.to.host, function( err ) {
		    if ( err ) log.error( from, err );
		    client.close();
		});
		if ( ! proxy.ignore ) {
		    syslogParser.parse( raw.toString( 'utf8', 0 ), function( parsed ) {
			messageQueue.push( parse( parsed ), function() {} );
		    });
		}
	    });

	    server.on( 'error', function( err ) {
		log.error( from, err );
	    });

	    server.on( 'listening', function() {
		var address = server.address();
		log.info( from, 'listening at', address.address + ':' + address.port );
	    });
	    
	    server.bind( proxy.from );
	}
	else if ( proxy.protocol == 'tcp' ) {
	    var net = require("net");

	    var server = net.createServer( function( c ) {
		c.on( 'error', function( err ) {
		    log.error( from, err );
		});
		c.on( 'data', function( raw ) {
		    try {
			var client = new net.Socket();
			client.connect( proxy.to.port, proxy.to.host, function( err ) {
			    if ( err ) log.error( from, err );
			    else client.write( raw, function() {
				client.end();
			    });
			});
		    } catch( err ) {
			log.error( err );
		    }
		    if ( ! proxy.ignore ) {
			syslogParser.parse( raw.toString( 'utf8', 0 ), function( parsed ) {
			    messageQueue.push( parse( parsed ), function() {} );
			});
		    }
		});
	    });
	    
	    server.on( 'error', function( err ) {
                log.warn( from, 'server encountered ' + err.code + ', restarting in one second...' );
                setTimeout( function() {
                    server.close();
                    server.listen( proxy.from );
                }, 1000 );
            });

            server.listen( proxy.from, function() {
		log.info( from, 'listening on', proxy.from );
            });
	}
    });

    cb();
}

/*
  Setup the database.  The callback returns the database handle.  Uses knex.
*/
function setupDatabase( log, config, cb ) {
    var fs = require( 'fs' );
    var dbfile = config.connection.filename;
    if ( dbfile.match( /^ENV:/ ) ) {
	var envvar = dbfile.split( ':' )[1];
	var def    = dbfile.split( ':' )[2];
	dbfile = ( process.env[ envvar ] || def );
	config.connection.filename = dbfile;
    }
    if ( ! fs.existsSync( dbfile ) ) {
	var path = require( 'path' );
	var mkdirp = require( 'mkdirp' );
	mkdirp.sync( path.dirname( dbfile ) );
	var schema = [
	    "create table if not exists events (id integer primary key,  name varchar(128),  regex  varchar(128) not NULL);",
	    "create table if not exists users (id integer primary key,  email varchar(48) not NULL,  freq integer default 10,  sentto integer default 0,  event_id   integer,  constraint fk_users1 foreign key(event_id) references events(id) on delete cascade on update cascade);",
	    "create table if not exists buffers (  id  integer primary key,  user_id    integer,  event_id   integer,  buffer     text,  count      integer default 0,  created    integer,  buffered   integer,  constraint fk_buffers1 foreign key(user_id) references users(id) on delete cascade on update cascade,  constraint fk_buffers2 foreign key(event_id) references events(id) on delete cascade on update cascade);"
	];
    }
    config.pool = {
	afterCreate: function( conn, cb ) {
	    log.debug( 'db connection created' );
	    conn.on( 'error', function( err ) {
		log.error( 'Uncaught knex error:', err );
	    });
	}
    };
    /*
    log.debug( JSON.stringify( config, null, 2 ) );
    var db = require( 'knex' )( config );
    */
    var db = require('knex')({
	client: 'sqlite3',
	connection: {
	    filename: config.connection.filename
	}
    });
    if ( schema && schema.length ) {
	log.warn( 'creating new database into', config.connection.filename );
	async.eachSeries( schema, function( sql, cb ) {
	    db.raw( sql ).then( function() {
		cb();
	    }).catch( cb );
	}, function( err ) {
	    if ( err ) return cb( err );
	    cb( null, db );
	});
    }
    else {
	cb( null, db );
    }
}

module.exports = {
    setupDatabase: setupDatabase,
    setupProxyServers: setupProxyServers,
};
