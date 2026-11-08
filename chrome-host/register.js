/*  REGISTERS THE START / STOP HELPER WITH CHROME AND EDGE
    -----------------------------------------------------------------------------
    Run by Start.cmd on every launch, so the registration follows the folder when
    it is moved or copied. Writes com.plmx.launcher.json next to this file and
    points the current user's registry entries of Chrome and Edge at it :

        HKCU\Software\Google\Chrome\NativeMessagingHosts\com.plmx.launcher
        HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.plmx.launcher

    Current user only - no administrator rights are needed and nothing outside
    these two keys is touched. Only the extension whose ID is listed below may use
    the helper; the ID is fixed by the "key" in chrome/manifest.json.

        node chrome-host/register.js            register (again)
        node chrome-host/register.js --remove   remove both registry entries
    ----------------------------------------------------------------------------- */

'use strict';

const fs            = require('fs');
const path          = require('path');
const child_process = require('child_process');

const HOST_NAME     = 'com.plmx.launcher';
const EXTENSION_IDS = [ 'hoihaoempgngpcglmnamdadlbplnkopl' ];
const BROWSERS      = [
    'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\' + HOST_NAME,
    'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\'  + HOST_NAME
];

const pathManifest  = path.join(__dirname, HOST_NAME + '.json');
const remove        = process.argv.includes('--remove');

function reg(args) {

    let result = child_process.spawnSync('reg.exe', args, { stdio : 'ignore', windowsHide : true, timeout : 10000 });

    return (result.status === 0);

}

if(process.platform !== 'win32') {
    console.log('The start / stop helper is only available on Windows.');
    process.exit(0);
}

if(remove) {

    for(let key of BROWSERS) reg(['delete', key, '/f']);

    try { fs.unlinkSync(pathManifest); } catch(error) {}

    console.log('Start / stop helper removed from Chrome and Edge.');
    process.exit(0);

}

let manifest = {
    name            : HOST_NAME,
    description     : 'Starts and stops the local PLM UX Extensions server',
    path            : path.join(__dirname, 'host.cmd'),
    type            : 'stdio',
    allowed_origins : EXTENSION_IDS.map(function(id) { return 'chrome-extension://' + id + '/'; })
};

let text = JSON.stringify(manifest, null, 4);
let old  = '';

try { old = fs.readFileSync(pathManifest, 'utf8'); } catch(error) {}

if(old !== text) fs.writeFileSync(pathManifest, text, 'utf8');

let failed = 0;

for(let key of BROWSERS) {
    if(!reg(['add', key, '/ve', '/t', 'REG_SZ', '/d', pathManifest, '/f'])) failed++;
}

console.log((failed === 0) ? 'Start / stop helper registered for Chrome and Edge.' : 'Start / stop helper : ' + failed + ' registry entry could not be written.');
process.exit(0);
