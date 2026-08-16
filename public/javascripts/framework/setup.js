/*  SETUP WIZARD
    ---------------------------------------------------------------------------
    Drives the first run wizard served by routes/setup.js. The page is fully
    standalone : it does not load the application framework as none of the
    connection settings the framework relies on exist yet at this point.
   --------------------------------------------------------------------------- */

let setupStatus       = {};
let setupWorkspaces   = [];
let setupRows         = [];
let setupStep         = 1;
let setupDiscovered   = false;
let setupSaving       = false;
let setupSecretMask   = '********';
let setupStashKey     = 'plmx-setup-stash';
let setupPollHandle   = null;
let setupPollState    = 'down';
let setupPollAttempts = 0;
let setupSavedTenant  = '';
let setupSavedClientId = '';
let setupProfiles     = [];
let setupDefaultEntry = null;
let setupOverwrite    = '';
let setupAdminTest    = 0;


$(document).ready(function() {

    applyTheme((typeof theme === 'undefined') ? 'dark' : theme);

    bindEvents();
    loadStatus();

});


/*  INITIALISATION
/* ----------------------------------------------------------------------------- */
function loadStatus() {

    $.ajax({
        url      : '/setup/status',
        dataType : 'json'
    }).done(function(response) {

        setupStatus = response;

        $('#tenant'             ).val(response.tenant);
        $('#client-id'          ).val(response.clientId);
        $('#redirect-uri'       ).val((response.redirectUri === '') ? response.suggestedRedirectUri : response.redirectUri);
        $('#default-theme'      ).val(response.defaultTheme);
        $('#ui-language'        ).val(response.uiLanguage);
        $('#admin-client-id'    ).val(response.adminClientId);
        $('#admin-client-secret').val(response.adminClientSecret);
        $('#vault-gateway'      ).val(response.vaultGateway);
        $('#vault-name'         ).val(response.vaultName);

        if(response.adminClientId !== '') $('#disclosure-advanced').addClass('open');
        if(response.vaultGateway  !== '') $('#disclosure-advanced').addClass('open');

        restoreStash();
        updateCallbackDisplay();
        updateTenantLink();
        validateConnection();
        updateHeaderState();
        updateAuthState();
        updateSaveMode();
        updateSummary();

        loadProfiles();

        goToStep(getInitialStep());

    }).fail(function() {

        $('#header-state').addClass('visible warning').text('The current configuration could not be read from this server. You can still fill in the form below.');

        goToStep(1);

    });

}
function getInitialStep() {

    if(!setupStatus.tenantSet)   return 1;
    if(!setupStatus.clientIdSet) return 1;

    return 5;

}
function bindEvents() {

    $('.step').click(function() {
        goToStep(parseInt($(this).attr('data-step'), 10));
    });

    $('[data-goto]').click(function() {

        let target = parseInt($(this).attr('data-goto'), 10);

        if($(this).hasClass('disabled')) return;
        if(($(this).attr('id') === 'next-connect') && (!validateConnection(true))) return;

        goToStep(target);

    });

    $('#copy-callback').click(function() {
        copyToClipboard($('#callback-display').val());
    });

    $('#tenant').on('input', function() {
        updateTenantLink();
        validateConnection();
        updateAuthState();
        updateProfileWorkspaces();
        updateSummary();
    });

    $('#client-id').on('input', function() {
        validateConnection();
        updateAuthState();
        updateSummary();
    });

    $('#redirect-uri').on('input', function() {
        updateCallbackDisplay();
        validateConnection();
        updateSummary();
    });

    $('#default-theme').change(function() {
        applyTheme($(this).val());
        updateSummary();
    });

    $('#ui-language').change(function() {
        applyLanguage($(this).val());
        updateSummary();
    });

    $('#admin-client-id, #vault-gateway, #vault-name').on('input', function() {
        updateSummary();
    });

    // A result shown for one pair of values must never stay on screen for another one.
    // The counter makes an answer which is still on its way belong to the values it was
    // asked for : editing a field bumps it, and the late answer is then dropped instead
    // of being written over the values the user has just corrected.
    $('#admin-client-id, #admin-client-secret').on('input', function() {
        setupAdminTest++;
        $('#result-admin').removeClass('visible ok error busy').text('');
        setFieldError('admin-client-id'    , '', false);
        setFieldError('admin-client-secret', '', false);
    });

    $('#test-admin').click(function() {
        if($(this).hasClass('disabled')) return;
        testAdminCredentials();
    });

    $('#toggle-advanced').click(function() {
        $('#disclosure-advanced').toggleClass('open');
    });

    $('#check-tenant').click(function() {
        checkTenant();
    });

    $('#sign-in').click(function() {
        if($(this).hasClass('disabled')) return;
        stashInput();
        window.location.href = '/setup/login';
    });

    $('#discover').click(function() {
        if($(this).hasClass('disabled')) return;
        discoverWorkspaces();
    });

    $('#save').click(function() {
        if($(this).hasClass('disabled')) return;
        save();
    });

    $('input[name="save-mode"]').change(function() {
        // A name typed for one profile must not be carried over to the next save without the
        // user seeing it again, so the confirmation to replace is dropped on every switch.
        setupOverwrite = '';
        updateSaveMode();
        updateSummary();
    });

    $('#profile-name').on('input', function() {
        setupOverwrite = '';
        validateProfileName();
        updateProfileWorkspaces();
        updateSummary();
    });

    // The translation engine adds its own floating language switcher to every page and
    // reloads the page when it is used. Stashing on every navigation away from here -
    // not only when the language dropdown of the wizard itself is used - keeps whatever
    // has been typed so far. Nothing is stashed once saving succeeded, the settings then
    // come from the server again.
    $(window).on('beforeunload', function() {
        if(setupSaving) return;
        stashInput();
    });

}


/*  NAVIGATION
/* ----------------------------------------------------------------------------- */
function goToStep(step) {

    if(isNaN(step)) step = 1;
    if(step < 1)    step = 1;
    if(step > 6)    step = 6;

    setupStep = step;

    $('.step').removeClass('active done');
    $('.panel').removeClass('active');

    $('.step').each(function() {
        let number = parseInt($(this).attr('data-step'), 10);
        if(number  <  step) $(this).addClass('done');
        if(number === step) $(this).addClass('active');
    });

    $('.panel[data-step="' + step + '"]').addClass('active');
    $('#panels').scrollTop(0);

    if(step === 5) updateAuthState();
    if(step === 6) updateSummary();

}


