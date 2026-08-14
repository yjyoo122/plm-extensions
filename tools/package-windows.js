#!/usr/bin/env node
//
//  PACKAGE-WINDOWS.JS
//  ---------------------------------------------------------------------------------------------------------------
//  Builds the zero-install Windows portable package of the UX server.
//
//      npm run package:win
//      npm run package:win -- --node=v22.11.0
//      npm run package:win -- --node=local --keep-staging
//
//  The result is dist/PLM-Extensions-<yyyy-mm-dd>-win-x64.zip containing a self-contained folder:
//  the application, a pre-installed node_modules, an embedded node.exe, Start.cmd and a .lnk shortcut.
//  The end user never installs Node, never opens a terminal and never runs npm.
//
//  Only Node built-ins are used. PowerShell is shelled out to for two things Node cannot do natively:
//  reading entries out of the official Node .zip distribution, and creating the Windows .lnk shortcut.
//  Both are present on Windows 11 out of the box. Writing the output .zip is done in pure Node
//  (see writeZip below) because PowerShell's Compress-Archive is slow with the thousands of files in
//  node_modules and inherits the 260 character path limit; --zip=powershell forces it as a fallback.
//  ---------------------------------------------------------------------------------------------------------------

'use strict';

const fs           = require('fs');
const os           = require('os');
const path         = require('path');
const zlib         = require('zlib');
const crypto       = require('crypto');
const { spawnSync} = require('child_process');


//  Connection settings that must be empty in the shipped environment.js. The wizard asks for them on
//  first start, and none of them may ever leave the machine that builds the package.
const BLANKED_SETTINGS = ['tenant', 'clientId', 'adminClientId', 'adminClientSecret', 'vaultGateway', 'vaultName'];
const SHIPPED_REDIRECT = 'http://localhost:8080/callback';


const REPO_ROOT           = path.resolve(__dirname, '..');
const TEMPLATE_DIR        = path.join(REPO_ROOT, 'package-template');
const DIST_DIR            = path.join(REPO_ROOT, 'dist');
const STAGING_DIR         = path.join(DIST_DIR, 'staging');
const PACKAGE_FOLDER_NAME = 'Fusion Manage UX';
const SHORTCUT_NAME       = 'Fusion Manage UX.lnk';
const NODE_DIST_BASE      = 'https://nodejs.org/dist';
const NODE_INDEX_URL      = 'https://nodejs.org/dist/index.json';
const NODE_FALLBACK       = 'v22.11.0';    // used only when the release index cannot be fetched


//  Files and folders copied into the package. Anything not listed here never ships.
const COPY_ITEMS = [
    { name: 'app.js',         required: true  },
    { name: 'environment.js', required: true  },
    { name: 'package.json',   required: true  },
    { name: 'settings.js',    required: true  },
    { name: 'README.md',      required: false },
    { name: 'bin',            required: true  },
    { name: 'routes',         required: true  },
    { name: 'views',          required: true  },
    { name: 'public',         required: true  },
    { name: 'settings',       required: true  },
    { name: 'environments',   required: true  },
    { name: 'chrome',         required: false },
    { name: 'docs',           required: false }
];

//  Runtime folders that must exist but must ship empty (the server writes into them).
const EMPTY_DIRS = [
    'uploads',
    'keys',
    'storage',
    'storage/cache',
    'storage/downloads',
    'storage/excel-export',
    'storage/exports',
    'storage/imports',
    'storage/uploads'
];

//  Files produced by the sibling i18n / setup work. Missing ones are only warned about.
const EXPECTED_FEATURE_FILES = [
    'public/i18n/ja.json',
    'public/i18n/ko.json',
    'public/i18n/dictionaries.js',
    'public/javascripts/framework/i18n.js',
    'public/stylesheets/framework/i18n.css',
    'public/javascripts/framework/setup.js',
    'public/stylesheets/framework/setup.css',
    'routes/setup.js',
    'views/framework/setup.pug'
];


let warnings = [];
let crcTable = null;


try {

    main();

} catch(error) {

    console.log();
    console.log('  BUILD FAILED');
    console.log('  ' + error.message);
    console.log();

    if(process.env.PLMX_PACKAGE_TRACE === '1') console.log(error.stack);

    process.exitCode = 1;

}


