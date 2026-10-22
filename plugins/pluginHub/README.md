# Plugin Hub

Adds **Additional Settings** to Discord's settings, under **Vencord**: every one of these
plugins in one place, each with an on/off switch.

> [!NOTE]
> Turning a plugin off does not forget anything. What you hid or faked is kept, and is back
> the moment you turn it on again.
>
> Off here is not off in Vencord. The plugin stays enabled on Vencord's own Plugins page and
> is only stopped, which is why it can be switched back on without restarting Discord. It
> stays off across restarts until you turn it on here.

## Using it

Open Discord's settings → **Vencord** → **Additional Settings**.

| | |
| --- | --- |
| **Turn Off** | Turns off every plugin that changes what you see, so you are looking at your real friends, messages, calls, DMs, servers and badges |
| **Turn On** | Brings back the ones that were on when you pressed Turn Off |
| **The switch on a row** | Turns that one plugin off or on |
| **The cog on a row** | Opens that plugin's settings |
| **To Cloud / From Cloud** | The two [Cloud Sync](../cloudSync) buttons, once you have a sync code |

## Screen Share Protection

On by default. While you share your screen, every plugin here is switched on, including the
ones you had turned off, so your real DMs, friends and messages are not on the stream. When
you stop sharing, everything goes back to how you had it.

It also counts **Streamer Mode** as sharing. Discord can turn Streamer Mode on by itself when
it sees OBS or another recorder running (Discord's settings, under Streamer Mode), which is how
recording outside Discord is caught. That part can be switched off on its own in this plugin's
settings.

Nothing pops up when it happens, because a notice would be on the stream too. Turn the whole
thing off with the **Screen Share Protection** switch at the top of Additional Settings.

## Is this safe?

Yes. It only switches plugins on and off, the same way Vencord's own Plugins page does.

## Ctrl+Z

Ctrl+Z takes back the last thing you hid, faked, inspected or moved in time - whichever plugin
did it, up to 30 steps back. In a text box with something typed in it, Ctrl+Z still undoes
your typing. Switch it off on Additional Settings under **Ctrl+Z undo**.
