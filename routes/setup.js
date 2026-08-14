const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const crypto  = require('node:crypto');
const dns     = require('dns');
const fs      = require('fs');
const os      = require('os');
const path    = require('path');

const pathRoot     = path.join(__dirname, '..');
const pathSettings = path.join(pathRoot, 'settings');

const secretPlaceholder = '********';
const rejectedChars     = /['"`\\\r\n\t]/;
const themes            = ['light', 'dark', 'black', 'fusion'];
const languages         = ['', 'en', 'ja', 'ko'];


/* ------------------------------------------------------------------------------
    WORKSPACE KEYS & ALIASES

    The keys below must stay in sync with exports.common.workspaceIds in
    settings/custom.js. Group entries only add a comment to the generated file.
   ------------------------------------------------------------------------------ */
const workspaceKeys = [

    { group : 'Product Development Workspaces' },
    { key : 'changeOrders'                 , label : 'Change Orders'                  , aliases : ['Change Orders', 'Changes', 'Engineering Change Orders', 'ECO'] },
    { key : 'changeRequests'               , label : 'Change Requests'                , aliases : ['Change Requests', 'Engineering Change Requests', 'ECR'] },
    { key : 'changeTasks'                  , label : 'Change Tasks'                   , aliases : ['Change Tasks'] },
    { key : 'designReviews'                , label : 'Design Reviews'                 , aliases : ['Design Reviews'] },
    { key : 'designReviewTasks'            , label : 'Design Review Tasks'            , aliases : ['Design Review Tasks'] },
    { key : 'engineeringProjects'          , label : 'Engineering Projects'           , aliases : ['Engineering Projects'] },
    { key : 'engineeringProjectActivities' , label : 'Engineering Project Activities' , aliases : ['Engineering Project Activities', 'Project Activities'] },
    { key : 'items'                        , label : 'Items'                          , aliases : ['Items', 'Item Master', 'Parts'] },
    { key : 'nonConformances'              , label : 'Non Conformances'               , aliases : ['Non Conformances', 'Non-Conformances', 'Nonconformances', 'Non Conformance Reports', 'NCR'] },
    { key : 'problemReports'               , label : 'Problem Reports'                , aliases : ['Problem Reports', 'Issues'] },

    { group : 'Products & Projects Workspaces' },
    { key : 'products'                     , label : 'Products'                       , aliases : ['Products'] },
    { key : 'projects'                     , label : 'Projects'                       , aliases : ['Projects'] },
    { key : 'projectTasks'                 , label : 'Project Tasks'                   , aliases : ['Project Tasks', 'Tasks'] },

    { group : 'Supplier Collaboration Workspaces' },
    { key : 'sparePartsRequests'           , label : 'Spare Parts Requests'           , aliases : ['Spare Parts Requests', 'Spare Part Requests'] },
    { key : 'supplierPackages'             , label : 'Supplier Packages'              , aliases : ['Supplier Packages', 'Supplier Collaboration Packages'] },

    { group : 'Asset Management Workspaces' },
    { key : 'orderProjects'                , label : 'Order Projects'                 , aliases : ['Order Projects'] },
    { key : 'orderProjectDeliveries'       , label : 'Order Project Deliveries'       , aliases : ['Order Project Deliveries', 'Order Deliveries'] },
    { key : 'assets'                       , label : 'Assets'                         , aliases : ['Assets'] },
    { key : 'assetItems'                   , label : 'Asset Items'                    , aliases : ['Asset Items'] },
    { key : 'assetServices'                , label : 'Asset Services'                 , aliases : ['Asset Services'] },
    { key : 'serialNumbers'                , label : 'Serial Numbers'                 , aliases : ['Serial Numbers'] }

];


/* ------------------------------------------------------------------------------
    ACCESS PROTECTION

    The wizard writes files on the server's file system. It therefore must only
    ever be reachable from the very machine the server runs on. This matters as
    soon as the same code base gets deployed to a cloud environment.
   ------------------------------------------------------------------------------ */
function isLoopbackRequest(req) {

    let address = '';

    if(typeof req.socket     !== 'undefined') address = req.socket.remoteAddress     || '';
    if((address === '') && (typeof req.connection !== 'undefined')) address = req.connection.remoteAddress || '';

    return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].indexOf(address) > -1;

}
function isSameOriginRequest(req) {

    // Being on loopback is not enough for a request which writes files : the browser of
    // the user is on loopback as well, so any web site could try posting here. Requiring
    // a JSON content type forces a CORS preflight for cross site requests, which no other
    // web site can pass. When the browser sends an origin, it has to be our own one.

    let type   = String((typeof req.headers['content-type'] === 'undefined') ? '' : req.headers['content-type']);
    let origin = req.headers.origin;

    if(type.toLowerCase().indexOf('application/json') < 0) return false;
    if(typeof origin === 'undefined') return true;

    return (origin === req.protocol + '://' + req.headers.host);

}
router.use(function(req, res, next) {

    if(isLoopbackRequest(req)) return next();

    console.log();
    console.log('  /setup : request rejected, remote address is not loopback');
    console.log();

    res.status(403).send('The setup wizard can only be used on the machine running this server.');

});


