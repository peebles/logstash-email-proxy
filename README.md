# Logstash Email Proxy

This server may be placed in front of any "syslog"-style logging service and provides a "tail -f"
like web GUI and a way for users to interactively create events based on search expressions and have email
sent to them when these events are detected in the input stream.  The input stream is passed along
unchanged to the downstream logging service.

Search expressions are very "lucene-like" and work well with structured data.

## Quick Start

Let's say you have an existing `logstash` server running on host "logstash" listening on
port 554 in both tcp and udp.

    docker build -t proxy .
    docker run -d --name proxy \
        -e PORT=8080 \
        -e PROXY_WEBSERVER_USER=admin -e PROXY_WEBSERVER_PASS=password \
        -e PROXY_SMTP_USER=smtpuser -e PROXY_SMTP_PASS=smtpsecret \
        -e PROXY_SMTP_HOST=smtp.sendgrid.net -e PROXY_SMTP_PORT=465 \
        -e PROXY_SMTP_FROM=events@newco.co \
        -p 554:554 \
        -p 554:554/udp \
        proxy 554/udp,logstash:554 554/tcp,logstash:554

You can then point your browser to port 8080 and log into it using `admin/password`.  Change your
loggers to point to this machine instead of `logstash`.

## Setup

Setup can be done using environment variables.  `PORT` is the port number to run the webserver
on.  `PROXY_WEBSERVER_USER` and `PROXY_WEBSERVER_PASS` are used with HTTP Basic Auth to authenticate
access to the web server.  The remaining environment variables, those that start with `PROXY_SMTP_`,
are used to configure the module that sends email.

### Email Settings

The module that sends email is `node-emailer`.  That module is configured to use `smtp-transport` which is
documented [here](https://github.com/andris9/nodemailer-smtp-transport).  The environment variables and their
defaults are:

* PROXY_SMTP_FROM - events@newco.com
* PROXY_SMTP_USER - admin
* PROXY_SMTP_PASS - password
* PROXY_SMTP_PORT - 465
* PROXY_SMTP_HOST - smpt.gmail.com
* PROXY_SMTP_SECURE - true
* PROXY_SMTP_IGNORETLS - false
* PROXY_SMTP_REQUIRETLS - true
* PROXY_SMTP_NAME - logstash-proxy
* PROXY_SMTP_LOCAL_ADDRESS - 0.0.0.0
* PROXY_SMTP_CONNECTION_TIMEOUT - 3000
* PROXY_SMTP_GREETING_TIMEOUT - 3000
* PROXY_SMTP_SOCKET_TIMEOUT - 5000
* PROXY_SMTP_DEBUG - false
* PROXY_SMTP_LMTP - false
* PROXY_SMTP_AUTH - PLAIN

## Proxy Port Mapping

You can establish the proxy port mapping by passing arguments on the command line.  You may
map as many input ports and protocols to as many output servers and ports as makes sense for
your application.  The syntax for creating a mapping is

    local-port/protocol,remote-server:report-port

## Expressions

The expressions used to define events are a varient of Lucene, slightly modified to be more
useful in the context of matching logging events.

### Supported features:

* conjunction operators (AND, OR, ||, &&, NOT)
* prefix operators (+, -) (on the field, like Kibana)
* quoted values ("foo bar")
* named fields (foo:bar)
* range expressions (foo:[bar TO baz], foo:{bar TO baz})
* parentheses grouping ( (foo OR bar) AND baz ) 
* field groups ( foo:(bar OR baz) )
* fields that refer to arrays ( foo.bar[0]:baz )
* test for missing and existing fields (foo.x:_missing_ AND foo.y:_exists)

