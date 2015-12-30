var _ = require( 'lodash' );
var winston = require( 'winston' );

var app = {};
app.config = require( 'env-friendly-config' )( __dirname + '/../config.json' );

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

var email = require( '../email' )( app, app.config.smtp );

email.send({
    to: 'aqpeeb@gmail.com',
    from: app.config.smtp.from,
    subject: 'Test Email',
    text: 'This is a test',
    html: '<pre>This is a test</pre>'
}, function( err ) {
    if ( err ) console.log( err );
    process.exit(0);
});
