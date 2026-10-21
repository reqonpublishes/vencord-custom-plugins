# Quick Restart

**Ctrl+R restarts Discord about five times faster.**

Discord's own Ctrl+R reloads *ignoring the cache*: it downloads the whole app again every time.
Quick Restart catches Ctrl+R (and Ctrl+Shift+R) first and does a normal reload, which keeps what
Discord already has. Everything still restarts for real: new updates, every plugin.

| Measured on PTB | Discord back after |
| --- | --- |
| Discord's own Ctrl+R | 17.6 s, sometimes over 25 s |
| Quick Restart's Ctrl+R | 2.8 to 4.1 s |

Pressing it again while Discord loads does nothing, so a few impatient presses never start the
load over.

The settings also have buttons to restart only the plugins (a few milliseconds), resync
Discord's data, reload, or quit and reopen Discord.
