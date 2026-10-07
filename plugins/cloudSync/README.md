# Sync

Keep what you have hidden, rewritten and added the same on your phone and this computer.

> [!NOTE]
> Nothing moves on its own. **Send** puts this computer's copy on the link; **Fetch**
> replaces this computer's copy with what is there. Both are buttons you press.

## Setting it up

**1.** Open **Settings → Vencord → Plugins → CustomPluginSync**.

**2.** Click **Make a link**. You get an address nobody else will guess.

**3.** Put that same link on your phone, in **Settings → Veil → Sync**.

That is the whole setup. The link is what joins the two - there is no account and no
password, so treat the link like one.

## Using it

**Send to cloud** — takes what this computer has and puts it on the link.

**Fetch from cloud** — takes what is on the link and makes this computer match it.

> [!TIP]
> Hide something on your phone, press Send there, then press Fetch here. The plugins
> restart themselves afterwards, so the change is on screen straight away.

## What gets shared

| Setting | What it covers |
| --- | --- |
| **Share hidden messages and hidden chats** | Everything Hide Messages is holding: single messages, ranges, and whole chats hidden up to a moment |
| **Share rewritten messages** | Everything Inspect Messages is holding: new text, timestamps and edited markers |
| **Share messages you added** | Everything Fake Messages is holding, in every conversation |
| **Share which conversations are hidden** | Everything Hide DMs is holding |

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
> **New link** and put the new one on both devices.
