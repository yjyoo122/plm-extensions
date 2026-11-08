importScripts('common.js');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

	if (request.action === 'fetchData' && request.url) {
		fetch(request.url)
			.then(response => response.json())
			.then(data => sendResponse({ success: true, data: data }))
			.catch(error => sendResponse({ success: false, error: error.message }));
		return true;
	}

	// A PLM UX command or button was clicked in Fusion Manage : open its page in a new tab next to the
	// current one. When the UX server is not running, go through starting.html, which starts it first.
	if (request.action === 'openCommand' && request.url) {
		openCommand(request.url, sender.tab).then(() => sendResponse({ success: true }));
		return true;
	}

});

async function openCommand(url, tab) {

	let settings = await plmxGetSettings();
	let target   = String(url);

	if (target.indexOf(settings.serverUrl + '/') !== 0) return;

	let running  = await plmxProbe(settings.serverUrl);
	let options  = { url: target };

	if (!running && plmxIsLocal(settings.serverUrl)) {
		options.url = chrome.runtime.getURL('starting.html') + '?target=' + encodeURIComponent(target);
	}

	if (tab && (typeof tab.index === 'number')) {
		options.index       = tab.index + 1;
		options.openerTabId = tab.id;
	}

	chrome.tabs.create(options);

}
