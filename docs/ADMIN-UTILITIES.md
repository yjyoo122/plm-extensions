# The two admin utilities and the second APS application (English)

日本語: [ADMIN-UTILITIES-ja.md](ADMIN-UTILITIES-ja.md) · 한국어: [ADMIN-UTILITIES-ko.md](ADMIN-UTILITIES-ko.md)

Installation guide: [INSTALL-en.md](INSTALL-en.md)

---

## 1. What this page is about

Almost everything in this package works right after you finish the setup wizard. **Two** applications do not:

| Application | What it does |
| -- | -- |
| **Outstanding Work Report** | Lists the open tasks — change orders, reviews, project tasks — of **every** user in the tenant, not only your own. |
| **User Settings Manager** | Copies saved **workspace views** (the personal column layouts and filters a user creates in a workspace) from one user to other users, so a whole team can share one prepared view. |

If you try to open either of them without the extra setup below, the application stops with:

> **System Admin access required** — This application signs in as the system administrator of your tenant. That needs a second APS application with a Client ID and a Client Secret, and those two values are missing or were not accepted.

This page explains how to fix that. It takes about five minutes and you do it once.

---

## 2. Why a *second* APS application is needed

Every other application in this package acts **as you**. You log in with your own Autodesk account, and the server carries your own session to your tenant. This is the APS application you created in step 1 of the setup wizard, and it is of the type `Desktop, Mobile, Single-Page App`.

These two utilities have to act **as other people** — that is the whole point of them. Reading somebody else's outstanding work, or writing a view into somebody else's account, cannot be done with your personal session. The server therefore has to log in **as itself**, and then tell Fusion Manage "treat this request as if user X had made it". Autodesk calls that *impersonation*, and it is only possible with a **2-legged** login.

A 2-legged login proves the identity of the *server*, not of a person, and the way a server proves who it is is with a **Client Secret** — a password belonging to the application. Your first APS application has no Client Secret at all: its type is designed for programs that run on a user's own machine, where a secret could not be kept secret. That is why it cannot simply be reused, and why you need a second application of a different type.

| | First APS app (step 1) | Second APS app (this page) |
| -- | -- | -- |
| Type | `Desktop, Mobile, Single-Page App` | `Server-to-Server` |
| Has a Client Secret | no | **yes** |
| Signs in | you, personally | the server itself |
| Used by | every application | Outstanding Work Report, User Settings Manager |
| Wizard fields | Client ID (step 2) | Admin Client ID + Admin Client Secret (step 4) |

---

## 3. Create the second APS application

1. Open <https://aps.autodesk.com/myapps/create> and sign in with the **same Autodesk account** you use for Fusion Manage.
2. Under **Choose an API**, tick the APIs you want available (the defaults are fine).
3. For **application type**, choose **`Server-to-Server`**.
   *This matters.* It is the only type that issues a Client Secret. **The type cannot be changed after the app is created** — if you pick the wrong one, you have to create another app.
4. Give it a **Name** that tells it apart from the first one, for example `PLM Extensions (admin)`.
5. A Callback URL is not part of this application type. If the page offers one, you can leave it empty — it is never used.
6. Click **Create app**.
7. On the app page, copy two values:
   * the **Client ID**
   * the **Client Secret** — this is shown **once**. Copy it immediately. If you lose it, you can generate a new one on the same page, which invalidates the old one.

### Whitelist this Client ID in your tenant as well

Your tenant only answers API calls from Client IDs an administrator has approved, and this second application is a second Client ID. Add it exactly like you added the first one:

```
https://<your-tenant>.autodeskplm360.net/admin#section=setuphome&tab=general&item=configparams
```

Find the list of allowed Client IDs (it may be labelled *Forge Client IDs* or *APS Client IDs*) and add the new one **next to** the first one. Do not replace the first one — both are needed.

---

## 4. Enter the two values

1. Open the setup wizard at <http://localhost:8080/setup> (the port is the one in your Callback URL).
2. Go to step **4 — Optional advanced** and click **Show the optional settings**.
3. Paste the Client ID of the *second* app into **Admin Client ID**.
4. Paste the Client Secret into **Admin Client Secret**.
5. Click **Test these credentials**.
6. When the test says the credentials work, go to step 6 and click **Save and restart**.

The two values are written to your connection settings file (`environment.js`) as `adminClientId` and `adminClientSecret`. You never have to open that file.

> If you prefer not to store the secret in a file at all, set the environment variables `ADMIN_CLIENT_ID` and `ADMIN_CLIENT_SECRET` before starting the server instead. They take priority over the file, and the wizard fields can then stay empty.

---

## 5. What the test tells you

The **Test these credentials** button asks the Autodesk authentication service for a server token with exactly the two values you typed — the same request the two utilities make. Nothing is saved by the test, the secret is never printed to the console window and never sent back to the browser.

| Result | What it means | What to do |
| -- | -- | -- |
| *These credentials work…* | Autodesk issued a server token. | Save and restart. You are done. |
| *No Admin Client Secret was provided…* | The Client Secret field is empty. | Fill it in. If your app has no Client Secret, it is of the wrong type — create a `Server-to-Server` app. |
| *This is the same Client ID this server already uses to sign users in…* | You pasted the Client ID from step 2. | Paste the Client ID of the **second** app. |
| *Autodesk refuses to issue a server token for this app…* | The app exists but is not a server-to-server type. | Create a new app with type `Server-to-Server`. The type of an existing app cannot be changed. |
| *Autodesk did not accept this pair of values…* | The Client ID and the Client Secret do not belong together, or one of them was pasted incompletely. | Copy both again from the same app page. Watch for a missing character or a trailing space. |
| *This machine could not reach developer.api.autodesk.com…* / *…did not answer within 20 seconds…* | A proxy, a firewall or a missing internet connection. The values themselves were **not** checked. | You can still save. Test the two utilities themselves afterwards. |

---

## 6. Verify it worked

1. Save and restart from step 6 of the wizard, and wait for the page to come back.
2. Open the landing page and start **Outstanding Work Report**.
3. It should show a list of users and their open work instead of the *System Admin access required* screen.

If it still fails after a successful credential test, the cause is almost always one of these two:

* **The second Client ID is not whitelisted in the tenant** — see the end of section 3.
* **Your own user is not a system administrator in Fusion Manage.** These utilities first check that *you* are in the `Administration [SYSTEM]` group; the second APS application does not grant you that. If you are not a system administrator, the message you get is *This feature requires system admin privileges*, which is a different message from the one this page is about.

---

## 7. Security note — please read

The Client Secret is not a convenience setting. Anyone who has it, together with the Client ID, can make this server read and write in your tenant **as any user**, without that user ever logging in and without leaving a trace of an interactive login.

Practical rules:

* **Only configure it while you actually need these two utilities.** Clearing both fields in step 4 and saving removes them again.
* **Treat the secret like a password.** Do not paste it into chat, tickets, screenshots or e-mail.
* **Do not put it on a shared machine.** This server is meant to run on your own PC. On a shared or demo machine, prefer the environment variables from section 4 so the secret disappears when the machine is switched off.
* **Do not commit `environment.js`.** It contains the secret in plain text.
* **If it leaks, revoke it.** Generate a new Client Secret on the APS app page — the old one stops working immediately — or delete the app entirely.
* Remember that impersonated actions appear in Fusion Manage under the impersonated user's name, not yours.
