# Call Length

Makes Vencord's **Call Timer** count the whole call, and keep counting through restarts. On
by default; it switches Call Timer on with it.

Call Timer starts at zero when you join and starts over every time Discord reloads. With this,
joining a DM or group call two minutes in starts the timer at 2:00, and a restart picks up
where it was.

## Settings

| Setting | What it does |
| --- | --- |
| **Show** | **Whole call** (how long the call has gone on), **Your time** (how long you have been in it), or **Both** side by side |

> [!NOTE]
> A server voice channel never says when it started, so there the timer counts your own time,
> still kept through restarts.

Call Timer itself is not changed: this lends it a different timer while it is on, and gives
its own back when switched off.
