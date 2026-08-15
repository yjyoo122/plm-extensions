/*  IN-APP ACCESS TO THE SETUP WIZARD
    -----------------------------------------------------------------------------
    Adds a control opening /setup in a new browser tab, so that the connection
    settings of this server can be changed without typing an address or touching a
    terminal.

    The wizard writes files on the server's file system and therefore rejects every
    request which does not come from the machine running the server (see the guard
    in routes/setup.js). The control must not show up at all when this server is
    reached remotely, which is why availability is probed instead of being rendered
    server side : /setup/status answers 200 on loopback and 403 everywhere else.
    The result is cached in sessionStorage so that only the first page of a session
    pays for the probe.

    Two hosts are supported :
      - #header-toolbar  : a gear button is injected right before #header-avatar
      - #setup-link-landing : the entry of the landing page, rendered hidden by
        landing.pug and unhidden here

    Nothing happens on pages without either host, and every step is wrapped so that
    a failure can only ever produce a console warning - a broken settings link must
    never take down a working application.
    ----------------------------------------------------------------------------- */

(function() {

    const STORAGE_KEY = 'plmx-setup-available';
    const LABEL       = 'Server Settings';
    const TOOLTIP     = 'Open the setup wizard to change tenant or connection settings';
    const THEMES      = ['light', 'dark', 'black', 'fusion'];


    /*  ERROR CONTAINMENT
        ----------------------------------------------------------------------------- */

    function guard(name, callback) {

        return function() {

            try {
                return callback.apply(this, arguments);
            } catch(error) {
                console.warn('plmx-setup-link : ' + name + ' failed - ' + error.message);
            }

        };

    }


    /*  PROBE & RESULT CACHE
        -----------------------------------------------------------------------------
        sessionStorage is not available in every context (private mode, sandboxed
        frames). Losing the cache only costs one additional request per page, so a
        failing storage is silently treated as 'nothing cached yet'. */

    function readCache() {

        try {
            return window.sessionStorage.getItem(STORAGE_KEY);
        } catch(error) {
            return null;
        }

    }

    function writeCache(value) {

        try {
            window.sessionStorage.setItem(STORAGE_KEY, value);
        } catch(error) {
            return;
        }

    }

    function probe(callback) {

        let cached = readCache();

        if(cached === 'yes') return callback(true);
        if(cached === 'no')  return callback(false);

        $.ajax({
            url      : '/setup/status',
            method   : 'GET',
            dataType : 'json',
            cache    : false
        }).done(guard('probe', function() {
            writeCache('yes');
            callback(true);
        })).fail(guard('probe', function() {
            writeCache('no');
            callback(false);
        }));

    }


    /*  OPENING THE WIZARD
        -----------------------------------------------------------------------------
        The wizard is opened in a new tab so that the application screen the user was
        working on stays untouched. The current theme is handed over only when it is
        one of the four known ones : routes/setup.js falls back to 'dark' for any
        unknown value, which would look wrong on a light installation. */

    function getWizardUrl() {

        let url = '/setup';

        if(typeof window.theme === 'string') {
            if(THEMES.indexOf(window.theme.toLowerCase()) > -1) url += '?theme=' + encodeURIComponent(window.theme.toLowerCase());
        }

        return url;

    }

    function openWizard() {

        let opened = window.open(getWizardUrl(), '_blank');

        if(opened === null)             return;
        if(typeof opened !== 'object')  return;

        try {
            opened.opener = null;
        } catch(error) {
            return;
        }

    }


    /*  TRANSLATION OF THE INJECTED CONTROL
        -----------------------------------------------------------------------------
        The engine of i18n.js watches the document with a MutationObserver, so the
        injected button gets picked up on its own. Translating it right away avoids
        one frame of english text and keeps this working should the observer ever be
        switched off. */

    function translate(elements) {

        if(typeof window.plmxI18n                 === 'undefined') return;
        if(typeof window.plmxI18n.translateNow    !== 'function')  return;

        window.plmxI18n.translateNow(elements);

    }


    /*  CONTROL IN THE APPLICATION HEADER
        -----------------------------------------------------------------------------
        The gear button is wrapped into a container which does NOT carry the class
        'button' : several applications address their own header buttons with
        $('#header-toolbar').children('.button') and trigger .first().click() on
        them. The wrapper keeps this control out of every one of those selections. */

    function insertHeaderButton() {

        let elemToolbar = $('#header-toolbar');

        if(elemToolbar.length === 0)    return;
        if($('#setup-link').length > 0) return;

        let elemControl = $('<div></div>')
            .attr('id', 'setup-link')
            .addClass('setup-link-control');

        $('<div></div>')
            .addClass('button').addClass('icon').addClass('icon-settings')
            .attr('title', TOOLTIP)
            .attr('aria-label', LABEL)
            .click(guard('click', function() { openWizard(); }))
            .appendTo(elemControl);

        let elemAvatar = elemToolbar.children('#header-avatar');

        if(elemAvatar.length > 0) elemControl.insertBefore(elemAvatar);
        else                      elemControl.appendTo(elemToolbar);

        translate(elemControl);

    }


    /*  ENTRY OF THE LANDING PAGE
        -----------------------------------------------------------------------------
        landing.pug renders this entry hidden. Keeping it in the template lets it be
        styled and translated like its siblings, unhiding it here keeps it invisible
        whenever the wizard is not reachable. */

    function showLandingButton() {

        let elemButton = $('#setup-link-landing');

        if(elemButton.length === 0) return;

        elemButton
            .removeClass('hidden')
            .click(guard('click', function() { openWizard(); }));

    }


    /*  INITIALISATION
        ----------------------------------------------------------------------------- */

    function install() {

        insertHeaderButton();
        showLandingButton();

    }

    function start() {

        if($('#header-toolbar').length === 0) {
            if($('#setup-link-landing').length === 0) return;
        }

        probe(guard('install', function(available) {
            if(available) install();
        }));

    }

    if(typeof jQuery === 'undefined') {
        console.warn('plmx-setup-link : jQuery is not available, the settings link is not installed');
        return;
    }

    $(document).ready(guard('ready', start));

})();
