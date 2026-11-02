#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

git clone https://github.com/inbucket/inbucket.git
git clone https://github.com/synox/disposable-mailbox.git
git clone https://github.com/stalwartlabs/mail-server.git
