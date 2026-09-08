# Quick Restart

A restart that takes milliseconds instead of seconds.

| Shortcut | What happens | How long |
| --- | --- | --- |
| `Ctrl+R` | Restarts every running plugin in place | Milliseconds |
| `Ctrl+Shift+R` | Reloads the window, the way Ctrl+R always did | ~1 second |
| (settings button) | Restarts Discord completely | Several seconds |

## Why it's quicker

Nothing is thrown away. No bundle is parsed again, your gateway connection stays up, and
the message you were half way through typing is still sitting there.

Restarting a plugin is a full lifecycle cycle — commands, context menus, event handlers,
styles, badges, buttons and decorations are all torn down and registered again. It's the
same thing the settings page does when you toggle a plugin off and on.

> [!TIP]
> This is what you actually want nearly every time you'd otherwise reload: making a plugin
> or a setting take effect.

## The one thing it can't do

Some plugins patch Discord's own code, and those patches are applied as Discord's modules
first load. If you switch such a plugin **on**, its patches were never applied, and no
amount of restarting will change that — only loading Discord again will.

`Ctrl+R` handles this for you: it notices, and reloads the window instead. So the shortcut
always does the right thing, it's just occasionally slower.

> [!NOTE]
> A plugin that *has* patches and is already running restarts perfectly well — its patches
> are already in place and stay there. It's only newly switched-on ones that need a reload.

Shortcuts are caught before Discord sees them, so they work from anywhere — mid-message,
inside a modal, or on the settings page you just changed.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Main shortcut | `ctrl+r` | Modifiers and a key joined by `+` |
| What the main shortcut does | Restart plugins, reload only if it has to | Or: never reload / always reload / restart Discord |
| Second shortcut | `ctrl+shift+r` | Always a full window reload |
| Restart right now | — | Buttons for all three, without a shortcut |