function main() {

    let options = parseArguments(process.argv.slice(2));

    if(options.help) {
        printUsage();
        return;
    }

    console.log();
    console.log('  PLM EXTENSIONS  -  WINDOWS PORTABLE PACKAGE BUILDER');
    console.log('  ----------------------------------------------------------------------------------');
    console.log();

    //  Refused rather than attempted elsewhere : the shortcut and the extraction of node.exe out of the
    //  Node distribution both need powershell.exe, and --node=local would silently embed a Linux or macOS
    //  binary under the name node.exe, which produces a package that fails only on the end user's machine.
    if(process.platform !== 'win32') {
        throw new Error('this builder produces a Windows package and must be run on Windows, not on ' + process.platform);
    }

    checkTemplates();
    checkFeatureFiles();

    let runtime = resolveNodeRuntime(options);
    let appDir  = path.join(STAGING_DIR, PACKAGE_FOLDER_NAME);

    console.log('  Preparing staging folder');
    removeTree(STAGING_DIR);
    fs.mkdirSync(appDir, { recursive : true });

    let copied = copyApplication(appDir);
    console.log('  Copied ' + copied.files + ' application files (' + formatSize(copied.bytes) + ')');

    sanitizeEnvironment(path.join(appDir, 'environment.js'));
    createEmptyDirectories(appDir);
    installRuntime(appDir, runtime);
    writeLauncherFiles(appDir);

    if(options.install) {
        installDependencies(appDir);
    } else {
        warn('Dependency installation was skipped, the package ships WITHOUT node_modules');
    }

    createShortcut(appDir);

    let zipPath = path.join(DIST_DIR, 'PLM-Extensions-' + today() + '-win-x64.zip');

    console.log('  Creating ' + path.basename(zipPath));
    createArchive(STAGING_DIR, zipPath, options.zip);

    if(!options.keepStaging) removeTree(STAGING_DIR);

    printSummary(zipPath, runtime, options);

}


// ---------------------------------------------------------------------------------------------------------------
//  ARGUMENTS
// ---------------------------------------------------------------------------------------------------------------

function parseArguments(argv) {

    let options = {
        node        : '',
        cache       : path.join(os.homedir(), '.plm-extensions-cache'),
        install     : true,
        keepStaging : false,
        zip         : 'node',
        help        : false
    };

    for(let argument of argv) {
        if(argument === '--help' || argument === '-h') {
            options.help = true;
        } else if(argument === '--skip-install') {
            options.install = false;
        } else if(argument === '--keep-staging') {
            options.keepStaging = true;
        } else if(argument.startsWith('--node=')) {
            options.node = argument.substring(7).trim();
        } else if(argument.startsWith('--cache=')) {
            options.cache = path.resolve(argument.substring(8).trim());
        } else if(argument.startsWith('--zip=')) {
            options.zip = argument.substring(6).trim().toLowerCase();
        } else {
            throw new Error('Unknown argument "' + argument + '", use --help for the list of options');
        }
    }

    if((options.zip !== 'node') && (options.zip !== 'powershell')) {
        throw new Error('--zip must be either "node" or "powershell"');
    }

    if((options.node !== '') && (options.node !== 'local') && !/^v\d+\.\d+\.\d+$/.test(options.node)) {
        throw new Error('--node must be "local" or a version like v22.11.0');
    }

    return options;

}

function printUsage() {

    console.log();
    console.log('  Usage : npm run package:win -- [options]');
    console.log();
    console.log('    --node=vX.Y.Z    Embed this exact Node version, default is the current LTS release');
    console.log('    --node=local     Embed the node.exe running this script instead of downloading one');
    console.log('    --cache=<dir>    Download cache for Node distributions, default is ' + path.join(os.homedir(), '.plm-extensions-cache'));
    console.log('    --skip-install   Do not run npm install, for quick test builds only');
    console.log('    --keep-staging   Keep dist/staging after zipping, useful when debugging the package');
    console.log('    --zip=powershell Use PowerShell instead of the built in zip writer');
    console.log('    --help           Show this text');
    console.log();

}


// ---------------------------------------------------------------------------------------------------------------
//  PREFLIGHT CHECKS
// ---------------------------------------------------------------------------------------------------------------

function checkTemplates() {

    for(let name of ['Start.cmd', 'README-FIRST.txt']) {
        if(!fs.existsSync(path.join(TEMPLATE_DIR, name))) {
            throw new Error('Template file package-template/' + name + ' is missing');
        }
    }

}

function checkFeatureFiles() {

    let missing = [];

    for(let relative of EXPECTED_FEATURE_FILES) {
        if(!fs.existsSync(path.join(REPO_ROOT, relative.split('/').join(path.sep)))) missing.push(relative);
    }

    if(missing.length > 0) {
        warn('These i18n / setup files do not exist yet and will not ship : ' + missing.join(', '));
    }

}


// ---------------------------------------------------------------------------------------------------------------
//  NODE RUNTIME
// ---------------------------------------------------------------------------------------------------------------