/* ------------------------------------------------------------------------------
    FIRST RUN REDIRECT

    Mounted in app.js before all other routes. As long as no tenant and / or no
    client id are available, every request for an HTML page gets redirected to
    the wizard instead of failing with a cryptic error message.
   ------------------------------------------------------------------------------ */
function firstRunRedirect(req, res, next) {

    let locals = req.app.locals;

    if(!isBlank(locals.tenant) && !isBlank(locals.clientId)) return next();

    if(req.method !== 'GET')                  return next();
    if(req.path === '/callback')              return next();
    if(req.path === '/setup')                 return next();
    if(req.path.indexOf('/setup/')  === 0)    return next();
    if(req.path.indexOf('.')        >   -1)   return next();
    if(!req.accepts('html'))                  return next();

    res.redirect('/setup');

}


/* ------------------------------------------------------------------------------
    WIZARD PAGE
   ------------------------------------------------------------------------------ */
router.get('/', function(req, res, next) {

    let locals = req.app.locals;
    let theme  = (typeof req.query.theme === 'undefined') ? locals.defaultTheme : req.query.theme;

    if(themes.indexOf(theme) < 0) theme = 'dark';

    res.render('framework/setup', {
        title      : 'PLM UX Setup Wizard',
        theme      : theme,
        uiLanguage : isBlank(locals.uiLanguage) ? '' : locals.uiLanguage
    });

});


/* ------------------------------------------------------------------------------
    CURRENT CONFIGURATION STATE
   ------------------------------------------------------------------------------ */
router.get('/status', function(req, res, next) {

    let locals   = req.app.locals;
    let ids      = getConfiguredWorkspaceIds(locals);
    let protocol = isBlank(locals.protocol) ? 'http' : locals.protocol;
    let port     = isBlank(locals.port)     ? '8080' : String(locals.port);
    let count    = 0;

    for(let key in ids) {
        if(ids[key] > 0) count++;
    }

    res.json({
        tenant               : blankToEmpty(locals.tenant),
        clientId             : blankToEmpty(locals.clientId),
        redirectUri          : blankToEmpty(locals.redirectUri),
        suggestedRedirectUri : protocol + '://localhost:' + port + '/callback',
        defaultTheme         : isBlank(locals.defaultTheme) ? 'dark' : locals.defaultTheme,
        uiLanguage           : blankToEmpty(locals.uiLanguage),
        enableCache          : (locals.enableCache === true) || (locals.enableCache === 'true'),
        debugMode            : (locals.debugMode   === true) || (locals.debugMode   === 'true'),
        adminClientId        : blankToEmpty(locals.adminClientId),
        adminClientSecret    : isBlank(locals.adminClientSecret) ? '' : secretPlaceholder,
        adminClientSecretSet : !isBlank(locals.adminClientSecret),
        vaultGateway         : blankToEmpty(locals.vaultGateway),
        vaultName            : blankToEmpty(locals.vaultName),
        tenantSet            : !isBlank(locals.tenant),
        clientIdSet          : !isBlank(locals.clientId),
        workspaceIds         : ids,
        workspaceIdsCount    : count,
        workspaceIdsSet      : (count > 0),
        workspaceKeys        : workspaceKeys,
        authenticated        : isAuthenticated(req),
        supervised           : isSupervised(),
        environmentFile      : path.basename(getEnvironmentPath()),
        settingsFile         : blankToEmpty(locals.settings),
        port                 : port
    });

});


/* ------------------------------------------------------------------------------
    AUTODESK LOGIN

    Same PKCE flow as used when launching an application. The callback route of
    routes/landing.js redirects back to the URL passed as state.
   ------------------------------------------------------------------------------ */
router.get('/login', function(req, res, next) {

    let locals = req.app.locals;

    if(isBlank(locals.clientId)) return res.redirect('/setup');

    req.session.code_verifier  = base64URLEncode(crypto.randomBytes(32));
    req.session.code_challenge = base64URLEncode(sha256(req.session.code_verifier));

    let url = 'https://developer.api.autodesk.com/authentication/v2/authorize'
        + '?response_type=code'
        + '&client_id=' + locals.clientId
        + '&redirect_uri=' + encodeURIComponent(locals.redirectUri)
        + '&scope=profapi:img-profile:read'
        + '&code_challenge=' + req.session.code_challenge
        + '&code_challenge_method=S256'
        + '&state=' + encodeURIComponent('/setup');

    res.redirect(url);

});


