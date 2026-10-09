# Fake Mod

Adds moderation entries to people, servers and messages, as if you were a moderator.

> [!NOTE]
> None of them do anything. Each one asks, says it was done, and that is all: nothing is sent
> to Discord, no case, note or flag exists afterwards, and nobody's account or server is
> touched.

## Using it

Pick a **Rank** in the plugin's settings, then open the **...** menu on a profile, or
right-click a person, a server or a message. The entries your rank can use work; the ones
above it are greyed out and say which rank they need.

| | Trial Moderator | Moderator | Senior Moderator |
| --- | :---: | :---: | :---: |
| **People** | | | |
| View Account Standing | ✓ | ✓ | ✓ |
| View Report History | ✓ | ✓ | ✓ |
| Add Staff Note | ✓ | ✓ | ✓ |
| Force Profile Review | ✓ | ✓ | ✓ |
| Escalate Account | ✓ | ✓ | ✓ |
| Suspend Account (24 Hours, 7 Days, 30 Days) | | ✓ | ✓ |
| Reset Username | | ✓ | ✓ |
| Disable Account | | | ✓ |
| **Servers** | | | |
| View Server Standing | ✓ | ✓ | ✓ |
| Force Server Review | ✓ | ✓ | ✓ |
| Escalate Server | ✓ | ✓ | ✓ |
| Quarantine Server | | ✓ | ✓ |
| Disable Server | | | ✓ |
| **Messages** | | | |
| Send Message for Review | ✓ | ✓ | ✓ |
| Remove Message | | ✓ | ✓ |

Actions that would open a case end with a made-up case number, like `Case #482913-07`.

These are invented. They are written to look at home in Discord's menus, not copied from
whatever Discord's staff actually see.

## Settings

| Setting | What it does |
| --- | --- |
| **Rank** | Trial Moderator, Moderator or Senior Moderator |
| **Show actions above your rank** | Lists them greyed out instead of leaving them out |
| **Show on profiles / people / servers / messages** | Which menus get the entries |
