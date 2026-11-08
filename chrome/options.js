// Popup of the toolbar button : shows whether the UX server is running, starts and stops it through
// the helper registered by Start.cmd (chrome-host/), opens the apps, and keeps the extension settings.

let settings  = { serverUrl : PLMX_DEFAULT_URL, language : '' };
let hasHelper = false;
let busy      = false;

const elemStatus  = document.getElementById('status');
const elemText    = document.getElementById('status-text');
const elemTenant  = document.getElementById('status-tenant');
const elemStart   = document.getElementById('start');
const elemStop    = document.getElementById('stop');
const elemOpen    = document.getElementById('open');
const elemHint    = document.getElementById('hint');
const elemMessage = document.getElementById('message');


function show(elem, visible) {

    elem.classList.toggle('hidden', !visible);

}

function setMessage(text) {

    elemMessage.textContent = text || '';
    show(elemMessage, !!text);

}

function render(state, status) {

    let local = plmxIsLocal(settings.serverUrl);

    elemStatus.className = (state === 'running') ? 'running' : (state === 'stopped') ? 'stopped' : 'busy';
    elemText.textContent = plmxText(state);

    let tenant = (status && status.tenant) ? status.tenant : '';

    if(status && status.profile && (status.profile !== status.tenant)) tenant += '  (' + status.profile + ')';

    elemTenant.textContent = plmxText('tenant') + ' : ' + tenant;
    show(elemTenant, (state === 'running') && (tenant !== ''));

    show(elemStart, (state === 'stopped') && local);
    show(elemOpen,  (state === 'running'));
    show(elemStop,  (state === 'running') && local && hasHelper);

    elemStart.disabled = busy || !hasHelper;
    elemStop.disabled  = busy;
    elemOpen.disabled  = busy;

    let hint = '';

    if(!local)                                       hint = plmxText('remoteServer');
    else if((state === 'stopped') && hasHelper)      hint = plmxText('startHint');
    else if((state === 'running') && hasHelper)      hint = plmxText('stopHint');

    elemHint.textContent = hint;
    show(elemHint, hint !== '');

}

async function refresh() {

    if(!plmxIsLocal(settings.serverUrl)) {
        hasHelper = false;
        render((await plmxProbe(settings.serverUrl)) ? 'running' : 'stopped');
        return;
    }

    let status = await plmxHelper('status');

    if(status.ok) {
        hasHelper = true;
        setMessage('');
        render(status.running ? 'running' : 'stopped', status);
        return;
    }

    // Without the helper the state can still be shown, only the Start and Stop buttons cannot work
    hasHelper = false;

    let running = await plmxProbe(settings.serverUrl);

    render(running ? 'running' : 'stopped');

    if(running)                         setMessage('');
    else if(status.code === 'no-helper') setMessage(plmxText('noHelper'));
    else                                 setMessage(plmxText('error') + ' ' + status.message);

}


elemStart.addEventListener('click', async function() {

    busy = true;
    setMessage('');
    render('starting');

    let result = await plmxHelper('start');

    if(!result.ok) {
        busy = false;
        await refresh();
        setMessage((result.code === 'no-helper') ? plmxText('noHelper') : plmxText('error') + ' ' + result.message);
        return;
    }

    let status = result.already ? result : await plmxWaitFor(true, 60);

    busy = false;

    if(status === null) {
        await refresh();
        setMessage(plmxText('startTimeout'));
    } else {
        render('running', status);
    }

});

elemStop.addEventListener('click', async function() {

    busy = true;
    setMessage('');
    render('stopping');

    let result = await plmxHelper('stop');

    if(!result.ok) {
        busy = false;
        await refresh();
        setMessage(plmxText('error') + ' ' + result.message);
        return;
    }

    await plmxWaitFor(false, 15);

    busy = false;

    await refresh();

});

elemOpen.addEventListener('click', function() {

    chrome.tabs.create({ url : settings.serverUrl + '/landing' });
    window.close();

});

document.getElementById('save').addEventListener('click', function() {

    let url = document.getElementById('serverUrl').value.trim().replace(/\/+$/, '');

    if(url === '') url = PLMX_DEFAULT_URL;

    let language = document.getElementById('language').value;

    document.getElementById('serverUrl').value = url;

    chrome.storage.sync.set({ serverUrl : url, language : language }, function() {
        settings.serverUrl = url;
        settings.language  = language;
        PLMX_LANGUAGE      = language;
        plmxApplyTexts();
        show(document.getElementById('saved'), true);
        refresh();
    });

});


plmxGetSettings().then(function(saved) {

    settings = saved;

    document.getElementById('serverUrl').value = settings.serverUrl;
    document.getElementById('language').value  = settings.language;

    plmxApplyTexts();
    refresh();

});
