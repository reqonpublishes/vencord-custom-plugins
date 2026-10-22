/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Who this client shows as a friend, a request or blocked - shared by Hide Friends and Fake
 * Friends.
 *
 * Both change the same thing, through the same few relationship events, so two of them each
 * saying their own would undo each other: unhiding a friend who is also fake blocked would show
 * them as a friend. So there is one engine, and each plugin is a part of it that can be on or
 * off. The same file is in both plugins, and everything it holds lives on one object on the
 * window - so whichever copy is running, there is only ever one list and one truth.
 */

import { del, get, set } from "@api/DataStore";
import { Settings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { findByPropsLazy } from "@webpack";
import { Flux, FluxDispatcher, RelationshipStore, UserStore } from "@webpack/common";

const logger = new Logger("Friends");

const Actions = findByPropsLazy("addRelationship", "removeRelationship");

export type Part = "hide" | "fake";

const PLUGIN: Record<Part, string> = { hide: "HideFriends", fake: "FakeFriends" };
const KEY: Record<Part, string> = { hide: "HideFriends_State", fake: "FakeFriends_State" };

/** Which lists belong to which part, as saved and as synced */
export const FIELDS: Record<Part, (keyof Lists)[]> = {
    hide: ["hidden", "hiddenWas", "dismissed"],
    fake: ["blocked", "blockedWas", "pending", "incoming", "friended"]
};

/** Marks a relationship event as ours, so nothing treats it as news from Discord */
const OURS = "__vcHideFriends";

/** The relationship types Discord uses. Nothing invents its own. */
export const NONE = 0;
export const FRIEND = 1;
export const BLOCKED = 2;
export const PENDING_INCOMING = 3;
export const PENDING_OUTGOING = 4;

/** What a relationship really was, so putting it back is exact rather than a guess */
interface Was {
    type: number;
    nickname?: string | null;
    since?: string | null;
}

interface Lists {
    /** userId -> the name they had when hidden, so the list stays readable */
    hidden: Record<string, string>;
    hiddenWas: Record<string, Was>;
    /** userId -> a real request, taken off this client without being answered */
    dismissed: Record<string, string>;
    /** userId -> somebody this client treats as blocked, without Discord being told */
    blocked: Record<string, string>;
    blockedWas: Record<string, Was>;
    /** userId -> when a request to them was pretended, so it shows as pending */
    pending: Record<string, number>;
    /** userId -> somebody shown as having sent you a request they never sent */
    incoming: Record<string, string>;
    /** userId -> somebody shown as a friend who is not one */
    friended: Record<string, string>;
}

const blank = (part?: Part): Partial<Lists> =>
    Object.fromEntries((part ? FIELDS[part] : [...FIELDS.hide, ...FIELDS.fake]).map(field => [field, {}]));

const pick = (from: any, fields: string[]) => Object.fromEntries(fields.map(field => [field, from?.[field] ?? {}]));

interface Engine {
    held: Lists;
    on: Record<Part, boolean>;
    loaded: Record<Part, boolean>;
    loading: Record<Part, Promise<void> | null>;
    reads: Record<Part, number>;
    saveQueued: Record<Part, boolean>;
    slice: Record<Part, number>;
    migrated: Promise<void> | null;
    truth: Map<string, Was>;
    truthKnown: boolean;
    changed: number;
    watching: boolean;
    realAdd: any;
    realRemove: any;
}

const S: Engine = (window as any).__vcFriends ??= {
    held: blank() as Lists,
    on: { hide: false, fake: false },
    loaded: { hide: false, fake: false },
    loading: { hide: null, fake: null },
    reads: { hide: 0, fake: 0 },
    saveQueued: { hide: false, fake: false },
    slice: { hide: 0, fake: 0 },
    migrated: null,
    truth: new Map(),
    truthKnown: false,
    changed: 0,
    watching: false,
    realAdd: null,
    realRemove: null
};

export const isOn = (part: Part) => S.on[part];

// ---------------------------------------------------------------- reading

export const isHidden = (id?: string | null) => !!id && id in S.held.hidden;
export const isDismissed = (id?: string | null) => !!id && id in S.held.dismissed;
export const isBlocked = (id?: string | null) => !!id && id in S.held.blocked;
export const isPending = (id?: string | null) => !!id && id in S.held.pending;
export const isIncoming = (id?: string | null) => !!id && id in S.held.incoming;
export const isFriended = (id?: string | null) => !!id && id in S.held.friended;

/** Hidden or fake blocked, and showing as that right now - for the mutual friends lists */
export const showsAsGone = (id?: string | null) => (S.on.hide && isHidden(id)) || (S.on.fake && isBlocked(id));

export const counts = () => ({
    hidden: Object.keys(S.held.hidden).length,
    dismissed: Object.keys(S.held.dismissed).length,
    blocked: Object.keys(S.held.blocked).length,
    pending: Object.keys(S.held.pending).length,
    incoming: Object.keys(S.held.incoming).length,
    friended: Object.keys(S.held.friended).length
});

export const listed = () => ({
    hidden: Object.entries(S.held.hidden),
    dismissed: Object.entries(S.held.dismissed),
    blocked: Object.entries(S.held.blocked),
    incoming: Object.entries(S.held.incoming),
    pending: Object.keys(S.held.pending),
    friended: Object.entries(S.held.friended)
});

export function nameOf(id: string): string {
    const user: any = UserStore.getUser(id);
    return user?.globalName ?? user?.username ?? S.held.hidden[id] ?? S.held.blocked[id] ?? S.held.friended[id] ?? S.held.incoming[id] ?? id;
}

/** Somebody on one of the lists as a settings page draws them */
export function infoOf(id: string, stored?: string): { name: string; image: string | null; detail: string; } {
    const user: any = UserStore.getUser(id);
    if (!user) return { name: stored || id, image: null, detail: "Not loaded on this device" };

    return {
        name: user.globalName ?? user.username,
        image: user.getAvatarURL?.(undefined, 64) ?? null,
        detail: "@" + user.username
    };
}

/** What the relationship really is, read past anything this client is pretending */
export const realType = (id: string): number => {
    if (S.truthKnown) return S.truth.get(id)?.type ?? NONE;

    try {
        return (RelationshipStore as any).getRelationshipType?.(id) ?? NONE;
    } catch {
        return NONE;
    }
};

// ---------------------------------------------------------------- persistence

/** Goes up whenever a list changes, so anything worked out from one knows when it is stale */
export const changes = () => S.changed;

const keeps = (part: Part) => (Settings.plugins[PLUGIN[part]] as any)?.persist !== false;

/**
 * Write a part's lists down, once, after whatever is changing them has finished.
 *
 * Asked for on every change, and a change to fifty things asks fifty times. They are folded
 * into one write of how things ended up.
 */
function save(part: Part) {
    S.changed++;

    if (S.saveQueued[part] || !keeps(part)) return;

    S.saveQueued[part] = true;
    queueMicrotask(() => {
        S.saveQueued[part] = false;
        if (keeps(part)) set(KEY[part], pick(S.held, FIELDS[part]));
    });
}

/**
 * Fakes used to be kept with Hide Friends. The first read after the split moves them to Fake
 * Friends' own key, once, before either part reads its lists - so nothing is lost and nothing
 * is read twice.
 */
function migrate(): Promise<void> {
    return S.migrated ??= (async () => {
        try {
            const old = await get<Record<string, any>>(KEY.hide);
            if (!old || !FIELDS.fake.some(field => old[field] && Object.keys(old[field]).length)) return;

            if (await get(KEY.fake) === undefined) await set(KEY.fake, pick(old, FIELDS.fake));
            await set(KEY.hide, pick(old, FIELDS.hide));
        } catch (e) {
            logger.error("Could not move the fakes to Fake Friends", e);
        }
    })();
}

export const isLoaded = (part: Part) => S.loaded[part];

/** Told that the saved copy was replaced - a sync from the cloud - so the next start reads it */
export function invalidate(part: Part) {
    S.loaded[part] = false;
    S.loading[part] = null;
    S.reads[part]++;
}

/**
 * Read a part's lists, once, then trust them: switching the plugin off and on again should not
 * go back to disk for a list it is already holding.
 */
export function load(part: Part): Promise<void> {
    if (S.loaded[part]) return Promise.resolve();
    if (S.loading[part]) return S.loading[part]!;

    const mine = ++S.reads[part];
    const loading = (async () => {
        try {
            await migrate();

            // Nothing on disk to read when it is not being kept, and what is in memory is
            // the only copy there is.
            const stored = keeps(part) ? await get<Partial<Lists>>(KEY[part]) : null;
            if (mine !== S.reads[part]) return;

            if (stored) Object.assign(S.held, blank(part), pick(stored, FIELDS[part]));
            S.loaded[part] = true;
        } finally {
            if (mine === S.reads[part]) S.loading[part] = null;
        }
    })();

    S.loading[part] = loading;
    return loading;
}

/** Called when "Keep after restart" is switched off, so nothing is left behind on disk */
export function forgetSaved(part: Part) {
    del(KEY[part]);
}

// ---------------------------------------------------------------- doing it without a freeze

/**
 * Do several things to the client and let it redraw once at the end.
 *
 * Every dispatch makes Discord's stores tell React to draw again. Fifty of something one at a
 * time is fifty redraws of the same list; held back until the last one, it is a single redraw.
 */
function batched(run: () => void) {
    const emitter = (Flux as any)?.Emitter;
    if (typeof emitter?.batched === "function") emitter.batched(run);
    else run();
}

/** How long one burst of work may run before the window is given a turn */
const BURST_MS = 8;

/** Up to this many are done in one go: too few to be felt, and not worth the ceremony */
const FEW = 24;

/**
 * Do a long list of things without the window freezing while it happens.
 *
 * Each one is a dispatch Discord spends a couple of milliseconds on, so a few hundred done in
 * one go is a second with the window not answering - and it lands as a call or a screen share
 * is starting. So they are done in short bursts with the window given a turn between each,
 * and Discord is asked to hold its redrawing until the last one. The hold has a time limit,
 * so the screen comes back by itself if anything stops half way.
 *
 * One run per part: starting another for the same part ends the first, and every step checks
 * what is true before acting, so a run cut short leaves nothing the next does not put right.
 */
function sliced(part: Part, steps: (() => void)[]) {
    const mine = ++S.slice[part];

    if (steps.length <= FEW) {
        batched(() => {
            for (const step of steps) step();
        });
        return;
    }

    const emitter = (Flux as any)?.Emitter;
    let at = 0;

    const burst = () => {
        if (mine !== S.slice[part]) return emitter?.resume?.();

        emitter?.pause?.(3000);

        const began = performance.now();
        while (at < steps.length && performance.now() - began < BURST_MS) {
            try {
                steps[at++]();
            } catch (e) {
                logger.error("A step failed while switching", e);
            }
        }

        if (at < steps.length) {
            setTimeout(burst, 0);
            return;
        }

        emitter?.resume?.();
    };

    burst();
}

// ---------------------------------------------------------------- the truth

/**
 * Every relationship as Discord really has it, whatever this client is showing.
 *
 * Kept from the only place it comes from: what Discord sends. The whole list when it
 * connects, and each change after that. Nothing this engine says is let in. Putting somebody
 * back is then just showing what is in here.
 */
const idOf = (relationship: any): string | undefined =>
    relationship?.id ?? relationship?.user_id ?? relationship?.user?.id;

/** Read the relationships as they stand. Only right before anything of ours has been said */
function learnTruth() {
    if (S.truthKnown) return;

    try {
        const store: any = RelationshipStore;
        const all = store.getMutableRelationships?.() ?? store.getRelationships?.();
        const entries: [string, number][] = all instanceof Map ? [...all] : Object.entries(all ?? {});

        for (const [id, type] of entries) {
            S.truth.set(id, { type: Number(type), nickname: store.getNickname?.(id) ?? null, since: store.getSince?.(id) ?? null });
        }

        S.truthKnown = true;
    } catch (e) {
        logger.error("Could not read the real relationships", e);
    }
}

/** Keep the truth up to date from what Discord sends. Called for every action, so it bails on the type first */
function noteReal(action: any) {
    switch (action?.type) {
        case "CONNECTION_OPEN":
            if (!Array.isArray(action.relationships)) return;

            S.truth.clear();
            for (const one of action.relationships) {
                const id = idOf(one);
                if (id) S.truth.set(id, { type: one.type, nickname: one.nickname ?? null, since: one.since ?? null });
            }
            S.truthKnown = true;

            for (const id of Object.keys(S.held.dismissed)) dropAnswered(id);
            return;

        case "RELATIONSHIP_ADD":
        case "RELATIONSHIP_UPDATE": {
            if (action[OURS]) return;

            const one = action.relationship;
            const id = idOf(one);
            if (!id) return;

            const was = S.truth.get(id);
            S.truth.set(id, { type: one.type, nickname: one.nickname ?? was?.nickname ?? null, since: one.since ?? was?.since ?? null });
            dropAnswered(id);
            return;
        }

        case "RELATIONSHIP_REMOVE": {
            if (action[OURS]) return;

            const id = idOf(action.relationship);
            if (!id) return;

            S.truth.delete(id);
            dropAnswered(id);
            return;
        }
    }
}

/**
 * Whether Discord still has somebody as `type` - the thing a hide of them is hiding. Once that
 * has changed for real, saying the hide again would take away whatever it has become. Taken
 * as yes while the truth is not known.
 */
const stillIs = (id: string, type: number) => !S.truthKnown || S.truth.get(id)?.type === type;

/** A hidden request that is not a request any more - answered or withdrawn - has nothing left to hide */
function dropAnswered(id: string) {
    if (!(id in S.held.dismissed) || stillIs(id, PENDING_INCOMING)) return;

    delete S.held.dismissed[id];
    save("hide");
}

function snapshot(id: string): Was {
    if (S.truthKnown) return S.truth.get(id) ?? { type: NONE, nickname: null, since: null };

    try {
        const store: any = RelationshipStore;
        return { type: store.getRelationshipType?.(id) ?? NONE, nickname: store.getNickname?.(id) ?? null, since: store.getSince?.(id) ?? null };
    } catch (e) {
        logger.error("Could not read what the relationship was", e);
        return { type: NONE, nickname: null, since: null };
    }
}

// ---------------------------------------------------------------- saying it to the client

function say(type: number, id: string, since?: string | null, nickname?: string | null) {
    FluxDispatcher.dispatch({
        type: "RELATIONSHIP_ADD",
        relationship: {
            id,
            type,
            nickname: nickname ?? null,
            since: since ?? new Date().toISOString(),
            user: UserStore.getUser(id)
        },
        [OURS]: true
    } as any);
}

function unsay(id: string, type: number) {
    FluxDispatcher.dispatch({
        type: "RELATIONSHIP_REMOVE",
        relationship: { id, type },
        [OURS]: true
    } as any);
}

/** Show somebody as Discord really has them */
function putBack(id: string) {
    const real = S.truthKnown ? S.truth.get(id) : (S.held.hiddenWas[id] ?? S.held.blockedWas[id]);

    if (!real || !real.type) return unsay(id, FRIEND);
    say(real.type, id, real.since, real.nickname);
}

/**
 * Show somebody as whatever is pretended about them by the parts that are on, or as they
 * really are when nothing is.
 *
 * Somebody can be on lists of both parts - a hidden friend sent a fake request, say - and a
 * fake is what shows, since it is the thing that was put there to be seen. Every change goes
 * through here, so what shows after any of them is what a reconnect would show.
 */
function settle(id: string) {
    if (S.on.fake) {
        if (isIncoming(id)) return say(PENDING_INCOMING, id);
        if (isPending(id)) return say(PENDING_OUTGOING, id);
        if (isBlocked(id)) return say(BLOCKED, id);
        if (isFriended(id)) return say(FRIEND, id, S.truth.get(id)?.since);
    }

    if (S.on.hide) {
        if (isHidden(id) && stillIs(id, FRIEND)) return unsay(id, FRIEND);
        if (isDismissed(id) && stillIs(id, PENDING_INCOMING)) return unsay(id, PENDING_INCOMING);
    }

    putBack(id);
}

/** Everybody a part has something about, once each */
const peopleOf = (part: Part) => [...new Set(FIELDS[part].filter(field => !field.endsWith("Was")).flatMap(field => Object.keys(S.held[field])))];

// ---------------------------------------------------------------- hiding

/** Show somebody as not added. The friendship itself is untouched. */
export function hideFriend(id: string): boolean {
    if (isHidden(id)) return false;

    S.held.hiddenWas[id] = snapshot(id);
    S.held.hidden[id] = nameOf(id);
    save("hide");

    if (S.on.hide) settle(id);
    return true;
}

export function showFriend(id: string): boolean {
    if (!isHidden(id)) return false;

    delete S.held.hidden[id];
    delete S.held.hiddenWas[id];
    save("hide");

    if (S.on.hide) settle(id);
    return true;
}

/** Everybody on the friends list at once */
export function hideAllFriends(): number {
    let ids: string[] = [];
    try {
        ids = (RelationshipStore as any).getFriendIDs?.() ?? [];
    } catch (e) {
        logger.error("Could not read the friends list", e);
    }

    let n = 0;
    batched(() => {
        for (const id of ids) if (!isFriended(id) && hideFriend(id)) n++;
    });

    return n;
}

export function showAllFriends(): number {
    const ids = Object.keys(S.held.hidden);
    batched(() => {
        for (const id of ids) showFriend(id);
    });

    return ids.length;
}

/** Take a real request off this client without answering it */
export function dismissRequest(id: string): boolean {
    if (isDismissed(id)) return false;

    S.held.dismissed[id] = nameOf(id);
    save("hide");

    if (S.on.hide) settle(id);
    return true;
}

export function restoreRequest(id: string): boolean {
    if (!isDismissed(id)) return false;

    delete S.held.dismissed[id];
    save("hide");

    // Handed back as Discord has it, when that is known. Otherwise nothing is said: the
    // request is real, so it returns on the next reconnect.
    if (S.on.hide && S.truthKnown) settle(id);
    return true;
}

/**
 * Everybody who is really a friend or has really sent you a request, as `id:type`.
 *
 * The type is part of it so that a request accepted while the plugin was off counts as a new
 * friend. Null until Discord has said who they are.
 */
export function realList(): string[] | null {
    if (!UserStore.getCurrentUser()) return null;

    learnTruth();
    if (!S.truthKnown) return null;

    const out: string[] = [];
    for (const [id, was] of S.truth) {
        if (was.type === FRIEND || was.type === PENDING_INCOMING) out.push(`${id}:${was.type}`);
    }

    return out;
}

/** Put away people who turned up while Hide Friends was off, as `id:type` from realList */
export function hideFresh(keys: string[]): string[] {
    const done: string[] = [];

    batched(() => {
        for (const key of keys) {
            const [id, type] = key.split(":");

            if (Number(type) === FRIEND) {
                if (!isFriended(id) && hideFriend(id)) done.push(key);
            } else if (Number(type) === PENDING_INCOMING) {
                if (dismissRequest(id)) done.push(key);
            }
        }
    });

    return done;
}

/** Take people off the lists again without saying anything. Only once they are back on screen */
export function forgetFresh(keys: string[]) {
    for (const key of keys) {
        const [id, type] = key.split(":");

        if (Number(type) === FRIEND) {
            delete S.held.hidden[id];
            delete S.held.hiddenWas[id];
        } else if (Number(type) === PENDING_INCOMING) {
            delete S.held.dismissed[id];
        }
    }

    save("hide");
}

// ---------------------------------------------------------------- faking

export type Fake = "friended" | "incoming" | "pending" | "blocked";

const FAKES: Fake[] = ["friended", "incoming", "pending", "blocked"];

/** Which fake somebody is, if any. Only ever one: a person shows as one thing at a time. */
export const fakeOf = (id?: string | null): Fake | null => FAKES.find(fake => !!id && id in S.held[fake]) ?? null;

/**
 * Show somebody as a fake friend, a fake request either way, or fake blocked.
 *
 * Each replaces whatever else was faked about them: Discord shows a person as one thing, so
 * a block on top of a request would be a choice of which to believe. Accepting a fake request
 * is this too - it becomes a fake friend.
 */
export function fakeAs(id: string, fake: Fake): boolean {
    if (fakeOf(id) === fake) return false;

    for (const other of FAKES) delete S.held[other][id];
    delete S.held.blockedWas[id];

    if (fake === "pending") S.held.pending[id] = Date.now();
    else S.held[fake][id] = nameOf(id);
    if (fake === "blocked") S.held.blockedWas[id] = snapshot(id);
    save("fake");

    if (S.on.fake) settle(id);
    return true;
}

/** Stop faking anything about somebody */
export function unfake(id: string): boolean {
    if (!fakeOf(id)) return false;

    for (const fake of FAKES) delete S.held[fake][id];
    delete S.held.blockedWas[id];
    save("fake");

    if (S.on.fake) settle(id);
    return true;
}

// ---------------------------------------------------------------- the parts

/**
 * Keep anything pretended from ever reaching Discord.
 *
 * The rows are real as far as this client is concerned, which is the point - and it means
 * Accept, Decline, Cancel and Unblock are real buttons that would go and do something about a
 * request nobody sent or a block that does not exist. Accepting a fake request would send them
 * a real one, which is the one outcome a pretence must never have. So they are answered here
 * instead, the way the real thing would look from this side.
 */
function guard() {
    const actions: any = Actions;
    if (!actions?.addRelationship || S.realAdd) return;

    S.realAdd = actions.addRelationship;
    S.realRemove = actions.removeRelationship;

    const idIn = (target: any): string | undefined => typeof target === "string" ? target : target?.userId ?? target?.id;

    actions.addRelationship = function (this: any, ...args: any[]) {
        const id = idIn(args[0]);
        const type = args[0]?.type;

        // Blocking and ignoring go through here too, and those are real things to ask for.
        if (!id || (type != null && type !== FRIEND)) return S.realAdd.apply(this, args);

        if (S.on.fake && isIncoming(id)) {
            // Hidden: the friendship is real and only this client said otherwise, so
            // accepting means showing it again rather than inventing a second one.
            if (isHidden(id)) {
                unfake(id);
                showFriend(id);
            } else fakeAs(id, "friended");

            return Promise.resolve();
        }

        if (S.on.hide && isHidden(id)) {
            showFriend(id);
            return Promise.resolve();
        }

        return S.realAdd.apply(this, args);
    };

    actions.removeRelationship = function (this: any, ...args: any[]) {
        const id = idIn(args[0]);

        // Cancel, Decline, Remove Friend and Unblock on anything fake. Letting Unblock through
        // would remove the real friendship underneath, which is what it does to a friend.
        if (id && S.on.fake && fakeOf(id)) {
            unfake(id);
            return Promise.resolve();
        }

        return S.realRemove.apply(this, args);
    };
}

function unguard() {
    const actions: any = Actions;
    if (!S.realAdd || !actions) return;

    actions.addRelationship = S.realAdd;
    actions.removeRelationship = S.realRemove;
    S.realAdd = null;
    S.realRemove = null;
}

/**
 * Switch a part on: everybody it has something about is shown that way.
 *
 * The listener for what Discord really sends is put on once and left: there is no taking an
 * interceptor back off, and it has to go on listening while both parts are off or what it
 * knows goes stale.
 */
export function attach(part: Part) {
    if (!S.watching) {
        S.watching = true;
        FluxDispatcher.addInterceptor((action: any) => {
            try {
                noteReal(action);
            } catch { /* what Discord sends still goes through */ }

            return false;
        });
    }

    try {
        guard();
    } catch (e) {
        logger.error("Could not guard the relationship actions", e);
    }

    learnTruth();
    S.on[part] = true;
    sliced(part, peopleOf(part).map(id => () => settle(id)));
}

/** Switch a part off: everybody it had something about back as the other part or Discord has them, kept on its lists */
export function detach(part: Part) {
    S.on[part] = false;
    if (!S.on.hide && !S.on.fake) unguard();

    sliced(part, peopleOf(part).map(id => () => settle(id)));
}

/** Discord rebuilds its relationships on every launch and reconnect, so a part says all of its again */
export function reapply(part: Part) {
    if (!S.on[part]) return;

    learnTruth();
    sliced(part, peopleOf(part).map(id => () => settle(id)));
}

/**
 * Everybody of a part's shown as they really are, at once - before its saved copy is replaced
 * by a sync, which would leave nothing to put them back from.
 */
export function release(part: Part) {
    S.slice[part]++;
    const was = S.on[part];
    S.on[part] = false;

    batched(() => {
        for (const id of peopleOf(part)) settle(id);
    });

    S.on[part] = was;
}

/** Forget everything a part has, and show those people as they really are */
export function clearAll(part: Part) {
    const people = peopleOf(part);
    S.slice[part]++;

    Object.assign(S.held, blank(part));
    save(part);

    if (S.on[part]) {
        batched(() => {
            for (const id of people) settle(id);
        });
    }
}

export const isOurEvent = (action: any) => !!action?.[OURS];
