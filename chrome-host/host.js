/*  START / STOP HELPER FOR THE CHROME EXTENSION  (native messaging host)
    -----------------------------------------------------------------------------
    A browser extension cannot start a program on the computer. Chrome and Edge
    offer exactly one way around that : a "native messaging host", a program the
    user has registered in advance and which only the extension IDs named in its
    registration may talk to (com.plmx.launcher.json, written by register.js).

    This is that program. Chrome starts it, hands it ONE message on stdin and reads
    ONE answer from stdout. Both are JSON, each preceded by its length as a 32 bit
    little endian number. Nothing else may ever be written to stdout - a stray
    console.log would corrupt the channel - so this file logs nothing at all.

    It understands three requests and nothing more, so the extension can never be
    used to run anything except this app's own launcher :

        { cmd : 'status' }  ->  is the app running, on which address and tenant
        { cmd : 'start'  }  ->  runs Start.cmd, minimised, without opening a tab
        { cmd : 'stop'   }  ->  asks the running app to end itself (/setup/shutdown)
    ----------------------------------------------------------------------------- */

'use strict';

const fs            = require('fs');
const path          = require('path');
const http          = require('http');
const https         = require('https');
const child_process = require('child_process');

const HOME          = path.resolve(__dirname, '..');
const LAUNCHER      = path.join(HOME, 'Start.cmd');
const SHORTCUT      = path.join(__dirname, 'Start from browser.lnk');
const VERSION       = 1;
const PROFILE_CHARS = /^[A-Za-z0-9_-]+$/;


/*  WHERE THE APP LISTENS
    The same order Start.cmd uses : the tenant profile recorded by the setup wizard
    in .plmx-profile, else environment.js, and the port of its redirect URI.        */
