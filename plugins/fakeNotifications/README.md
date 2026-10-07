# Fake Notifications

Choose what the badges say: how many friend requests and message requests are waiting.

> [!NOTE]
> Only the numbers change. Nothing is read, answered, accepted or sent, and the requests
> that are really waiting are all still there.

## Using it

Open **Settings → Vencord → Plugins → CustomPluginFakeNotifications**.

Each badge has a box. Type the number you want to see; the real one sits behind it in grey.
Empty the box and the badge goes back to the truth. **Put the real numbers back** clears
both.

> [!IMPORTANT]
> Switching this plugin on or off needs Discord to reload once, because it works from inside
> Discord's own counting. Changing the numbers afterwards is instant.

## The badge keeps counting

What is kept is how far a badge is moved, not the number on it. Set friend requests to 100
while 30 are really waiting, and when a 31st arrives the badge reads 101 — it goes on being
a badge rather than a sticker.

## Settings

| Setting | What it does |
| --- | --- |
| **Friend requests** | The Friends button and its Pending tab |
| **Message requests** | The Message Requests entry in your DM list |

## Is this safe?

Yes. It changes the answer your own client gives itself when it asks how many are waiting.
Nothing is sent to Discord and nobody else is affected.

## Syncing

Install **[Sync](../cloudSync)** and the numbers follow you to your phone. What is shared is
how far each badge is moved, so both devices land on the same number and both move when a
real request arrives.