function resolveNodeRuntime(options) {

    if(options.node === 'local') return localRuntime('--node=local was requested');

    let version = options.node;

    if(version === '') {
        console.log('  Looking up the current Node LTS release');
        version = fetchLatestLts();
        if(version === '') {
            version = NODE_FALLBACK;
            warn('The Node release index could not be read, falling back to ' + version);
        }
    }

    try {

        let distribution = 'node-' + version + '-win-x64';
        let archiveName  = distribution + '.zip';
        let archivePath  = path.join(options.cache, archiveName);

        fs.mkdirSync(options.cache, { recursive : true });

        let expected = fetchChecksum(version, archiveName);

        if(fs.existsSync(archivePath) && (sha256OfFile(archivePath) === expected)) {
            console.log('  Using cached ' + archiveName);
        } else {
            console.log('  Downloading ' + archiveName);
            download(NODE_DIST_BASE + '/' + version + '/' + archiveName, archivePath);
            let actual = sha256OfFile(archivePath);
            if(actual !== expected) {
                fs.unlinkSync(archivePath);
                throw new Error('Checksum mismatch for ' + archiveName + ', expected ' + expected + ' but got ' + actual);
            }
            console.log('  Checksum verified against SHASUMS256.txt');
        }

        let extracted = path.join(options.cache, distribution);
        fs.mkdirSync(extracted, { recursive : true });

        let exePath     = path.join(extracted, 'node.exe');
        let licensePath = path.join(extracted, 'LICENSE');

        if(!fs.existsSync(exePath) || !fs.existsSync(licensePath)) {
            extractFromZip(archivePath, [
                { entry : distribution + '/node.exe', target : exePath     },
                { entry : distribution + '/LICENSE',  target : licensePath }
            ]);
        }

        return {
            version     : version,
            exePath     : exePath,
            licensePath : licensePath,
            verified    : true
        };

    } catch(error) {

        return localRuntime(error.message);

    }

}

function localRuntime(reason) {

    let exePath     = process.execPath;
    let licensePath = path.join(path.dirname(exePath), 'LICENSE');

    if(!fs.existsSync(licensePath)) licensePath = '';

    if(reason.indexOf('--node=local') < 0) {
        warn('The official Node runtime could not be obtained (' + reason + ')');
    }

    warn('The package will embed the node.exe of THIS machine (' + process.version + ') taken from ' + exePath);
    warn('That binary is not checksum verified, rebuild with network access before shipping to end users');

    return {
        version     : process.version,
        exePath     : exePath,
        licensePath : licensePath,
        verified    : false
    };

}

function fetchLatestLts() {

    try {

        let index = JSON.parse(downloadToString(NODE_INDEX_URL));

        for(let release of index) {
            if(release.lts === false) continue;
            if(!Array.isArray(release.files)) continue;
            if(release.files.indexOf('win-x64-zip') < 0) continue;
            return release.version;
        }

    } catch(error) { }

    return '';

}

function fetchChecksum(version, fileName) {

    let sums = downloadToString(NODE_DIST_BASE + '/' + version + '/SHASUMS256.txt');

    for(let line of sums.split('\n')) {
        let parts = line.trim().split(/\s+/);
        if(parts.length < 2) continue;
        if(parts[1].replace(/^\*/, '') === fileName) return parts[0].toLowerCase();
    }

    throw new Error('SHASUMS256.txt of ' + version + ' does not list ' + fileName);

}


// ---------------------------------------------------------------------------------------------------------------
//  DOWNLOADS
// ---------------------------------------------------------------------------------------------------------------

function download(url, targetPath) {

    let temporary = targetPath + '.part';
    let buffer    = requestBuffer(url, 5);

    fs.writeFileSync(longPath(temporary), buffer);
    fs.renameSync(longPath(temporary), longPath(targetPath));

}

function downloadToString(url) {
    return requestBuffer(url, 5).toString('utf8');
}

//  Fetches a url synchronously by delegating to a short lived child process running node -e.
//  This keeps the builder a simple top to bottom script instead of turning every step into a promise
//  chain, and it gives every download a hard timeout without extra plumbing.
function requestBuffer(url, redirects) {

    let script = [
        'const https = require("https");',
        'let url = process.argv[1];',
        'let left = Number(process.argv[2]);',
        'function get(target) {',
        '    https.get(target, { headers : { "user-agent" : "plm-extensions-packager" } }, function(response) {',
        '        if(([301,302,303,307,308].indexOf(response.statusCode) >= 0) && response.headers.location && (left > 0)) {',
        '            left--; response.resume(); get(new URL(response.headers.location, target).toString()); return;',
        '        }',
        '        if(response.statusCode !== 200) { console.error("HTTP " + response.statusCode + " for " + target); process.exit(1); }',
        '        response.pipe(process.stdout);',
        '    }).on("error", function(error) { console.error(error.message); process.exit(1); }).setTimeout(60000, function() { console.error("timeout"); process.exit(1); });',
        '}',
        'get(url);'
    ].join('\n');

    let result = spawnSync(process.execPath, ['-e', script, url, String(redirects)], { maxBuffer : 256 * 1024 * 1024 });

    if(result.error) throw new Error('Download of ' + url + ' failed : ' + result.error.message);

    if(result.status !== 0) {
        let message = (result.stderr || Buffer.alloc(0)).toString('utf8').trim();
        throw new Error('Download of ' + url + ' failed : ' + (message === '' ? 'unknown error' : message));
    }

    return result.stdout;

}

