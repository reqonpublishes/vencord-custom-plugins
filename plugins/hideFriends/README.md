# Hide Friends

Show a friend as not added — or everybody at once — in your own Discord only.

> [!NOTE]
> The real friendship is never touched. Nothing is sent to Discord, the other person is told
> nothing, and putting them back is instant because they were never removed.

## Using it

Right-click a person anywhere → **Only For Me**. What is offered depends on who they are:

| Entry | What it does |
| --- | --- |
| **Hide Friend** | They read as not added: gone from your friends list, an Add Friend button on their profile |
| **Block Here Only** | Discord treats them as blocked on this computer — their messages collapse — without blocking them |
| **Pretend They Sent a Request** | A friend request from them appears in Pending |
| **Pretend You Sent a Request** | An outgoing request to them appears in Pending |
| **Hide Their Request** | A real request from them leaves your Pending list, unanswered |

Each one has its opposite in the same menu once it is on.

**Everybody at once** — **Settings → Vencord → Plugins → CustomPluginHideFriends** →
**Hide all friends**. **Show all friends** brings them back, and **Put everyone back** undoes
everything this plugin is doing.

> [!TIP]
> The settings page lists everybody who is hidden or faked, with a button beside each. That
> list is the way back: somebody shown as not added is not in your friends list to be
> right-clicked.

## The buttons on a pretended request are safe

A pretended request has real Accept and Decline buttons, and pressing them must never reach
Discord — accepting a request nobody sent would send them a real one. So they are answered
on your computer instead: accepting shows them as a friend, declining takes the request
away. The same goes for unblocking somebody only this computer thinks is blocked.

## Settings

| Setting | What it does |
| --- | --- |
| **Add the entries when you right-click a person** | The **Only For Me** menu |
| **Keep people hidden and faked after Discord restarts** | Off means everybody is back next time you open Discord |
| **Everybody hidden or faked** | The list, the bulk buttons, and the way back |

## Is this safe?

Yes. Every change is a local event of the kind Discord sends your client itself when a
relationship changes, and nothing here calls Discord's API. Nobody else can see any of it.

## Syncing

Install **[Sync](../cloudSync)** and who you have hidden can follow you to your phone, and
back.
