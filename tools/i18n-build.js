// ---------------------------------------------------------------------------------------------------------------------------
//  I18N DICTIONARY BUILDER
// ---------------------------------------------------------------------------------------------------------------------------
//  Compiles the translation files /public/i18n/ja.json and /public/i18n/ko.json into a single
//  browser script /public/i18n/dictionaries.js which defines window.PLMX_I18N.
//  This script is loaded by the layouts before the i18n engine (i18n.js) starts.
//
//  Entries with an empty value are dropped: they mark strings that have not been translated yet
//  and must fall back to the original English text at runtime.
//
//  Usage:
//    node tools/i18n-build.js
// ---------------------------------------------------------------------------------------------------------------------------

const fs   = require('fs');
const path = require('path');

const DIR       = path.join(__dirname, '..', 'public', 'i18n');
const LANGUAGES = ['ja', 'ko'];

let output = {};

for(let lang of LANGUAGES) {

    let file = path.join(DIR, lang + '.json');

    if(!fs.existsSync(file)) {
        console.log('  ! ' + lang + '.json not found, skipping');
        output[lang] = {};
        continue;
    }

    let raw;

    try {
        raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch(error) {
        console.error('  ERROR ! ' + lang + '.json contains invalid JSON: ' + error.message);
        process.exit(1);
    }

    let dictionary = {};
    let dropped    = 0;

    for(let key of Object.keys(raw)) {
        let value = raw[key];
        if(typeof value !== 'string' || value === '') { dropped++; continue; }
        dictionary[key] = value;
    }

    output[lang] = dictionary;

    console.log('  ' + lang + ' : ' + Object.keys(dictionary).length + ' translations' + (dropped > 0 ? ' (' + dropped + ' untranslated entries skipped)' : ''));
}

let script = '// GENERATED FILE - DO NOT EDIT MANUALLY\n'
           + '// Edit /public/i18n/ja.json and /public/i18n/ko.json instead, then rebuild with:\n'
           + '//   node tools/i18n-build.js\n'
           + 'window.PLMX_I18N = ' + JSON.stringify(output) + ';\n';

fs.writeFileSync(path.join(DIR, 'dictionaries.js'), script, 'utf8');

console.log('  -> public/i18n/dictionaries.js written');