function sha256OfFile(filePath) {

    let hash   = crypto.createHash('sha256');
    let handle = fs.openSync(longPath(filePath), 'r');
    let buffer = Buffer.alloc(1024 * 1024);

    try {
        let read = fs.readSync(handle, buffer, 0, buffer.length, null);
        while(read > 0) {
            hash.update(buffer.subarray(0, read));
            read = fs.readSync(handle, buffer, 0, buffer.length, null);
        }
    } finally {
        fs.closeSync(handle);
    }

    return hash.digest('hex');

}


// ---------------------------------------------------------------------------------------------------------------
//  COPYING THE APPLICATION
// ---------------------------------------------------------------------------------------------------------------

function copyApplication(appDir) {

    let counters = { files : 0, bytes : 0 };

    for(let item of COPY_ITEMS) {

        let source = path.join(REPO_ROOT, item.name);

        if(!fs.existsSync(source)) {
            if(item.required) throw new Error('Required file or folder "' + item.name + '" does not exist in ' + REPO_ROOT);
            warn('Optional item "' + item.name + '" does not exist and was skipped');
            continue;
        }

        copyRecursive(source, path.join(appDir, item.name), item.name, counters);

    }

    return counters;

}

function copyRecursive(source, target, relative, counters) {

    let stats = fs.statSync(longPath(source));

    if(stats.isDirectory()) {

        fs.mkdirSync(longPath(target), { recursive : true });

        for(let name of fs.readdirSync(longPath(source))) {
            let childRelative = relative + '/' + name;
            if(isExcluded(childRelative, name)) continue;
            copyRecursive(path.join(source, name), path.join(target, name), childRelative, counters);
        }

    } else if(stats.isFile()) {

        fs.mkdirSync(longPath(path.dirname(target)), { recursive : true });
        fs.copyFileSync(longPath(source), longPath(target));

        counters.files++;
        counters.bytes += stats.size;

    }

}

function isExcluded(relative, name) {

    if(name === '.git')          return true;
    if(name === 'node_modules')  return true;
    if(name === '.DS_Store')     return true;
    if(name === 'Thumbs.db')     return true;
    if(name.indexOf('.backup-') >= 0) return true;

    //  Never ship the maintainer's own tenant connection files, only the template
    if(relative.startsWith('environments/') && (name !== 'template.js')) return true;

    //  Private keys and runtime data never ship
    if(relative.startsWith('keys/'))    return true;
    if(relative.startsWith('uploads/')) return true;
    if(relative.startsWith('storage/')) return true;

    return false;

}

function createEmptyDirectories(appDir) {

    for(let relative of EMPTY_DIRS) {
        let target = path.join(appDir, relative.split('/').join(path.sep));
        fs.mkdirSync(longPath(target), { recursive : true });
        fs.writeFileSync(longPath(path.join(target, '.gitkeep')), '');
    }

}