/*  CONNECTION SETTINGS
/* ----------------------------------------------------------------------------- */
function normalizeTenant(value) {

    let tenant = $.trim(String(value));

    if(tenant === '') return '';

    tenant = tenant.replace(/^[a-z]+:\/\//i, '');
    tenant = tenant.split('/')[0];
    tenant = tenant.split('?')[0];
    tenant = tenant.split(':')[0];

    if(tenant.toLowerCase().indexOf('.autodeskplm360.net') > -1) {
        tenant = tenant.substring(0, tenant.toLowerCase().indexOf('.autodeskplm360.net'));
    }

    return $.trim(tenant.split('.')[0]);

}
function validateConnection(showAll) {

    let tenant   = normalizeTenant($('#tenant').val());
    let clientId = $.trim(String($('#client-id').val()));
    let redirect = $.trim(String($('#redirect-uri').val()));
    let valid    = true;

    setFieldError('tenant', '', showAll);
    setFieldError('client-id', '', showAll);
    setFieldError('redirect-uri', '', showAll);

    if(tenant === '') {
        valid = false;
        if(showAll) setFieldError('tenant', 'Please provide the name of your Fusion Manage tenant.', true);
    } else if(!/^[A-Za-z0-9-]+$/.test(tenant)) {
        valid = false;
        setFieldError('tenant', 'The tenant name may only contain letters, digits and dashes.', true);
    }

    if(clientId === '') {
        valid = false;
        if(showAll) setFieldError('client-id', 'Please paste the Client ID of your APS application.', true);
    } else if(/\s/.test(clientId)) {
        valid = false;
        setFieldError('client-id', 'The Client ID must not contain spaces. Please paste it again.', true);
    } else if(clientId.length < 8) {
        valid = false;
        setFieldError('client-id', 'This Client ID looks too short. Please paste the complete value.', true);
    }

    if(!/^https?:\/\/[A-Za-z0-9_.-]+(:[0-9]{1,5})?\/callback$/.test(redirect)) {
        valid = false;
        setFieldError('redirect-uri', 'The Callback URL must look like http://localhost:8080/callback and must end with /callback.', true);
    }

    if(valid) $('#next-connect').removeClass('disabled');
    else      $('#next-connect').addClass('disabled');

    return valid;

}
function setFieldError(field, message, visible) {

    let elem = $('#error-' + field);

    if((message === '') || (!visible)) {
        elem.removeClass('visible').text('');
        $('#' + field).removeClass('invalid');
        return;
    }

    elem.addClass('visible').text(message);
    $('#' + field).addClass('invalid');

}
function updateCallbackDisplay() {

    let redirect = $.trim(String($('#redirect-uri').val()));

    if(redirect === '') redirect = setupStatus.suggestedRedirectUri;

    $('#callback-display').val(redirect);

}
function updateTenantLink() {

    let tenant = normalizeTenant($('#tenant').val());
    let link   = $('#link-settings');

    if((tenant === '') || (!/^[A-Za-z0-9-]+$/.test(tenant))) {
        link.addClass('disabled').removeAttr('href');
        $('#hint-settings').text('Enter your tenant name in the next step to activate this link.');
        return;
    }

    link.removeClass('disabled').attr('href', 'https://' + tenant + '.autodeskplm360.net/admin#section=setuphome&tab=general&item=configparams');
    setSplitMessage($('#hint-settings'), 'This opens the General Settings of the tenant', tenant, 'in a new tab. You need administrator rights there.');

}
/*  The i18n layer matches whole text nodes, so a sentence built by concatenating a
    runtime value would never match a dictionary entry. Emitting the fixed halves as
    their own text nodes keeps both of them translatable, while the value itself sits
    in a skipped span so a tenant named like a UI label never gets translated too.   */
function setSplitMessage(elem, textBefore, value, textAfter) {

    elem.empty();
    elem.append(document.createTextNode(textBefore + ' '));
    elem.append($('<span></span>').attr('data-i18n-skip', '').text(value));

    /*  A trailing part which already starts with punctuation must sit tight against
        the value, otherwise Japanese and Korean render a gap in front of the stop.  */
    elem.append(document.createTextNode((/^[.,;:!?]/.test(textAfter) ? '' : ' ') + textAfter));

}
function updateHeaderState() {

    let elem = $('#header-state').removeClass('visible warning ok');

    if(!setupStatus.tenantSet || !setupStatus.clientIdSet) {
        elem.addClass('visible warning').text('This server has no connection settings yet. Work through the steps below, then save.');
        return;
    }

    elem.addClass('visible ok');
    setSplitMessage(elem, 'This server is configured for the tenant', setupStatus.tenant, '. You can change the settings here at any time.');

}


/*  TENANT PROFILES

    A profile is one more pair of configuration files describing another tenant.
    The wizard always edits the profile the server was STARTED with - which the
    header names, so nobody edits the wrong tenant by accident - and can write a
    new profile next to it. Choosing between profiles happens in the launcher,
    not here : a running server cannot swap its own connection settings.
/* ----------------------------------------------------------------------------- */
function loadProfiles() {

    $.ajax({
        url      : '/setup/profiles',
        dataType : 'json'
    }).done(function(response) {

        setupProfiles     = Array.isArray(response.profiles) ? response.profiles : [];
        setupDefaultEntry = ((typeof response.defaultEntry === 'object') && (response.defaultEntry !== null)) ? response.defaultEntry : null;

        updateProfileHeader(response);
        renderProfileList();
        validateProfileName();
        updateProfileWorkspaces();

    }).fail(function() {

        setupProfiles     = [];
        setupDefaultEntry = null;

        updateProfileHeader(null);
        renderProfileList();

    });

}
function updateProfileHeader(response) {

    let elem = $('#header-profile').empty();

    if(response === null) return;

    if(response.usingDefault) {

        if(setupProfiles.length === 0) return;

        elem.text('You are editing the default settings in environment.js. ' + setupProfiles.length + ' tenant profile(s) exist next to it. Use the list further down on this page to switch between them.');

        return;

    }

    elem.text('You are editing the tenant profile ' + response.active + ' in environments/' + response.active + '.js. Everything saved here applies to that profile only.');

}
/*  The list used the same two column layout as the summary table above it, a quiet label
    next to a quiet value. Two names sitting side by side with no heading read as two
    separate tenants rather than as one entry - the name the user chose and the tenant it
    points at. Every entry is now one bordered card that names both roles explicitly, the
    entry currently running carries a badge, and the default connection settings appear in
    the same list because the launcher offers them as a choice just like a profile.       */
function renderProfileList() {

    let list    = $('#profile-list').empty();
    let entries = [];

    if(setupDefaultEntry !== null) entries.push(setupDefaultEntry);

    for(let profile of setupProfiles) entries.push(profile);

    if(entries.length === 0) {
        list.append($('<div></div>').addClass('field-hint').text('No tenant profile exists yet. Save one below to keep a second tenant next to this one, then switch between them from here.'));
        return;
    }

    for(let entry of entries) {

        let card = $('<div></div>').addClass('profile-card');
        let head = $('<div></div>').addClass('profile-card-head');

        if(entry.active) card.addClass('active');

        // data-i18n-skip keeps the translation engine away from the names the user chose
        // and from the tenant names of their customers.
        head.append($('<div></div>').addClass('profile-name').attr('data-i18n-skip', '').text(entry.name));

        if(entry.isDefault) head.append($('<div></div>').addClass('profile-tag').text('default settings'));

        if(entry.active) head.append($('<div></div>').addClass('profile-badge').text('running right now'));

        card.append(head);

        let line = $('<div></div>').addClass('profile-tenant');

        line.append($('<span></span>').addClass('profile-tenant-label').text('Fusion Manage tenant'));

        if(!entry.readable) {
            line.append($('<span></span>').addClass('profile-warning').text('this file cannot be read, please open it in Notepad and compare it with environments/template.js'));
        } else if(entry.tenant === '') {
            line.append($('<span></span>').addClass('profile-warning').text('no tenant is set in this file yet'));
        } else {
            line.append($('<span></span>').addClass('profile-tenant-name').attr('data-i18n-skip', '').text(entry.tenant));
        }

        /*  Switching is done here rather than in the launcher window : that window is not where a
            non-technical user should be making decisions. The button records the choice and the
            server restarts itself onto it, exactly like saving the connection settings does.     */
        if(!entry.active) {

            head.append($('<div></div>')
                .addClass('button').addClass('profile-switch')
                .attr('data-profile', entry.isDefault ? '' : entry.name)
                .text('Switch to this tenant')
                .click(function() { activateProfile($(this).attr('data-profile'), $(this)); }));

            //  The default settings are not a file this wizard created and are never deleted.
            if(!entry.isDefault) {
                head.append($('<div></div>')
                    .addClass('button').addClass('profile-delete')
                    .attr('data-profile', entry.name)
                    .attr('title', 'Delete this tenant profile')
                    .text('Delete')
                    .click(function() { deleteProfile($(this).attr('data-profile'), $(this)); }));
            }

        }

        card.append(line);

        /*  Two entries on the same tenant are almost always a slip : the tenant field was left
            as it was while only the profile name got changed. Nothing is broken by it, but the
            launcher would then offer two entries that reach the same place, so it is said out
            loud here rather than left for the user to spot by comparing names.                */
        if(entry.readable && (entry.tenant !== '')) {

            let twins = [];

            for(let other of entries) {
                if(other === entry)             continue;
                if(other.tenant !== entry.tenant) continue;
                twins.push(other.name);
            }

            if(twins.length > 0) {
                let note = $('<div></div>').addClass('profile-note');
                note.append($('<span></span>').text('This points at the same tenant as'));
                note.append($('<span></span>').attr('data-i18n-skip', '').text(' ' + twins.join(', ')));
                card.append(note);
            }

        }

        list.append(card);

    }

}
function deleteProfile(profile, elemButton) {

    if(setupSaving) return;

    /*  Asked once, in the button itself, rather than through a confirm dialog : the files are
        backed up next to the originals anyway, and a dialog on a page the user is still
        learning their way around is one more thing to be unsure about.                      */
    if(elemButton.attr('data-armed') !== '1') {
        $('.profile-delete').removeAttr('data-armed').removeClass('armed').text('Delete');
        elemButton.attr('data-armed', '1').addClass('armed').text('Really delete?');
        return;
    }

    setupSaving = true;
    $('.profile-switch, .profile-delete').addClass('disabled');
    elemButton.text('Deleting ...');

    $.ajax({
        url         : '/setup/profile-delete',
        method      : 'POST',
        contentType : 'application/json',
        dataType    : 'json',
        data        : JSON.stringify({ profile : profile })
    }).done(function(response) {

        setupSaving = false;

        $('#restart-info').addClass('visible').empty()
            .append($('<div></div>').append(
                $('<span></span>').text('The tenant profile was deleted. A copy of both files was kept next to the originals :'),
                $('<span></span>').attr('data-i18n-skip', '').text(' ' + (response.files || []).join(', '))
            ));

        loadProfiles();
        validateProfileName();

    }).fail(function(xhr) {

        setupSaving = false;
        $('.profile-switch, .profile-delete').removeClass('disabled');

        let message = 'The tenant could not be deleted.';

        if(xhr && xhr.responseJSON && xhr.responseJSON.message) message = xhr.responseJSON.message;

        $('#restart-info').addClass('visible').empty().append($('<div></div>').addClass('error').text(message));

        loadProfiles();

    });

}
function activateProfile(profile, elemButton) {

    if(setupSaving) return;

    setupSaving = true;

    $('.profile-switch').addClass('disabled');
    elemButton.text('Switching ...');

    $.ajax({
        url         : '/setup/activate',
        method      : 'POST',
        contentType : 'application/json',
        dataType    : 'json',
        data        : JSON.stringify({ profile : profile })
    }).done(function(response) {

        let info = $('#restart-info').addClass('visible').empty();

        if(!response.supervised) {
            setupSaving = false;
            $('.profile-switch').removeClass('disabled');
            renderProfileList();
            info.append($('<div></div>').text('The tenant was recorded, but this server was not started by the Windows launcher, so it cannot restart itself. Please close the console window of the server and start the application again.'));
            return;
        }

        info.append($('<div></div>').attr('id', 'restart-state').text('Switching tenant. This page reloads automatically as soon as the server is back, usually within a few seconds. Please leave the console window of the server open.'));

        /*  The active profile reported by /setup/status is what proves the server came back on
            the tenant that was just chosen. Comparing the tenant name would not do : two
            profiles are allowed to point at the same tenant, and then it never changes.
            Back to the wizard rather than to the applications, because the workspace ids of
            the tenant just switched to usually still have to be discovered.                  */
        startPolling(function(status) {
            return (String(status.profile) === String(profile));
        }, '/setup');

    }).fail(function(xhr) {

        setupSaving = false;
        $('.profile-switch').removeClass('disabled');

        let message = 'The tenant could not be switched.';

        if(xhr && xhr.responseJSON && xhr.responseJSON.message) message = xhr.responseJSON.message;

        $('#restart-info').addClass('visible').empty().append($('<div></div>').addClass('error').text(message));

        renderProfileList();

    });

}
function isNewProfileMode() {

    return ($('#save-mode-profile').is(':checked'));

}
function updateSaveMode() {

    let profileMode = isNewProfileMode();

    if(profileMode) $('#profile-block').show();
    else            $('#profile-block').hide();

    $('#save').text(profileMode ? 'Save the tenant profile' : 'Save and restart');

    setFieldError('profile-name', '', false);

    if(profileMode) {
        validateProfileName();
        updateProfileWorkspaces();
    }

}
function getProfileName() {

    return $.trim(String($('#profile-name').val()));

}
function findProfile(name) {

    for(let profile of setupProfiles) {
        if(String(profile.name).toLowerCase() === String(name).toLowerCase()) return profile;
    }

    return null;

}
function validateProfileName(showAll) {

    let name = getProfileName();

    setFieldError('profile-name', '', false);

    if(!isNewProfileMode()) return true;

    if(name === '') {
        if(showAll) setFieldError('profile-name', 'Please give the new tenant profile a name.', true);
        return false;
    }

    if(!/^[A-Za-z0-9_-]+$/.test(name)) {
        setFieldError('profile-name', 'A profile name may only contain the letters a to z, digits, dashes and underscores. It becomes the name of two files.', true);
        return false;
    }

    if(name.length > 40) {
        setFieldError('profile-name', 'A profile name must not be longer than 40 characters.', true);
        return false;
    }

    if(findProfile(name) !== null) {
        setFieldError('profile-name', 'A tenant profile with this name exists already. Saving replaces it, and you will be asked to confirm that first.', true);
        return true;
    }

    return true;

}
function updateProfileWorkspaces() {

    let message = $('#profile-workspaces').removeClass('ok error').removeClass('visible');
    let tenant  = normalizeTenant($('#tenant').val());

    if(!isNewProfileMode()) return;

    message.addClass('visible');

    /*  Workspace ids are numbered per tenant, so the ids on this page belong to the tenant this
        server is connected to and to no other one. They are only written into the new profile when
        it describes that very tenant. In every other case the profile starts with all ids at 0 and
        the discovery has to be run again after switching - which is what this says, before saving. */
    if(setupDiscovered && (tenant === setupStatus.tenant) && (tenant !== '')) {
        message.addClass('ok').text('The workspace ids you discovered above belong to this tenant and will be written into the profile.');
        return;
    }

    message.text('The new profile starts with all workspace ids set to 0, because workspace ids are numbered per tenant and the ones on this page belong to the tenant this server is connected to. Save the profile, switch to it in the list below, then come back to step 5 and run Discover workspaces. Until that is done the applications open with empty lists.');

}


/*  TENANT CHECK
/* ----------------------------------------------------------------------------- */
function checkTenant() {

    let tenant = normalizeTenant($('#tenant').val());
    let result = $('#result-tenant').removeClass('ok error').addClass('visible busy');

    if(tenant === '') {
        result.removeClass('busy').addClass('error').text('Please provide your tenant name in step 2 first.');
        return;
    }

    result.text('Checking https://' + tenant + '.autodeskplm360.net ...');

    $.ajax({
        url      : '/setup/check-tenant',
        data     : { tenant : tenant },
        dataType : 'json'
    }).done(function(response) {

        result.removeClass('busy');

        if(response.resolved && response.reachable) result.addClass('ok').text(response.message);
        else if(response.resolved)                  result.addClass('error').text(response.message);
        else                                        result.addClass('error').text(response.message);

    }).fail(function() {
        result.removeClass('busy').addClass('error').text('The check could not be run. Please make sure this server still runs and try again.');
    });

}


/*  ADMIN CREDENTIALS TEST
/* ----------------------------------------------------------------------------- */
function testAdminCredentials() {

    let clientId = $.trim(String($('#admin-client-id').val()));
    let secret   = String($('#admin-client-secret').val());
    let button   = $('#test-admin');
    let result   = $('#result-admin').addClass('visible busy').removeClass('ok error');

    setFieldError('admin-client-id'    , '', false);
    setFieldError('admin-client-secret', '', false);

    if(clientId === '') {
        result.removeClass('busy').addClass('error').text('Please provide the Admin Client ID of your second APS app before testing.');
        setFieldError('admin-client-id', 'Please provide the Admin Client ID of your second APS app before testing.', true);
        return;
    }

    if(secret === '') {
        result.removeClass('busy').addClass('error').text('Please provide the Admin Client Secret of your second APS app before testing.');
        setFieldError('admin-client-secret', 'Please provide the Admin Client Secret of your second APS app before testing.', true);
        return;
    }

    result.text('Asking Autodesk for a server token ...');

    button.addClass('disabled');

    let attempt = ++setupAdminTest;

    // The secret leaves this page exactly once, in this request, and is never returned.
    // When it still shows the mask, the server tests the secret it already has instead.
    $.ajax({
        url         : '/setup/test-admin',
        type        : 'POST',
        contentType : 'application/json',
        data        : JSON.stringify({ adminClientId : clientId, adminClientSecret : secret }),
        dataType    : 'json',
        timeout     : 30000
    }).done(function(response) {

        button.removeClass('disabled');

        if(attempt !== setupAdminTest) return;

        result.removeClass('busy').addClass(response.success ? 'ok' : 'error').text(response.message);

        if(response.success) return;

        if(response.code === 'wrongtype') setFieldError('admin-client-id'    , 'This app cannot issue a server token. Please use a second APS app of a server to server type.', true);
        if(response.code === 'rejected')  setFieldError('admin-client-secret', 'This Client ID and this Client Secret were not accepted together.', true);

    }).fail(function(request) {

        button.removeClass('disabled');

        if(attempt !== setupAdminTest) return;

        let message = 'The test could not be run. Please make sure this server still runs and try again.';

        if(typeof request.responseJSON !== 'undefined') {
            if(request.responseJSON !== null) {
                if(typeof request.responseJSON.message === 'string') message = request.responseJSON.message;
            }
        }

        result.removeClass('busy').addClass('error').text(message);

    });

}


/*  AUTHENTICATION STATE
/* ----------------------------------------------------------------------------- */
function updateAuthState() {

    let result   = $('#result-auth').addClass('visible').removeClass('ok error busy');
    let tenant   = normalizeTenant($('#tenant').val());
    let clientId = $.trim(String($('#client-id').val()));
    let changed  = ((tenant !== setupStatus.tenant) || (clientId !== setupStatus.clientId));

    if(setupStatus.authenticated && !changed) {
        $('#sign-in').addClass('disabled');
        $('#discover').removeClass('disabled');
        result.addClass('ok').text('You are signed in. Discovering the workspaces of your tenant will work now.');
        return;
    }

    if(changed) {
        $('#sign-in').addClass('disabled');
        $('#discover').addClass('disabled');
        result.text('Discovery uses the tenant and the Client ID this server was started with, and you have just changed them. Save and restart first (step 6), then come back to this page and run the discovery. Until then, all workspace ids stay as they are.');
        return;
    }

    if(!setupStatus.clientIdSet || !setupStatus.tenantSet) {
        $('#sign-in').addClass('disabled');
        $('#discover').addClass('disabled');
        result.text('This server has no connection settings yet, so it cannot sign you in. Save and restart first (step 6), then come back to this page and run the discovery. The applications work without the workspace ids, but their lists stay empty.');
        return;
    }

    $('#sign-in').removeClass('disabled');
    $('#discover').addClass('disabled');
    result.text('Sign in to Autodesk first. A normal Autodesk login window opens and brings you straight back to this page.');

}


/*  WORKSPACE DISCOVERY
/* ----------------------------------------------------------------------------- */
function discoverWorkspaces() {

    let result = $('#result-discover').addClass('visible busy').removeClass('ok error').text('Reading the list of workspaces from your tenant ...');

    setupWorkspaces = [];

    readWorkspacePage(0, function(success, message) {

        result.removeClass('busy');

        if(!success) {
            result.addClass('error').text(message);
            return;
        }

        if(setupWorkspaces.length === 0) {
            result.addClass('error').text('Your tenant did not return any workspace. Please make sure your user has access to at least one workspace.');
            return;
        }

        setupRows       = matchWorkspaces();
        setupDiscovered = true;

        renderWorkspaceTable();

        let matched = 0;

        for(let row of setupRows) {
            if(typeof row.key === 'undefined') continue;
            if(row.id > 0) matched++;
        }

        result.addClass('ok').text('Found ' + setupWorkspaces.length + ' workspaces in your tenant and matched ' + matched + ' of them automatically. Please review the table below and correct anything that looks wrong.');

        updateProfileWorkspaces();

    });

}
function readWorkspacePage(offset, callback) {

    let limit = 250;

    $.ajax({
        url      : '/plm/workspaces',
        data     : { offset : offset, limit : limit },
        dataType : 'json'
    }).done(function(response) {

        if(response.error) {
            callback(false, 'Your tenant refused the request for the workspace list. ' + ((response.message === '') ? 'Please sign in again and retry.' : response.message));
            return;
        }

        let items = [];

        if(typeof response.data !== 'undefined') {
            if(response.data !== null) {
                if(typeof response.data.items !== 'undefined') items = response.data.items;
            }
        }

        for(let item of items) {

            let id = parseInt(String(item.link).split('/')[4], 10);

            if(isNaN(id)) continue;

            setupWorkspaces.push({
                id         : id,
                title      : (typeof item.title      === 'undefined') ? '' : item.title,
                systemName : (typeof item.systemName === 'undefined') ? '' : item.systemName,
                category   : (typeof item.category   === 'undefined') ? '' : item.category
            });

        }

        if((items.length >= limit) && (offset < 2000)) {
            readWorkspacePage(offset + limit, callback);
            return;
        }

        setupWorkspaces.sort(function(a, b) {
            return String(a.title).localeCompare(String(b.title));
        });

        callback(true, '');

    }).fail(function(request) {

        if(request.status === 401) {
            callback(false, 'Your session has expired. Please sign in again and retry.');
            return;
        }

        callback(false, 'The workspace list could not be read. Please sign in to Autodesk first, then run the discovery again.');

    });

}
function matchWorkspaces() {

    let rows = [];
    let used = {};

    /*  Every row starts from the id this server is ALREADY configured with, not from zero.
        A workspace the matching below cannot identify - because this tenant names it something
        the alias list does not know - therefore keeps the value that was working until now
        instead of being overwritten with a zero, which would silently disable the applications
        that use it. Only a workspace which was never configured stays at zero.               */
    let current = (typeof setupStatus.workspaceIds === 'object' && setupStatus.workspaceIds !== null) ? setupStatus.workspaceIds : {};

    for(let entry of setupStatus.workspaceKeys) {

        if(typeof entry.group !== 'undefined') {
            rows.push({ group : entry.group });
            continue;
        }

        let existing = parseInt(current[entry.key], 10);

        if(isNaN(existing) || (existing < 0)) existing = 0;

        rows.push({
            key      : entry.key,
            label    : entry.label,
            aliases  : entry.aliases,
            id       : existing,
            existing : existing,
            title    : '',
            matched  : false
        });

    }

    matchWorkspacePass(rows, used, false);
    matchWorkspacePass(rows, used, true);

    return rows;

}
function matchWorkspacePass(rows, used, loose) {

    for(let row of rows) {

        if(typeof row.key === 'undefined') continue;
        if(row.matched) continue;

        let names = [];

        for(let alias of row.aliases) names.push(normalizeName(alias));

        names.push(normalizeName(row.key.replace(/([A-Z])/g, ' $1')));

        for(let workspace of setupWorkspaces) {

            if(used[workspace.id]) continue;

            let title  = normalizeName(workspace.title);
            let system = normalizeName(workspace.systemName);

            if(loose) {
                title  = toSingular(title);
                system = toSingular(system);
            }

            let found = false;

            for(let name of names) {

                let compare = loose ? toSingular(name) : name;

                if(compare === '') continue;
                if((compare === title) || (compare === system)) {
                    found = true;
                    break;
                }

            }

            if(found) {
                row.id             = workspace.id;
                row.title          = workspace.title;
                row.matched        = true;
                used[workspace.id] = true;
                break;
            }

        }

    }

}
function normalizeName(value) {

    return String((typeof value === 'undefined') ? '' : value).toLowerCase().replace(/[^a-z0-9]/g, '');

}
function toSingular(value) {

    if(value.length > 3) {
        if(value.charAt(value.length - 1) === 's') return value.substring(0, value.length - 1);
    }

    return value;

}
function renderWorkspaceTable() {

    let container = $('#workspace-table').empty();
    let table     = $('<table></table>');
    let head      = $('<tr></tr>');

    head.append($('<th></th>').text('Setting'));
    head.append($('<th></th>').text('Workspace in your tenant'));
    head.append($('<th></th>').addClass('id').text('Id'));

    table.append(head);

    for(let row of setupRows) {

        if(typeof row.group !== 'undefined') {
            table.append($('<tr></tr>').append($('<td></td>').addClass('group').attr('colspan', 3).text(row.group)));
            continue;
        }

        let line  = $('<tr></tr>');
        let cell  = $('<td></td>');
        let list  = $('<select></select>').attr('data-key', row.key);
        let value = $('<td></td>').addClass('id');

        list.append($('<option></option>').attr('value', '0').text('not present in this tenant (will be skipped)'));

        /*  The discovery only returns the workspaces this user can see. When the id this server is
            already configured with is not among them - a workspace the user has no access to, or one
            this tenant names differently - there would be no option carrying that value, the select
            would silently fall back to 0 and saving would wipe a working setting. So it gets an
            option of its own and stays selected until the user decides otherwise.                  */
        let known = false;

        for(let workspace of setupWorkspaces) {
            if(String(workspace.id) === String(row.existing)) known = true;
        }

        if((row.existing > 0) && !known) {
            list.append($('<option></option>').attr('value', row.existing).text('keep the setting this server already uses')
                .append($('<span></span>').attr('data-i18n-skip', '').text('  (' + row.existing + ')')));
        }

        for(let workspace of setupWorkspaces) {
            // data-i18n-skip keeps the translation engine away from tenant data : a workspace
            // literally named 'Items' must stay exactly as your tenant spells it.
            list.append($('<option></option>').attr('value', workspace.id).attr('data-i18n-skip', '').text(workspace.title + '  (' + workspace.id + ')'));
        }

        list.val(String(row.id));

        list.change(function() {
            let selected = parseInt($(this).val(), 10);
            $(this).closest('tr').find('td.id').text((selected > 0) ? selected : '-');
            $(this).closest('tr').toggleClass('missing', selected === 0);
            updateSummary();
        });

        line.append($('<td></td>').text(row.label));
        line.append(cell.append(list));
        line.append(value.text((row.id > 0) ? row.id : '-'));

        if(row.id === 0) line.addClass('missing');

        table.append(line);

    }

    container.append(table);
    container.append($('<div></div>').attr('id', 'workspace-summary').text('A workspace the discovery could not identify keeps the setting this server already uses, so nothing that works today gets lost. Only the rows marked as not present are written as 0, and the applications skip those.'));

}
function getWorkspaceIds() {

    let ids = {};

    $('#workspace-table select').each(function() {

        let id = parseInt($(this).val(), 10);

        ids[$(this).attr('data-key')] = isNaN(id) ? 0 : id;

    });

    return ids;

}


/*  SUMMARY & SAVING
/* ----------------------------------------------------------------------------- */
function updateSummary() {

    let summary  = $('#summary').empty();
    let language = $('#ui-language option:selected').text();
    let matched  = 0;

    if(setupDiscovered) {
        let ids = getWorkspaceIds();
        for(let key in ids) {
            if(ids[key] > 0) matched++;
        }
    }

    addSummaryRow(summary, 'Tenant'              , normalizeTenant($('#tenant').val()));
    addSummaryRow(summary, 'Client ID'           , $.trim(String($('#client-id').val())));
    addSummaryRow(summary, 'Callback URL'        , $.trim(String($('#redirect-uri').val())));
    addSummaryRow(summary, 'Default theme'       , $('#default-theme option:selected').text());
    addSummaryRow(summary, 'Interface language'  , language);
    addSummaryRow(summary, 'Admin Client ID'     , ($.trim(String($('#admin-client-id').val())) === '') ? 'not used' : $.trim(String($('#admin-client-id').val())));
    addSummaryRow(summary, 'Admin Client Secret' , (String($('#admin-client-secret').val()) === '') ? 'not used' : 'set (never shown again)');
    addSummaryRow(summary, 'Vault'               , ($.trim(String($('#vault-gateway').val())) === '') ? 'not used' : $.trim(String($('#vault-gateway').val())) + ' / ' + $.trim(String($('#vault-name').val())));
    addSummaryRow(summary, 'Workspace ids'       , setupDiscovered ? (matched + ' workspaces detected, will be written') : 'not discovered, the existing ids stay unchanged');

    if(isNewProfileMode()) {
        if(getProfileName() === '') addSummaryRow(summary, 'Saved as', 'a new tenant profile, still without a name');
        else                        addSummaryRow(summary, 'Saved as', 'the new tenant profile', getProfileName());
        return;
    }

    addSummaryRow(summary, 'Saved as', 'the settings this server runs on', (typeof setupStatus.environmentFile === 'undefined') ? 'environment.js' : setupStatus.environmentFile);

}
/*  literal is an optional file or profile name appended after the value. It goes into
    its own skipped span so that the value stays translatable while the name does not
    get matched against the dictionary, see setSplitMessage.                          */
function addSummaryRow(summary, label, value, literal) {

    let row   = $('<div></div>').addClass('summary-row');
    let elem  = $('<div></div>').addClass('summary-value');

    row.append($('<div></div>').addClass('summary-label').text(label));

    if(isBlankText(literal)) {
        elem.text((value === '') ? '-' : value);
    } else {
        elem.append(document.createTextNode(value + ' '));
        elem.append($('<span></span>').attr('data-i18n-skip', '').text(literal));
    }

    row.append(elem);

    summary.append(row);

}
function isBlankText(value) {
    return (typeof value === 'undefined') || (value === null) || (String(value).trim() === '');
}
function save() {

    if(setupSaving) return;
    if(!validateConnection(true)) {
        goToStep(2);
        return;
    }
    if(!validateProfileName(true)) return;

    let secret  = String($('#admin-client-secret').val());
    let result  = $('#result-save').addClass('visible busy').removeClass('ok error').text('Saving your settings ...');
    let payload = {
        tenant        : normalizeTenant($('#tenant').val()),
        clientId      : $.trim(String($('#client-id').val())),
        redirectUri   : $.trim(String($('#redirect-uri').val())),
        defaultTheme  : $('#default-theme').val(),
        uiLanguage    : $('#ui-language').val(),
        enableCache   : setupStatus.enableCache,
        debugMode     : setupStatus.debugMode,
        adminClientId : $.trim(String($('#admin-client-id').val())),
        vaultGateway  : $.trim(String($('#vault-gateway').val())),
        vaultName     : $.trim(String($('#vault-name').val()))
    };

    if(secret !== setupSecretMask) payload.adminClientSecret = secret;
    if(setupDiscovered) payload.workspaceIds = getWorkspaceIds();

    if(isNewProfileMode()) {

        payload.saveMode    = 'profile';
        payload.profileName = getProfileName();

        // Only ever true for the exact name the user has just confirmed. Typing a different name
        // or switching the save target clears it again, so no profile is replaced unseen.
        payload.overwriteProfile = (setupOverwrite !== '') && (setupOverwrite === payload.profileName);

    }

    setupSavedTenant   = payload.tenant;
    setupSavedClientId = payload.clientId;
    setupSaving        = true;

    $('#save').addClass('disabled');

    $.ajax({
        url         : '/setup/save',
        type        : 'POST',
        contentType : 'application/json',
        data        : JSON.stringify(payload),
        dataType    : 'json'
    }).done(function(response) {

        clearStash();

        if(typeof response.savedProfile === 'string') {

            setupSaving    = false;
            setupOverwrite = '';

            $('#save').removeClass('disabled');

            result.removeClass('busy').addClass('ok').text('The tenant profile was saved.');

            loadProfiles();
            showProfileInfo(response);

            return;

        }

        result.removeClass('busy').addClass('ok').text('Your settings were saved.');

        showRestartInfo(response);

    }).fail(function(request) {

        setupSaving = false;

        $('#save').removeClass('disabled');

        let answer   = ((typeof request.responseJSON === 'undefined') || (request.responseJSON === null)) ? {} : request.responseJSON;
        let messages = Array.isArray(answer.errors) ? answer.errors : ['The settings could not be saved.'];

        // The server refuses to replace an existing profile until it has been told to. The name is
        // remembered here, so pressing the button a second time carries the confirmation with it.
        if(answer.profileExists === true) {

            setupOverwrite = String(answer.profileName);

            result.removeClass('busy').addClass('error').text('A tenant profile named ' + answer.profileName + ' exists already. Press Save once more to replace it, or type another name. A timestamped backup of the files being replaced is kept.');

            return;

        }

        result.removeClass('busy').addClass('error').text(messages.join(' '));

    });

}
function showRestartInfo(response) {

    let info = $('#restart-info').addClass('visible').empty();

    if(Array.isArray(response.warnings)) {
        for(let warning of response.warnings) {
            info.append($('<div></div>').addClass('field-message visible error').text(warning));
        }
    }

    if(Array.isArray(response.files)) {
        if(response.files.length > 0) {
            info.append($('<div></div>').addClass('file-list').text('Files written : ' + response.files.join(', ')));
        }
    }

    if(!response.supervised) {
        info.prepend($('<div></div>').text('Your settings are saved. This server was not started by the Windows launcher, so it cannot restart itself. Please close the console window of the server and start the application again to apply the new settings.'));
        return;
    }

    if(!response.samePort) {
        info.prepend($('<div></div>').append(
            $('<span></span>').text('Your settings are saved and the server is restarting on a new port. Wait a few seconds, then open '),
            $('<a></a>').attr('href', response.newUrl).text(response.newUrl)
        ));
        return;
    }

    info.prepend($('<div></div>').attr('id', 'restart-state').text('Your settings are saved and the server is restarting. This page reloads automatically as soon as the server is back, usually within a few seconds. Please leave the console window of the server open.'));

    //  The settings that were just written coming back out of /setup/status is the proof
    //  that this is the restarted server and not the one which is still going down.
    startPolling(function(status) {
        return (status.tenant === setupSavedTenant) && (status.clientId === setupSavedClientId);
    }, '/');

}
function showProfileInfo(response) {

    /*  Deliberately no restart and no polling. This server keeps running on the tenant it was
        started with : it has no way to load another environment file into itself, and restarting
        it would only bring the same tenant back. The launcher is where a tenant is chosen, so
        that is what this explains.                                                              */
    let info = $('#restart-info').addClass('visible').empty();

    info.append($('<div></div>').text('The tenant profile ' + response.savedProfile + ' was saved. This server keeps running on the tenant it was started with - nothing about it has changed.'));
    info.append($('<div></div>').text('To use it now, press Switch to this tenant next to ' + response.savedProfile + ' in the list below. The app restarts itself on that tenant.'));

    if(Array.isArray(response.warnings)) {
        for(let warning of response.warnings) {
            info.append($('<div></div>').addClass('field-message visible error').text(warning));
        }
    }

    if(Array.isArray(response.files)) {
        if(response.files.length > 0) {
            info.append($('<div></div>').addClass('file-list').text('Files written : ' + response.files.join(', ')));
        }
    }

}
/*  Waits for the server to come back after it restarted itself, then leaves this page.
    -----------------------------------------------------------------------------------
    'settled' decides what counts as proof that the restart already happened, and it HAS to
    be given by the caller. Saving the connection settings and switching tenant restart the
    server for different reasons and recognise the result by different fields, and a test
    belonging to the other flow simply never becomes true - the page then polls until it
    gives up and claims the server never came back, while the server is answering every one
    of those requests with 200.

    'target' is where to go once it did settle.                                            */
function startPolling(settled, target) {

    setupPollState    = 'down';
    setupPollAttempts = 0;

    if(typeof settled !== 'function') settled = function() { return true; };
    if(typeof target  !== 'string')   target  = '/';

    if(setupPollHandle !== null) clearInterval(setupPollHandle);

    setupPollHandle = setInterval(function() {

        setupPollAttempts++;

        if(setupPollAttempts > 90) {
            clearInterval(setupPollHandle);
            setupPollHandle = null;
            $('#restart-state').text('The server did not come back automatically. Please check the console window of the server, then reload this page.');
            return;
        }

        $.ajax({
            url      : '/setup/status',
            data     : { ts : new Date().getTime() },
            dataType : 'json',
            timeout  : 2000,
            cache    : false
        }).done(function(response) {

            if(typeof response !== 'object') return;
            if(response === null)            return;

            if(setupPollState !== 'gone') {

                // The server can also come back so quickly that this page never sees it
                // being down. In that case the caller's test is the only proof that the
                // restart already happened.
                if(!settled(response))   return;
                if(setupPollAttempts < 6) return;

            }

            clearInterval(setupPollHandle);
            setupPollHandle = null;

            window.location.href = target;

        }).fail(function() {
            setupPollState = 'gone';
        });

    }, 1000);

}


/*  KEEPING THE FORM ACROSS THE AUTODESK LOGIN
/* ----------------------------------------------------------------------------- */
function stashInput() {

    if(typeof window.sessionStorage === 'undefined') return;

    let stash = {
        tenant        : String($('#tenant').val()),
        clientId      : String($('#client-id').val()),
        redirectUri   : String($('#redirect-uri').val()),
        defaultTheme  : String($('#default-theme').val()),
        uiLanguage    : String($('#ui-language').val()),
        adminClientId : String($('#admin-client-id').val()),
        vaultGateway  : String($('#vault-gateway').val()),
        vaultName     : String($('#vault-name').val()),
        profileName   : getProfileName(),
        profileMode   : isNewProfileMode(),
        secretTyped   : ((String($('#admin-client-secret').val()) !== setupSecretMask) && (String($('#admin-client-secret').val()) !== ''))
    };

    try {
        window.sessionStorage.setItem(setupStashKey, JSON.stringify(stash));
    } catch(error) {
        return;
    }

}
function restoreStash() {

    if(typeof window.sessionStorage === 'undefined') return;

    let raw   = null;
    let stash = null;

    try {
        raw = window.sessionStorage.getItem(setupStashKey);
    } catch(error) {
        return;
    }

    if(raw === null) return;

    try {
        stash = JSON.parse(raw);
    } catch(error) {
        clearStash();
        return;
    }

    $('#tenant'        ).val(stash.tenant);
    $('#client-id'     ).val(stash.clientId);
    $('#redirect-uri'  ).val(stash.redirectUri);
    $('#default-theme' ).val(stash.defaultTheme);
    $('#ui-language'   ).val(stash.uiLanguage);
    $('#admin-client-id').val(stash.adminClientId);
    $('#vault-gateway' ).val(stash.vaultGateway);
    $('#vault-name'    ).val(stash.vaultName);

    if(typeof stash.profileName === 'string') $('#profile-name').val(stash.profileName);
    if(stash.profileMode === true)            $('#save-mode-profile').prop('checked', true);

    if(stash.secretTyped) {
        $('#disclosure-advanced').addClass('open');
        $('#error-admin-client-secret').addClass('visible').text('The Admin Client Secret is never kept across an Autodesk login. Please type it again before saving.');
    }

}
function clearStash() {

    if(typeof window.sessionStorage === 'undefined') return;

    try {
        window.sessionStorage.removeItem(setupStashKey);
    } catch(error) {
        return;
    }

}


/*  THEME, LANGUAGE & CLIPBOARD
/* ----------------------------------------------------------------------------- */
function applyTheme(value) {

    let name = String((typeof value === 'undefined') ? '' : value).toLowerCase();

    $('body').removeClass('light-theme dark-theme black-theme fusion-theme');

         if(name ===   'dark') $('body').addClass(  'dark-theme');
    else if(name ===  'black') $('body').addClass( 'black-theme');
    else if(name === 'fusion') $('body').addClass('fusion-theme');
    else                       $('body').addClass( 'light-theme');

}
function applyLanguage(value) {

    // Switching the language reloads the page, this is how the i18n engine applies a new
    // dictionary. Everything typed so far therefore gets stashed first and comes back
    // right after the reload, so the wizard immediately shows itself in the language the
    // user just picked without losing a single field.

    window.PLMX_I18N_DEFAULT = value;

    if(value === '') return;
    if(typeof window.plmxI18n === 'undefined') return;
    if(window.plmxI18n === null) return;
    if(typeof window.plmxI18n.setLanguage !== 'function') return;

    stashInput();

    try {
        window.plmxI18n.setLanguage(value);
    } catch(error) {
        return;
    }

}
function copyToClipboard(value) {

    let button = $('#copy-callback');
    let label  = button.text();

    function confirmCopy() {
        button.text('Copied');
        setTimeout(function() { button.text(label); }, 1500);
    }

    if(typeof navigator.clipboard !== 'undefined') {
        navigator.clipboard.writeText(value).then(confirmCopy).catch(function() {
            copyToClipboardFallback(value, confirmCopy);
        });
        return;
    }

    copyToClipboardFallback(value, confirmCopy);

}
function copyToClipboardFallback(value, callback) {

    let field = $('#callback-display');

    field.get(0).select();
    field.get(0).setSelectionRange(0, 999);

    try {
        document.execCommand('copy');
        callback();
    } catch(error) {
        return;
    }

}
