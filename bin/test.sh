#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
./node_modules/.bin/tsc --noEmit
exec ./node_modules/.bin/playwright test "$@"
