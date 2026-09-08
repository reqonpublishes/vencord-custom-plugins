# Quick Restart

Restart Discord with a shortcut, including an instant plugin-only restart.

## The three restarts

| Shortcut | What happens | How long |
| --- | --- | --- |
| `Ctrl+Shift+R` | **Plugins only** — Vencord's plugins stop and start where they stand | Instant |
| `Ctrl+R` | **Reload the window** — exactly what Ctrl+R always did | ~1 second |
| (settings button) | **Full restart** — relaunches the whole Discord process | Several seconds |

> [!TIP]
> The plugin-only restart is the one worth learning. Nothing is thrown away: no bundle is
> parsed again, your connection stays up, and the message you were half way through typing
> is still sitting there.

It's the right tool for the thing people actually reload for — making a plugin or a setting
take effect.

> [!NOTE]
> Plugins that patch Discord's own code are skipped. Their patches were applied when those
> modules first loaded, and only a real reload can redo that. The toast tells you what was
> restarted and what still needs one.

Shortcuts are caught before Discord sees them, so they work from anywhere — mid-message,
inside a modal, or on the settings page you just changed.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Main shortcut | `ctrl+r` | Modifiers and a key joined by `+` |
| What the main shortcut does | Reload the window | Reload / plugins only / full restart |
| Second shortcut | `ctrl+shift+r` | Always a plugin-only restart |
| Restart right now | — | Buttons for all three, without a shortcut |
