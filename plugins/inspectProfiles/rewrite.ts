/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { findStore } from "@webpack";
import { UserStore } from "@webpack/common";

import { badgesFor, realKeys } from "./badges";
import { isStored, urlOf } from "./images";
import { realActivities, realOutbox, realStatus, realWidgets } from "./presence";
import { changes, Look, lookFor, NOTHING, presetCalled, switcherNames, wornPreset } from "./store";

const logger = new Logger("InspectProfiles");

/**
 * Stands in for a picture hash, so the client believes there is a picture to ask about.
 *
 * Never fetched: the functions that build an address from a hash answer with the chosen
 * address first - see the patches in index.tsx. Starting a_ lets a gif be allowed to move.
 */
const MARK = "a_vcip";

/**
 * Your own row in Switch Accounts while you wear one of its presets. The preset has a row of
 * its own then, so yours shows the real you - the way back - and its picture is drawn from
 * this mark rather than from the look every other picture of you follows.
 */
const REAL = "vcreal_";

let UserProfileStore: any = null;
const profileStore = () => (UserProfileStore ??= findStore("UserProfileStore"));

/** The accounts you are logged in to, which Switch Accounts lists from its own saved copy */
let MultiAccountStore: any = null;
const accountStore = () => (MultiAccountStore ??= findStore("MultiAccountStore"));

/** The store methods as Discord wrote them, so the real thing can always be read */
let realGetUser: ((id: string) => any) | null = null;
let realGetUsers: (() => Record<string, any>) | null = null;
let realGetCurrentUser: (() => any) | null = null;
let realGetProfile: ((id: string) => any) | null = null;
let realGetAccounts: (() => any[]) | null = null;
let realGetValidAccounts: (() => any[]) | null = null;

let running = false;

export const realUser = (id: string) => (realGetUser ?? UserStore.getUser).call(UserStore, id);
export const realProfile = (id: string) => (realGetProfile ?? profileStore()?.getUserProfile)?.call(profileStore(), id);

// ---------------------------------------------------------------- copies

/**
 * One copy per person, kept until either the real record or the look changes.
 *
 * A fresh object on every read is a new identity on every read, which defeats every comparison
 * React makes between the user it was given and the user it has - so the screen would redraw
 * forever. Same idea as the phone.
 */
const userCopies = new Map<string, { from: any; version: number; copy: any; }>();
const profileCopies = new Map<string, { from: any; version: number; copy: any; }>();

