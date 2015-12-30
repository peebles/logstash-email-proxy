var express = require('express');
var basicAuth = require( 'basic-auth' );
var router = express.Router();
var fs = require( 'fs' );
var async = require( 'async' );

var app;

var auth = function() {
    return function(req, res, next) {
	var user = basicAuth(req);
	var username = app.config.auth.username;
	var password = app.config.auth.password;
	if (!user || user.name !== username || user.pass !== password) {
	    res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
	    return res.status(401).end();
	}

	next();
    };
};

function tail( filename, offset, limit, regex, callback ) {
    var data = {
	bytes: 0,
	buffer: ''
    }

    var regexp = null;
    if ( regex ) {
	try { regexp = new RegExp( regex ); }
	catch( e ) { return callback( e ); }
    }

    fs.open( filename, 'r', function( err, fd ) {
	if ( err ) {
	    app.log.error( 'fs.open', err.message );
	    return callback( err, data );
	}
	var b = new Buffer( 4096 );
	var lines = [];
	var linecount = 0;
	var bytecount = 0;
	var eof = false;
	var partial = '';
	async.doWhilst( 
	    function( cb ) {
		fs.read( fd, b, 0, 4096, offset, function( err, bytes, buf ) {
		    if ( err ) {
			app.log.error( 'fs.read', err.message );
			return cb( err );
		    }
		    offset += bytes;
		    if ( bytes == 0 ) { eof = true; return cb() };
		    var str = partial + buf.toString('utf8',0,bytes);
		    var localLines = str.split( /\n/ );
		    if ( ! localLines[ localLines.length - 1 ].match( /\n$/ ) ) {
			partial = localLines.pop();
		    }
		    localLines.forEach( function( l ) {
			var good = ( regexp ? l.match( regexp ) : true );
			if ( (linecount < limit) && good ) {
			    bytecount += l.length + 1;
			    lines.push( l + '\n' );
			    linecount += 1;
			}
			else if ( ! good ) {
			    bytecount += l.length + 1;
			}
		    });
		    cb();
		});
	    },
	    function( cb ) {
		return ( eof == false && linecount < limit );
	    },
	    function( err ) {
		fs.close( fd );
		if ( err ) callback( err );
		else {
		    //console.log( 'returning:', lines.join('') );
		    callback( null, { bytes: bytecount, 
				      buffer: lines.join('') } );
		}
	    }
	);
    });
}

/* GET home page. */
router.get('/', auth(), function(req, res) {
    res.render('index', { title: 'Logstash Proxy' });
});

router.get('/tail', function( req, res, next ) {
    var offset = req.query[ 'offset' ] || 0;
    var limit  = req.query[ 'limit' ] || 1000;
    var regex  = req.query[ 'regex' ];

    offset = Number( offset );
    limit  = Number( limit );

    var size = app.get( 'lineQueue' ).length();

    if ( size <= offset ) {
	res.setHeader( 'Content-Type', 'text/plain' );
	res.setHeader( 'X-Seek-Offset', size.toString() );
	//console.log( 'size <= offset', size, offset );
	res.write('');
	return res.end();
    }

    //console.log( 'doing a tail:', offset, limit, regex );
    app.get( 'lineQueue' ).get( offset, regex, function( err, data ) {
	if ( err ) return next( err );
	res.setHeader( 'Content-Type', 'text/plain' );
	var newOffset = offset + data.bytes;
	res.setHeader( 'X-Seek-Offset', newOffset.toString() );
	res.write( data.buffer );
	res.end();
    });
});

router.get( '/events', function( req, res, next ) {
    var db = app.get( 'db' );
    db( 'events' ).orderBy( 'id', 'asc' ).then( function( events ) {
	async.map( events, function( event, cb ) {
	    db( 'users' ).where({ event_id: event.id }).then( function( users ) {
		event.users = users;
		cb();
	    }).catch( cb );
	}, function( err ) {
	    if ( err ) next( err );
	    else res.jsonp( events );
	});
    }).catch( next );
});

router.get( '/event', function( req, res, next ) {
    var db = app.get( 'db' );
    var id = req.query[ 'id' ];
    db( 'events' ).where({ id: id }).then( function( events ) {
	async.map( events, function( event, cb ) {
	    db( 'users' ).where({ event_id: event.id }).then( function( users ) {
		event.users = users;
		cb();
	    }).catch( cb );
	}, function( err ) {
	    if ( err ) next( err );
	    else res.jsonp( events[0] );
	});
    }).catch( next );
});

router.get( '/add_event', function( req, res, next ) {
    var db = app.get( 'db' );
    var evt = {
	name: req.query[ 'name' ],
	regex: req.query[ 'regex' ]
    };
    db( 'events' ).insert( evt ).then( function( ids ) {
	res.jsonp({ id: ids[0], name: evt.name, regex: evt.regex });
    }).catch( next );
});

router.get( '/remove_event', function( req, res, next ) {
    var db = app.get( 'db' );
    db( 'events' ).where({ id: req.query[ 'event_id' ] }).del().then( function() {
	res.jsonp({});
    }).catch( next );
});

router.get( '/edit_event', function( req, res, next ) {
    var db = app.get( 'db' );
    var id    = req.query[ 'event_id' ];
    var name  = req.query[ 'name' ];
    var regex = req.query[ 'regex' ];
    db( 'events' ).where({ id: id }).update({ name: name, regex: regex }).then( function() {
	res.jsonp({});
    }).catch( next );
});

router.get( '/add_user', function( req, res, next ) {
    var db = app.get( 'db' );
    var user = {
	email: req.query[ 'email' ],
	freq: Number( req.query[ 'freq' ] ),
	event_id: req.query[ 'event_id' ],
    };
    db( 'users' ).insert( user ).then( function( ids ) {
	user.id = ids[0];
	res.jsonp( user );
    }).catch( next );
});

router.get( '/remove_user', function( req, res, next ) {
    var db = app.get( 'db' );
    db( 'users' ).where({ email: req.query[ 'email' ], event_id: req.query[ 'event_id' ] }).del().then( function() {
	res.jsonp({});
    }).catch( next );
});    

router.get('/admin', auth(), function(req, res, next) {
    var db = app.get( 'db' );
    db( 'events' ).orderBy( 'id', 'asc' ).then( function( events ) {
	async.map( events, function( event, cb ) {
	    db( 'users' ).where({ event_id: event.id }).then( function( users ) {
		event.users = users;
		cb();
	    }).catch( cb );
	}, function( err ) {
	    if ( err ) next( err );
	    else res.render( 'admin', { events: events } );
	});
    }).catch( next );
});

module.exports = function( _app ) {
    app = _app;
    return router;
};
