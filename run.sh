#!/bin/sh
# Because SQLite is native, must build before launching app
npm install
node app $*

