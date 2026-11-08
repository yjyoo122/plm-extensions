// Opened in a new tab when a PLM UX command is clicked in Fusion Manage while the UX server is not
// running : starts it through the helper, waits until it answers, then continues to the page that was
// asked for (?target=...). Only pages of the configured UX server are accepted as target.

function fail(text) {

    document.body.classList.add('failed');

    let elem = document.getElementById('message');

    elem.textContent = text;
    elem.classList.remove('hidden');

}

plmxGetSettings().then(async function(settings) {

    plmxApplyTexts();

    let target = new URLSearchParams(location.search).get('target') || '';

    if(target.indexOf(settings.serverUrl + '/') !== 0) target = settings.serverUrl + '/landing';

    let status = await plmxHelper('status');

    if(!status.ok) {
        // the helper is missing, but the server may still have been started by hand meanwhile
        if(await plmxProbe(settings.serverUrl)) return location.replace(target);
        return fail((status.code === 'no-helper') ? plmxText('noHelper') : plmxText('error') + ' ' + status.message);
    }

    if(status.running) {
        document.getElementById('title').textContent = plmxText('alreadyRunning');
        return location.replace(target);
    }

    let result = await plmxHelper('start');

    if(!result.ok) return fail(plmxText('error') + ' ' + result.message);

    if(!result.already && (await plmxWaitFor(true, 60) === null)) return fail(plmxText('startTimeout'));

    location.replace(target);

});
