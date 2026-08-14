# PLM Extensions — Installation and User Guide (English)

日本語: [INSTALL-ja.md](INSTALL-ja.md) · 한국어: [INSTALL-ko.md](INSTALL-ko.md)

---

## 1. What this is

This package is a set of custom web applications ("User Experiences") that run on top of **your own Autodesk Fusion Manage tenant** — a PLM Portal, a Workspace Navigator, BOM editors, dashboards and a handful of administration utilities. It runs as a small web server on **your own PC**; you open it in your browser at `http://localhost:8080`, and it talks to your tenant through the Fusion Manage REST APIs. It is free: there is no server to rent and nothing is hosted anywhere — your PLM data travels only between your PC and your own tenant, and none of it is stored outside Fusion Manage.

> This is **not an official Autodesk product**. It is community source code provided as is, with no warranty. See the disclaimer in the repository `README.md`.

---

## 2. Before you start

| You need | You do **not** need |
| -- | -- |
| A Fusion Manage tenant you can log into with your Autodesk account | To install anything by hand — the package brings everything it needs, including the Node.js runtime it runs on |
| Permission to whitelist a Client ID in your tenant's General Settings (or an administrator who will do it for you) | A terminal / command prompt — you never type a command |
| A Windows 11 PC and a browser (Chrome or Edge) | Any coding, or editing any `.js` file by hand |
| About **10 minutes** | A credit card — the Autodesk Platform Services (APS) APIs used here are free of charge |

**Glossary of terms used below**

| Term | Meaning in plain English |
| -- | -- |
| **Tenant** | Your company's Fusion Manage site. It is the first part of the address you use to log in: for `https://acme.autodeskplm360.net`, the tenant name is `acme`. |
| **APS** | Autodesk Platform Services — the Autodesk developer site where you register an "application" so this tool is allowed to sign you in. |
| **Client ID** | A long code (looks like `k7QsX2f9...`) that identifies the APS application you create in Step 1. It is not a password and it is not secret. |
| **Callback URL** | The address Autodesk sends your browser back to after you log in. It must match exactly on both sides. |
| **Workspace (ワークスペース / 작업공간)** | A Fusion Manage data area, e.g. Items, Change Orders, Projects. |
| **Console window** | The black text window that appears when you start the app. It *is* the app — see Step 3. |

---

## 3. Step 1 — Create the APS application

1. Open <https://aps.autodesk.com/myapps/create> in your browser.
2. Sign in with the **same Autodesk account** you use for Fusion Manage.
3. Under **Choose an API**, tick the APIs you want available (the defaults are fine).
4. For **application type**, choose **`Desktop, Mobile, Single-Page App`**.
   *This matters.* If you pick "Web App" or "Server-to-Server", login will later fail with a **401** error.
5. Give the app any **Name** and **Description** you like — for example `PLM Extensions (local)`.
6. In **Callback URL**, type exactly:

   ```
   http://localhost:8080/callback
   ```

   Check it character by character:

   | Common mistake | Result |
   | -- | -- |
   | `https://localhost:8080/callback` | `400 - Invalid redirect_uri` |
   | `http://localhost:8080/callback/` (trailing slash) | `400 - Invalid redirect_uri` |
   | `http://127.0.0.1:8080/callback` | `400 - Invalid redirect_uri` |
   | `http://localhost:3000/callback` (wrong port) | `400 - Invalid redirect_uri` |

7. Click **Create app**.
8. On the page that appears, find **Client ID** and click the copy icon. **Keep this page open** — you will paste this value twice (Step 2 and Step 4).

---

## 4. Step 2 — Whitelist the Client ID in Fusion Manage

Your tenant will refuse a login from an unknown application, so the Client ID must be registered once.

1. Log into your Fusion Manage tenant.
2. Open the **Administration** menu (the gear icon, top right) → **General Settings**.
3. Find the setting for allowed / whitelisted **Client IDs** (in some tenant versions it is labelled *Forge Client IDs* or *APS Client IDs*).
4. Paste the Client ID you copied in Step 1. If other IDs are already listed, add yours on a new line — do not delete the existing entries.
5. Save.

> No administration rights? Send the Client ID to your Fusion Manage administrator and ask them to add it here. Nothing else in this guide requires admin rights, except the Administration Utilities described in section 9.

---

## 5. Step 3 — Unzip and run

1. Download the package `.zip` file.
2. Right-click it → **Extract All…** and extract it anywhere you like. **Your Desktop is fine.**
   Avoid folders synchronised by OneDrive if you can — synchronisation can lock files while the app runs.
