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
        updateSummary();

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
    $('#hint-settings').text('This opens the General Settings of the tenant ' + tenant + ' in a new tab. You need administrator rights there.');

}
function updateHeaderState() {

    let elem = $('#header-state').removeClass('visible warning ok');

    if(!setupStatus.tenantSet || !setupStatus.clientIdSet) {
        elem.addClass('visible warning').text('This server has no connection settings yet. Work through the steps below, then save.');
        return;
    }

    elem.addClass('visible ok').text('This server is configured for the tenant ' + setupStatus.tenant + '. You can change the settings here at any time.');

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

    for(let entry of setupStatus.workspaceKeys) {

        if(typeof entry.group !== 'undefined') {
            rows.push({ group : entry.group });
            continue;
        }

        rows.push({
            key     : entry.key,
            label   : entry.label,
            aliases : entry.aliases,
            id      : 0,
            title   : '',
            matched : false
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
    container.append($('<div></div>').attr('id', 'workspace-summary').text('Settings marked as not present are written as 0 and get skipped by the applications. That is expected whenever your tenant simply does not use that workspace.'));

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

}
function addSummaryRow(summary, label, value) {

    let row = $('<div></div>').addClass('summary-row');

    row.append($('<div></div>').addClass('summary-label').text(label));
    row.append($('<div></div>').addClass('summary-value').text((value === '') ? '-' : value));

    summary.append(row);

}
function save() {

    if(setupSaving) return;
    if(!validateConnection(true)) {
        goToStep(2);
        return;
    }

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

        result.removeClass('busy').addClass('ok').text('Your settings were saved.');

        showRestartInfo(response);

    }).fail(function(request) {

        setupSaving = false;

        $('#save').removeClass('disabled');

        let messages = ['The settings could not be saved.'];

        if(typeof request.responseJSON !== 'undefined') {
            if(request.responseJSON !== null) {
                if(Array.isArray(request.responseJSON.errors)) messages = request.responseJSON.errors;
            }
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

    startPolling();

}
function startPolling() {

    setupPollState    = 'down';
    setupPollAttempts = 0;

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

            if(setupPollState !== 'gone') {

                // The server can also come back so quickly that this page never sees it
                // being down. In that case the new tenant showing up in the status is
                // the proof that the restart already happened.
                if(typeof response         === 'undefined') return;
                if(response.tenant         !== setupSavedTenant) return;
                if(response.clientId       !== setupSavedClientId) return;
                if(setupPollAttempts       <   6) return;

            }

            clearInterval(setupPollHandle);
            setupPollHandle = null;

            window.location.href = '/';

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
