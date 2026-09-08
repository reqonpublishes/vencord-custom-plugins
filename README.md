# Vencord Custom Plugins

Custom plugins for [Vencord](https://vencord.dev).

> [!NOTE]
> Everything here is **client side only** — it changes what *your* Discord looks like.
> Nothing is deleted, nothing is sent to Discord, and nobody else can see any of it.

## Plugins

| Plugin | What it does |
| --- | --- |
| **[Hide&nbsp;Messages](https://github.com/reqonpublishes/vencord-custom-plugins/tree/main/plugins/hideMessages)** | Hide messages, or a whole chat's history, from your own Discord. Nothing is deleted and the other person still sees everything. |
| **[Inspect&nbsp;Messages](https://github.com/reqonpublishes/vencord-custom-plugins/tree/main/plugins/inspectMessages)** | Change what a message says and when it was sent, on your screen only. |
| **[Quick&nbsp;Restart](https://github.com/reqonpublishes/vencord-custom-plugins/tree/main/plugins/quickRestart)** | Restart Discord with a shortcut, including an instant plugin-only restart. |

Click a plugin for how to use it and what its settings do.

## Install — Windows

**1.** [**Download install.bat**](https://github.com/reqonpublishes/vencord-custom-plugins/raw/main/install.bat)

**2.** Double-click it.

**3.** Follow the prompts. When it finishes, open Discord →
**Settings → Vencord → Plugins** → search `CustomPlugin` → switch on all three.

That's it.

<details>
<summary><b>What is it actually doing?</b></summary>

In order, it:

1. installs Node.js and Git, if you don't already have them
2. downloads Vencord to `C:\Users\you\Vencord`
3. downloads these plugins to `C:\Users\you\vc-plugins`
4. builds Vencord with the plugins compiled in
5. points Discord at that build

Nothing outside those two folders is changed, and it's plain Windows commands you could
type yourself — [read it here](https://github.com/reqonpublishes/vencord-custom-plugins/blob/main/install.bat)
before running it.

</details>

Two things that look alarming but are normal:

- **"The publisher could not be verified"** when you open it. Windows says that about every
  script downloaded from the internet. Click **Run**.
- **It asks you to close the window and run it again.** Only on the very first run, if it had
  to install Node and Git — Windows only gives new programs to new windows.

> [!IMPORTANT]
> When it asks, quit Discord *properly* — right-click its icon in the system tray, down by
> the clock, and choose **Quit Discord**. Closing the window leaves it running.

## Install — macOS and Linux

<details>
<summary><b>Terminal commands</b></summary>

Node 22+ and Git first:

```sh
brew install node git                     # macOS
sudo apt install -y nodejs git            # Debian / Ubuntu
sudo dnf install -y nodejs git            # Fedora
sudo pacman -S --needed nodejs npm git    # Arch
```

On Debian and Ubuntu the packaged Node is usually older than 22 — if `node -v` disagrees,
use [NodeSource](https://github.com/nodesource/distributions).

Then:

```sh
corepack enable
git clone https://github.com/Vendicated/Vencord ~/Vencord
git clone https://github.com/reqonpublishes/vencord-custom-plugins ~/vc-plugins
cd ~/Vencord
pnpm install --frozen-lockfile
mkdir -p src/userplugins
cp -r ~/vc-plugins/plugins/* src/userplugins/
pnpm build
pnpm inject
```

</details>

<details>
<summary><b>Windows, by hand</b></summary>

If you'd rather not run a script. In PowerShell:

```powershell
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Git.Git
```

Close PowerShell, open it again, then:

```powershell
corepack enable
git clone https://github.com/Vendicated/Vencord "$HOME\Vencord"
git clone https://github.com/reqonpublishes/vencord-custom-plugins "$HOME\vc-plugins"
cd "$HOME\Vencord"
pnpm install --frozen-lockfile
New-Item -ItemType Directory -Force src\userplugins | Out-Null
Copy-Item -Recurse -Force "$HOME\vc-plugins\plugins\*" src\userplugins\
pnpm build
```

Quit Discord from the system tray, then `pnpm inject`.

</details>

> [!NOTE]
> On Vesktop, or Discord in a browser, the last step differs — run `install.bat --no-inject`
> and see [Vencord's docs](https://docs.vencord.dev/installing/custom-plugins/).

## Update

Run `install.bat` again. It updates both folders and rebuilds.

On macOS and Linux:

```sh
git -C ~/vc-plugins pull
cp -r ~/vc-plugins/plugins/* ~/Vencord/src/userplugins/
cd ~/Vencord && pnpm build
```

Then reload Discord with <kbd>Ctrl</kbd>+<kbd>R</kbd>.

## Uninstall

Delete the plugin folders from `src/userplugins` and run `pnpm build` again. To remove
Vencord itself, run `pnpm uninject` from the `Vencord` folder.

## If something goes wrong

| Problem | Fix |
| --- | --- |
| `git`, `node` or `pnpm` not recognised | Close the window and run `install.bat` again |
| It says Discord is running | Quit it from the system tray, not just the window |
| Plugins don't show up in Discord | Run `install.bat` again, then reload Discord |
| Build fails with "could not resolve" | Only plugin *folders* may sit in `src/userplugins` — remove any loose files |
| "name too long" during install | Your Vencord folder is nested too deep — keep it at `C:\Users\you\Vencord` |

---

Using any client mod is against Discord's Terms of Service. Vencord is very widely used and
bans for it are effectively unheard of, but it's your account — decide for yourself.

[GPL-3.0-or-later](LICENSE), same as Vencord.