/** A picture this can draw: an address, or one kept on this computer */
const isAddress = (value?: string) => !!value && (/^https?:\/\//.test(value) || isStored(value));

/** Where to draw a chosen picture from, once it is ready */
export const pictureUrl = (value?: string) =>
    !value ? undefined : isStored(value) ? urlOf(value) : /^https?:\/\//.test(value) ? value : undefined;

function userCopy(user: any) {
    if (!running || !user?.id) return user;

    const look = lookFor(user.id);
    if (!look) return user;

    const held = userCopies.get(user.id);
    if (held && held.from === user && held.version === changes()) return held.copy;

    const fields: Record<string, any> = {};
    if (look.globalName !== undefined) fields.globalName = look.globalName;
    if (look.username !== undefined) fields.username = look.username;
    if (look.premiumType !== undefined) fields.premiumType = look.premiumType || null;

    if (look.avatar) fields.avatar = look.avatar === NOTHING ? null : (isAddress(look.avatar) ? MARK : look.avatar);
    if (look.banner) fields.banner = look.banner === NOTHING ? null : (isAddress(look.banner) ? MARK : look.banner);

    if (look.decoration) {
        fields.avatarDecorationData = look.decoration === NOTHING ? null : { asset: look.decoration, skuId: look.decorationSku ?? "1" };
    }

    if (look.nameplate) {
        fields.collectibles = {
            ...(user.collectibles ?? {}),
            nameplate: look.nameplate === NOTHING ? null : {
                asset: look.nameplate,
                skuId: look.nameplateSku ?? "1",
                palette: look.nameplatePalette ?? "none",
                label: "",
            },
        };
    }

    if (look.fontId !== undefined || look.effectId !== undefined || look.nameColors !== undefined) {
        const held = user.displayNameStyles ?? {};
        fields.displayNameStyles = {
            fontId: look.fontId ?? held.fontId ?? 0,
            effectId: look.effectId ?? held.effectId ?? 0,
            colors: look.nameColors ? [...look.nameColors] : (held.colors ?? []),
        };
    }

    let copy = user;
    try {
        // Discord's own way of making a changed copy, which keeps every method a record has.
        // A copy made by hand lost some of them and took the whole window down with it.
        copy = Object.keys(fields).length ? user.merge(fields) : user;

        if (look.memberSince) {
            const day = new Date(look.memberSince);
            Object.defineProperty(copy === user ? (copy = user.merge({})) : copy, "createdAt", { get: () => day, configurable: true });
        }
    } catch (e) {
        logger.error("Could not rewrite a user", e);
        copy = user;
    }

    userCopies.set(user.id, { from: user, version: changes(), copy });
    return copy;
}

function profileCopy(profile: any) {
    if (!running || !profile?.userId) return profile;

    const look = lookFor(profile.userId);
    if (!look) return profile;

    const held = profileCopies.get(profile.userId);
    if (held && held.from === profile && held.version === changes()) return held.copy;

    // A plain object, measured, so spreading it keeps everything it had.
    const copy: any = { ...profile };

    if (look.bio !== undefined) copy.bio = look.bio;
    if (look.pronouns !== undefined) copy.pronouns = look.pronouns;

    // The card asks whether there is a banner before asking for its address, so a chosen banner
    // needs the mark here as well as on the user, or nothing asks for it at all.
    if (look.banner) copy.banner = look.banner === NOTHING ? null : (isAddress(look.banner) ? MARK : look.banner);

    if (look.themeColors) {
        copy.themeColors = [...look.themeColors];
        copy.accentColor = look.themeColors[0];
    }

    if (look.premiumType !== undefined) {
        copy.premiumType = look.premiumType || null;
        if (look.premiumType) copy.premiumSince ??= new Date(Date.now() - 31536e6);
    }

    // Discord draws a card's colours only for Nitro, and anything less shows them on the
    // banner strip alone. Colours that were chosen are meant to be seen, so the card has Nitro.
    if (look.themeColors && (copy.premiumType ?? 0) < 2) {
        copy.premiumType = 2;
        copy.premiumSince ??= new Date(Date.now() - 31536e6);
    }

    if (look.badges) copy.badges = badgesFor(profile.badges ?? [], look.badges);
    if (look.profileEffect) copy.profileEffect = look.profileEffect === NOTHING ? null : { skuId: look.profileEffect };
    if (look.profileFrame) copy.profileFrame = look.profileFrame === NOTHING ? null : { skuId: look.profileFrame, type: 3 };
    if (look.connections) copy.connectedAccounts = look.connections.map(one => ({ ...one }));

    profileCopies.set(profile.userId, { from: profile, version: changes(), copy });
    return copy;
}

// ---------------------------------------------------------------- pictures, from the patches

/** The chosen picture for somebody, when it is an address. Called from Discord's own code */
export function avatarFor(user: any): string | undefined {
    if (!running) return;
    const id = user?.id ?? user?.userId;
    if (typeof user?.avatar === "string" && user.avatar.startsWith(REAL)) return realPicture(id, user.avatar.slice(REAL.length));

    const preset = presetForAccount(id);
    if (preset) return pictureUrl(presetCalled(preset)?.avatar);

    const chosen = lookFor(id)?.avatar;
    return pictureUrl(chosen);
}

/** Your real picture, as Discord's own address for it */
function realPicture(id: string, hash: string) {
    if (!hash) return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(id) >> 22n) % 6n)}.png`;
    return `https://cdn.discordapp.com/avatars/${id}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}?size=128`;
}

export function bannerFor(user: any): string | undefined {
    if (!running) return;
    const chosen = lookFor(user?.id ?? user?.userId)?.banner;
    return pictureUrl(chosen);
}

/** The day somebody joined, as Member Since shows it: the chosen one, or the real one */
export function joinedAt(userId: string, real: number): number {
    if (!running) return real;
    return lookFor(userId)?.memberSince ?? real;
}

// ---------------------------------------------------------------- on and off

/**
 * Answer with the copies wherever the stores are asked.
 *
 * The methods are replaced outright on the store rather than wrapped: Discord calls them in
 * ways a wrapper can be bypassed by, and replacing the property is the one thing every caller
 * goes through.
 */
export function startRewriting() {
    if (running) return;

    const profiles = profileStore();
    const accounts = accountStore();
    realGetUser = UserStore.getUser;
    realGetUsers = (UserStore as any).getUsers ?? null;
    realGetCurrentUser = UserStore.getCurrentUser;
    realGetProfile = profiles?.getUserProfile ?? null;
    realGetAccounts = accounts?.getUsers ?? null;
    realGetValidAccounts = accounts?.getValidUsers ?? null;

    const getUser = realGetUser;
    const getCurrentUser = realGetCurrentUser;
    const getProfile = realGetProfile;
    const getAccounts = realGetAccounts;
    const getValidAccounts = realGetValidAccounts;

    (UserStore as any).getUser = function (id: string) { return userCopy(getUser.call(this, id)); };
    if (realGetUsers) {
        const getUsers = realGetUsers;
        (UserStore as any).getUsers = function () { return everyoneCopy(getUsers.call(this)); };
    }
    (UserStore as any).getCurrentUser = function () { return userCopy(getCurrentUser.call(this)); };
    if (profiles && getProfile) profiles.getUserProfile = function (id: string) { return profileCopy(getProfile.call(this, id)); };
    if (accounts && getAccounts) accounts.getUsers = function () { return accountsCopy("all", getAccounts.call(this)); };
    if (accounts && getValidAccounts) accounts.getValidUsers = function () { return accountsCopy("valid", getValidAccounts.call(this)); };

    running = true;
    redraw();
}

