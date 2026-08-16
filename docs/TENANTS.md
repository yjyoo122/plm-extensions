# Working with several tenants

This app normally connects to one Fusion Manage tenant. If you demonstrate to several customers, you
can set up a **tenant profile** for each of them and pick the one you want every time you start the
app. No terminal and no hand editing of files is involved.


## What a tenant profile is

A profile is a name, such as `tokyo-demo`, standing for two files:

| File | What it holds |
|---|---|
| `environments\tokyo-demo.js` | the connection settings: tenant name, Client ID, callback URL, theme, language |
| `settings\tokyo-demo.js` | the workspace ids of that tenant |

Everything else - menus, application settings, the BOM view name and so on - keeps coming from
`settings\custom.js`, which all profiles share. Change something there and it applies to every
tenant at once.

The settings your app currently runs on without any profile live in `environment.js` and
`settings\custom.js`. That pair keeps working exactly as before. Profiles are added next to it, and
you never have to create one if you only ever use a single tenant.


## Creating a profile

1. Start the app and let it open in your browser.
2. Open the setup wizard at `http://localhost:8080/setup`.
3. Fill in the tenant name and the Client ID of the **new** customer tenant in step 2. The wizard
   header always tells you which profile you are editing, so you can see that you are not about to
   overwrite the tenant you came from.
4. Go to step 6, **Save and restart**.
5. Under *Where should this be saved?* choose **Save as a new tenant profile** and type a name.
   Allowed are the letters a to z, digits, dashes and underscores - the name becomes a file name and
   the entry you will pick in the wizard list, so something like `tokyo-demo` or `customer-abc` works
   well. Japanese and Korean characters, spaces and dots are refused.
6. Press **Save the tenant profile**.

The server does not restart. It stays connected to the tenant it was started with, because a running
server cannot swap its own connection settings. The new profile is simply there, ready to be picked
and can be switched to from the same page.

If a profile of that name already exists, the wizard says so and does nothing. Press Save a second
time to confirm, and a timestamped backup of both files is kept next to the originals.


## Switching tenant

Switching happens in the setup wizard, not in the black console window. That window never asks you
anything - the app always starts on whatever tenant the wizard recorded, so a colleague who only
double-clicks the icon is never presented with a decision.

1. Open the setup wizard - the gear in any application header, or `http://localhost:8080/setup`.
2. Go to step 6, **Save and restart**, and look at **Tenant profiles on this server**.
3. Every tenant this app can run on is listed there, including the default settings in
   `environment.js`. The one currently running carries a green **running right now** badge.
4. Press **Switch to this tenant** on the one you want.

The app restarts itself and the page reloads on the new tenant, usually within a few seconds. Leave
the console window open while that happens.

The choice is remembered in a small file named `.plmx-profile` next to `Start.cmd`, so the next
launch comes up on the same tenant. Deleting that file makes the app start on the default settings
in `environment.js` again.

If the recorded tenant is missing or its file has a typo in it, the app says so in the console window
and starts on the default settings rather than refusing to launch.

When you start the server yourself with `npm start` instead of the launcher, nothing supervises the
process, so it cannot restart itself. The wizard records your choice and tells you to stop and start
the server by hand. `npm start tokyo-demo` also still works and overrides the recorded tenant for
that one run.


If no profile exists at all, nothing is asked and the app starts straight away, exactly as it did
before this feature existed.


## Workspace ids have to be discovered again for every tenant

This is the one thing to watch out for.

Workspaces are numbered per tenant. The Items workspace may be number 57 in one tenant and 133 in
the next, and number 57 over there may be something else entirely. Ids from one tenant are therefore
meaningless in another, and using them would make the applications open the wrong workspace.

For that reason a new profile is created with **all workspace ids set to 0**, and the applications
skip a workspace whose id is 0. Until you have discovered the ids of the new tenant, the
applications open with empty lists. To fix that:

1. Save the profile.
2. Close the console window of the app and start it again.
3. Pick the new profile in the list.
4. Open `http://localhost:8080/setup` again, go to step 5, sign in to Autodesk and press
   **Discover workspaces**.
5. Go to step 6 and save with **Update the settings this server is running on**.

The one exception: if the profile you are saving is for the very tenant the server is already
connected to, and you have just run the discovery, the wizard writes those ids into the profile
straight away and tells you so.


## Deleting a profile

Delete its two files:

- `environments\<name>.js`
- `settings\<name>.js`

The profile disappears from the wizard list the next time you open it. Nothing else refers
to it. If the deleted profile happened to be the one in use, the app falls back to the
default entry.

You can also delete the timestamped `*.backup-*.js` files in both folders at any time. They are
copies the wizard kept before overwriting something, and they are never offered as profiles.


## For anyone who does use a terminal

The wizard only automates what the server already supported: the name of the environment file is
its first argument.

```
npm start tokyo-demo          reads environments\tokyo-demo.js
npm start                     reads environment.js
```