/* ------------------------------------------------------------------------------
    TENANT HOSTNAME VALIDATION
   ------------------------------------------------------------------------------ */
router.get('/check-tenant', function(req, res, next) {

    let tenant = normalizeTenant(req.query.tenant);

    if(tenant === '') {
        return res.json({ tenant : '', resolved : false, reachable : false, message : 'Please provide a tenant name.' });
    }
    if(!/^[A-Za-z0-9-]+$/.test(tenant)) {
        return res.json({ tenant : tenant, resolved : false, reachable : false, message : 'The tenant name may only contain letters, digits and dashes.' });
    }

    let host = tenant + '.autodeskplm360.net';

    dns.lookup(host, function(error) {

        if(error) {
            return res.json({
                tenant    : tenant,
                host      : host,
                resolved  : false,
                reachable : false,
                message   : 'The address ' + host + ' could not be found. Please check the spelling of your tenant name.'
            });
        }

        axios.get('https://' + host + '/', {
            timeout        : 15000,
            maxRedirects   : 0,
            validateStatus : function() { return true; }
        }).then(function(response) {
            res.json({
                tenant    : tenant,
                host      : host,
                resolved  : true,
                reachable : true,
                message   : 'The tenant ' + tenant + ' was found and answers on https://' + host
            });
        }).catch(function(error) {
            res.json({
                tenant    : tenant,
                host      : host,
                resolved  : true,
                reachable : false,
                message   : 'The address ' + host + ' exists but did not answer. This can be caused by a proxy or firewall.'
            });
        });

    });

});


/* ------------------------------------------------------------------------------
    SAVE CONFIGURATION & RESTART
   ------------------------------------------------------------------------------ */
