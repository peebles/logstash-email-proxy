var offset = -1;
var polling = null;
var regex = null;
var state = 'running';
var eid;
var mode = 'new';

var param = function (key, fallback) {
    var query = window.location.search.substring(1);
    var parameters = query.split('&');
    for (var i = 0; i < parameters.length; i++) {
        var pair = parameters[i].split('=');
        if (pair[0] == key) {
            return unescape(pair[1]);
        }
    }
    return fallback;
}

var append = function (text) {
    if (text) {
        var element = document.getElementById('tail');
        element.textContent += text;
        window.scrollTo(0, document.body.scrollHeight);
    }
}

function cleartext() {
    var element = document.getElementById('tail');
    element.textContent = '';
    window.scrollTo(0, document.body.scrollHeight);
}

var request = function( uri, callback ) {
    //console.log( 'request', uri );
    $.ajax({
	url: uri,
	success: function( res, status, xhr ) {
            var newOffset = xhr.getResponseHeader('X-Seek-Offset');
	    //console.log( 'response', newOffset );
            if (newOffset) offset = parseInt(newOffset);
	    callback( res );
	},
	error: function() {
	    console.log( 'ERROR' );
	}
    });
}

var tail = function () {
    var uri = '/tail?offset=' + offset;
    if (!offset) {
        var limit = parseInt(param('limit', 1000));
        uri += '&limit=' + limit;
    }
    if ( regex ) 
	uri += '&regex=' + encodeURIComponent( regex );
    request(uri, append);
}

var refresh = function () {
    tail();
    if (polling == null) {
        var interval = parseInt(param('interval', 3000));
        polling = window.setInterval(tail, interval);
    }
}

var sleep = function () {
    if (polling != null) {
        window.clearInterval(polling);
        polling = null;
    }
}

function toggle() {
    if ( state == 'running' ) {
	state = 'paused';
	sleep();
	$( '.glyphicon-pause' ).removeClass( 'glyphicon-pause' ).addClass( 'glyphicon-play' );
    }
    else {
	state = 'running';
	refresh();
	$( '.glyphicon-play' ).removeClass( 'glyphicon-play' ).addClass( 'glyphicon-pause' );
    }
}

function search() {
    regex = $('.search input').val();
    offset = 0;
    $('#tail').empty();
    refresh();
}

function save_event( _eid, _name, _regex, _users ) {
    $('tr.editing').remove();
    
    if ( _eid && _name && _regex ) {
	$('input[name="regex"]').val( _regex );
	$('input[name="ename"]').val( _name );

	var table = '';
	_users.forEach( function( u ) {
	    var english = 'every ' + moment.duration( u.freq * 60 * 1000 ).humanize();
	    english = english.replace( 'an hour', 'hour' );
	    var html = [
		'<tr class="editing">',
		'<td class="email">', u.email, '</td>',
		'<td>', english, '</td>',
		'<td><i class="delete glyphicon glyphicon-remove-circle"></i></td>',
		'</tr>'
	    ].join('');
	    table += html;
	});

	var el = $(table);
	$(el).insertBefore( '.dialog-table tr:first' );

	$(el).find('i.delete').bind( 'click', function() {
	    var self = this;
	    var email = $(self).parent().parent().find('.email').text();
	    $.getJSON( '/remove_user', { email: email, event_id: _eid } ).then( function( result ) {
		$(self).parent().parent().remove();
	    }, function( err ) {
		$('.error-message' ) = err.message;
		$('#error-dialog').modal( 'show' );
	    });
	});
	mode = 'edit';
	eid = _eid;
	$('.adduser-btn').removeAttr( 'disabled' );
    }
    else {
	$('input[name="regex"]').val( $('.search input').val() );
	$('input[name="ename"]').val('');
	mode = 'new';
	$('.adduser-btn').attr( 'disabled', 'disabled' );
    }

    $('#event-dialog').modal('show');
}

function server_save_event() {
    var ename = $('input[name="ename"]').val();
    var regex = $('input[name="regex"]').val();

    try {
	var test = new RegExp( regex );
    } catch( err ) {
	$('.error-message' ).text( err.message );
	$('#error-dialog').modal( 'show' );
	return false;
    }

    if ( ! ename || ename == '' ) {
	$('.error-message' ).text( 'This event requires a name!' );
	$('#error-dialog').modal( 'show' );
	return false;
    }

    if ( mode == 'new' ) {
	$.getJSON( '/add_event', { name: ename, regex: regex } ).then( function( result ) {
	    eid = result.id;
	    $('.adduser-btn').removeAttr( 'disabled' );
	    mode = 'edit';
	}, function( err ) {
	    $('.error-message' ) = err.message;
	    $('#error-dialog').modal( 'show' );
	});
	return false;
    }
    else {
	$.getJSON( '/edit_event', { name: ename, regex: regex, event_id: eid } ).then( function( result ) {
	    $('.adduser-btn').removeAttr( 'disabled' );
	}, function( err ) {
	    $('.error-message' ) = err.message;
	    $('#error-dialog').modal( 'show' );
	});
	return false;
    }
}