//  Ships environment.js with blank tenant and client id so the setup wizard triggers on first start.
//  Secrets of the machine building the package must never leave it.
function sanitizeEnvironment(filePath) {

    let content  = fs.readFileSync(longPath(filePath), 'utf8');
    let original = content;

    for(let key of BLANKED_SETTINGS) {
        content = blankExport(content, key);
    }

    content = content.replace(
        /^(\s*exports\.redirectUri\s*=\s*)(['"]).*?\2(\s*;)/m,
        "$1'" + SHIPPED_REDIRECT + "'$3"
    );

    fs.writeFileSync(longPath(filePath), content);

    verifyEnvironment(filePath);

    if(content === original) {
        console.log('  Shipping environment.js unchanged, all connection settings were already blank');
    } else {
        console.log('  Blanked connection settings in environment.js so the setup wizard triggers on first start');
    }

}

//  The blanking above is text substitution and only recognises plain quoted literals. A maintainer whose
//  environment.js assigns a tenant, a client id or a secret in any other way (backticks, concatenation,
//  a process.env fallback) would otherwise get a package containing their credentials, announced by a
//  message claiming the opposite. So the written file is loaded back and the result is proven, in a
//  child process because environment.js is executable code that must not run inside the builder.
function verifyEnvironment(filePath) {

    let reader = 'console.log(JSON.stringify(require(process.argv[1])));';
    let result = spawnSync(process.execPath, ['-e', reader, filePath], { encoding : 'utf8' });

    if(result.status !== 0) {
        throw new Error('the sanitized environment.js could not be loaded : ' + (result.stderr || '').split('\n')[0].trim());
    }

    let values = JSON.parse(result.stdout);
    let leaked = [];

    for(let key of BLANKED_SETTINGS) {
        if((typeof values[key] !== 'undefined') && (values[key] !== '')) leaked.push(key);
    }

    if(leaked.length > 0) {
        throw new Error('environment.js still carries values for ' + leaked.join(', ')
            + '. These must not ship. Blank them in ' + path.join(REPO_ROOT, 'environment.js')
            + ' or write them as plain quoted strings so the builder can blank them, then build again');
    }

    if(values.redirectUri !== SHIPPED_REDIRECT) {
        throw new Error('environment.js ships redirectUri "' + values.redirectUri + '" instead of "'
            + SHIPPED_REDIRECT + '". Write it as a plain quoted string so the builder can reset it');
    }

}

function blankExport(content, key) {

    let pattern = new RegExp('^(\\s*exports\\.' + key + '\\s*=\\s*)([\'"]).*?\\2(\\s*;)', 'm');

    return content.replace(pattern, "$1''$3");

}


// ---------------------------------------------------------------------------------------------------------------
//  RUNTIME, LAUNCHER AND DEPENDENCIES
// ---------------------------------------------------------------------------------------------------------------

function installRuntime(appDir, runtime) {

    let runtimeDir = path.join(appDir, 'runtime');

    fs.mkdirSync(longPath(runtimeDir), { recursive : true });
    fs.copyFileSync(longPath(runtime.exePath), longPath(path.join(runtimeDir, 'node.exe')));

    let licenseTarget = path.join(runtimeDir, 'LICENSE-nodejs.txt');

    if(runtime.licensePath !== '') {
        fs.copyFileSync(longPath(runtime.licensePath), longPath(licenseTarget));
    } else {
        fs.writeFileSync(longPath(licenseTarget), [
            'This folder contains node.exe, the Node.js runtime, redistributed unmodified.',
            'Node.js is distributed under the MIT license.',
            'The full license text is published at https://github.com/nodejs/node/blob/main/LICENSE',
            ''
        ].join('\r\n'));
        warn('The LICENSE file of the embedded Node runtime could not be located, a pointer was written instead');
    }

    fs.writeFileSync(longPath(path.join(runtimeDir, 'node-version.txt')), runtime.version + '\r\n');

    console.log('  Embedded Node runtime ' + runtime.version + (runtime.verified ? ' (checksum verified)' : ' (copied from this machine)'));

}

//  Both files are written with CRLF line endings and without a byte order mark. cmd.exe mis-parses
//  labels and parenthesised blocks in batch files that use bare LF, and a BOM in front of "@echo off"
//  makes the first line fail, so this normalisation is not cosmetic.
function writeLauncherFiles(appDir) {

    for(let name of ['Start.cmd', 'README-FIRST.txt']) {

        let content = fs.readFileSync(path.join(TEMPLATE_DIR, name), 'utf8');

        if(content.charCodeAt(0) === 0xFEFF) content = content.substring(1);

        content = content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

        fs.writeFileSync(longPath(path.join(appDir, name)), content, 'utf8');

    }

    console.log('  Wrote Start.cmd and README-FIRST.txt');

}

function installDependencies(appDir) {

    console.log('  Running npm install --omit=dev, this takes a moment');
    console.log();

    let npm    = (process.platform === 'win32') ? 'npm.cmd' : 'npm';
    let result = spawnSync(npm, ['install', '--omit=dev', '--no-audit', '--no-fund'], {
        cwd   : appDir,
        stdio : 'inherit',
        shell : true
    });

    console.log();

    if(result.error)      throw new Error('npm install could not be started : ' + result.error.message);
    if(result.status !== 0) throw new Error('npm install failed with exit code ' + result.status);

    let modulesDir = path.join(appDir, 'node_modules');

    if(!fs.existsSync(longPath(modulesDir))) throw new Error('npm install did not create node_modules');

    removeTree(path.join(modulesDir, '.cache'));

    console.log('  Dependencies installed into node_modules');

}


// ---------------------------------------------------------------------------------------------------------------
//  WINDOWS SHORTCUT
// ---------------------------------------------------------------------------------------------------------------
//  A .lnk stores an absolute target, so it is also given a relative path fallback. Start.cmd rewrites the
//  shortcut with correct absolute paths the first time it runs from a new location, which is what makes
//  copying the icon to the desktop work no matter where the user extracted the folder.
function createShortcut(appDir) {

    let script = [
        '$ErrorActionPreference = "Stop"',
        '$shell    = New-Object -ComObject WScript.Shell',
        '$shortcut = $shell.CreateShortcut(' + psString(path.join(appDir, SHORTCUT_NAME)) + ')',
        '$shortcut.TargetPath       = ' + psString(path.join(appDir, 'Start.cmd')),
        '$shortcut.WorkingDirectory = ' + psString(appDir),
        '$shortcut.IconLocation     = ' + psString(path.join(appDir, 'public', 'favicon.ico') + ',0'),
        '$shortcut.Description      = "Fusion Manage UX - starts the local server and opens the apps"',
        //  1 = normal window. The console window IS the running server and README-FIRST tells the user
        //  to leave it open, so it must never start minimised. A minimised window would also hide the
        //  "port already in use" and "runtime\node.exe is missing" messages, which end in a pause.
        '$shortcut.WindowStyle      = 1',
        'try { $shortcut.RelativePath = ".\\Start.cmd" } catch { }',
        '$shortcut.Save()'
    ].join('\r\n');

    let result = runPowerShell(script);

    if(result.status !== 0) {
        warn('The shortcut ' + SHORTCUT_NAME + ' could not be created : ' + powerShellError(result));
        warn('The package is still usable, the user can double click Start.cmd directly');
        return;
    }

    console.log('  Created ' + SHORTCUT_NAME);

}


// ---------------------------------------------------------------------------------------------------------------
//  ARCHIVE
// ---------------------------------------------------------------------------------------------------------------

function createArchive(sourceDir, zipPath, mode) {

    fs.mkdirSync(longPath(path.dirname(zipPath)), { recursive : true });
    ignoreDistFolder();
    if(fs.existsSync(longPath(zipPath))) fs.unlinkSync(longPath(zipPath));

    if(mode === 'powershell') {
        compressWithPowerShell(sourceDir, zipPath);
        return;
    }

    try {
        writeZip(sourceDir, zipPath);
    } catch(error) {
        warn('The built in zip writer failed (' + error.message + '), retrying with PowerShell');
        if(fs.existsSync(longPath(zipPath))) fs.unlinkSync(longPath(zipPath));
        compressWithPowerShell(sourceDir, zipPath);
    }

}

//  dist/ holds a 200 MB staging tree and a 130 MB archive. The repository's own .gitignore is left
//  untouched on purpose, so the build output is kept out of git with a .gitignore inside dist/ itself,
//  which also ignores itself and therefore never shows up as an untracked file.
function ignoreDistFolder() {

    let target = path.join(DIST_DIR, '.gitignore');

    if(fs.existsSync(longPath(target))) return;

    fs.writeFileSync(longPath(target), ['*', ''].join('\r\n'));

}

function compressWithPowerShell(sourceDir, zipPath) {

    let script = [
        '$ErrorActionPreference = "Stop"',
        'Add-Type -AssemblyName System.IO.Compression.FileSystem',
        '[System.IO.Compression.ZipFile]::CreateFromDirectory(' + psString(sourceDir) + ', ' + psString(zipPath) + ', [System.IO.Compression.CompressionLevel]::Optimal, $false)'
    ].join('\r\n');

    let result = runPowerShell(script);

    if(result.status !== 0) throw new Error('PowerShell could not create the archive : ' + powerShellError(result));

}

//  Minimal but standards compliant zip writer. Deflate is used unless storing is smaller.
//  Explicit directory entries are written so the empty runtime folders survive extraction.
function writeZip(sourceDir, zipPath) {

    let entries = [];

    collectEntries(sourceDir, '', entries);

    if(entries.length > 65534) throw new Error('the package contains too many entries for a non zip64 archive');

    let handle    = fs.openSync(longPath(zipPath), 'w');
    let offset    = 0;
    let directory = [];

    try {

        for(let entry of entries) {

            let nameBuffer = Buffer.from(entry.name, 'utf8');
            let data       = Buffer.alloc(0);
            let method     = 0;
            let crc        = 0;
            let size       = 0;

            if(!entry.directory) {
                let raw     = fs.readFileSync(longPath(entry.fullPath));
                let deflate = zlib.deflateRawSync(raw, { level : 6 });
                crc         = crc32(raw);
                size        = raw.length;
                if(deflate.length < raw.length) {
                    data   = deflate;
                    method = 8;
                } else {
                    data = raw;
                }
            }

            let header = Buffer.alloc(30);

            header.writeUInt32LE(0x04034b50, 0);
            header.writeUInt16LE(20, 4);
            header.writeUInt16LE(0x0800, 6);
            header.writeUInt16LE(method, 8);
            header.writeUInt16LE(entry.time, 10);
            header.writeUInt16LE(entry.date, 12);
            header.writeUInt32LE(crc, 14);
            header.writeUInt32LE(data.length, 18);
            header.writeUInt32LE(size, 22);
            header.writeUInt16LE(nameBuffer.length, 26);
            header.writeUInt16LE(0, 28);

            directory.push({
                name   : nameBuffer,
                method : method,
                time   : entry.time,
                date   : entry.date,
                crc    : crc,
                csize  : data.length,
                size   : size,
                offset : offset,
                attrs  : entry.directory ? 0x10 : 0x20
            });

            fs.writeSync(handle, header);
            fs.writeSync(handle, nameBuffer);
            if(data.length > 0) fs.writeSync(handle, data);

            offset += header.length + nameBuffer.length + data.length;

        }

        let directoryOffset = offset;
        let directorySize   = 0;

        for(let record of directory) {

            let header = Buffer.alloc(46);

            header.writeUInt32LE(0x02014b50, 0);
            header.writeUInt16LE(20, 4);
            header.writeUInt16LE(20, 6);
            header.writeUInt16LE(0x0800, 8);
            header.writeUInt16LE(record.method, 10);
            header.writeUInt16LE(record.time, 12);
            header.writeUInt16LE(record.date, 14);
            header.writeUInt32LE(record.crc, 16);
            header.writeUInt32LE(record.csize, 20);
            header.writeUInt32LE(record.size, 24);
            header.writeUInt16LE(record.name.length, 28);
            header.writeUInt16LE(0, 30);
            header.writeUInt16LE(0, 32);
            header.writeUInt16LE(0, 34);
            header.writeUInt16LE(0, 36);
            header.writeUInt32LE(record.attrs, 38);
            header.writeUInt32LE(record.offset, 42);

            fs.writeSync(handle, header);
            fs.writeSync(handle, record.name);

            directorySize += header.length + record.name.length;

        }

        let end = Buffer.alloc(22);

        end.writeUInt32LE(0x06054b50, 0);
        end.writeUInt16LE(0, 4);
        end.writeUInt16LE(0, 6);
        end.writeUInt16LE(directory.length, 8);
        end.writeUInt16LE(directory.length, 10);
        end.writeUInt32LE(directorySize, 12);
        end.writeUInt32LE(directoryOffset, 16);
        end.writeUInt16LE(0, 20);

        fs.writeSync(handle, end);

    } finally {

        fs.closeSync(handle);

    }

}

function collectEntries(baseDir, relative, entries) {

    let currentDir = (relative === '') ? baseDir : path.join(baseDir, relative.split('/').join(path.sep));
    let names      = fs.readdirSync(longPath(currentDir)).sort();

    for(let name of names) {

        let childRelative = (relative === '') ? name : relative + '/' + name;
        let fullPath      = path.join(currentDir, name);
        let stats         = fs.statSync(longPath(fullPath));
        let stamp         = dosStamp(stats.mtime);

        if(stats.isDirectory()) {
            entries.push({ name : childRelative + '/', fullPath : fullPath, directory : true, time : stamp.time, date : stamp.date });
            collectEntries(baseDir, childRelative, entries);
        } else if(stats.isFile()) {
            entries.push({ name : childRelative, fullPath : fullPath, directory : false, time : stamp.time, date : stamp.date });
        }

    }

}

function dosStamp(date) {

    let year = date.getFullYear();

    if(year < 1980) return { date : (1 << 5) | 1, time : 0 };

    return {
        date : ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
        time : (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
    };

}

function crc32(buffer) {

    if(crcTable === null) {
        crcTable = new Int32Array(256);
        for(let index = 0; index < 256; index++) {
            let value = index;
            for(let bit = 0; bit < 8; bit++) {
                value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
            }
            crcTable[index] = value;
        }
    }

    let crc = -1;

    for(let index = 0; index < buffer.length; index++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ buffer[index]) & 0xFF];
    }

    return (crc ^ -1) >>> 0;

}


// ---------------------------------------------------------------------------------------------------------------
//  ZIP ENTRY EXTRACTION
// ---------------------------------------------------------------------------------------------------------------
//  Node has no zip reader, so the two files needed out of the 40 MB Node distribution are pulled with
//  System.IO.Compression through PowerShell. Extracting only two entries keeps this fast.
function extractFromZip(archivePath, extractions) {

    let lines = [
        '$ErrorActionPreference = "Stop"',
        'Add-Type -AssemblyName System.IO.Compression.FileSystem',
        '$archive = [System.IO.Compression.ZipFile]::OpenRead(' + psString(archivePath) + ')',
        'try {'
    ];

    for(let extraction of extractions) {
        lines.push('    $entry = $archive.Entries | Where-Object { $_.FullName -eq ' + psString(extraction.entry) + ' } | Select-Object -First 1');
        lines.push('    if($null -eq $entry) { throw "entry ' + extraction.entry + ' not found in the archive" }');
        lines.push('    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, ' + psString(extraction.target) + ', $true)');
    }

    lines.push('} finally { $archive.Dispose() }');

    let result = runPowerShell(lines.join('\r\n'));

    if(result.status !== 0) throw new Error('extraction from ' + path.basename(archivePath) + ' failed : ' + powerShellError(result));

}


// ---------------------------------------------------------------------------------------------------------------
//  HELPERS
// ---------------------------------------------------------------------------------------------------------------

//  PowerShell is driven through a temporary script file so that paths with spaces, ampersands or
//  parentheses never have to survive command line quoting.
function runPowerShell(script) {

    let scriptPath = path.join(os.tmpdir(), 'plmx-package-' + process.pid + '-' + Math.random().toString(36).substring(2, 8) + '.ps1');

    fs.writeFileSync(scriptPath, '\uFEFF' + script + '\r\n', 'utf8');

    try {
        return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
            encoding  : 'utf8',
            maxBuffer : 32 * 1024 * 1024
        });
    } finally {
        try { fs.unlinkSync(scriptPath); } catch(error) { }
    }

}