router.post('/save', function(req, res, next) {

    console.log();
    console.log('  /setup/save');
    console.log(' --------------------------------------------');

    if(!isSameOriginRequest(req)) {
        console.log('  rejected : the request did not come from the wizard page itself');
        console.log();
        return res.status(403).json({ success : false, errors : ['This request did not come from the setup wizard page. Please open http://localhost:' + (isBlank(req.app.locals.port) ? '8080' : req.app.locals.port) + '/setup and try again.'] });
    }

    let locals = req.app.locals;
    let body   = (typeof req.body === 'undefined') ? {} : req.body;
    let errors = [];
    let values = {};

    values.tenant = normalizeTenant(body.tenant);

    if(values.tenant === '') {
        errors.push('Please provide the name of your Fusion Manage tenant.');
    } else if(!/^[A-Za-z0-9-]+$/.test(values.tenant)) {
        errors.push('The tenant name may only contain letters, digits and dashes.');
    }

    values.clientId = cleanText(body.clientId, 'Client ID', errors);

    if(values.clientId === '') {
        errors.push('Please provide the Client ID of your APS application.');
    } else if(/\s/.test(values.clientId)) {
        errors.push('The Client ID must not contain spaces.');
    } else if(values.clientId.length < 8) {
        errors.push('The Client ID looks too short. Please paste the complete value from aps.autodesk.com.');
    }

    values.redirectUri = cleanText(body.redirectUri, 'Callback URL', errors);

    if(values.redirectUri === '') values.redirectUri = blankToEmpty(locals.redirectUri);
    if(!/^https?:\/\/[A-Za-z0-9_.-]+:[0-9]{1,5}\/callback$/.test(values.redirectUri)) {
        errors.push('The Callback URL must look like http://localhost:8080/callback, must include the port number and must end with /callback.');
    }

    values.defaultTheme = String(blankToEmpty(body.defaultTheme));
    if(themes.indexOf(values.defaultTheme) < 0) values.defaultTheme = 'dark';

    values.uiLanguage = String(blankToEmpty(body.uiLanguage));
    if(languages.indexOf(values.uiLanguage) < 0) values.uiLanguage = '';

    values.enableCache = readFlag(body.enableCache, locals.enableCache);
    values.debugMode   = readFlag(body.debugMode  , locals.debugMode);

    values.adminClientId = cleanText(body.adminClientId, 'Admin Client ID', errors);
    values.vaultGateway  = cleanText(body.vaultGateway , 'Vault Gateway'  , errors);
    values.vaultName     = cleanText(body.vaultName    , 'Vault Name'     , errors);

    if(typeof body.adminClientSecret === 'undefined') {
        values.adminClientSecret = blankToEmpty(locals.adminClientSecret);
    } else if(String(body.adminClientSecret) === secretPlaceholder) {
        values.adminClientSecret = blankToEmpty(locals.adminClientSecret);
    } else {
        values.adminClientSecret = cleanText(body.adminClientSecret, 'Admin Client Secret', errors);
    }

    values.settings = blankToEmpty(locals.settings);
    if(values.settings === '') values.settings = 'custom.js';
    if(!/^[A-Za-z0-9._-]+\.js$/.test(values.settings)) {
        errors.push('The name of the settings file in your environment file is not valid.');
    }

    let ids = readWorkspaceIds(body.workspaceIds, errors);

    if(errors.length > 0) {
        console.log('  rejected : ' + errors.join(' | '));
        console.log();
        return res.status(400).json({ success : false, errors : errors });
    }

    let files    = [];
    let warnings = [];

    try {

        let pathEnvironment = getEnvironmentPath();
        let previous        = fs.existsSync(pathEnvironment) ? fs.readFileSync(pathEnvironment, 'utf8') : undefined;
        let contents        = matchLineEndings(renderEnvironment(values), previous);

        if(!isLoadable(contents)) throw new Error('The generated environment file could not be validated.');

        backupFile(pathEnvironment, files);
        fs.writeFileSync(pathEnvironment, contents, 'utf8');
        files.push(path.relative(pathRoot, pathEnvironment).split(path.sep).join('/'));

    } catch(error) {
        console.log('  ERROR writing environment file : ' + error.message);
        console.log();
        return res.status(500).json({ success : false, errors : ['The connection settings could not be written : ' + error.message] });
    }

    if(ids !== null) {

        try {

            let requested = values.settings;
            let written   = writeWorkspaceIds(ids, values, files, warnings);

            if(written.settingsFile !== requested) {

                let pathEnvironment = getEnvironmentPath();
                let previous        = fs.existsSync(pathEnvironment) ? fs.readFileSync(pathEnvironment, 'utf8') : undefined;

                values.settings = written.settingsFile;

                fs.writeFileSync(pathEnvironment, matchLineEndings(renderEnvironment(values), previous), 'utf8');

            }

        } catch(error) {
            console.log('  ERROR writing workspace ids : ' + error.message);
            warnings.push('The connection settings were saved, but the workspace ids could not be written : ' + error.message);
        }

    }

    let supervised  = isSupervised();
    let portCurrent = isBlank(locals.port) ? '' : String(locals.port);
    let portNew     = getPortFromUri(values.redirectUri);
    let samePort    = (portCurrent === portNew);

    console.log('  tenant       = ' + values.tenant);
    console.log('  clientId     = ' + values.clientId.substring(0, 8) + '...');
    console.log('  redirectUri  = ' + values.redirectUri);
    console.log('  defaultTheme = ' + values.defaultTheme);
    console.log('  uiLanguage   = ' + (values.uiLanguage === '' ? '(browser language)' : values.uiLanguage));
    console.log('  adminSecret  = ' + (values.adminClientSecret === '' ? '(not set)' : '(set, not printed)'));
    console.log('  files        = ' + files.join(', '));
    console.log();

    res.json({
        success     : true,
        supervised  : supervised,
        restarting  : supervised,
        samePort    : samePort,
        newUrl      : values.redirectUri.replace(/\/callback$/, '/'),
        files       : files,
        warnings    : warnings
    });

    if(supervised) {
        setTimeout(function() {
            console.log();
            console.log('  Restarting the server to apply the new settings');
            console.log();
            process.exit(42);
        }, 750);
    }

});


/* ------------------------------------------------------------------------------
    CONFIGURATION FILE GENERATION
   ------------------------------------------------------------------------------ */
