FROM ubuntu:15.04

RUN apt-get -qq install -y curl

ENV NODE_VERSION 0.10.40
ENV NPM_VERSION 2.14.1

RUN curl -SLO "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.gz" \
        && tar -xzf "node-v$NODE_VERSION-linux-x64.tar.gz" -C /usr/local --strip-components=1 \
        && npm install -g npm@"$NPM_VERSION" \
        && npm cache clear

RUN mkdir /deploy
ADD . /deploy
EXPOSE 8080

ENV PORT 8080
VOLUME ["/data"]
ENV PROXY_SQLITEDB /data/logger.db
ENV PROXY_WEBSERVER_USER admin
ENV PROXY_WEBSERVER_PASS password
ENV PROXY_SMTP_USER admin
ENV PROXY_SMTP_PASS password

WORKDIR /deploy
CMD ["./run.sh"]
