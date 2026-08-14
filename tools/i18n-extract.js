// ---------------------------------------------------------------------------------------------------------------------------
//  I18N STRING EXTRACTOR
// ---------------------------------------------------------------------------------------------------------------------------
//  Harvests user-visible English UI strings from this repository so they can be translated in
//  /public/i18n/ja.json and /public/i18n/ko.json. The runtime translation layer (i18n.js) matches
//  whole strings exactly, so the strings collected here must be the exact values written to the DOM.
//
//  Sources scanned:
//    - Pug views          : plain text on tags, piped text (| ...) and title / placeholder / alt attributes
//    - Browser javascript : arguments of .html() / .text() / .attr('title'|'placeholder', ...) and the
//                           showMessage / showErrorMessage / showSuccessMessage / showInfoMessage helpers,
//                           plus common label-carrying object properties (title, label, headerLabel, ...)
//    - settings.js        : menu titles & subtitles and application labels
//
//  Usage:
//    node tools/i18n-extract.js                 print a summary
//    node tools/i18n-extract.js --write         merge new strings into public/i18n/ja.json and ko.json
//                                               (existing translations are never overwritten)
//    node tools/i18n-extract.js --list          print every extracted string with its source
//
//  Folders /views/docs, /views/dev, /views/tutorial and /public/javascripts/dev|tutorial|custom|libs
//  are excluded: they contain developer documentation, not end user UI.
// ---------------------------------------------------------------------------------------------------------------------------

const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const OUT_DIR  = path.join(ROOT, 'public', 'i18n');
const doWrite  = process.argv.includes('--write');
const doList   = process.argv.includes('--list');

const PUG_DIRS = ['views/apps', 'views/admin', 'views/framework', 'views/addins'];
const JS_DIRS  = ['public/javascripts/apps', 'public/javascripts/admin', 'public/javascripts/addins',
                  'public/javascripts/contents', 'public/javascripts/framework'];

const strings = new Map(); // english -> { count, sources:Set }

function record(value, source) {
    let text = normalize(value);
    if(!isUIString(text)) return;
    if(!strings.has(text)) strings.set(text, { count : 0, sources : new Set() });
    let entry = strings.get(text);
    entry.count++;
    if(entry.sources.size < 3) entry.sources.add(source);
}