3. Open the extracted folder and double-click **`Start.cmd`**.
4. A **black console window** opens and fills with text.

   > **Important:** that black window *is the application*. It is not an error and it is not a leftover. **Leave it open** for as long as you want to use the apps. Closing it stops the server, and your browser tabs will stop working.
   >
   > You can minimise it. Do not press `Ctrl` + `C` inside it unless you want to stop the app.

5. The first time you run it, the window may sit for a minute or two while it prepares itself. This is normal.
6. Your default browser opens automatically at `http://localhost:8080`. If it does not, open a browser yourself and type that address.

If Windows shows a security warning at this point, see **SmartScreen** in the troubleshooting table (section 9).

---

## 6. Step 4 — The setup wizard

The first time the app starts with no connection settings, the browser opens the **setup wizard** at `http://localhost:8080/setup` instead of the landing page.

Fill in the form top to bottom:

| Field | What to enter |
| -- | -- |
| **Tenant** | Just the tenant name, not the full address. For `https://acme.autodeskplm360.net`, enter `acme`. |
| **Client ID** | Paste the value from Step 1. |
| **Callback URL** | Leave it at `http://localhost:8080/callback` — it must match the APS application exactly. |
| **Theme** | `dark` or `light`. You can change this later, or per request by adding `&theme=light` to any URL. |
| **Language** | `English`, `日本語 (ja)` or `한국어 (ko)`. This becomes the default for the user interface. |

Then:

1. Click **Discover workspaces**. The wizard signs you into your tenant (a normal Autodesk login window appears — approve it), reads the list of workspaces from your tenant, and fills in the numeric **workspace IDs** automatically.
   * Workspaces that do not exist in your tenant are simply left empty — that is fine and expected.
   * These IDs are what the apps use to find your Items, Change Orders (変更オーダ / 변경 오더), Projects and so on. Without them, lists in the apps stay blank.
2. Review the result. You can correct any single ID by hand in the wizard if you know better.
3. Click **Save**.

The wizard writes your answers into `environment.js` and `settings/custom.js` for you, then **the app restarts itself**. The console window will briefly print restart messages — this is expected, do not close it. After a few seconds, refresh the browser and you land on the main page.

> You can re-open the wizard at any time at `http://localhost:8080/setup` to change the tenant, theme, language, or to re-run workspace discovery.

---

## 7. Step 5 — Using it

* **Landing page — `http://localhost:8080`**
  Lists every available application with a short description and, where relevant, extra setup notes for that specific app. Start here the first time.
* **Start Menu — `http://localhost:8080/start`**
  A compact launcher for every application that does not need a specific PLM record as its starting point (the BOM editors, for example, are opened *from* an item and so are not listed here).
* Applications that work on one record are normally opened from Fusion Manage itself, or by adding the record to the URL. The landing page explains this per application.

### Switching language later

Two ways, both instant:

1. **The language selector in the page header** — choose `English` / `日本語` / `한국어`. The page reloads once and your choice is remembered in this browser, so it applies to every app from then on.
2. **On any URL**, add `?uilang=ja` (Japanese), `?uilang=ko` (Korean) or `?uilang=en` (English). For example:

   ```
   http://localhost:8080/start?uilang=ja
   ```

   If the URL already has a `?` in it, use `&uilang=ja` instead.

Any text that has not been translated yet stays in English — nothing breaks, and you can always fall back to `?uilang=en`.

---

## 8. Stopping and restarting

| To… | Do this |
| -- | -- |
| **Stop** the app | Close the black console window (click its **X**), or click inside it and press `Ctrl` + `C`. |
| **Restart** it | Double-click `Start.cmd` again. |
| Recover from a frozen page | Stop, then restart, then refresh the browser (`F5`). |

Nothing is lost by stopping the app: no data is stored on your PC — everything lives in your Fusion Manage tenant.

