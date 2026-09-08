# Vencord Custom Plugins

A small hub of custom [Vencord](https://vencord.dev) plugins.

Everything here is **client side only**. Nothing is deleted, nothing is sent to Discord, and
nobody else can see any of it — these plugins only change what *your* Discord looks like.

| Plugin | What it does |
| --- | --- |
| [**Hide Messages**](#hide-messages) | Hide a message, a range of them, or a whole channel's history from your own client. |
| [**Inspect Messages**](#inspect-messages) | Rewrite any message's text, timestamp and "(edited)" marker in your own client. |
| [**Quick Restart**](#quick-restart) | Restart Discord from a shortcut — including an instant plugin-only restart. |

---

## Install

Custom plugins **cannot** be installed through the normal Vencord installer. The installer
ships a prebuilt Vencord, and custom plugins have to be compiled in. So you build Vencord
yourself once, and after that adding plugins is just copying folders.

It takes about five minutes. You only do steps 1–3 once, ever.

### 1. Install the prerequisites

| Tool | Version | Get it |
| --- | --- | --- |
| [Node.js](https://nodejs.org) | 22 or newer | Download the LTS installer |
| [Git](https://git-scm.com/downloads) | any | Download the installer |
| pnpm | any | `corepack enable` (ships with Node) |

Open a terminal and check they work:

```sh
node -v      # should print v22 or higher
git --version
corepack enable
```

> On Windows, use **PowerShell** or **Git Bash**. On macOS/Linux, any terminal is fine.

### 2. Get Vencord's source code

```sh
git clone https://github.com/Vendicated/Vencord
cd Vencord
pnpm install --frozen-lockfile
```

### 3. Add these plugins

From inside your `Vencord` folder:

```sh
mkdir -p src/userplugins
git clone https://github.com/reqonpublishes/vencord-custom-plugins /tmp/vc-custom-plugins
cp -r /tmp/vc-custom-plugins/plugins/* src/userplugins/
```

<details>
<summary><b>Windows PowerShell version</b></summary>

```powershell
New-Item -ItemType Directory -Force src\userplugins
git clone https://github.com/reqonpublishes/vencord-custom-plugins $env:TEMP\vc-custom-plugins
Copy-Item -Recurse -Force $env:TEMP\vc-custom-plugins\plugins\* src\userplugins\
```

</details>

You should now have:

```
Vencord/
└── src/
    └── userplugins/
        ├── hideMessages/
        ├── inspectMessages/
        └── quickRestart/
```

> **Important:** only *plugin folders* may live in `src/userplugins`. A stray `README.md` or
> any other loose file in there will break the build.

### 4. Build

```sh
pnpm build
```

### 5. Inject into Discord

**Close Discord completely first** (quit it from the tray icon, don't just close the window).

```sh
pnpm inject
```

Pick your Discord install when it asks, then start Discord again.

### 6. Turn the plugins on

In Discord: **User Settings → Vencord → Plugins**, search for `CustomPlugin`, and enable:

- `CustomPluginHideMessages`
- `CustomPluginInspectMessages`
- `CustomPluginQuickRestart`

Done.

---

## Updating

From your `Vencord` folder:

```sh
git pull                                    # update Vencord itself
pnpm install --frozen-lockfile

cd /tmp/vc-custom-plugins && git pull && cd -    # update these plugins
cp -r /tmp/vc-custom-plugins/plugins/* src/userplugins/

pnpm build                                  # then reload Discord (Ctrl+R)
```

## Uninstalling

Delete the plugin folders from `src/userplugins` and run `pnpm build` again. To remove
Vencord entirely, run `pnpm uninject`.

---

## Hide Messages

Hides messages from your own client. Nothing is deleted — the messages stay in the channel,
the other person still sees everything, and bringing them back is instant because they were
never actually removed.

### Using it

**One message** — hover it and click the eye button in the toolbar, or right-click →
**Hide Message**.

**A range** — right-click the first message → **Select From Here**, then right-click the
last one → **Hide To Here**. The range is remembered by its two endpoints, so it keeps
hiding messages in between even ones that hadn't loaded yet.

**A whole channel** — right-click a DM, channel, person, or their profile menu →
**Hide Messages**. The history goes blank, but the conversation carries on normally: new
messages still arrive and stay visible.

**Bringing it all back** — the same menu now says **View Messages**. There's also a
*Bring every hidden message back* button in the plugin's settings.

### Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Hover button on messages | Only while Shift is held | When the toolbar button shows up |
| Right-click menu entries | On | Which context menus get an entry (message, channel, user, profile) |
| Remember hidden messages after Discord restarts | On | Persists your hides to disk |

---

## Inspect Messages

Inspect element, but it sticks. Rewrite a message's text, when it was sent, and whether it
shows an "(edited)" marker — in your client only. Nothing is sent to Discord.

### Using it

Hover a message and click the inspect button, or right-click → **Inspect Message**.

The modal gives you:

- **Sent** — a date and time box, quick nudges (`-1d` … `+1d`), and buttons to jump to
  **Now** or back to the **Original** time.
- **Highlighted message** — paints the row like a real mention. It follows your text
  automatically until you flip it yourself, and it uses Discord's own mention styling, so it
  matches whatever theme you use.
- **Show "(edited)" tag** — adds the edited marker, at a time of your choosing.
- **Content** — the message text. Markdown works. `Ctrl+Enter` applies.

**Apply** commits it, **Revert** puts that one message back, and the settings page has a
*Clear all inspected messages* button.

Edits survive restarts and reappear the moment a channel loads, with no flicker of the real
message first.

### Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Hover button on messages | Only while Shift is held | When the toolbar button shows up |
| Add "Inspect Message" to the right-click menu | On | Adds the context menu entry |
| Remember edits after Discord restarts | On | Persists your edits to disk |

---

## Quick Restart

Three restarts, from fastest to slowest, on shortcuts.

| Shortcut | What happens | How long |
| --- | --- | --- |
| `Ctrl+Shift+R` | **Restart plugins only** — Vencord's plugins stop and start where they stand | Instant |
| `Ctrl+R` | **Reload the window** — exactly what Ctrl+R always did | ~1 second |
| (button) | **Full restart** — relaunches the whole Discord process | Several seconds |

The plugin-only restart is the interesting one. Nothing is thrown away: no bundle is parsed
again, your gateway connection stays up, and the message you were half way through typing is
still there. It's the right tool for the thing people usually reload for — making a plugin or
a setting take effect.

Plugins that patch Discord's own code are skipped, because their patches were applied when
those modules first loaded and only a real reload can redo that. The toast tells you exactly
what was restarted and what still needs a reload.

Shortcuts are listened for in the capture phase, so they work from anywhere — mid-message,
inside a modal, or in the settings page you just changed.

### Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Main shortcut | `ctrl+r` | Written as modifiers and a key joined by `+` |
| What the main shortcut does | Reload the window | Reload / plugins only / full restart |
| Second shortcut | `ctrl+shift+r` | Always a plugin-only restart |

---

## Troubleshooting

**The plugins don't show up in settings.**
Make sure the folders are directly inside `src/userplugins` (not nested another level deep),
then run `pnpm build` and reload Discord.

**The build fails with a "could not resolve" error.**
There's a loose file in `src/userplugins`. Only plugin folders belong there — move any
`README.md` or similar out.

**`pnpm inject` says Discord is running.**
Quit Discord from the system tray, not just the window, then try again.

**Nothing changed after `pnpm build`.**
Reload Discord — `Ctrl+R`, or `Ctrl+Shift+R` if Quick Restart is already enabled.

**Hidden messages or edits came back after a restart.**
Check that *Remember … after Discord restarts* is on in that plugin's settings.

---

## Notes

These plugins change your client and nothing else. They don't delete messages, they don't
send anything to Discord's servers, and other people are entirely unaffected by them.

Using any client mod is against Discord's Terms of Service. Vencord is very widely used and
bans for it are effectively unheard of, but it's your account — decide for yourself.

## License

[GPL-3.0-or-later](LICENSE), same as Vencord.