function renderEnvironment(values) {

    let lines = [];

    lines.push('// ---------------------------------------------------------------------------------------------------------------------------');
    lines.push('//  REQUIRED CONNECTION SETTINGS');
    lines.push('// ---------------------------------------------------------------------------------------------------------------------------');
    lines.push('//  Provide the requried parameters below to enable connections to your tenant.');
    lines.push('//  You can provide these settings also by using the matching environment variables insted (i.e. CLIENT_ID).');
    lines.push('//  When using such environment variables, the matching setting below will be overridden.');
    lines.push("//  The value of variable redirectUri must match your APS app's callback URL EXACTLY. ");
    lines.push('//  If you encounter the error "400 - Invalid redirect_uri" when starting apps, please review this link for typos and any other differences.');
    lines.push("//  The 'defaultTheme' setting can be overwritten with each request if needed: add the parameter 'theme' to your request (&theme=dark or &theme=light)");
    lines.push("//  'enableCache' can be used to enable server-side caching of defined data which does not change frequently (ie workspace settings)");
    lines.push('// ---------------------------------------------------------------------------------------------------------------------------');
    lines.push('//  NEW : Use export.settings to reference a file with custom settings. This file must be stored in /settings and should');
    lines.push('//  contain your custom settings only. The standard file settings.js will always be used by the server, but will');
    lines.push('//  me merged with your custom settings before. This enables administrators to copy individual settings to be changed');
    lines.push('//  from settings.js to custom.js. When updates to settings.js will be provided, the custom settings will still remain');
    lines.push('// ---------------------------------------------------------------------------------------------------------------------------');
    lines.push('//  This file was written by the setup wizard on ' + new Date().toISOString() + '.');
    lines.push('//  You can edit it by hand, or simply open ' + values.redirectUri.replace(/\/callback$/, '/setup') + ' again.');
    lines.push('// ---------------------------------------------------------------------------------------------------------------------------');
    lines.push('exports.tenant       = ' + literal(values.tenant) + ';');
    lines.push('exports.clientId     = ' + literal(values.clientId) + ';');
    lines.push('exports.redirectUri  = ' + literal(values.redirectUri) + ';');
    lines.push('exports.defaultTheme = ' + literal(values.defaultTheme) + ';');
    lines.push('exports.enableCache  = ' + (values.enableCache ? 'true' : 'false') + ';');
    lines.push('exports.debugMode    = ' + (values.debugMode ? 'true' : 'false') + ';         // Enables printout of view configuration settings to console for debugging purposes (ie when using insertBOM, insertDetails, ...)');
    lines.push('exports.settings     = ' + literal(values.settings) + ';   // This file must be stored in folder /settings');
    lines.push('');
    lines.push('');
    lines.push('// ---------------------------------------------------------------------------------------------------------------------------');
    lines.push('//  USER INTERFACE LANGUAGE');
    lines.push('// ---------------------------------------------------------------------------------------------------------------------------');
    lines.push("//  Set uiLanguage to 'ja' (Japanese), 'ko' (Korean) or 'en' (English) to force one single language for all users.");
    lines.push("//  Leave it empty ('') to let every user's browser language decide. Can also be provided as environment variable UI_LANGUAGE.");
    lines.push('exports.uiLanguage = ' + literal(values.uiLanguage) + ';');
    lines.push('');
    lines.push('');
    lines.push('// ---------------------------------------------------------------------------------------------------------------------------');
    lines.push('//  OPTIONAL ADDITIONAL CLIENT ID FOR 2-LEGGED AUTHENTICATION');
    lines.push('// ---------------------------------------------------------------------------------------------------------------------------');
    lines.push('//  The applications OUTSTANDING WORK REPORT and  USER SETTINGS MANAGER require an APS application with Client ID and Client Secret for 2-legged authentications, please proivde the given settings in the next variables.');
    lines.push('//  This APS application must be different from the one provided in clientId above as this one must require a Client Secret, to be provided ad adminClientSecret.');
    lines.push('//  Only 2-legged applications enable impersonation - which is required for the two advanced admin applications (OUTSTANDING WORK REPORT and USER SETTINGS MANAGER). ');
    lines.push('//  However, as this impacts security, its is recommended to provide the following settings only if these advanced admin utilities will be used, maybe even only temporarily or in a local copy of this server.');
    lines.push('//  All other applications will work even if the following 2 settings are not provided as they use the clientId variable instead. ');
    lines.push('//  Note that you can also provide these settings using the given environment variables ADMIN_CLIENT_ID and ADMIN_CLIENT_SECRET.');
    lines.push('exports.adminClientId     = ' + literal(values.adminClientId) + ';');
    lines.push('exports.adminClientSecret = ' + literal(values.adminClientSecret) + ';');
    lines.push('');
    lines.push('');
    lines.push('// ---------------------------------------------------------------------------------------------------------------------------');
    lines.push('//  OPTIONAL VAULT SETTINGS');
    lines.push('// ---------------------------------------------------------------------------------------------------------------------------');
    lines.push('//  These optional settings are only required for connections to Vault using the REST API BETA (i.e. when using the addins)');
    lines.push('//  The standard applications of this UX server do not require a Vault connection, the settings usually should be left blank.');
    lines.push('exports.vaultGateway = ' + literal(values.vaultGateway) + ';');
    lines.push('exports.vaultName    = ' + literal(values.vaultName) + ';');
    lines.push('');
    lines.push('');
    lines.push('// ---------------------------------------------------------------------------------------------------------------------------');
    lines.push('//  ENVIRONMENT VARIABLES');
    lines.push('// ---------------------------------------------------------------------------------------------------------------------------');
    lines.push('//  When running the server in the cloud, changing this file might be a challenge');
    lines.push('//  This is why you can also provide all these settings by using the environment variables listed below. ');
    lines.push('//  Environment variables have higher priority, mattching environment variable values overwrite the value defined in this file');
    lines.push('//   - TENANT');
    lines.push('//   - CLIENT_ID');
    lines.push('//   - REDIRECT_URI');
    lines.push('//   - DEFAULT_THEME');
    lines.push('//   - ENABLE_CACHE');
    lines.push('//   - SETTINGS');
    lines.push('//   - DEBUG_MODE');
    lines.push('//   - UI_LANGUAGE');
    lines.push('//   - ADMIN_CLIENT_ID');
    lines.push('//   - ADMIN_CLIENT_SECRET');
    lines.push('//   - VAULT_GATEWAY');
    lines.push('//   - VAULT_NAME');
    lines.push('// ---------------------------------------------------------------------------------------------------------------------------');
    lines.push('');

    return lines.join('\n');

}
function renderWorkspaceIds(ids, indent) {

    let inner = indent + '    ';
    let lines = ['{', ''];
    let width = 0;
    let first = true;

    for(let entry of workspaceKeys) {
        if(typeof entry.key === 'undefined') continue;
        if(entry.key.length > width) width = entry.key.length;
    }

    for(let entry of workspaceKeys) {

        if(typeof entry.group !== 'undefined') {
            if(!first) lines.push('');
            lines.push(inner + '// ' + entry.group);
            first = false;
            continue;
        }

        let id      = (typeof ids[entry.key] === 'number') ? ids[entry.key] : 0;
        let padding = new Array(width - entry.key.length + 1).join(' ');
        let comment = (id === 0) ? '   // not available in this tenant - this workspace gets skipped' : '';

        lines.push(inner + entry.key + padding + ' : ' + id + ',' + comment);

    }

    lines.push('');
    lines.push(indent + '}');

    return lines.join('\n');

}
function renderWizardSettings(ids) {

    let lines = [];

    lines.push('// ---------------------------------------------------------------------------------------------------------------------------');
    lines.push('//  WORKSPACE IDS DETECTED BY THE SETUP WIZARD');
    lines.push('// ---------------------------------------------------------------------------------------------------------------------------');
    lines.push('//  This file was written by the setup wizard on ' + new Date().toISOString() + '.');
    lines.push('//  It reuses every setting of custom.js and only replaces the workspace ids with the ones detected in your tenant.');
    lines.push('//  The wizard created this file because the workspaceIds section of custom.js could not be replaced safely.');
    lines.push('//  Edit custom.js for all other settings - they keep being used from there.');
    lines.push('// ---------------------------------------------------------------------------------------------------------------------------');
    lines.push("const custom = require('./custom.js');");
    lines.push('');
    lines.push('for(let key of Object.keys(custom)) exports[key] = custom[key];');
    lines.push('');
    lines.push('exports.common = Object.assign({}, custom.common, {');
    lines.push('');
    lines.push('    workspaceIds : ' + renderWorkspaceIds(ids, '    '));
    lines.push('');
    lines.push('});');
    lines.push('');

    return lines.join('\n');

}
function matchLineEndings(text, sample) {

    let normalized = String(text).replace(/\r\n/g, '\n');
    let useCrlf    = true;

    if(typeof sample === 'string') useCrlf = (sample.indexOf('\r\n') > -1);

    return useCrlf ? normalized.replace(/\n/g, '\r\n') : normalized;

}
function writeWorkspaceIds(ids, values, files, warnings) {

    let pathCustom = path.join(pathSettings, values.settings);
    let regenerate = (values.settings === 'wizard.js');

    if(!regenerate) {

        if(fs.existsSync(pathCustom)) {

            let source   = fs.readFileSync(pathCustom, 'utf8');
            let location = findObjectLiteral(source, 'workspaceIds');

            if(location !== null) {

                let indent   = getIndentOfOffset(source, location.start);
                let literal  = matchLineEndings(renderWorkspaceIds(ids, indent), source);
                let contents = source.substring(0, location.start) + literal + source.substring(location.end);

                if(isLoadable(contents, ids)) {
                    backupFile(pathCustom, files);
                    fs.writeFileSync(pathCustom, contents, 'utf8');
                    files.push('settings/' + values.settings);
                    return { settingsFile : values.settings };
                }

                warnings.push('The workspaceIds section of settings/' + values.settings + ' could not be replaced safely. The wizard wrote settings/wizard.js instead and left your file untouched.');

            } else {
                warnings.push('No workspaceIds section was found in settings/' + values.settings + '. The wizard wrote settings/wizard.js instead and left your file untouched.');
            }

        } else {
            warnings.push('The file settings/' + values.settings + ' does not exist. The wizard wrote settings/wizard.js instead.');
        }

    }

    let pathWizard = path.join(pathSettings, 'wizard.js');
    let wizard     = matchLineEndings(renderWizardSettings(ids));

    if(fs.existsSync(pathWizard)) backupFile(pathWizard, files);

    fs.writeFileSync(pathWizard, wizard, 'utf8');
    files.push('settings/wizard.js');

    return { settingsFile : 'wizard.js' };

}


