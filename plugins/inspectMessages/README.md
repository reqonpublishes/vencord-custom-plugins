# Inspect Messages

Change what a message says and when it was sent, on your screen only.

> [!NOTE]
> Inspect element, except it sticks. Nothing is sent to Discord, the real message is
> untouched, and everyone else sees the original.

## Using it

Hover a message and click the inspect button, or right-click it → **Inspect Message**.

The window has three parts:

**Sent** — a date box and a time box, quick nudges (`-1d` through `+1d`), and buttons to
jump to **Now** or back to the **Original** time.

**Appearance**
- *Highlighted message* — paints the row like a real ping. It follows your text on its own
  until you flip it yourself.
- *Show "(edited)" tag* — adds the edited marker, at a time you choose.

**Content** — the message text. Markdown works.

> [!TIP]
> `Ctrl+Enter` applies without reaching for the mouse.

**Apply** commits it, **Revert** puts that one message back, and *Clear all inspected
messages* in the settings undoes the lot.

> [!TIP]
> Highlighting uses Discord's own mention styling rather than a hand-picked orange, so a
> faked ping looks identical to a real one whatever theme you're running.

Edits survive restarts and are back the moment a channel loads, with no flicker of the real
message first.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Hover button on messages | Only while Shift is held | When the toolbar button appears |
| Add "Inspect Message" to the right-click menu | On | Adds the context menu entry |
| Remember edits after Discord restarts | On | Keeps your edits between restarts |
| Clear all inspected messages | — | Undoes every edit and starts fresh |
