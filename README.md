# Vencord Custom Plugins

Custom plugins for [Vencord](https://vencord.dev).

> [!NOTE]
> Everything here is **client side only** — it changes what *your* Discord looks like.
> Nothing is deleted, nothing is sent to Discord, and nobody else can see any of it.

## Plugins

🙈 **[Hide Messages](https://github.com/reqonpublishes/vencord-custom-plugins/tree/main/plugins/hideMessages)**
Hide messages, or a whole chat's history, from your own Discord. Nothing is deleted and the other person still sees everything.

🔍 **[Inspect Messages](https://github.com/reqonpublishes/vencord-custom-plugins/tree/main/plugins/inspectMessages)**
Change what a message says and when it was sent, on your screen only.

⚡ **[Quick Restart](https://github.com/reqonpublishes/vencord-custom-plugins/tree/main/plugins/quickRestart)**
Restart Discord with a shortcut, including an instant plugin-only restart.

Click a plugin for how to use it and what its settings do.

## Install

> [!IMPORTANT]
> Custom plugins have to be compiled into Vencord, so the normal installer can't load them.
> You build Vencord from source once — about five minutes — and after that adding or
> updating plugins is a single paste.

<details>
<summary><b>Need Node and Git first?</b> (skip if <code>node -v</code> prints v22 or higher)</summary>

```powershell
# Windows
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Git.Git
```

```sh
# macOS
brew install node git

# Debian / Ubuntu
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt install -y nodejs git

# Fedora
sudo dnf install -y nodejs git

# Arch
sudo pacman -S --needed nodejs npm git
```

Reopen your terminal afterwards. Installers from [nodejs.org](https://nodejs.org) and
[git-scm.com](https://git-scm.com/downloads) work just as well.

</details>

**1. Get Vencord** — skip if you already build it from source.

```bash
git clone https://github.com/Vendicated/Vencord
cd Vencord
corepack enable
pnpm install --frozen-lockfile
```

**2. Add the plugins**

```bash
git clone https://github.com/reqonpublishes/vencord-custom-plugins ~/vencord-custom-plugins
mkdir -p src/userplugins
cp -r ~/vencord-custom-plugins/plugins/* src/userplugins/
pnpm build
```

> [!TIP]
> On Windows PowerShell, swap the two middle lines for these:
> ```powershell
> New-Item -ItemType Directory -Force src\userplugins | Out-Null
> Copy-Item -Recurse -Force "$HOME\vencord-custom-plugins\plugins\*" src\userplugins\
> ```

**3. Put it into Discord** — quit Discord completely first, from its tray icon.

```bash
pnpm inject
```

Start Discord, open **Settings → Vencord → Plugins**, search `CustomPlugin`, and switch on
the three.

> [!NOTE]
> On Vesktop or the web build the last step is different — see
> [Vencord's docs](https://docs.vencord.dev/installing/custom-plugins/).

## Update

```bash
git -C ~/vencord-custom-plugins pull
cp -r ~/vencord-custom-plugins/plugins/* ~/Vencord/src/userplugins/
cd ~/Vencord && pnpm build
```

Then reload Discord with `Ctrl+R`.

> [!WARNING]
> Only plugin *folders* may sit directly in `src/userplugins`. A stray `README.md` or any
> other loose file in there will break the build.

## Uninstall

Delete the plugin folders out of `src/userplugins` and run `pnpm build` again. To remove
Vencord itself, run `pnpm uninject`.

---

Using any client mod is against Discord's Terms of Service. Vencord is very widely used and
bans for it are effectively unheard of, but it's your account — decide for yourself.

[GPL-3.0-or-later](LICENSE), same as Vencord.