export function stopRewriting() {
    if (!running) return;
    running = false;

    if (realGetUser) (UserStore as any).getUser = realGetUser;
    if (realGetUsers) (UserStore as any).getUsers = realGetUsers;
    if (realGetCurrentUser) (UserStore as any).getCurrentUser = realGetCurrentUser;
    if (realGetProfile && profileStore()) profileStore().getUserProfile = realGetProfile;
    if (realGetAccounts && accountStore()) accountStore().getUsers = realGetAccounts;
    if (realGetValidAccounts && accountStore()) accountStore().getValidUsers = realGetValidAccounts;

    userCopies.clear();
    profileCopies.clear();
    accountLists.clear();
    redraw();
}

/** Tell everything showing a user or a profile to look again */
export function redraw() {
    try {
        (UserStore as any).emitChange?.();
        profileStore()?.emitChange?.();
        accountStore()?.emitChange?.();
    } catch (e) {
        logger.error("Could not redraw", e);
    }
}

// ---------------------------------------------------------------- everyone at once

/** One stand-in per real list, so the same list read twice is the same list */
const everyoneCopies = new WeakMap<object, Record<string, any>>();

/**
 * Every user at once, as the @mention list and searches read them, with the changed ones as
 * their copies.
 *
 * Without this the @mention list showed and matched your real name while you wore a look -
 * it reads the whole list rather than asking for anyone. The list itself is Discord's, read
 * through, so it is never out of date and nobody is copied but the people who were changed.
 */
function everyoneCopy(all: Record<string, any>) {
    if (!running || !all || typeof all !== "object") return all;

    let copy = everyoneCopies.get(all);
    if (!copy) {
        copy = new Proxy(all, {
            get(target, key, receiver) {
                const user = Reflect.get(target, key, receiver);
                return typeof key === "string" && user && lookFor(key) ? userCopy(user) : user;
            }
        });
        everyoneCopies.set(all, copy);
    }
    return copy;
}

// ---------------------------------------------------------------- Switch Accounts

/** Each list kept until the real list or a look changes, for the same reason as the user copies */
const accountLists = new Map<string, { from: any[]; version: number; list: any[]; }>();

/**
 * The accounts as Switch Accounts lists them, with the name and picture of any look worn.
 *
 * Only what is shown changes. Discord switches by id and saves the list from its own copy,
 * never from what this answers, so the real accounts are untouched.
 */
function accountsCopy(key: string, list: any[]) {
    if (!running || !Array.isArray(list)) return list;

    const presets = switcherNames();
    if (!presets.length && !list.some(account => lookFor(account?.id))) return list;

    const held = accountLists.get(key);
    if (held && held.from === list && held.version === changes()) return held.list;

    const me = realGetCurrentUser?.call(UserStore)?.id;
    const wearing = !!wornPreset(me);

    const copy = list.map(account => {
        const look = lookFor(account?.id);
        if (!look) return account;
        if (wearing && account.id === me) return { ...account, avatar: REAL + (account.avatar ?? "") };

        const shown = { ...account };
        if (look.username !== undefined) shown.username = look.username;
        if (look.avatar) shown.avatar = look.avatar === NOTHING ? null : (isAddress(look.avatar) ? MARK : look.avatar);
        return shown;
    });

    // The presets you put in Switch Accounts, after the real accounts, each as a row of its
    // own. Choosing one wears it - see switchTo in index.tsx - so nothing ever logs in.
    for (const name of presets) {
        const look = presetCalled(name)!;
        copy.push({
            id: presetAccountId(name),
            username: look.username ?? look.globalName ?? name,
            globalName: look.globalName ?? null,
            avatar: look.avatar && look.avatar !== NOTHING ? MARK : null,
            discriminator: "0",
            tokenStatus: 2,
            pushSyncToken: null
        });
    }

    accountLists.set(key, { from: list, version: changes(), list: copy });
    return copy;
}

