bin=./node_modules/.bin
npm run tsc
$bin/playwright install
$bin/playwright install-deps
$bin/playwright test
