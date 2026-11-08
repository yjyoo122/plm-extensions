// ------------------------------------------------------------------------------------------------------
//  Shared by the background worker, the popup (options.html) and the start page (starting.html)
//
//  The texts of the extension's own pages come in English, Japanese and Korean. The language follows
//  the browser unless one is picked in the popup. They are kept in this plain script instead of Chrome's
//  _locales folders because the installer download on the landing page copies the files of this folder
//  only, no subfolders - and a manifest naming a default locale without them does not load at all.
// ------------------------------------------------------------------------------------------------------

const PLMX_HOST        = 'com.plmx.launcher';   // the start / stop helper, see chrome-host/register.js
const PLMX_DEFAULT_URL = 'http://localhost:8080';

let PLMX_LANGUAGE = '';                          // '' = follow the browser

const PLMX_STRINGS = {

    en : {
        title          : 'PLM UX Extensions',
        checking       : 'Checking…',
        running        : 'Running',
        stopped        : 'Not running',
        starting       : 'Starting…',
        stopping       : 'Stopping…',
        tenant         : 'Tenant',
        start          : 'Start',
        stop           : 'Stop',
        open           : 'Open apps',
        stopHint       : 'Apps already open in other tabs stop working until you start it again.',
        startHint      : 'Opens minimised in the taskbar - no window pops up over your browser.',
        noHelper       : 'The Start button is not set up on this computer yet. Double-click Start.cmd in the Fusion Manage UX folder once - that sets it up - then try again.',
        remoteServer   : 'This server is not on this computer, so it cannot be started or stopped from here.',
        startTimeout   : 'The app did not answer within a minute. Look for the "Fusion Manage UX" window in the taskbar - it explains what went wrong.',
        error          : 'Something went wrong :',
        settings       : 'Settings',
        serverUrl      : 'UX server URL',
        save           : 'Save',
        saved          : 'Saved. Reload the Fusion Manage page to apply it.',
        startingTitle  : 'Starting PLM UX Extensions…',
        startingText   : 'This takes about 10 seconds. The page opens by itself as soon as the app is ready.',
        alreadyRunning : 'Opening…',
        language       : 'Language',
        languageAuto   : 'Same as browser'
    },

    ja : {
        title          : 'PLM UX Extensions',
        checking       : '確認しています…',
        running        : '実行中',
        stopped        : '停止中',
        starting       : '起動しています…',
        stopping       : '停止しています…',
        tenant         : 'テナント',
        start          : '起動',
        stop           : '停止',
        open           : 'アプリを開く',
        stopHint       : '他のタブで開いているアプリは、再び起動するまで使えなくなります。',
        startHint      : 'タスクバーに最小化して起動します。ブラウザの前に画面は出ません。',
        noHelper       : 'このコンピューターでは起動ボタンがまだ設定されていません。Fusion Manage UX フォルダの Start.cmd を一度ダブルクリックすると設定されます。その後もう一度お試しください。',
        remoteServer   : 'このサーバーはこのコンピューター上にないため、ここから起動・停止できません。',
        startTimeout   : '1 分以内にアプリが応答しませんでした。タスクバーの「Fusion Manage UX」ウィンドウに原因が表示されています。',
        error          : 'エラーが発生しました：',
        settings       : '設定',
        serverUrl      : 'UX サーバーの URL',
        save           : '保存',
        saved          : '保存しました。Fusion Manage のページを再読み込みすると反映されます。',
        startingTitle  : 'PLM UX Extensions を起動しています…',
        startingText   : '10 秒ほどかかります。準備ができるとページが自動的に開きます。',
        alreadyRunning : '開いています…',
        language       : '言語',
        languageAuto   : 'ブラウザと同じ'
    },

    ko : {
        title          : 'PLM UX Extensions',
        checking       : '확인 중…',
        running        : '실행 중',
        stopped        : '중지됨',
        starting       : '시작하는 중…',
        stopping       : '중지하는 중…',
        tenant         : '테넌트',
        start          : '시작',
        stop           : '중지',
        open           : '앱 열기',
        stopHint       : '다른 탭에 열려 있는 앱은 다시 시작할 때까지 작동하지 않습니다.',
        startHint      : '작업 표시줄에 최소화된 상태로 시작되며, 브라우저 앞에 창이 뜨지 않습니다.',
        noHelper       : '이 컴퓨터에는 아직 시작 버튼이 설정되지 않았습니다. Fusion Manage UX 폴더의 Start.cmd를 한 번 더블클릭하면 설정됩니다. 그런 다음 다시 시도하세요.',
        remoteServer   : '이 서버는 이 컴퓨터에 있지 않으므로 여기에서 시작하거나 중지할 수 없습니다.',
        startTimeout   : '1분 안에 앱이 응답하지 않았습니다. 작업 표시줄의 "Fusion Manage UX" 창에 원인이 표시되어 있습니다.',
        error          : '오류가 발생했습니다:',
        settings       : '설정',
        serverUrl      : 'UX 서버 URL',
        save           : '저장',
        saved          : '저장했습니다. Fusion Manage 페이지를 새로 고치면 적용됩니다.',
        startingTitle  : 'PLM UX Extensions를 시작하는 중…',
        startingText   : '10초 정도 걸립니다. 준비되면 페이지가 자동으로 열립니다.',
        alreadyRunning : '여는 중…',
        language       : '언어',
        languageAuto   : '브라우저와 동일'
    }

};