/* ------------------------------------------------------------------------------
    SOURCE CODE HELPERS

    findObjectLiteral() locates an object literal assigned to a given key and
    returns its exact boundaries. Comments and strings get masked out first so
    that braces inside them cannot confuse the brace counter. Masking keeps the
    length of the source unchanged, this is why the returned offsets are valid
    for the original source as well.
   ------------------------------------------------------------------------------ */
function maskCommentsAndStrings(source) {

    let output = '';
    let index  = 0;

    while(index < source.length) {

        let char = source.charAt(index);
        let next = source.charAt(index + 1);

        if((char === '/') && (next === '/')) {

            while((index < source.length) && (source.charAt(index) !== '\n')) {
                output += ' ';
                index++;
            }

        } else if((char === '/') && (next === '*')) {

            output += '  ';
            index  += 2;

            while(index < source.length) {
                if((source.charAt(index) === '*') && (source.charAt(index + 1) === '/')) {
                    output += '  ';
                    index  += 2;
                    break;
                }
                output += (source.charAt(index) === '\n') ? '\n' : ' ';
                index++;
            }

        } else if((char === '"') || (char === "'") || (char === '`')) {

            output += ' ';
            index++;

            while(index < source.length) {

                let inner = source.charAt(index);

                if(inner === '\\') {
                    output += ' ';
                    index++;
                    if(index < source.length) {
                        output += ' ';
                        index++;
                    }
                    continue;
                }

                output += (inner === '\n') ? '\n' : ' ';
                index++;

                if(inner === char) break;

            }

        } else {

            output += char;
            index++;

        }

    }

    return output;

}
function findObjectLiteral(source, key) {

    let masked = maskCommentsAndStrings(source);

    if(masked.length !== source.length) return null;

    let regex = new RegExp('(^|[^A-Za-z0-9_$])' + key + '\\s*:\\s*\\{');
    let match = regex.exec(masked);

    if(match === null) return null;

    let start = masked.indexOf('{', match.index);
    let depth = 0;

    if(start < 0) return null;

    for(let index = start; index < masked.length; index++) {

        let char = masked.charAt(index);

        if(char === '{') depth++;
        else if(char === '}') {
            depth--;
            if(depth === 0) return { start : start, end : index + 1 };
        }

    }

    return null;

}
function getIndentOfOffset(source, offset) {

    let start  = source.lastIndexOf('\n', offset) + 1;
    let indent = '';

    for(let index = start; index < offset; index++) {
        let char = source.charAt(index);
        if((char === ' ') || (char === '\t')) indent += char;
        else break;
    }

    return indent;

}
function isLoadable(contents, ids) {

    let pathTemp = path.join(os.tmpdir(), 'plmx-setup-check-' + process.pid + '-' + Date.now() + '.js');

    try {

        fs.writeFileSync(pathTemp, contents, 'utf8');

        let loaded = require(pathTemp);

        delete require.cache[require.resolve(pathTemp)];
        fs.unlinkSync(pathTemp);

        if(typeof ids === 'undefined') return true;
        if(typeof loaded.common === 'undefined') return false;
        if(typeof loaded.common.workspaceIds !== 'object') return false;
        if(loaded.common.workspaceIds === null) return false;

        for(let key in ids) {
            if(loaded.common.workspaceIds[key] !== ids[key]) return false;
        }

        return true;

    } catch(error) {

        try {
            if(fs.existsSync(pathTemp)) fs.unlinkSync(pathTemp);
        } catch(ignore) {}

        return false;

    }

}
function backupFile(pathFile, files) {

    if(!fs.existsSync(pathFile)) return;

    let stamp  = getTimestamp();
    let folder = path.dirname(pathFile);
    let name   = path.basename(pathFile, '.js');
    let target = path.join(folder, name + '.backup-' + stamp + '.js');

    fs.copyFileSync(pathFile, target);

    files.push(path.relative(pathRoot, target).split(path.sep).join('/'));

}


