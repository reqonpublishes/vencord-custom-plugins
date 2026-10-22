# Shared plugin files

Every plugin carries its own copy of `ui.tsx`, `shared.css`, `icons.tsx` and `menu.tsx`, so no
plugin depends on another. They are generated from the templates here - change the template,
never one plugin's copy.

- `python regen.py` regenerates every plugin's `ui.tsx`, `shared.css` and `icons.tsx`,
  keeping each one's class prefix and icons. `python regen.py hideServers=Hash,Server` adds
  icons to a plugin. New icons go in `ICONS` in `gen.py`.
- `menu.tsx` is copied as it is into every plugin with right-click entries.
