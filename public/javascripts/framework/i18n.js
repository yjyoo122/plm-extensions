/*  PLM EXTENSIONS - RUNTIME USER INTERFACE TRANSLATION (i18n)
    -----------------------------------------------------------------------------

    This file translates the user interface at the DOM boundary. No application
    code needs to be modified : text written by Pug during page parsing and text
    written later by jQuery are both picked up by a MutationObserver and looked up
    in the dictionaries provided by /i18n/dictionaries.js. Strings that have no
    translation stay in English, so nothing can ever break.

    LOADING
    This script must be loaded AFTER /i18n/dictionaries.js and AFTER jquery, but
    BEFORE utils.js and the application scripts. Both files are ordinary blocking
    script tags, the dictionary is therefore guaranteed to be present here.

    LANGUAGE RESOLUTION (first match wins)
    1. url parameter    ?uilang=ja|ko|en   (persisted to local storage when used)
    2. local storage    plmx-uilang
    3. window.PLMX_I18N_DEFAULT (optional server side default)
       window.PLMX_I18N_SETTINGS carries the remaining server side options,
       showSwitcher : false hides the language selector,
       collectMissing : false switches the missing string collector off.
    4. navigator.language : ja* -> ja, ko* -> ko, everything else -> en
    5. en

    When the resolved language is 'en', or its dictionary is missing or empty,
    NOTHING is installed except the language switcher. No observer, no sweep, no
    measurable overhead. This is what keeps the feature genuinely opt-in. When
    window.PLMX_I18N is absent altogether the engine does not even add the switcher,
    the page then behaves exactly as it did before this file existed.

    EXCLUDING A REGION FROM TRANSLATION
    Translation only ever replaces a WHOLE string that exactly matches a dictionary
    key, never a substring. Should a PLM data value nevertheless collide with a
    user interface label (an item named 'Description', a status called 'New', ...)
    the region can be excluded by an administrator :

        - add one of the marker attributes / classes to any ancestor element :
          data-i18n-skip, class 'no-translate', class 'notranslate', translate='no'
        - or register additional selectors before this script runs :
          window.PLMX_I18N_SKIP = [ '#bom-table td', '.supplier-name' ];
        - or at runtime : plmxI18n.addSkipSelector('#bom-table td');
          (this only affects what is translated from then on, it does not put text
           that was already translated back into English - reload for that)

    The opposite marker data-i18n-force re-enables translation inside an excluded
    subtree, so a whole panel can be excluded while its toolbar stays translated.

    GROWING THE DICTIONARY
    Every string that looks like English user interface text and has no translation
    is collected together with the number of places it was seen. Browse the
    applications, then call plmxI18n.exportMissing() in the browser console to
    download a json file that can be pasted into ja.json / ko.json.

    PUBLIC API - window.plmxI18n
        lang                  resolved language code
        available             codes backed by a non empty dictionary, 'en' included
        t(text)               translate a single string, returns the input on a miss
        setLanguage(code)     persist and reload the page in the given language
        translateNow(element) translate a subtree immediately, defaults to the body
        missing()             collected untranslated strings, most frequent first
        exportMissing()       download plmx-i18n-missing-<lang>.json for translation
        stats()               { lang, dictSize, translated, missing }
        addSkipSelector(sel)  exclude further regions at runtime

    Any internal error is caught and reported as a console warning. A broken
    translation layer must never take down a working application.

    ----------------------------------------------------------------------------- */

