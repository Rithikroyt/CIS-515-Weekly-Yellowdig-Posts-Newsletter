// Runs n8n/src/parse-workflows.js locally against a canonical ingest payload.
// Usage: node tests/harness/run-parse.js <canonical.json> [extra-workflow.json ...]
const fs = require('fs');
const path = require('path');
const [, , canonicalPath, ...extra] = process.argv;
const payload = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
const code = fs.readFileSync(path.join(__dirname, '../../n8n/src/parse-workflows.js'), 'utf8');
const $input = { first: () => ({ json: payload }) };
const fn = new Function('$input', 'return (async () => {' + code + '})();');
fn($input).then((out) => process.stdout.write(JSON.stringify(out[0].json, null, 2)));
