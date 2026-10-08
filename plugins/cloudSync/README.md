# Cloud Sync

Sync what you have hidden, changed and faked between your phone and this computer.

> [!NOTE]
> Nothing syncs on its own. **Sync to Cloud** uploads this computer's copy; **Sync from
> Cloud** replaces this computer's copy with what is there. Both are buttons you press.

## Setting it up

**1.** Open **Settings → Vencord → Plugins → CloudSync**.

**2.** Click **Make a Link**. You get an address nobody else will guess.

**3.** Put that same link on your phone, in **Settings → Veil → Sync**.

That is the whole setup. The link is what joins the two - there is no account and no
password, so treat the link like one.

## Using it

**Sync to Cloud** — takes what this computer has and puts it on the link.

**Sync from Cloud** — takes what is on the link and makes this computer match it.

> [!TIP]
> Hide something on your phone, press Sync to Cloud there, then Sync from Cloud here. The plugins
> restart themselves afterwards, so the change is on screen straight away.

## What gets shared

| Setting | What it covers |
| --- | --- |
| **Hide Messages** | Everything Hide Messages is holding: single messages, ranges, and whole chats hidden up to a moment |
| **Inspect Messages** | Everything Inspect Messages is holding: new text, timestamps and edited markers |
| **Fake Messages** | Everything Fake Messages is holding, in every conversation |
| **Hide DMs** | Everything Hide DMs is holding |
| **Hide Friends** | Everything Hide Friends is holding |
| **Hide Servers** | Everything Hide Servers is holding |
| **Fake Calls** | Everything Fake Calls is holding |
| **Fake Notifications** | How far Fake Notifications has moved each badge |

Switch any of them off and that part is left alone in both directions.

Anything the phone has that this computer has no idea about - words it hides everywhere,
for instance - is carried across untouched rather than thrown away. Sending from here
never costs you something the phone was keeping.

## Is this safe?

It is as client-side as the rest of these plugins. Nothing is sent to Discord, no Discord
API is called, and nothing here is visible to anyone else on Discord. The only thing that
leaves your computer is the data you asked to share, to the link you chose.

> [!IMPORTANT]
> Anyone holding your link can read and write what is on it. It is generated rather than
> chosen for exactly that reason. If you ever paste it somewhere public, press
> **New Link** and put the new one on both devices.
