# Fake Friends

Fake a friend, a friend request either way, or a block — in your own Discord only. Off until
you switch it on.

> [!NOTE]
> Nothing is sent to Discord and nobody is told. The fakes look exactly like the real thing on
> your screen: a fake friend is in your friends list, a fake request is in Pending with the
> badge, and a fake block collapses their messages.

## Using it

Right-click someone → **Fake**:

| Entry | What it does |
| --- | --- |
| **Fake Friend** | They show as your friend |
| **Fake Incoming Request** | A friend request from them appears in Pending |
| **Fake Outgoing Request** | A request from you to them appears in Pending |
| **Fake Block** | They show as blocked — their messages collapse — without being blocked |

Someone is only ever one of these at a time: picking another replaces the first. Once they
are faked, the menu offers the one way back.

**Someone you share nothing with** — **Settings → Vencord → Plugins → FakeFriends** → type
their user ID, pick what they should be, and press **Add**. Discord is asked who the ID
belongs to, so they show with their real name and picture.

## The buttons on anything fake are safe

A fake request has real Accept and Decline buttons, and pressing them must never reach
Discord — accepting a request nobody sent would send them a real one. So they are answered on
your computer instead: accepting makes them a fake friend, declining takes the request away.
Removing a fake friend and unblocking a fake block work the same way.

## Settings

| Setting | What it does |
| --- | --- |
| **Show in the people menu** | The **Fake** entries when you right-click someone |
| **Keep after restart** | Off means every fake is gone next time you open Discord |
| **Faked** | Add someone by ID, the list of everyone faked, and **Remove All** |

## Works with Hide Friends

A hidden friend can still be faked: a fake request from them shows in Pending while the
friendship stays hidden. Accepting it just shows the real friendship again.

## Syncing

Install **[Cloud Sync](../cloudSync)** and your fakes follow you to your phone, and back.