/* ------------------------------------------------------------------------------
    GENERIC HELPERS
   ------------------------------------------------------------------------------ */
function isBlank(value) {

    if(typeof value === 'undefined') return true;
    if(value === null)               return true;

    return (String(value).trim() === '');

}
function blankToEmpty(value) {

    return isBlank(value) ? '' : String(value).trim();

}
function readFlag(value, fallback) {

    // A page which could not read /setup/status sends no value at all for these two
    // switches. Falling back to false would silently turn off the server side cache
    // of a working installation, so the current setting gets kept instead.

    if(typeof value === 'undefined') value = fallback;
    if(value === null)               value = fallback;

    return ((value === true) || (String(value).toLowerCase() === 'true'));

}
function cleanText(value, label, errors) {

    if(isBlank(value)) return '';

    let text = String(value).trim();

    if(rejectedChars.test(text)) {
        errors.push(label + ' contains characters which are not allowed here : quotes, backslashes, tabs or line breaks.');
        return '';
    }

    return text;

}
function literal(value) {

    let text = blankToEmpty(value);

    if(rejectedChars.test(text)) text = '';

    return "'" + text + "'";

}
function normalizeTenant(value) {

    let tenant = blankToEmpty(value);

    if(tenant === '') return '';

    tenant = tenant.replace(/^[a-z]+:\/\//i, '');
    tenant = tenant.split('/')[0];
    tenant = tenant.split('?')[0];
    tenant = tenant.split(':')[0];

    if(tenant.toLowerCase().endsWith('.autodeskplm360.net')) {
        tenant = tenant.substring(0, tenant.length - '.autodeskplm360.net'.length);
    }

    tenant = tenant.split('.')[0];

    return tenant.trim();

}
function readWorkspaceIds(source, errors) {

    if(typeof source === 'undefined') return null;
    if(source === null)               return null;
    if(typeof source !== 'object')    return null;

    let ids   = {};
    let count = 0;

    for(let entry of workspaceKeys) {

        if(typeof entry.key === 'undefined') continue;

        let value = source[entry.key];

        if(typeof value === 'undefined') {
            ids[entry.key] = 0;
            continue;
        }

        let id = parseInt(value, 10);

        if(isNaN(id) || (id < 0)) {
            errors.push('The workspace id provided for ' + entry.label + ' is not a valid number.');
            id = 0;
        }

        ids[entry.key] = id;

        if(id > 0) count++;

    }

    if(count === 0) return null;

    return ids;

}
function getConfiguredWorkspaceIds(locals) {

    let ids     = {};
    let configured = {};

    if(typeof locals.common !== 'undefined') {
        if(typeof locals.common.workspaceIds === 'object') {
            if(locals.common.workspaceIds !== null) configured = locals.common.workspaceIds;
        }
    }

    for(let entry of workspaceKeys) {
        if(typeof entry.key === 'undefined') continue;
        let id = parseInt(configured[entry.key], 10);
        ids[entry.key] = (isNaN(id) || (id < 0)) ? 0 : id;
    }

    return ids;

}
function getEnvironmentPath() {

    if(process.argv.length > 2) {
        let file = process.argv[2];
        if(!file.endsWith('.js')) file += '.js';
        return path.join(pathRoot, 'environments', file);
    }

    return path.join(pathRoot, 'environment.js');

}
function getPortFromUri(uri) {

    let parts = blankToEmpty(uri).split(':');

    if(parts.length < 3) return '';

    return parts[2].split('/')[0];

}
function getTimestamp() {

    let now = new Date();

    return String(now.getFullYear())
        + pad2(now.getMonth() + 1)
        + pad2(now.getDate())
        + '-'
        + pad2(now.getHours())
        + pad2(now.getMinutes())
        + pad2(now.getSeconds());

}
function pad2(value) {

    return (value < 10) ? '0' + value : String(value);

}
function isSupervised() {

    return (process.env.PLMX_SUPERVISED === '1');

}
function isAuthenticated(req) {

    if(typeof req.session                 === 'undefined') return false;
    if(typeof req.session.headers         === 'undefined') return false;
    if(typeof req.session.headers.expires === 'undefined') return false;

    return (new Date(req.session.headers.expires).getTime() > new Date().getTime());

}
function base64URLEncode(value) {

    return value.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

}
function sha256(buffer) {

    return crypto.createHash('sha256').update(buffer).digest();

}


module.exports = router;
module.exports.firstRunRedirect = firstRunRedirect;