function powerShellError(result) {

    if(result.error) return result.error.message;

    let message = (result.stderr || '').trim();

    if(message === '') message = (result.stdout || '').trim();
    if(message === '') message = 'exit code ' + result.status;

    return message.split('\n')[0].trim();

}

//  Single quoted PowerShell literal, the only escape needed is a doubled single quote
function psString(value) {
    return "'" + String(value).split("'").join("''") + "'";
}

//  Windows refuses paths beyond 260 characters unless they are given in extended length form.
//  node_modules trees regularly exceed that, so every filesystem call in this script goes through here.
function longPath(target) {

    if(process.platform !== 'win32') return target;

    let resolved = path.resolve(target);

    if(resolved.length < 240)          return resolved;
    if(resolved.startsWith('\\\\?\\')) return resolved;
    if(resolved.startsWith('\\\\'))    return '\\\\?\\UNC\\' + resolved.substring(2);

    return '\\\\?\\' + resolved;

}

function removeTree(target) {

    if(!fs.existsSync(longPath(target))) return;

    fs.rmSync(longPath(target), { recursive : true, force : true, maxRetries : 5, retryDelay : 200 });

}

function directorySize(target) {

    let total = 0;

    for(let name of fs.readdirSync(longPath(target))) {
        let child = path.join(target, name);
        let stats = fs.statSync(longPath(child));
        total += stats.isDirectory() ? directorySize(child) : stats.size;
    }

    return total;

}

