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
   the entry you will pick in the launcher, so something like `tokyo-demo` or `customer-abc` works
   well. Japanese and Korean characters, spaces and dots are refused.
6. Press **Save the tenant profile**.

The server does not restart. It stays connected to the tenant it was started with, because a running
server cannot swap its own connection settings. The new profile is simply there, ready to be picked
the next time you start the app.

If a profile of that name already exists, the wizard says so and does nothing. Press Save a second
time to confirm, and a timestamped backup of both files is kept next to the originals.


## Choosing a tenant when you start the app

Start the app as usual with `Start.cmd` or the desktop shortcut.

As soon as at least one profile exists, the black console window shows a list before the server
starts:

```
  Which tenant do you want to work with?

      1)  customer-abc   -   tenant abccorp
   *  2)  tokyo-demo     -   tenant adskyjyoo
      3)  東京テナント    -   tenant tokyodemo
      0)  Default connection settings (environment.js)

     *  marks what you used last time. Press Ctrl+C to close this window instead.

Type a number and press Enter, or press Enter for 2 :
```

Type the number and press Enter. Pressing Enter without typing anything starts the tenant you used
last time, which is the one marked with `*`.

- Entry `0` starts the app on `environment.js`, the settings that were there before you created any
  profile.
- If you type something that is not in the list, you are simply asked again.
- Your choice is remembered in a small file named `.plmx-last-profile` next to `Start.cmd`. Deleting
  that file only forgets which tenant you used last.
- When the setup wizard restarts the server, it comes back on the **same** profile. You are not
  asked again.

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

The profile disappears from the launcher list the next time you start the app. Nothing else refers
to it. If the deleted profile happened to be the one you used last, the launcher falls back to the
default entry.

You can also delete the timestamped `*.backup-*.js` files in both folders at any time. They are
copies the wizard kept before overwriting something, and they are never offered as profiles.


## For anyone who does use a terminal

The launcher only automates what the server already supported: the name of the environment file is
its first argument.

```
npm start tokyo-demo          reads environments\tokyo-demo.js
npm start                     reads environment.js
```
