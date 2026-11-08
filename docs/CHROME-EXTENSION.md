# Browser extension — menu entry, Start and Stop

[English](#english) · [日本語](#日本語) · [한국어](#한국어)

---

## English

The extension in the `chrome` folder does two things:

1. **Adds "PLM UX Extensions" to the Fusion Manage menu** (☰, administrators only). It opens All Apps in a new tab.
2. **Starts and stops the app from the browser.** Click the extension's icon in the toolbar. You get the status (Running / Not running, plus the tenant) and the buttons **Start**, **Open apps** and **Stop**.

If the app is not running when you click the menu entry, the extension starts it first. A tab shows "Starting…" for about 10 seconds, then opens All Apps.

When the app is started from the browser, its black window opens **minimised** in the taskbar, so nothing pops up over your demo. **Stop** closes that window as well.

### Setting it up (once)

1. Double-click `Start.cmd` once. Besides starting the app, this tells Chrome where the Start / Stop helper is.
2. In Chrome, open `chrome://extensions`, switch on **Developer mode**, click **Load unpacked** and choose the `chrome` folder inside the app folder. If an older "PLM UX Extensions" is listed there, **remove it first**: this version has a fixed ID, which the helper checks.
3. Click the puzzle icon in the toolbar and pin **PLM UX Extensions**.

### Good to know

- **Use Chrome on managed PCs.** Many company PCs (Autodesk ones included) set the Edge policy `NativeMessagingUserLevelHosts = 0`, which does not allow helpers registered per user. In Edge the menu entry then works, but Start / Stop does not.
- **What gets registered:** two registry values under `HKEY_CURRENT_USER` (Chrome and Edge), pointing at `chrome-host\com.plmx.launcher.json`. No administrator rights are needed, and only this extension's ID may use the helper. The helper understands just three requests: status, start this app's `Start.cmd`, and ask the app to stop.
- **Removing it:** run `runtime\node.exe chrome-host\register.js --remove` in the app folder.
- **"The Start button is not set up on this computer yet"** means `Start.cmd` has not been run from this folder yet, or the folder was moved. Run `Start.cmd` once from its new location.

---

## 日本語

`chrome` フォルダの拡張機能には 2 つの役割があります。

1. **Fusion Manage のメニュー（☰、管理者のみ）に「PLM UX Extensions」を追加**し、すべてのアプリを新しいタブで開きます。
2. **ブラウザからアプリを起動・停止**します。ツールバーの拡張機能アイコンをクリックすると、状態（実行中 / 停止中とテナント）と、**起動**・**アプリを開く**・**停止** ボタンが表示されます。

メニューの項目をクリックしたときにアプリが起動していなければ、拡張機能が先に起動します。タブに「起動しています…」が 10 秒ほど表示され、その後すべてのアプリが開きます。

ブラウザから起動したときは、黒いウィンドウがタスクバーに**最小化**された状態で開くため、デモ中に画面の前に出てきません。**停止** を押すとそのウィンドウも閉じます。

### 初回の設定

1. `Start.cmd` を一度ダブルクリックします。アプリが起動すると同時に、起動・停止用ヘルパーの場所が Chrome に登録されます。
2. Chrome で `chrome://extensions` を開き、**デベロッパー モード** をオンにして **パッケージ化されていない拡張機能を読み込む** をクリックし、アプリ フォルダ内の `chrome` フォルダを選びます。古い「PLM UX Extensions」が表示されている場合は、**先に削除してください**。この版は ID が固定されており、ヘルパーがその ID を確認します。
3. ツールバーのパズル アイコンをクリックし、**PLM UX Extensions** を固定します。

### 補足

- **管理された PC では Chrome を使用してください。** 多くの企業 PC（Autodesk の PC を含む）では Edge のポリシー `NativeMessagingUserLevelHosts = 0` によりユーザー単位のヘルパーが許可されていません。その場合 Edge ではメニュー項目は使えますが、起動・停止は使えません。
- **登録される内容：** `HKEY_CURRENT_USER` の下に 2 つのレジストリ値（Chrome と Edge）が作られ、`chrome-host\com.plmx.launcher.json` を指します。管理者権限は不要で、このヘルパーを使えるのはこの拡張機能の ID だけです。ヘルパーが受け付けるのは、状態の確認、このアプリの `Start.cmd` の起動、アプリへの停止依頼の 3 つだけです。
- **削除するには：** アプリ フォルダで `runtime\node.exe chrome-host\register.js --remove` を実行します。
- **「このコンピューターでは起動ボタンがまだ設定されていません」** と表示された場合は、このフォルダから `Start.cmd` がまだ実行されていないか、フォルダが移動されています。新しい場所で `Start.cmd` を一度実行してください。

---

## 한국어

`chrome` 폴더의 확장 프로그램은 두 가지 일을 합니다.

1. **Fusion Manage 메뉴(☰, 관리자 전용)에 "PLM UX Extensions"를 추가**하고, 모든 앱을 새 탭에서 엽니다.
2. **브라우저에서 앱을 시작·중지**합니다. 도구 모음의 확장 프로그램 아이콘을 클릭하면 상태(실행 중 / 중지됨과 테넌트)와 **시작**, **앱 열기**, **중지** 버튼이 표시됩니다.

메뉴 항목을 클릭했을 때 앱이 실행 중이 아니면 확장 프로그램이 먼저 시작합니다. 탭에 "시작하는 중…"이 10초 정도 표시된 뒤 모든 앱이 열립니다.

브라우저에서 시작하면 검은 창이 작업 표시줄에 **최소화**된 상태로 열리므로 데모 중에 화면 앞으로 튀어나오지 않습니다. **중지**를 누르면 그 창도 닫힙니다.

### 처음 한 번 설정

1. `Start.cmd`를 한 번 더블클릭합니다. 앱이 시작되면서 시작·중지 도우미의 위치가 Chrome에 등록됩니다.
2. Chrome에서 `chrome://extensions`를 열고 **개발자 모드**를 켠 다음 **압축해제된 확장 프로그램을 로드합니다**를 클릭하고 앱 폴더 안의 `chrome` 폴더를 선택합니다. 이전 "PLM UX Extensions"가 목록에 있으면 **먼저 삭제하세요**. 이 버전은 ID가 고정되어 있고 도우미가 그 ID를 확인합니다.
3. 도구 모음의 퍼즐 아이콘을 클릭하고 **PLM UX Extensions**를 고정합니다.

### 참고

- **관리되는 PC에서는 Chrome을 사용하세요.** 많은 회사 PC(Autodesk PC 포함)는 Edge 정책 `NativeMessagingUserLevelHosts = 0`으로 사용자 단위 도우미를 허용하지 않습니다. 이 경우 Edge에서는 메뉴 항목은 작동하지만 시작·중지는 작동하지 않습니다.
- **등록되는 내용:** `HKEY_CURRENT_USER` 아래에 레지스트리 값 2개(Chrome, Edge)가 만들어지며 `chrome-host\com.plmx.launcher.json`을 가리킵니다. 관리자 권한은 필요 없고, 이 도우미는 이 확장 프로그램의 ID만 사용할 수 있습니다. 도우미가 받는 요청은 상태 확인, 이 앱의 `Start.cmd` 실행, 앱에 중지 요청 세 가지뿐입니다.
- **제거하려면:** 앱 폴더에서 `runtime\node.exe chrome-host\register.js --remove`를 실행합니다.
- **"이 컴퓨터에는 아직 시작 버튼이 설정되지 않았습니다"**가 표시되면 이 폴더에서 `Start.cmd`를 아직 실행하지 않았거나 폴더가 이동된 것입니다. 새 위치에서 `Start.cmd`를 한 번 실행하세요.
