# Quick Restart

Ctrl+R is still your restart. It's just faster, and the window never flashes.

| You press | What happens | How long |
| --- | --- | --- |
| `Ctrl+R` | Every plugin restarts, then Discord fetches your servers, DMs, friends and settings again, the way it does when it opens. The window stays put | ~2 seconds |
| `Ctrl+Shift+R` | Discord's own reload, untouched. The window goes blank and loads again | ~5 seconds |
| **Restart Discord** (settings) | Quits Discord and opens it again | Several seconds |

## What Ctrl+R does

1. **Plugins restart in place.** Every running plugin is stopped and started again: commands,
   menus, styles, buttons and badges are torn down and put back. This takes a few milliseconds.
2. **Discord resyncs.** Its connection is closed and opened again as a new session, so the
   server sends everything afresh, exactly what a launch gets. Whatever you were typing stays
   where it is.

> [!NOTE]
> In a call only the plugins restart. A new session would hang the call up.

## When it reloads instead

Two things can only take effect by loading Discord's code again:

- **A new Vencord build.** Ctrl+R notices the build on disk is newer than the one running.
- **A plugin you just switched on that patches Discord's code.** Its patches go in as Discord
  loads, so they were never applied.

Then Ctrl+R does a real reload, behind a still picture of the window, so you never see it go
blank. You don't have to tell it which: the shortcut always picks the right restart.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Restart shortcut | `ctrl+r` | Modifiers and a key joined by `+` |
| Restart now | | **Restart and Resync** (what Ctrl+R does), **Plugins Only**, **Reload** and **Restart Discord**, with the times of the last restart |