function getServerUrl() {

    let environment = path.join(HOME, 'environment.js');
    let profile     = '';

    try {
        profile = fs.readFileSync(path.join(HOME, '.plmx-profile'), 'utf8').trim();
    } catch(error) {}

    if((profile !== '') && PROFILE_CHARS.test(profile)) {
        let candidate = path.join(HOME, 'environments', profile + '.js');
        if(fs.existsSync(candidate)) environment = candidate;
    }

    let scheme = 'http';
    let port   = '8080';

    try {
        let text  = fs.readFileSync(environment, 'utf8');
        let match = text.match(/^exports\.redirectUri\s*=\s*['"`]([^'"`]*)['"`]/m);
        if(match !== null) {
            let uri = new URL(match[1]);
            if(uri.protocol === 'https:') scheme = 'https';
            if(uri.port !== '') port = uri.port;
        }
    } catch(error) {}

    return scheme + '://localhost:' + port + '/';

}


/*  TALKING TO THE APP                                                          */
function request(method, url, timeout) {

    return new Promise(function(resolve) {

        let target  = new URL(url);
        let library = (target.protocol === 'https:') ? https : http;
        let options = {
            method  : method,
            timeout : timeout,
            headers : { 'accept' : 'application/json' },
            // the local server of an https setup uses a self signed certificate
            rejectUnauthorized : false
        };

        if(method === 'POST') {
            options.headers['content-type']   = 'application/json';
            options.headers['content-length'] = 2;
        }

        let req = library.request(target, options, function(res) {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', function(chunk) { body += chunk; });
            res.on('end',  function() {
                let data = null;
                try { data = JSON.parse(body); } catch(error) {}
                resolve({ status : res.statusCode, data : data });
            });
        });

        req.on('timeout', function() { req.destroy(new Error('timeout')); });
        req.on('error',   function() { resolve({ status : 0, data : null }); });

        if(method === 'POST') req.write('{}');

        req.end();

    });

}

async function getStatus() {

    let url      = getServerUrl();
    let response = await request('GET', url + 'setup/status', 2500);
    let running  = (response.status === 200) && (response.data !== null) && (typeof response.data === 'object');

    return {
        ok       : true,
        version  : VERSION,
        url      : url,
        running  : running,
        tenant   : running ? String(response.data.tenant  || '') : '',
        profile  : running ? String(response.data.profile || '') : '',
        home     : HOME
    };

}


/*  STARTING
    Start.cmd is opened through Windows Explorer - exactly what a double click does -
    and not as a child of this process. Chrome ends this helper as soon as it has
    answered, and a child started from here could be ended along with it. Going
    through a shortcut is what allows starting the window minimised, so it does not
    jump in front of the browser in the middle of a demo, and passing --no-browser,
    since the extension opens the page itself once the app answers.                */
function writeShortcut() {

    let script = [
        '$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:PLMX_LNK)',
        '$s.TargetPath       = $env:PLMX_TARGET',
        '$s.Arguments        = "--no-browser"',
        '$s.WorkingDirectory = $env:PLMX_HOME',
        '$s.WindowStyle      = 7',
        '$s.Description      = "Fusion Manage UX - started from the browser"',
        'if(Test-Path -LiteralPath $env:PLMX_ICON) { $s.IconLocation = $env:PLMX_ICON + ",0" }',
        '$s.Save()'
    ].join('; ');

    // the paths travel in environment variables, so no character in a folder name can break the command
    let result = child_process.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        env         : Object.assign({}, process.env, {
            PLMX_LNK    : SHORTCUT,
            PLMX_TARGET : LAUNCHER,
            PLMX_HOME   : HOME + path.sep,
            PLMX_ICON   : path.join(HOME, 'public', 'favicon.ico')
        }),
        stdio       : 'ignore',
        windowsHide : true,
        timeout     : 20000
    });

    return (result.status === 0) && fs.existsSync(SHORTCUT);

}

async function start() {

    let status = await getStatus();

    if(status.running) return Object.assign(status, { started : false, already : true });

    if(!fs.existsSync(LAUNCHER)) {
        return { ok : false, code : 'no-launcher', message : 'Start.cmd was not found in ' + HOME };
    }

    // the shortcut is written again every time, so it is never left pointing at an old folder
    if(!writeShortcut()) {
        return { ok : false, code : 'shortcut', message : 'Windows did not allow creating the start shortcut in ' + __dirname };
    }

    let explorer = child_process.spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'explorer.exe'), [SHORTCUT], {
        detached    : true,
        stdio       : 'ignore',
        windowsHide : false
    });

    explorer.on('error', function() {});
    explorer.unref();

    return Object.assign(status, { started : true, already : false });

}


/*  STOPPING
    The app ends itself with exit code 0 when asked, which Start.cmd treats as a
    normal end, so its black window closes as well and nothing is restarted.        */
async function stop() {

    let status = await getStatus();

    if(!status.running) return Object.assign(status, { stopped : false, already : true });

    let response = await request('POST', status.url + 'setup/shutdown', 5000);

    if((response.status !== 200) || (response.data === null) || (response.data.ok !== true)) {
        return Object.assign(status, { ok : false, code : 'refused', message : 'The app did not accept the request to stop (HTTP ' + response.status + '). Close its black window instead.' });
    }

    return Object.assign(status, { stopped : true, already : false });

}


/*  NATIVE MESSAGING CHANNEL                                                    */
function reply(message) {

    let body   = Buffer.from(JSON.stringify(message), 'utf8');
    let header = Buffer.alloc(4);

    header.writeUInt32LE(body.length, 0);

    process.stdout.write(Buffer.concat([header, body]), function() {
        process.exit(0);
    });

}

function readMessage() {

    return new Promise(function(resolve, reject) {

        let chunks = [];
        let size   = 0;

        process.stdin.on('data', function(chunk) {

            chunks.push(chunk);
            size += chunk.length;

            let buffer = Buffer.concat(chunks, size);

            if(buffer.length < 4) return;

            let length = buffer.readUInt32LE(0);

            if(length > 65536) return reject(new Error('message too large'));
            if(buffer.length < 4 + length) return;

            try {
                resolve(JSON.parse(buffer.subarray(4, 4 + length).toString('utf8')));
            } catch(error) {
                reject(error);
            }

        });

        process.stdin.on('end', function() { reject(new Error('no message')); });

    });

}

readMessage().then(async function(message) {

    let cmd = (message !== null && typeof message === 'object') ? message.cmd : '';

    if(cmd === 'status') return reply(await getStatus());
    if(cmd === 'start')  return reply(await start());
    if(cmd === 'stop')   return reply(await stop());

    reply({ ok : false, code : 'unknown', message : 'Unknown request' });

}).catch(function(error) {

    reply({ ok : false, code : 'error', message : error.message });

});
