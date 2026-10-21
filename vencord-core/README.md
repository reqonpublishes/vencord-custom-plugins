# Changes to Vencord itself

Small changes to Vencord's own code that make Discord load faster with these plugins. They
live in your Vencord folder (`%USERPROFILE%\Vencord`), not in a plugin, so a fresh download of
Vencord does not have them. Put one back with:

```
cd %USERPROFILE%\Vencord
git apply path\to\vencord-core\faster-patcher.patch
pnpm build
```

## faster-patcher.patch

As Discord loads, Vencord checks every piece of Discord's code against every plugin's search
text, one at a time. With about 95 plugins that is 177 searches over 15,000 pieces of code.
This looks for all of them in one pass first, and only searches one by one where something
matched. The same patches apply to the same code.

Measured on PTB: the checking went from 1.1 s to 0.37 s, Vencord's own share of a restart from
1.9 s to 0.5 s, and Discord is drawn at about 2.4 s after Ctrl+R instead of 2.8 s.
