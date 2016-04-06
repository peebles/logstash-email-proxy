module.exports = function( app ) {
    var q = [];
    var LIMIT = 1000;
    var TOP = 0;
    return {
	add: function( json ) {
	    q.push( json );
	    if ( q.length == LIMIT ) {
		q.shift();
		TOP += 1;
	    }
	},
	length: function() {
	    return TOP + q.length;
	},
	get: function( offset, regex, cb ) {
	    var ret = [];
	    if ( offset < TOP ) offset = TOP;
	    for( var i=(offset - TOP); i<q.length; i++ ) {
		var json = q[i];
		var fullLine;
		if ( json.appName )
		    fullLine = json.time + ' ' + json.host + ' - ' + json.appName + ': ' + json.message + "\n";
		else
		    fullLine = json.time + ' ' + json.host + ' - ' + json.message + "\n";
		if ( ! regex ) {
		    ret.push( fullLine );
		}
		else if ( regex == '*' ) {
		    ret.push( fullLine + "\n" + JSON.stringify( json, null, 2 ) + "\n" );
		}
		else {
		    try {
			var match = JSON.query( q[i], regex );
			if ( match.length ) {
			    ret.push( fullLine );
			}
		    } catch( err ) {
			return cb( err );
		    }
		}
	    }
	    cb( null, {
		buffer: ret.join(''),
		bytes: TOP + q.length + 1,
	    });
	},
    };
};
