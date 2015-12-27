var async = require( 'async' );
var moment = require( 'moment' );

module.exports = function( app ) {
    var db = app.get( 'db' );

    app.config.resolve( 'smtp.from' );
    app.config.resolve( 'smtp.auth.user' );
    app.config.resolve( 'smtp.auth.pass' );
    app.config.resolve( 'smtp.options.host' );
    app.config.resolve( 'smtp.options.port' );
    app.config.resolve( 'smtp.options.secure' );
    app.config.resolve( 'smtp.options.ignoreTLS' );
    app.config.resolve( 'smtp.options.requireTLS' );
    app.config.resolve( 'smtp.options.name' );
    app.config.resolve( 'smtp.options.localAddress' );
    app.config.resolve( 'smtp.options.connectionTimeout' );
    app.config.resolve( 'smtp.options.greetingTimeout' );
    app.config.resolve( 'smtp.options.socketTimeout' );
    app.config.resolve( 'smtp.options.debug' );
    app.config.resolve( 'smtp.options.lmtp' );
    app.config.resolve( 'smtp.options.authMethod' );

    var email = require( './email' )( app, app.config.smtp );
    
    async.forever(
	function( cb ) {
            setTimeout( function() {
		handle_notification( cb );
            }, 1000 * 60 * 1 );
	},
	function( err ) {
            log.error( 'handle_notification forever loop broken:', err );
	}
    );

    function handle_line( line, json, cb ) {
	if ( line.match( /^$/ ) ) return cb();
	db( 'events' ).then( function( events ) {
	    async.eachSeries( events, function( event, cb ) {
		handle_event( line, event, json, cb );
	    }, function( err ) {
		cb( err );
	    });
	}).catch( cb );
    }

    function handle_event( line, event, json, cb ) {
	//var regexp = new RegExp( event.regex );
	//if ( ! line.match( regexp ) ) return cb();
	try {
	    if ( ! JSON.query( json, event.regex ).length ) return cb();
	} catch( err ) {
	    app.log.error( 'query problem:', event.regex, '=>', err );
	    return cb();
	}
	db( 'users' ).where({ event_id: event.id }).then( function( users ) {
	    async.eachSeries( users, function( user, cb ) {
		handle_user( line, event, user, cb );
	    }, function( err ) {
		cb( err );
	    });
	}).catch( cb );
    }

    function handle_user( line, event, user, cb ) {
	db( 'buffers' ).where({ user_id: user.id, event_id: event.id }).then( function( buffers ) {
	    if ( buffers && buffers.length == 1 ) {
		var buffer = buffers[0];
		buffer.buffer += line + '\n';
		buffer.buffered = moment().unix();
		buffer.count += 1;
		db( 'buffers' ).where({id: buffer.id }).update({ buffer: buffer.buffer, buffered: buffer.buffered, count: buffer.count }).then( function( res ) {
		    cb();
		}).catch( cb );
	    }
	    else {
		var now = moment().unix();
		var buffer = {
		    user_id: user.id,
		    event_id: event.id,
		    buffer: line + '\n',
		    count: 1,
		    created: now,
		    buffered: now,
		};
		db( 'buffers' ).insert( buffer ).then( function() {
		    cb();
		}).catch( cb );
	    }
	}).catch( cb );
    }

    function handle_notification( cb ) {
	var now = moment().unix();
	db( 'buffers' ).then( function( buffers ) {
	    if ( buffers.length ) app.log.debug( '  there are', buffers.length, 'buffers' );
	    async.mapSeries( buffers, function( buffer, cb ) {
		var user, event;
		async.series([
		    function( cb ) {
			// get user
			app.log.debug( '    looking for user...' );
			db( 'users' ).where({ id: buffer.user_id }).then( function( result ) {
			    if ( result.length == 0 ) return cb( new Error( 'user not found' ) );
			    user = result[0];
			    app.log.debug( '      ', user.email );
			    cb();
			}).catch( cb );
		    },
		    function( cb ) {
			// get event
			app.log.debug( '    getting event...' );
			db( 'events' ).where({ id: buffer.event_id }).then( function( result ) {
			    if ( result.length == 0 ) return cb( new Error( 'event not found' ) );
			    event = result[0];
			    app.log.debug( '      ', event.name );
			    cb();
			}).catch( cb );
		    },
		    function( cb ) {
			// determine if email is to be sent.  if so, send it and delete the buffer,
			// else don't do anything.
			app.log.debug( '    calculating email...' );
			if ( ((now - user.sentto) / 60) >= user.freq ) {
			    app.log.debug( 'Sending email:', moment().format( 'lll' ), user.email, event.name, buffer.count );
			    db( 'users' ).where({ id: user.id }).update({ sentto: now }).then( function() {
				send_email( user, event, buffer, function( err ) {
				    if ( err ) return cb( err );
				    db( 'buffers' ).where({ id: buffer.id }).del().then( function( result ) {
					cb();
				    }).catch( cb );
				});
			    }).catch( cb );
			}
			else {
			    app.log.debug( '      not sending because', ((now - user.sentto) / 60), 'is < freq', user.freq );
			    cb();
			}
		    },
		], function( err ) {
		    if ( err ) app.log.error( err );
		    cb();
		});
	    }, function( err ) {
		if ( err ) app.log.error( err );
		cb();
	    });
	}).catch( cb );
    }

    function send_email( user, event, buffer, cb ) {
	var data = {
	    to: user.email,
	    from: app.config.smtp.from,
	    subject: 'Event: ' + event.name,
	    text: buffer.buffer,
	    html: '<pre>' + buffer.buffer + '</pre>',
	};
	email.send( data, cb );
    }

    return {
	handle_line: handle_line,
	handle_notification: handle_notification,
    };
};