(function() {

    'use strict';

    let STORAGE_KEY  = 'plmx-uilang';
    let PARAMETER    = 'uilang';
    let LANGUAGES    = ['en', 'ja', 'ko'];
    let LABELS       = { en : 'English', ja : '日本語', ko : '한국어' };
    let ATTRIBUTES   = ['title', 'placeholder', 'alt', 'aria-label', 'data-tooltip'];
    /*  tagName is uppercase for html elements but keeps its case for elements of a
        foreign namespace, an svg injected by the viewer carries 'script' and 'style'
        in lower case. Both spellings are listed so that no lookup has to normalise. */
    let HARD_TAGS    = { SCRIPT : 1, STYLE : 1, TEXTAREA : 1, CODE : 1, PRE : 1,
                         script : 1, style : 1, textarea : 1, code : 1, pre : 1 };
    let SKIP_DEFAULT = ['[data-i18n-skip]', '.no-translate', '.notranslate', '[translate=no]'];
    let FORCE_SELECT = '[data-i18n-force]';
    let MIN_LENGTH   = 2;
    let MAX_LENGTH   = 200;
    let MAX_WARNINGS = 20;
    let MAX_PENDING  = 20000;
    let MAX_MISSING  = 5000;

    let ASCII_LETTER = /[A-Za-z]/;
    /*  Hangul, kana, cjk ideographs, halfwidth and fullwidth forms. Built from code
        points so that this source file stays plain ascii. */
    let CJK          = new RegExp('[' + [
        [0x1100, 0x11ff], [0x2e80, 0x2fdf], [0x3000, 0x303f], [0x3040, 0x30ff],
        [0x3130, 0x318f], [0x31a0, 0x31bf], [0x31f0, 0x31ff], [0x3400, 0x4dbf],
        [0x4e00, 0x9fff], [0xa960, 0xa97f], [0xac00, 0xd7ff], [0xf900, 0xfaff],
        [0xfe30, 0xfe4f], [0xff00, 0xffef]
    ].map(function(bounds) {
        return String.fromCharCode(bounds[0]) + '-' + String.fromCharCode(bounds[1]);
    }).join('') + ']');
    let LEADING      = /^\s*/;
    let TRAILING     = /\s*$/;
    let PROTOCOL     = /^(https?:|ftp:|file:|mailto:|data:|blob:|javascript:|\/\/)/i;
    let PATH         = /^([A-Za-z]:[\\\/]|\.{1,2}[\\\/]|\/[A-Za-z0-9._-]*\/)/;
    let ALL_CAPS     = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/;
    let CAMEL_CASE   = /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/;
    let KEBAB_CASE   = /^[a-z0-9]+(-[a-z0-9]+)+$/;
    let DOTTED       = /^[A-Za-z0-9_$]+([._][A-Za-z0-9_$]+)+$/;
    let FILE_NAME    = /^[A-Za-z0-9 _\-]+\.[A-Za-z]{2,5}$/;
    let NO_LETTER    = /^[^A-Za-z]+$/;

    let showSwitcher   = true;
    let collectMissing = true;

    let language     = 'en';
    let dictionary   = {};
    let dictionaries = {};
    let available    = ['en'];
    let active       = false;
    let installed    = false;
    let warnings     = 0;
    let translated   = 0;

    let skipSelectors = SKIP_DEFAULT.slice();
    let skipSelector  = skipSelectors.join(', ');

    let missingStrings = null;
    let writtenText    = null;
    let writtenAttr    = null;

    let observer      = null;
    let pendingNodes  = null;
    let pendingAttrs  = null;
    let frameHandle   = 0;
    let timeoutHandle = 0;
    let deferred      = false;


    /*  ERROR HANDLING
        ----------------------------------------------------------------------------- */

    function warn(context, error) {
        if(warnings >= MAX_WARNINGS) return;
        warnings++;
        try {
            console.warn('plmx-i18n : ' + context, error);
            if(warnings === MAX_WARNINGS) console.warn('plmx-i18n : further warnings suppressed');
        } catch(ignored) { }
    }

    function guard(context, callback) {
        return function() {
            try {
                return callback.apply(this, arguments);
            } catch(error) {
                warn(context, error);
                return undefined;
            }
        };
    }


    /*  LANGUAGE RESOLUTION
        ----------------------------------------------------------------------------- */

    function normalize(value) {
        if(typeof value !== 'string') return null;
        let code = value.trim().toLowerCase().replace('_', '-');
        if(code === '') return null;
        if(code.indexOf('ja') === 0) return 'ja';
        if(code.indexOf('ko') === 0) return 'ko';
        if(code.indexOf('en') === 0) return 'en';
        return null;
    }

    function getParameter(name) {
        let search = String(window.location.search || '');
        if(search.length < 2) return null;
        let pairs = search.substring(1).split('&');
        for(let i = 0; i < pairs.length; i++) {
            if(pairs[i] === '') continue;
            let pair = pairs[i].split('=');
            if(decodeURIComponent(pair[0]) !== name) continue;
            if(pair.length < 2) return '';
            return decodeURIComponent(pair.slice(1).join('=').replace(/\+/g, ' '));
        }
        return null;
    }

    function readStorage() {
        try {
            return window.localStorage.getItem(STORAGE_KEY);
        } catch(error) {
            return null;
        }
    }

    function writeStorage(code) {
        try {
            window.localStorage.setItem(STORAGE_KEY, code);
        } catch(error) {
            warn('local storage is not available', error);
        }
    }

    function resolveLanguage() {

        let requested = normalize(getParameter(PARAMETER));
        if(requested !== null) {
            writeStorage(requested);
            return requested;
        }

        let stored = normalize(readStorage());
        if(stored !== null) return stored;

        let injected = normalize(window.PLMX_I18N_DEFAULT);
        if(injected !== null) return injected;

        let browser = normalize(window.navigator ? window.navigator.language : null);
        if(browser !== null) return browser;

        return 'en';

    }

    function updateParameter(url, name, value) {

        let hash  = '';
        let index = url.indexOf('#');

        if(index > -1) {
            hash = url.substring(index);
            url  = url.substring(0, index);
        }

        let parts = url.split('?');
        let base  = parts[0];
        let pairs = [];
        let found = false;

        if(parts.length > 1) {
            let existing = parts.slice(1).join('?').split('&');
            for(let i = 0; i < existing.length; i++) {
                if(existing[i] === '') continue;
                if(existing[i].split('=')[0] === name) {
                    if(found) continue;
                    pairs.push(name + '=' + encodeURIComponent(value));
                    found = true;
                } else {
                    pairs.push(existing[i]);
                }
            }
        }

        if(!found) pairs.push(name + '=' + encodeURIComponent(value));

        return base + '?' + pairs.join('&') + hash;

    }


    /*  SKIP SELECTORS
        ----------------------------------------------------------------------------- */

    function isValidSelector(selector) {
        if(typeof selector !== 'string' || selector.trim() === '') return false;
        try {
            document.createElement('div').matches(selector);
            return true;
        } catch(error) {
            warn('ignoring invalid skip selector : ' + selector, error);
            return false;
        }
    }

    function addSkipSelector(selector) {
        if(!isValidSelector(selector)) return false;
        let value = selector.trim();
        if(skipSelectors.indexOf(value) > -1) return true;
        skipSelectors.push(value);
        skipSelector = skipSelectors.join(', ');
        return true;
    }

    function matchesSelector(elem, selector) {
        try {
            return elem.matches(selector);
        } catch(error) {
            return false;
        }
    }

    function isSkipped(elem) {
        let current = elem;
        while(current !== null && current.nodeType === 1) {
            if(HARD_TAGS[current.tagName] === 1)             return true;
            if(matchesSelector(current, FORCE_SELECT))       return false;
            if(matchesSelector(current, skipSelector))       return true;
            current = current.parentElement;
        }
        return false;
    }

    /*  Attributes of a textarea, code or pre element itself (a placeholder for example)
        are still user interface text, only their content is left alone. */
    function isSkippedForAttributes(elem) {
        let tag = elem.tagName;
        if(tag === 'SCRIPT' || tag === 'STYLE')     return true;
        if(matchesSelector(elem, FORCE_SELECT))     return false;
        if(matchesSelector(elem, skipSelector))     return true;
        return isSkipped(elem.parentElement);
    }


    /*  DICTIONARY LOOKUP
        ----------------------------------------------------------------------------- */

    function lookup(text) {
        if(!Object.prototype.hasOwnProperty.call(dictionary, text)) return null;
        let value = dictionary[text];
        if(typeof value !== 'string') return null;
        if(value === '') return null;
        return value;
    }

    function translateString(text) {
        if(typeof text !== 'string') return null;
        let trimmed = text.trim();
        if(trimmed.length < MIN_LENGTH)  return null;
        if(trimmed.length > MAX_LENGTH)  return null;
        if(!ASCII_LETTER.test(trimmed))  return null;
        return lookup(trimmed);
    }


    /*  MISSING STRING COLLECTOR
        ----------------------------------------------------------------------------- */

    function isCollectable(text) {
        if(NO_LETTER.test(text))       return false;
        if(CJK.test(text))             return false;
        if(PROTOCOL.test(text))        return false;
        if(PATH.test(text))            return false;
        if(text.indexOf('\\') > -1)    return false;
        if(ALL_CAPS.test(text))        return false;
        if(CAMEL_CASE.test(text))      return false;
        if(KEBAB_CASE.test(text))      return false;
        if(DOTTED.test(text))          return false;
        if(FILE_NAME.test(text))       return false;
        return true;
    }

    function cssPath(elem) {

        let parts   = [];
        let current = elem;

        while(current !== null && current.nodeType === 1 && parts.length < 6) {

            let part = current.tagName.toLowerCase();

            if(typeof current.id === 'string' && current.id !== '') {
                parts.unshift(part + '#' + current.id);
                break;
            }

            let names = current.getAttribute('class');
            if(typeof names === 'string' && names.trim() !== '') {
                part += '.' + names.trim().split(/\s+/)[0];
            }

            parts.unshift(part);

            if(current.tagName === 'BODY') break;

            current = current.parentElement;

        }

        return parts.join(' > ');

    }

    function recordMissing(text, elem) {

        if(missingStrings === null)  return;
        if(!isCollectable(text))     return;

        let entry = missingStrings.get(text);

        if(entry === undefined) {
            /*  A plm table can produce tens of thousands of distinct data strings, the
                collector is capped so that a long session cannot exhaust memory. */
            if(missingStrings.size >= MAX_MISSING) return;
            missingStrings.set(text, { text : text, count : 1, path : cssPath(elem) });
        } else {
            entry.count++;
        }

    }

    function listMissing() {
        let entries = [];
        if(missingStrings === null) return entries;
        missingStrings.forEach(function(entry) {
            entries.push({ text : entry.text, count : entry.count, path : entry.path });
        });
        entries.sort(function(a, b) {
            if(b.count !== a.count) return b.count - a.count;
            return a.text < b.text ? -1 : (a.text > b.text ? 1 : 0);
        });
        return entries;
    }

    function exportMissing() {

        let entries = listMissing();
        let result  = {};

        for(let i = 0; i < entries.length; i++) result[entries[i].text] = '';

        let blob = new Blob([JSON.stringify(result, null, 4)], { type : 'application/json;charset=utf-8' });
        let url  = window.URL.createObjectURL(blob);
        let link = document.createElement('a');

        link.setAttribute('href', url);
        link.setAttribute('download', 'plmx-i18n-missing-' + language + '.json');
        link.setAttribute('data-i18n-skip', '');
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        window.setTimeout(function() {
            try { window.URL.revokeObjectURL(url); } catch(ignored) { }
        }, 2000);

        return entries.length;

    }


    /*  TRANSLATION OF TEXT NODES AND ATTRIBUTES
        ----------------------------------------------------------------------------- */

    /*  While the html parser is still running, the text node it is currently filling
        can still grow. Translating it early would corrupt the final string, so nodes
        sitting on the parse frontier are left to the DOMContentLoaded sweep. */
    function isOnParseFrontier(node) {
        let current = node;
        while(current !== null && current !== document.documentElement) {
            if(current.nextSibling !== null) return false;
            current = current.parentNode;
        }
        return true;
    }

    function translateTextNode(node) {

        let value = node.nodeValue;

        if(typeof value !== 'string')             return;
        if(writtenText.get(node) === value)       return;

        let trimmed = value.trim();

        if(trimmed.length < MIN_LENGTH)           return;
        if(trimmed.length > MAX_LENGTH)           return;
        if(!ASCII_LETTER.test(trimmed))           return;
        if(deferred && isOnParseFrontier(node))   return;

        let translation = lookup(trimmed);

        if(translation === null) {
            writtenText.set(node, value);
            recordMissing(trimmed, node.parentElement);
            return;
        }

        let written = value.match(LEADING)[0] + translation + value.match(TRAILING)[0];

        node.nodeValue = written;
        writtenText.set(node, written);
        translated++;

    }

    /*  The value attribute carries data, not user interface text : an option value, a
        hidden field or the current content of a text input are sent back to plm as
        they are. Only the caption of a push button is user interface text. */
    function isTranslatableAttribute(elem, name) {

        if(name !== 'value')         return true;
        if(elem.tagName !== 'INPUT') return false;

        let type = elem.getAttribute('type');

        if(typeof type !== 'string') return false;

        type = type.toLowerCase();

        return (type === 'button' || type === 'submit');

    }

    function translateAttribute(elem, name) {

        if(!isTranslatableAttribute(elem, name)) return;
        if(!elem.hasAttribute(name)) return;

        let value = elem.getAttribute(name);

        if(typeof value !== 'string') return;

        let record = writtenAttr.get(elem);

        if(record !== undefined && record[name] === value) return;

        let trimmed = value.trim();

        if(trimmed.length < MIN_LENGTH) return;
        if(trimmed.length > MAX_LENGTH) return;
        if(!ASCII_LETTER.test(trimmed)) return;

        let translation = lookup(trimmed);

        if(record === undefined) {
            record = {};
            writtenAttr.set(elem, record);
        }

        if(translation === null) {
            record[name] = value;
            recordMissing(trimmed, elem);
            return;
        }

        let written = value.match(LEADING)[0] + translation + value.match(TRAILING)[0];

        elem.setAttribute(name, written);

        record[name] = written;
        translated++;

    }

    function translateAttributes(elem) {

        if(!elem.hasAttributes()) return;

        for(let i = 0; i < ATTRIBUTES.length; i++) translateAttribute(elem, ATTRIBUTES[i]);

        translateAttribute(elem, 'value');

    }

    /*  Descends an element, carrying the inherited skip state down the tree instead of
        walking back up for every single text node. Skipped subtrees are still visited
        because they may contain a data-i18n-force marker. */
    function descend(elem, inherited) {

        let skipped = inherited;
        let tag     = elem.tagName;

             if(matchesSelector(elem, FORCE_SELECT)) skipped = false;
        else if(matchesSelector(elem, skipSelector)) skipped = true;

        if(!skipped && tag !== 'SCRIPT' && tag !== 'STYLE') translateAttributes(elem);

        if(HARD_TAGS[tag] === 1) return;

        let child = elem.firstChild;

        while(child !== null) {

            let next = child.nextSibling;

                 if(child.nodeType === 3) { if(!skipped) translateTextNode(child); }
            else if(child.nodeType === 1) { descend(child, skipped); }

            child = next;

        }

    }

    function translateNode(node) {

        if(node === null || node === undefined)     return;
        if(!document.documentElement.contains(node)) return;

        if(node.nodeType === 3) {
            if(!isSkipped(node.parentElement)) translateTextNode(node);
            return;
        }

        if(node.nodeType !== 1) return;

        descend(node, isSkipped(node.parentElement));

    }


    /*  MUTATION HANDLING
        ----------------------------------------------------------------------------- */

    function flush() {

        deferred = (document.readyState === 'loading');

        let nodes = pendingNodes;
        let attrs = pendingAttrs;

        pendingNodes = [];
        pendingAttrs = [];

        let visited = new Set();

        for(let i = 0; i < nodes.length; i++) {

            let node = nodes[i];

            if(visited.has(node))                        continue;
            if(!document.documentElement.contains(node)) continue;

            visited.add(node);

            translateNode(node);

        }

        for(let i = 0; i < attrs.length; i++) {

            let elem = attrs[i].elem;

            if(!document.documentElement.contains(elem)) continue;
            if(isSkippedForAttributes(elem))             continue;

            translateAttribute(elem, attrs[i].name);

        }

    }

    function cancelScheduled() {

        if(frameHandle !== 0) {
            window.cancelAnimationFrame(frameHandle);
            frameHandle = 0;
        }

        if(timeoutHandle !== 0) {
            window.clearTimeout(timeoutHandle);
            timeoutHandle = 0;
        }

    }

    /*  The flush is raced between an animation frame, which applies the translation
        before the browser paints, and a timeout, which still fires in a background
        tab where animation frames are suspended. The first one to run cancels the
        other, so a batch is always processed exactly once. */
    function schedule() {

        if(frameHandle !== 0 || timeoutHandle !== 0) return;

        let run = guard('flush', function() {
            cancelScheduled();
            flush();
        });

        if(typeof window.requestAnimationFrame === 'function') frameHandle = window.requestAnimationFrame(run);

        timeoutHandle = window.setTimeout(run, 0);

    }

    function onMutations(records) {

        for(let i = 0; i < records.length; i++) {

            let record = records[i];

            if(record.type === 'attributes') {

                if(record.attributeName === null) continue;
                pendingAttrs.push({ elem : record.target, name : record.attributeName });

            } else if(record.type === 'characterData') {

                pendingNodes.push(record.target);

            } else {

                let added = record.addedNodes;
                for(let j = 0; j < added.length; j++) {
                    let node = added[j];
                    if(node.nodeType === 1 || node.nodeType === 3) pendingNodes.push(node);
                }

            }

        }

        /*  Should the queue ever run away (a hidden tab does not run animation frames)
            it is collapsed into a single full sweep instead of growing without bound. */
        if(pendingNodes.length > MAX_PENDING) pendingNodes = [document.documentElement];

        if(pendingAttrs.length > MAX_PENDING) {
            pendingAttrs = [];
            pendingNodes = [document.documentElement];
        }

        if(pendingNodes.length > 0 || pendingAttrs.length > 0) schedule();

    }

    function observe() {

        let filter = ATTRIBUTES.slice();
        filter.push('value');

        observer = new MutationObserver(guard('mutation', onMutations));

        observer.observe(document.documentElement, {
            childList      : true,
            subtree        : true,
            characterData  : true,
            attributes     : true,
            attributeFilter : filter
        });

    }


    /*  LANGUAGE SWITCHER
        ----------------------------------------------------------------------------- */

    function setLanguage(code) {

        let target = normalize(code);

        if(target === null)     return false;
        if(target === language) return false;

        writeStorage(target);

        window.location.href = updateParameter(String(window.location.href), PARAMETER, target);

        return true;

    }

    /*  #themes is a narrow flex row already holding the theme label and the theme
        selector. The language pair gets its own line inside that row, squeezing it in
        next to the theme selector would shrink both of them below a usable width. */
    function createSelectSwitcher(host) {

        let row = document.createElement('span');
        row.className = 'uilang-row';
        row.setAttribute('data-i18n-skip', '');

        let label = document.createElement('span');
        label.className = 'uilang-label';
        label.appendChild(document.createTextNode('Language:'));

        let select = document.createElement('select');
        select.setAttribute('id', 'uilang-selector');
        select.setAttribute('data-i18n-skip', '');
        select.className = 'button';

        for(let i = 0; i < LANGUAGES.length; i++) {
            let option = document.createElement('option');
            option.setAttribute('value', LANGUAGES[i]);
            option.appendChild(document.createTextNode(LABELS[LANGUAGES[i]]));
            select.appendChild(option);
        }

        select.value = language;

        select.addEventListener('change', guard('switcher', function() {
            setLanguage(select.value);
        }));

        row.appendChild(label);
        row.appendChild(select);

        host.appendChild(row);

    }

    function createDropdownSwitcher(host, before) {

        let control = document.createElement('div');
        control.setAttribute('id', 'uilang-selector');
        control.setAttribute('data-i18n-skip', '');
        control.className = 'uilang-control';

        let button = document.createElement('div');
        button.className = 'button uilang-button';
        button.setAttribute('title', 'Language');
        button.appendChild(document.createTextNode(LABELS[language]));

        let menu = document.createElement('div');
        menu.className = 'uilang-menu';

        for(let i = 0; i < LANGUAGES.length; i++) {

            let code   = LANGUAGES[i];
            let option = document.createElement('div');

            option.className = (code === language) ? 'uilang-option selected' : 'uilang-option';
            option.setAttribute('data-uilang', code);
            option.appendChild(document.createTextNode(LABELS[code]));

            option.addEventListener('click', guard('switcher', function(event) {
                event.stopPropagation();
                control.classList.remove('uilang-open');
                setLanguage(code);
            }));

            menu.appendChild(option);

        }

        button.addEventListener('click', guard('switcher', function(event) {
            event.stopPropagation();
            control.classList.toggle('uilang-open');
        }));

        document.addEventListener('click', guard('switcher', function() {
            control.classList.remove('uilang-open');
        }));

        control.appendChild(button);
        control.appendChild(menu);

        if(before !== null && before.parentNode === host) host.insertBefore(control, before);
        else                                             host.appendChild(control);

    }

    function createSwitcher() {

        if(!installed)                                          return;
        if(!showSwitcher)                                       return;
        if(document.body === null)                              return;
        if(document.getElementById('uilang-selector') !== null)  return;

        let themes = document.getElementById('themes');

        if(themes !== null) {
            createSelectSwitcher(themes);
            return;
        }

        let toolbar = document.getElementById('header-toolbar');

        if(toolbar !== null) {
            createDropdownSwitcher(toolbar, document.getElementById('header-avatar'));
            return;
        }

        let floating = document.createElement('div');
        floating.setAttribute('id', 'uilang-floating');
        floating.setAttribute('data-i18n-skip', '');

        document.body.appendChild(floating);

        createDropdownSwitcher(floating, null);

    }


    /*  INITIALISATION
        ----------------------------------------------------------------------------- */

    function onReady(callback) {
        if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', guard('ready', callback));
        else                                  guard('ready', callback)();
    }

    function sweep() {

        deferred = false;

        translateNode(document.documentElement);

        let title = document.title;

        if(typeof title === 'string' && title !== '') {
            let translation = translateString(title);
            if(translation !== null && translation !== title.trim()) document.title = translation;
        }

    }

    function publish() {

        window.plmxI18n = {

            lang      : language,
            available : available.slice(),

            t : guard('t', function(text) {
                let translation = translateString(text);
                return (translation === null) ? text : translation;
            }),

            setLanguage : guard('setLanguage', function(code) {
                return setLanguage(code);
            }),

            translateNow : guard('translateNow', function(root) {
                if(!active) return false;
                let target = root;
                if(target === undefined || target === null) target = document.body;
                if(typeof target === 'object' && typeof target.jquery === 'string') target = target.get(0);
                if(target === undefined || target === null) return false;
                deferred = false;
                translateNode(target);
                return true;
            }),

            missing : guard('missing', function() {
                return listMissing();
            }),

            exportMissing : guard('exportMissing', function() {
                if(!active) {
                    console.warn('plmx-i18n : nothing to export, the user interface is shown in English');
                    return 0;
                }
                return exportMissing();
            }),

            stats : guard('stats', function() {
                return {
                    lang       : language,
                    dictSize   : Object.keys(dictionary).length,
                    translated : translated,
                    missing    : (missingStrings === null) ? 0 : missingStrings.size
                };
            }),

            addSkipSelector : guard('addSkipSelector', function(selector) {
                return addSkipSelector(selector);
            })

        };

    }

    function initialize() {

        installed    = (window.PLMX_I18N !== undefined && window.PLMX_I18N !== null && typeof window.PLMX_I18N === 'object');
        dictionaries = installed ? window.PLMX_I18N : {};

        /*  Optional server side settings block, injected by the layout from
            settings.js / settings/custom.js. Absent settings keep the defaults. */
        let settings = window.PLMX_I18N_SETTINGS;

        if(settings !== undefined && settings !== null && typeof settings === 'object') {
            if(settings.showSwitcher   === false) showSwitcher   = false;
            if(settings.collectMissing === false) collectMissing = false;
        }

        for(let i = 0; i < LANGUAGES.length; i++) {
            let code = LANGUAGES[i];
            if(code === 'en') continue;
            let entries = dictionaries[code];
            if(entries === undefined || entries === null || typeof entries !== 'object') continue;
            if(Object.keys(entries).length === 0) continue;
            available.push(code);
        }

        language = resolveLanguage();

        if(language !== 'en' && available.indexOf(language) < 0) language = 'en';

        active = (language !== 'en');

        publish();

        if(!active) {
            onReady(createSwitcher);
            return;
        }

        dictionary = dictionaries[language];

        if(Array.isArray(window.PLMX_I18N_SKIP)) {
            for(let i = 0; i < window.PLMX_I18N_SKIP.length; i++) addSkipSelector(window.PLMX_I18N_SKIP[i]);
        }

        missingStrings = collectMissing ? new Map() : null;
        writtenText    = new WeakMap();
        writtenAttr    = new WeakMap();
        pendingNodes   = [];
        pendingAttrs   = [];
        deferred       = (document.readyState === 'loading');

        document.documentElement.setAttribute('lang', language);

        observe();

        onReady(function() {
            sweep();
            createSwitcher();
        });

    }

    try {
        initialize();
    } catch(error) {
        warn('initialisation failed, the user interface stays in English', error);
        if(window.plmxI18n === undefined) {
            window.plmxI18n = {
                lang            : 'en',
                available       : ['en'],
                t               : function(text) { return text; },
                setLanguage     : function() { return false; },
                translateNow    : function() { return false; },
                missing         : function() { return []; },
                exportMissing   : function() { return 0; },
                stats           : function() { return { lang : 'en', dictSize : 0, translated : 0, missing : 0 }; },
                addSkipSelector : function() { return false; }
            };
        }
    }

})();