/**
 * The id a preset's row in Switch Accounts goes by.
 *
 * Digits like a real one, so anything Discord works out from an id still works - the default
 * picture, sorting - and starting with a 9, which no account will have for a few hundred
 * years. The same name always gives the same id, so the row keeps its place.
 */
export function presetAccountId(name: string): string {
    let hash = 0n;
    for (const char of name) hash = (hash * 131n + BigInt(char.codePointAt(0)!)) % 10n ** 17n;
    return "9" + String(hash).padStart(17, "0") + "7";
}

/** Which preset a Switch Accounts row stands for, if it stands for one */
export function presetForAccount(id?: string | null): string | undefined {
    if (!id || !id.startsWith("9")) return;
    return switcherNames().find(name => presetAccountId(name) === id);
}

/** How many of the rows are real accounts, so a drag among the made-up rows can be told apart */
export const realAccountCount = () => realGetAccounts?.call(accountStore())?.length ?? 0;

// ---------------------------------------------------------------- stealing

const pictureAt = (kind: "avatars" | "banners", id: string, hash: string, size: number) =>
    `https://cdn.discordapp.com/${kind}/${id}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}?size=${size}`;

/**
 * Everything somebody looks like, as a look anybody can wear - read off their real records.
 *
 * All of it: names, bio, pronouns, the day they joined, badges, Nitro, both pictures, the
 * decoration, nameplate, effect and frame, the lettering and colours of their name, the colours
 * of their card, and their connections. Where they have no picture of their own that is written
 * down as none, so wearing it takes yours away rather than leaving it showing through.
 *
 * Anything that has been changed about them already is laid on top, so a profile you made is
 * taken as you made it.
 */
export function wholeLookOf(userId: string): Look | null {
    const user = realUser(userId);
    if (!user) return null;

    const profile = realProfile(userId);
    const look: Look = {
        globalName: user.globalName ?? user.username,
        username: user.username,
        memberSince: new Date(Number(BigInt(userId) >> 22n) + 1420070400000).getTime(),
        avatar: user.avatar ? pictureAt("avatars", userId, user.avatar, 512) : NOTHING,
    };

    // Discord only says whether somebody else has Nitro on their profile - their user record
    // leaves it out - so it is read from there. Not known until the profile has loaded.
    const premium = profile?.premiumType ?? user.premiumType;
    if (premium !== undefined) look.premiumType = premium ?? 0;

    const banner = profile?.banner ?? user.banner;
    look.banner = banner ? pictureAt("banners", userId, banner, 1024) : NOTHING;

    if (profile) {
        look.bio = profile.bio ?? "";
        look.pronouns = profile.pronouns ?? "";
        look.badges = realKeys(profile.badges ?? []);
        if (Array.isArray(profile.themeColors) && profile.themeColors.length === 2) look.themeColors = [profile.themeColors[0], profile.themeColors[1]];
        if (profile.profileEffect?.skuId) look.profileEffect = String(profile.profileEffect.skuId);
        if (profile.profileFrame?.skuId) look.profileFrame = String(profile.profileFrame.skuId);
        look.connections = (profile.connectedAccounts ?? []).map((one: any) => ({ ...one }));
    }

    const ring = user.avatarDecorationData;
    look.decoration = ring?.asset ?? NOTHING;
    if (ring?.skuId) look.decorationSku = String(ring.skuId);

    const plate = user.collectibles?.nameplate;
    look.nameplate = plate?.asset ?? NOTHING;
    if (plate?.skuId) look.nameplateSku = String(plate.skuId);
    if (plate?.palette) look.nameplatePalette = plate.palette;

    const styles = user.displayNameStyles;
    look.fontId = styles?.fontId ?? 0;
    look.effectId = styles?.effectId ?? 0;
    look.nameColors = [...(styles?.colors ?? [])];

    // Their status, what they are doing, and their board - read as Discord really has them
    const status = realStatus(userId);
    look.status = status === "offline" ? "invisible" : status as Look["status"];
    const activities = realActivities(userId);
    const custom = activities.find(a => a?.type === 4);
    look.customStatus = custom ? { text: custom.state ?? "", emoji: custom.emoji ? { ...custom.emoji } : undefined } : NOTHING;
    look.activities = activities.filter(a => a?.type !== 4).map(a => JSON.parse(JSON.stringify(a)));
    const widgets = realWidgets(userId);
    if (widgets) look.widgets = JSON.parse(JSON.stringify(widgets));
    const recent = realOutbox(userId)?.entries;
    if (Array.isArray(recent)) look.recentActivity = JSON.parse(JSON.stringify(recent));

    return { ...look, ...(lookFor(userId) ?? {}) };
}

/** Whether their full profile has loaded, which is when stealing gets everything */
export const profileLoaded = (userId: string) => !!realProfile(userId);