function formatSize(bytes) {

    if(bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    if(bytes >= 1024 * 1024)        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    if(bytes >= 1024)               return (bytes / 1024).toFixed(1) + ' KB';

    return bytes + ' bytes';

}

function today() {

    let now = new Date();

    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

}

function warn(message) {

    warnings.push(message);

}

function printSummary(zipPath, runtime, options) {

    let size = fs.statSync(longPath(zipPath)).size;

    console.log();
    console.log('  ----------------------------------------------------------------------------------');
    console.log('  PACKAGE READY');
    console.log('  ----------------------------------------------------------------------------------');
    console.log('  Output          ' + zipPath);
    console.log('  Size            ' + formatSize(size));
    console.log('  Node runtime    ' + runtime.version + (runtime.verified ? '  (downloaded and checksum verified)' : '  (copied from this machine)'));
    console.log('  Folder in zip   ' + PACKAGE_FOLDER_NAME);
    console.log('  Start with      ' + PACKAGE_FOLDER_NAME + '\\Start.cmd  or  ' + PACKAGE_FOLDER_NAME + '\\' + SHORTCUT_NAME);

    if(options.keepStaging) console.log('  Staging kept    ' + STAGING_DIR + '  (' + formatSize(directorySize(STAGING_DIR)) + ')');

    if(warnings.length > 0) {
        console.log();
        console.log('  WARNINGS');
        for(let message of warnings) console.log('   !  ' + message);
    }

    console.log();

}
