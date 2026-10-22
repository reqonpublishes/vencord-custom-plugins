# Hide Friends

Hide friends from your friends list — one at a time or all at once — and hide friend
requests without answering them, in your own Discord only.

> [!NOTE]
> The real friendship is never touched. Nothing is sent to Discord, the other person is told
> nothing, and putting them back is instant because they were never removed.

## Using it

Right-click someone → **Hide**:

| Entry | What it does |
| --- | --- |
| **Hide Friend** | They read as not added: gone from your friends list, an Add Friend button on their profile |
| **Hide Friend Request** | A real request from them leaves your Pending list, unanswered |

Each one has its opposite in the same menu once it is on.

**Everybody at once** — **Settings → Vencord → Plugins → HideFriends** → **Hide All**.
**Unhide All** brings them all back.

> [!TIP]
> The settings page lists everybody who is hidden, with an Unhide button beside each. That
> list is the way back: somebody shown as not added is not in your friends list to be
> right-clicked.

Faking a friend, a request or a block is **[Fake Friends](../fakeFriends)** now.

## The Implicit tab

If you use Vencord's **ImplicitRelationships** plugin, it adds an **Implicit** tab to the Friends
page listing people you talk to without being friends. **Hide the Implicit tab** takes that tab
away while this plugin is on. It is on by default.

## Settings

| Setting | What it does |
| --- | --- |
| **Show in the people menu** | **Hide Friend** when you right-click someone |
| **Hide new friends when turned back on** | Friends and requests from while it was off are hidden too |
| **Keep after restart** | Off means everybody is back next time you open Discord |
| **Hide the Implicit tab** | See above |

## Is this safe?

Yes. Every change is a local event of the kind Discord sends your client itself when a
relationship changes, and nothing here calls Discord's API. Nobody else can see any of it.

## Syncing

Install **[Cloud Sync](../cloudSync)** and who you have hidden can follow you to your phone,
and back.
