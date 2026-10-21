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
import { realActivities, realStatus, realWidgets } from "./presence";
import { changes, Look, lookFor, NOTHING } from "./store";

const logger = new Logger("InspectProfiles");

/**
 * Stands in for a picture hash, so the client believes there is a picture to ask about.
 *
 * Never fetched: the functions that build an address from a hash answer with the chosen
 * address first - see the patches in index.tsx. Starting a_ lets a gif be allowed to move.
 */
const MARK = "a_vcip";

let UserProfileStore: any = null;
const profileStore = () => (UserProfileStore ??= findStore("UserProfileStore"));

/** The store methods as Discord wrote them, so the real thing can always be read */
let realGetUser: ((id: string) => any) | null = null;
let realGetCurrentUser: (() => any) | null = null;
let realGetProfile: ((id: string) => any) | null = null;

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
    const chosen = lookFor(user?.id ?? user?.userId)?.avatar;
    return pictureUrl(chosen);
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
    realGetUser = UserStore.getUser;
    realGetCurrentUser = UserStore.getCurrentUser;
    realGetProfile = profiles?.getUserProfile ?? null;

    const getUser = realGetUser;
    const getCurrentUser = realGetCurrentUser;
    const getProfile = realGetProfile;

    (UserStore as any).getUser = function (id: string) { return userCopy(getUser.call(this, id)); };
    (UserStore as any).getCurrentUser = function () { return userCopy(getCurrentUser.call(this)); };
    if (profiles && getProfile) profiles.getUserProfile = function (id: string) { return profileCopy(getProfile.call(this, id)); };

    running = true;
    redraw();
}

export function stopRewriting() {
    if (!running) return;
    running = false;

    if (realGetUser) (UserStore as any).getUser = realGetUser;
    if (realGetCurrentUser) (UserStore as any).getCurrentUser = realGetCurrentUser;
    if (realGetProfile && profileStore()) profileStore().getUserProfile = realGetProfile;

    userCopies.clear();
    profileCopies.clear();
    redraw();
}

/** Tell everything showing a user or a profile to look again */
export function redraw() {
    try {
        (UserStore as any).emitChange?.();
        profileStore()?.emitChange?.();
    } catch (e) {
        logger.error("Could not redraw", e);
    }
}

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
        premiumType: user.premiumType ?? 0,
        avatar: user.avatar ? pictureAt("avatars", userId, user.avatar, 512) : NOTHING,
    };

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

    return { ...look, ...(lookFor(userId) ?? {}) };
}

/** Whether their full profile has loaded, which is when stealing gets everything */
export const profileLoaded = (userId: string) => !!realProfile(userId);