function plmxLanguage() {

    if(PLMX_STRINGS[PLMX_LANGUAGE]) return PLMX_LANGUAGE;

    let browser = String(navigator.language || 'en').toLowerCase().split('-')[0];

    return PLMX_STRINGS[browser] ? browser : 'en';

}

function plmxText(key) {

    let table = PLMX_STRINGS[plmxLanguage()];

    return (typeof table[key] === 'string') ? table[key] : PLMX_STRINGS.en[key];

}

// Fills every element carrying data-text="key" with the text of the current language
function plmxApplyTexts(root) {

    for(let elem of (root || document).querySelectorAll('[data-text]')) elem.textContent = plmxText(elem.getAttribute('data-text'));

    document.documentElement.lang = plmxLanguage();

}


// Server URL and language as saved in the popup
function plmxGetSettings() {

    return new Promise(function(resolve) {
        chrome.storage.sync.get(['serverUrl', 'language'], function(data) {
            let serverUrl = (data && data.serverUrl) ? String(data.serverUrl) : PLMX_DEFAULT_URL;
            PLMX_LANGUAGE = (data && data.language)  ? String(data.language)  : '';
            resolve({ serverUrl : serverUrl.replace(/\/+$/, ''), language : PLMX_LANGUAGE });
        });
    });

}

// Only a server on this very computer can be started and stopped by the helper
function plmxIsLocal(serverUrl) {

    try {
        let host = new URL(serverUrl).hostname;
        return ['localhost', '127.0.0.1', '[::1]'].includes(host);
    } catch(error) {
        return false;
    }

}

// Does the server answer at all - any HTTP response counts, only a failed connection does not
async function plmxProbe(serverUrl) {

    let controller = new AbortController();
    let timer      = setTimeout(function() { controller.abort(); }, 2500);

    try {
        await fetch(serverUrl + '/services/chrome', { cache : 'no-store', signal : controller.signal });
        return true;
    } catch(error) {
        return false;
    } finally {
        clearTimeout(timer);
    }

}

// One request to the start / stop helper : { cmd : 'status' | 'start' | 'stop' }
function plmxHelper(cmd) {

    return new Promise(function(resolve) {

        try {
            chrome.runtime.sendNativeMessage(PLMX_HOST, { cmd : cmd }, function(response) {

                if(chrome.runtime.lastError) {

                    // "Specified native messaging host not found." / "Access ... is forbidden." both mean
                    // that Start.cmd has not registered the helper on this computer yet
                    let message = String(chrome.runtime.lastError.message || '');
                    let missing = /not found|forbidden/i.test(message);

                    resolve({ ok : false, code : missing ? 'no-helper' : 'error', message : message });

                } else if(!response || (typeof response !== 'object')) {
                    resolve({ ok : false, code : 'error', message : 'No answer from the helper' });
                } else {
                    resolve(response);
                }

            });
        } catch(error) {
            resolve({ ok : false, code : 'error', message : error.message });
        }

    });

}

// Waits until the app reports the expected state, polling once a second
async function plmxWaitFor(running, seconds) {

    for(let i = 0; i < seconds; i++) {

        await new Promise(function(resolve) { setTimeout(resolve, 1000); });

        let status = await plmxHelper('status');

        if(status.ok && (status.running === running)) return status;

    }

    return null;

}