You do **not** need to leave your PC on for colleagues. This server is for you alone; each colleague installs their own copy.

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
| -- | -- | -- |
| `400 - Invalid redirect_uri` when logging in | The **Callback URL** in your APS application does not match the `redirectUri` used by the server, character for character. Usual culprits: a trailing `/`, `https` instead of `http`, `127.0.0.1` instead of `localhost`, or a different port. | Open <https://aps.autodesk.com/myapps>, open your app, and set the callback to exactly `http://localhost:8080/callback`. Then confirm the same value in the setup wizard. |
| **401 Unauthorized** after logging in | Either the APS app is the wrong type, or the Client ID was never whitelisted in the tenant. | Check that the APS app type is **Desktop, Mobile, Single-Page App** (type cannot be changed after creation — create a new app if it is wrong). Then re-check Step 2. |
| Login window appears, then loops back to login | Cookies blocked for `localhost`, or you signed in with an Autodesk account that has no access to this tenant. | Allow cookies for `localhost` and sign in with the account you use for Fusion Manage. |
| Console shows `EADDRINUSE` / `address already in use` / the page never loads | **Port 8080 is already taken** by another program (a second copy of this app, or another development tool). | Close the other copy of the console window and try again. If another program owns the port permanently, change the port: open the setup wizard and set the callback URL to a free port, e.g. `http://localhost:8081/callback`, **and** change the callback URL in your APS application to the identical value. |
| **Windows protected your PC** (SmartScreen) when double-clicking `Start.cmd` | Windows does not recognise a downloaded `.cmd` file. | Click **More info** → **Run anyway**. If you prefer: right-click the original `.zip` before extracting → **Properties** → tick **Unblock** → OK, then extract again. |
| Antivirus blocks or deletes `Start.cmd`, or Windows Firewall asks for permission | Corporate security software treats scripts and local servers as suspicious. | Allow the file / allow access on **Private networks** only. If your policy forbids it, ask IT to whitelist the extracted folder. |
| Workspace lists (Items, Change Orders, …) are **blank** in the apps | The workspace IDs are missing or wrong — either discovery was never run, or that workspace does not exist in your tenant. | Re-open `http://localhost:8080/setup` and run **Discover workspaces** again. If a workspace genuinely does not exist in your tenant, leave it empty — the apps needing it will not work, the others are unaffected. |
| BOM tree navigation is empty or errors, in any BOM-based app | These applications require a **BOM view named `Tree Navigator`** in your tenant, as called out in the repository `README.md`. New tenants will get it by default; older ones will not. | In Fusion Manage, create a BOM view named exactly `Tree Navigator` on the Items workspace, containing **only** these columns: `Descriptor`, `Number`, `Quantity`. |
| An app shows "no permission" / empty admin data | Some applications need PLM privileges you do not have. **Tenant Insights** in particular needs **system administrator** privileges (it reads the tenant system log). The other admin utilities need administration permission. | Ask a tenant administrator to run these, or to grant you the role. |
| **Outstanding Work Report** or **User Settings Manager** does not start | These two utilities impersonate other users, which needs *2-legged* authentication — that means a **second, different** APS application, of a type that has a **Client Secret**. | Create a second APS application (a server-to-server type, which issues a Client Secret), then enter its Client ID and Client Secret as `adminClientId` / `adminClientSecret` in the setup wizard's advanced section. Only do this if you actually need these two utilities — a Client Secret is sensitive, treat it like a password and never share it. |
| Some app menu entries are missing | The Start Menu and the list of enabled applications are configurable. | This is a settings change in `settings/custom.js` (`exports.menu`, `exports.server.servicesEnabled`) — ask whoever maintains your copy. |
| Interface is partly English after switching to 日本語 / 한국어 | Normal. Translation is dictionary-based and grows over time; anything not yet translated falls back to English. | Nothing to fix. Contributors can extend the dictionary — see [I18N.md](I18N.md). |
| A PLM record's own value got translated (e.g. an item literally named "New" shows as 新規) | The translation layer matches whole strings, so a data value identical to a UI label is also translated. | See the "false positives" section of [I18N.md](I18N.md). It is a one-line exclusion for the affected region — whoever maintains your copy can add it. |

---

## 10. Updating to a newer version

Your settings live in exactly two files. Keep them and you keep your configuration.

1. **Stop** the app (close the console window).
2. Download the new `.zip` and extract it into a **new, separate folder** — do not extract on top of the old one.
3. From your **old** folder, copy these two files into the **new** folder, overwriting the new copies:

   | File | Contains |
   | -- | -- |
   | `environment.js` | Tenant, Client ID, callback URL, theme, language |
   | `settings/custom.js` | Workspace IDs and any other custom settings |

   If you use several tenants, also copy the whole `environments/` folder and any extra files you added under `settings/`.
4. Double-click `Start.cmd` in the **new** folder.
5. Check the landing page loads and one app opens correctly.
6. Keep the old folder for a week or so as a fallback, then delete it.

> If a release changes the structure of the settings, the setup wizard will tell you and can regenerate `settings/custom.js` for you — re-running **Discover workspaces** is always safe.
