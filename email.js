var nodemailer = require('nodemailer');

module.exports = function( app, options ) {
    options.options.auth = options.auth;
    app.log.debug( 'emailer: options:', JSON.stringify( options.options, null, 2 ) );
    var transporter = nodemailer.createTransport( options.options );

    function send( data, cb ) {
	app.log.debug( 'email: sending email: from:', data.from, 'to:', data.to );
	transporter.sendMail( data, function( err, info ) {
	    if ( err ) {
		app.log.error( 'email: sent:', err );
		return cb( err );
	    }
	    if ( info ) app.log.debug( 'email: sent: info:', JSON.stringify( info, null, 2 ) );
	    cb();
	});
    }

    return {
	send: send
    };
};

