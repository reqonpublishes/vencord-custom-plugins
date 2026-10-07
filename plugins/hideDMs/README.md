# Hide DMs

Take a conversation out of your DM list, for you only.

> [!NOTE]
> Nothing is closed on Discord's side. The other person is told nothing, the conversation
> carries on existing, and every message is still there when you bring it back.

## Using it

**Hiding one** — right-click a conversation in the sidebar → **Hide DM**. It leaves the
list exactly as if you had closed it.

**Hiding all of them** — the plugin's settings page has **Hide all DMs**. The conversation
you are in is left alone.

**Bringing one back** — open **Settings → Vencord → Plugins → CustomPluginHideDMs**. Every
hidden conversation is listed there with a **Show** button, and **Show all** brings back
the lot.

> [!TIP]
> Opening a hidden conversation any other way — search, a profile, your friends list — also
> brings it back, and takes it off the hidden list. Reaching for a conversation is a clear
> enough way of saying you want it again.

You can also hide from a person: right-click them anywhere, including in your friends
list, and their DM is found for you.

## Why it is listed in the settings

A hidden conversation is not in the sidebar to be right-clicked, and Discord cannot look it
up by the person either, because as far as it is concerned the conversation is closed. So
the way back has to live somewhere that does not depend on finding it.

## Settings

| Setting | What it does |
| --- | --- |
| **Add "Hide DM" when you right-click a conversation** | The entry in the sidebar |
| **Add "Hide DM" when you right-click a person** | The entry on people, including your friends list |
| **Keep conversations hidden after Discord restarts** | Off means they come back next time you open Discord |
| **Conversations you have hidden** | The list, and the way back |

## Is this safe?

Yes. Hiding is one local event — the same one Discord sends your client when you close a DM
on another device — and bringing it back is its opposite. Nothing is sent, nothing is
deleted, and nobody else can tell.

## Syncing

Install **[Sync](../cloudSync)** and what you hide here can follow you to your phone, and
back.
