var config = {
    "logger": {
        "includeNodeEnv": true,
        "console": { "enabled": true, "level": "error" },
        "file": { "enabled": false },
        "syslog": {
            "enabled": true,
            "level": "debug",
            "port": 3030,
            "server": "52.32.30.62",
            "type": "TCP_META"
        },
        "meta": {
            "enabled": true,
            "level": "debug",
            "port": 3031,
            "server": "52.32.30.62",
            "type": "TCP_META"
        }
    },
};
var log  = require( 'docker-logger' )( config.logger );
var mlog = require( 'winston' ).loggers.get( 'meta' );

log.info( 'This is a syslog message, with meta', { foo: "bar" } );

/*
try {
    var x = gg.ff;
} catch( err ) {
    log.error( 'catch:', err );
}
*/
mlog.info( 'This is a metalog message', { with: 'data', struct: { foo: 'bar' } } );
setTimeout( function() {
    process.exit(0);
}, 2000 );

