# Hide Friends

Hide friends from your friends list — one at a time or all at once — in your own Discord only.

> [!NOTE]
> The real friendship is never touched. Nothing is sent to Discord, the other person is told
> nothing, and putting them back is instant because they were never removed.

## Using it

Right-click a friend → **Hide Friend**. The rest sit under **Fake Relationship** in the same
menu, and what is offered depends on who they are:

| Entry | What it does |
| --- | --- |
| **Hide Friend** | They read as not added: gone from your friends list, an Add Friend button on their profile |
| **Fake Block** | Discord treats them as blocked on this computer — their messages collapse — without blocking them |
| **Fake Incoming Request** | A friend request from them appears in Pending |
| **Fake Outgoing Request** | An outgoing request to them appears in Pending |
| **Hide Their Friend Request** | A real request from them leaves your Pending list, unanswered |

Each one has its opposite in the same menu once it is on.

**Everybody at once** — **Settings → Vencord → Plugins → HideFriends** →
**Hide All**. **Unhide All** brings them back, and **Reset** undoes
everything this plugin is doing.

> [!TIP]
> The settings page lists everybody who is hidden or faked, with a button beside each. That
> list is the way back: somebody shown as not added is not in your friends list to be
> right-clicked.

## The buttons on a fake request are safe

A fake request has real Accept and Decline buttons, and pressing them must never reach
Discord — accepting a request nobody sent would send them a real one. So they are answered
on your computer instead: accepting shows them as a friend, declining takes the request
away. The same goes for unblocking somebody only this computer thinks is blocked.

## The Implicit tab

If you use Vencord's **ImplicitRelationships** plugin, it adds an **Implicit** tab to the Friends
page listing people you talk to without being friends. **Hide the Implicit tab** takes that tab
away while this plugin is on. It is on by default.

## Settings

| Setting | What it does |
| --- | --- |
| **Show on people** | **Hide Friend** and **Fake Relationship** when you right-click a person |
| **Keep after restart** | Off means everybody is back next time you open Discord |
| **Everybody hidden or faked** | The list, the bulk buttons, and the way back |

## Is this safe?

Yes. Every change is a local event of the kind Discord sends your client itself when a
relationship changes, and nothing here calls Discord's API. Nobody else can see any of it.

## Syncing

Install **[Sync](../cloudSync)** and who you have hidden can follow you to your phone, and
back.