function normalize(value) {
    return value
        .replace(/\\'/g, '\'')
        .replace(/\\"/g, '"')
        .replace(/&amp;?/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Accept only strings that plausibly are English UI text (not ids, urls, code or field IDs)
function isUIString(text) {
    if(text.length < 2 || text.length > 200)        return false;
    if(!/[A-Za-z]/.test(text))                      return false;
    if(/^[a-z0-9_.\-]+$/.test(text))                return false;  // ids, css classes, keys
    if(/^[A-Z0-9_]+$/.test(text))                   return false;  // FIELD_IDS
    if(/^[a-z]+([A-Z][a-z0-9]*)+$/.test(text))      return false;  // camelCase identifiers
    if(/^(https?:|www\.|\/|#|\.|<|{)/.test(text))   return false;  // urls, paths, selectors, markup
    if(/[<>{}]/.test(text))                         return false;  // html / template fragments
    if(/\.(js|css|png|jpg|jpeg|svg|gif|ico|json|pug|html|pdf|zip|xlsx?)$/i.test(text)) return false;
    if(/^[\d\s.,:;%+\-/*=()]+$/.test(text))         return false;  // numbers & punctuation
    if(!/[A-Z]/.test(text) && !/\s/.test(text))     return false;  // single lowercase word: likely a key
    return true;
}

function walk(dir) {
    let results = [];
    if(!fs.existsSync(dir)) return results;
    for(let entry of fs.readdirSync(dir, { withFileTypes : true })) {
        let p = path.join(dir, entry.name);
        if(entry.isDirectory()) results = results.concat(walk(p));
        else results.push(p);
    }
    return results;
}

function rel(file) { return path.relative(ROOT, file).split(path.sep).join('/'); }


// ---------------------------------------------------------------------------------------------------------------------------
//  PUG VIEWS
// ---------------------------------------------------------------------------------------------------------------------------
function extractPug(file) {

    let source = rel(file);
    let lines  = fs.readFileSync(file, 'utf8').split(/\r?\n/);

    for(let line of lines) {

        let text = line.trim();

        if(text === '' || text.startsWith('//')) continue;
        if(text.startsWith('script') || text.startsWith('link') || text.startsWith('meta')) continue;

        // quoted attribute values : title='...', placeholder="...", alt='...'
        let attrRe = /(title|placeholder|alt|value|data-tooltip)\s*=\s*(['"])((?:(?!\2)[^\\]|\\.)+)\2/g;
        let m;
        while((m = attrRe.exec(text)) !== null) {
            if(m[3].includes('#{')) continue;                    // interpolated: runtime value
            record(m[3], source);
        }

        // piped text : | Some text
        m = text.match(/^\|\s?(.*)$/);
        if(m) { recordPugText(m[1], source); continue; }

        // trailing plain text after a tag : div.button#save Save Changes
        m = text.match(/^[a-zA-Z#.][a-zA-Z0-9#._\-]*(\([^)]*\))?\s+(.+)$/);
        if(m && !m[2].startsWith('=') && !m[2].startsWith('!')) {
            recordPugText(m[2], source);
        }
    }
}

function recordPugText(text, source) {
    if(text.includes('#{') || text.includes('#[')) return;       // interpolation: runtime value
    record(text, source);
}


// ---------------------------------------------------------------------------------------------------------------------------
//  BROWSER JAVASCRIPT
// ---------------------------------------------------------------------------------------------------------------------------
function extractJS(file) {

    let source = rel(file);
    let code   = fs.readFileSync(file, 'utf8');
    let m;

    // .html('...') / .text('...') / .append('...') with a pure string literal
    let htmlRe = /\.(html|text)\(\s*(['"])((?:(?!\2)[^\\\r\n]|\\.)+)\2\s*\)/g;
    while((m = htmlRe.exec(code)) !== null) record(m[3], source);

    // .attr('title', '...') / .attr('placeholder', '...')
    let attrRe = /\.attr\(\s*(['"])(title|placeholder|alt|aria-label)\1\s*,\s*(['"])((?:(?!\3)[^\\\r\n]|\\.)+)\3\s*\)/g;
    while((m = attrRe.exec(code)) !== null) record(m[4], source);

    // message helpers: showErrorMessage('title', 'message'), showInfoMessage(...), ...
    let msgRe = /show(?:Error|Success|Info|Startup)?(?:Message|Error|Dialog)\(\s*(['"])((?:(?!\1)[^\\\r\n]|\\.)+)\1\s*(?:,\s*(['"])((?:(?!\3)[^\\\r\n]|\\.)+)\3)?/g;
    while((m = msgRe.exec(code)) !== null) {
        record(m[2], source);
        if(m[4]) record(m[4], source);
    }

    // label-carrying object properties in DOM-building code
    let propRe = /(?:^|[,{\s])(title|label|headerLabel|placeholder|tooltip|buttonLabel|text)\s*:\s*(['"])((?:(?!\2)[^\\\r\n]|\\.)+)\2/gm;
    while((m = propRe.exec(code)) !== null) record(m[3], source);
}


// ---------------------------------------------------------------------------------------------------------------------------
//  SETTINGS (menu labels, app names & descriptions shown in Start Menu and landing page)
// ---------------------------------------------------------------------------------------------------------------------------
function extractSettings() {

    let code = fs.readFileSync(path.join(ROOT, 'settings.js'), 'utf8');
    let m;

    let propRe = /(?:^|[,{\s])(label|title|subtitle|bomLabel)\s*:\s*(['"])((?:(?!\2)[^\\\r\n]|\\.)+)\2/gm;
    while((m = propRe.exec(code)) !== null) record(m[3], 'settings.js');
}


// ---------------------------------------------------------------------------------------------------------------------------
//  RUN
// ---------------------------------------------------------------------------------------------------------------------------
for(let dir of PUG_DIRS) for(let file of walk(path.join(ROOT, dir))) if(file.endsWith('.pug')) extractPug(file);
for(let dir of JS_DIRS ) for(let file of walk(path.join(ROOT, dir))) if(file.endsWith('.js' )) extractJS(file);
extractSettings();

let sorted = [...strings.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));

console.log();
console.log('  Extracted ' + sorted.length + ' unique candidate UI strings');
console.log();

if(doList) {
    for(let [text, entry] of sorted) {
        console.log(String(entry.count).padStart(5) + '  ' + JSON.stringify(text) + '   [' + [...entry.sources].join(', ') + ']');
    }
}

if(doWrite) {

    if(!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive : true });

    for(let lang of ['ja', 'ko']) {

        let file     = path.join(OUT_DIR, lang + '.json');
        let existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
        let added    = 0;

        for(let [text] of sorted) {
            if(!(text in existing)) { existing[text] = ''; added++; }
        }

        let keys   = Object.keys(existing).sort((a, b) => a.localeCompare(b));
        let output = {};
        for(let key of keys) output[key] = existing[key];

        fs.writeFileSync(file, JSON.stringify(output, null, 4) + '\n', 'utf8');

        let untranslated = keys.filter(k => output[k] === '').length;
        console.log('  ' + lang + '.json : ' + keys.length + ' strings total, ' + added + ' added, ' + untranslated + ' still untranslated');
    }

    console.log();
    console.log('  Now fill in the empty values, then run:  node tools/i18n-build.js');
    console.log();
}