$(document).ready( function() {

    if ( $('#tail' ).length ) {
	window.onload = refresh;
	window.onfocus = refresh;
	window.onblur = sleep;
    }

    $('.search input').keypress( function( e ) {
	if ( e.which == 13 ) {
	    search();
	    return false;
	}
    });

    $('input[name="ename"]').on( 'blur', function() {
	server_save_event();
    });

    $('input[name="regex"]').on( 'blur', function() {
	server_save_event();
    });

    $('input[name="ename"]').keypress( function( e ) {
	if ( e.which == 13 ) {
	    return server_save_event();
	}
    });

    $('input[name="regex"]').keypress( function( e ) {
	if ( e.which == 13 ) {
	    return server_save_event();
	}
    });

    $('.search input').keyup( function( e ) {
	var v = $('.search input').val();
	if ( v ) {
	    if ( $('.save-event').css( 'display' ) == 'none' ) {
		$('.save-event').show( 'slide', { direction: 'left' }, 500 );
	    }
	}
	else {
	    if ( $('.save-event').css( 'display' ) != 'none' ) {
		$('.save-event').hide( 'slide', { direction: 'left' }, 500 );
	    }
	    search();
	}
    });

});

function adduser() {
    var html = [
	'<tr class="editing">',
	'<td><input name="email" id="email" type="text" placeholder="Email" /></td>',
	'<td>',
	'  <input name="freq" id="freq" type="number" size="3" value="10" />',
	'  <select name="unit" id="unit">',
	'    <option value="minutes">minutes</option>',
	'    <option value="hours">hours</option>',
	'  </select>',
	'</td>',
	'<td><i class="ok glyphicon glyphicon-ok-circle"></i></td>',
	'</tr>',
    ].join( '' );
    $(html).insertBefore( '.dialog-table tr:first' );

    $('i.ok').on( 'click', function() {
	var self = this;
	var email = $(self).parent().parent().find('input[name="email"]').val();
	var freq  = $(self).parent().parent().find('input[name="freq"]').val();
	var unit  = $(self).parent().parent().find('select[name="unit"]').val();

	freq = Number( freq );
	if ( unit == 'hours' ) freq = freq * 60;
	
	//console.log( 'saving user', email, freq, unit );
	
	$.getJSON( '/add_user', { email: email, freq: freq, event_id: eid } ).then( function( result ) {
	    var english = 'every ' + moment.duration( freq * 60 * 1000 ).humanize();
	    english = english.replace( 'an hour', 'hour' );
	    var html = [
		'<tr class="editing">',
		'<td class="email">', email, '</td>',
		'<td>', english, '</td>',
		'<td><i class="delete glyphicon glyphicon-remove-circle"></i></td>',
		'</tr>'
	    ].join('');
	    var el = $(html);
	    $(self).parent().parent().replaceWith( el );
	    $(el).find('i.delete').bind( 'click', function() {
		var self = this;
		var email = $(self).parent().parent().find('td.email').text();
		$.getJSON( '/remove_user', { email: email, event_id: eid } ).then( function( result ) {
		    $(self).parent().parent().remove();
		}, function( err ) {
		    $('.error-message' ) = err.message;
		    $('#error-dialog').modal( 'show' );
		});
	    });
	}, function( err ) {
	    $('.error-message' ) = err.message;
	    $('#error-dialog').modal( 'show' );
	});
    });
    
}

function admin_delete_event( id ) {
    $.getJSON( '/event', {id: id} ).then( function( event ) {
	$('#delete-dialog').find( '.delete-message' ).data( 'id', id );
	$('#delete-dialog').find( '.delete-message' ).text(
	    'Are you sure you want to delete the event named "' + event.name + '"?' );
	$('#delete-dialog').modal( 'show' );
    });
}

function admin_delete_event_confirmed() {
    var id = $('#delete-dialog').find( '.delete-message' ).data( 'id' );
    $.getJSON( '/remove_event', { event_id: id }).then( function() {
	$('.evt'+id).remove();
    });
}

function admin_edit_event( id ) {
    $.getJSON( '/event', {id: id} ).then( function( event ) {
	save_event( event.id, event.name, event.regex, event.users );
    });
}
