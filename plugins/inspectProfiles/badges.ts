/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Every badge a profile can be given, under the id and picture Discord itself uses.
 *
 * Read off real profiles rather than written from memory - a few dozen people Discord already
 * knew about, on this computer and on the phone - so each one draws exactly as anybody else's
 * does. The pictures not seen on anybody (Active Developer, AutoMod) were checked against
 * Discord's own image server before going in.
 */

export type Group = "staff" | "nitro" | "boost" | "stats" | "gifting" | "house" | "other";

export interface Badge {
    /** ours, and what is stored - Discord's id repeats across tiers that differ by picture */
    key: string;
    /** Discord's id, so a badge somebody really has is known for the same one */
    id: string;
    /** the name Discord serves the picture under */
    icon: string;
    /** what it is called while picking */
    label: string;
    group: Group;
    /** one at a time within this family, inside a group that otherwise stacks */
    family?: string;
    /** what the profile says on hover, when it is the same for everybody */
    description?: string;
    link?: string;
    /** for the ones that say "since": how long it has supposedly been held */
    months?: number;
    /** how "since" is written: Nitro tenure uses the short form, plain Nitro and boosting the long */
    since?: "short" | "long" | "boost";
}

const PREMIUM = "https://discord.com/settings/premium";
const BOOSTING = "https://discord.com/settings/guild-boosting";

const tiers = (id: string, label: string, icons: string[], description = label): Badge[] =>
    icons.map((icon, i) => ({ key: `${id}:${icon}`, id, icon, label: `${label} ${i + 1}`, group: "stats" as Group, family: id, description }));

export const BADGES: Badge[] = [
    { key: "staff", id: "staff", icon: "5e74e9b61934fc1f67c65515d1f7e60d", label: "Discord Staff", group: "staff", description: "Discord Staff", link: "https://discord.com/company" },
    { key: "partner", id: "partner", icon: "3f9748e53446a137a052f3454e2de41e", label: "Partnered Server Owner", group: "staff", description: "Partnered Server Owner", link: "https://discord.com/partners" },
    { key: "certified_moderator", id: "certified_moderator", icon: "fee1624003e2fee35cb398e125dc479b", label: "Moderator Programs Alumni", group: "staff", description: "Moderator Programs Alumni", link: "https://discord.com/safety" },
    { key: "hypesquad", id: "hypesquad", icon: "bf01d1073931f921909045f3a39fd264", label: "HypeSquad Events", group: "staff", description: "HypeSquad Events", link: "https://support.discord.com/hc/en-us/articles/360035962891-Profile-Badges-101#h_01GM67K5EJ16ZHYZQ5MPRW3JT3" },
    { key: "bug_hunter_level_1", id: "bug_hunter_level_1", icon: "2717692c7dca7289b35297368a940dd0", label: "Bug Hunter", group: "staff", family: "bug_hunter", description: "Discord Bug Hunter", link: "https://support.discord.com/hc/en-us/articles/360046057772-Discord-Bugs" },
    { key: "bug_hunter_level_2", id: "bug_hunter_level_2", icon: "848f79194d4be5ff5f81505cbd0ce1e6", label: "Bug Hunter Gold", group: "staff", family: "bug_hunter", description: "Discord Bug Hunter", link: "https://support.discord.com/hc/en-us/articles/360046057772-Discord-Bugs" },
    { key: "verified_developer", id: "verified_developer", icon: "6df5892e0f35b051f8b61eace34f4967", label: "Early Verified Bot Developer", group: "staff", description: "Early Verified Bot Developer" },
    { key: "active_developer", id: "active_developer", icon: "6bdc42827a38498929a4920da12695d9", label: "Active Developer", group: "staff", description: "Active Developer", link: "https://support-dev.discord.com/hc/en-us/articles/10113997751447?ref=badge" },
    { key: "early_supporter", id: "early_supporter", icon: "7060786766c9c840eb3019e725d2b358", label: "Early Supporter", group: "staff", description: "Early Supporter", link: PREMIUM },

    { key: "premium", id: "premium", icon: "7294f50817c5fe9fd98631d230ac2e5d", label: "Nitro", group: "nitro", link: PREMIUM, months: 1, since: "long" },
    { key: "premium_tenure_1_month_v2", id: "premium_tenure_1_month_v2", icon: "4f33c4a9c64ce221936bd256c356f91f", label: "Nitro Bronze (1 month)", group: "nitro", link: PREMIUM, months: 1, since: "short" },
    { key: "premium_tenure_3_month_v2", id: "premium_tenure_3_month_v2", icon: "4514fab914bdbfb4ad2fa23df76121a6", label: "Nitro Silver (3 months)", group: "nitro", link: PREMIUM, months: 3, since: "short" },
    { key: "premium_tenure_6_month_v2", id: "premium_tenure_6_month_v2", icon: "2895086c18d5531d499862e41d1155a6", label: "Nitro Gold (6 months)", group: "nitro", link: PREMIUM, months: 6, since: "short" },
    { key: "premium_tenure_12_month_v2", id: "premium_tenure_12_month_v2", icon: "0334688279c8359120922938dcb1d6f8", label: "Nitro Platinum (1 year)", group: "nitro", link: PREMIUM, months: 12, since: "short" },
    { key: "premium_tenure_24_month_v2", id: "premium_tenure_24_month_v2", icon: "0d61871f72bb9a33a7ae568c1fb4f20a", label: "Nitro Diamond (2 years)", group: "nitro", link: PREMIUM, months: 24, since: "short" },
    { key: "premium_tenure_36_month_v2", id: "premium_tenure_36_month_v2", icon: "11e2d339068b55d3a506cff34d3780f3", label: "Nitro Emerald (3 years)", group: "nitro", link: PREMIUM, months: 36, since: "short" },
    { key: "premium_tenure_60_month_v2", id: "premium_tenure_60_month_v2", icon: "cd5e2cfd9d7f27a8cdcd3e8a8d5dc9f4", label: "Nitro Ruby (5 years)", group: "nitro", link: PREMIUM, months: 60, since: "short" },
    { key: "premium_tenure_72_month_v2", id: "premium_tenure_72_month_v2", icon: "5b154df19c53dce2af92c9b61e6be5e2", label: "Nitro Opal (6 years)", group: "nitro", link: PREMIUM, months: 72, since: "short" },

    { key: "guild_booster_lvl1", id: "guild_booster_lvl1", icon: "51040c70d4f20a921ad6674ff86fc95c", label: "1 month", group: "boost", link: BOOSTING, months: 1, since: "boost" },
    { key: "guild_booster_lvl2", id: "guild_booster_lvl2", icon: "0e4080d1d333bc7ad29ef6528b6f2fb7", label: "2 months", group: "boost", link: BOOSTING, months: 2, since: "boost" },
    { key: "guild_booster_lvl3", id: "guild_booster_lvl3", icon: "72bed924410c304dbe3d00a6e593ff59", label: "3 months", group: "boost", link: BOOSTING, months: 3, since: "boost" },
    { key: "guild_booster_lvl4", id: "guild_booster_lvl4", icon: "df199d2050d3ed4ebf84d64ae83989f8", label: "6 months", group: "boost", link: BOOSTING, months: 6, since: "boost" },
    { key: "guild_booster_lvl5", id: "guild_booster_lvl5", icon: "996b3e870e8a22ce519b3a50e6bdd52f", label: "9 months", group: "boost", link: BOOSTING, months: 9, since: "boost" },
    { key: "guild_booster_lvl6", id: "guild_booster_lvl6", icon: "991c9f39ee33d7537d9f408c3e53141e", label: "12 months", group: "boost", link: BOOSTING, months: 12, since: "boost" },
    { key: "guild_booster_lvl7", id: "guild_booster_lvl7", icon: "cb3ae83c15e970e8f3d410bc62cb8b99", label: "15 months", group: "boost", link: BOOSTING, months: 15, since: "boost" },
    { key: "guild_booster_lvl8", id: "guild_booster_lvl8", icon: "7142225d31238f6387d9f09efaa02759", label: "18 months", group: "boost", link: BOOSTING, months: 18, since: "boost" },
    { key: "guild_booster_lvl9", id: "guild_booster_lvl9", icon: "ec92202290b48d0879b7413d2dde3bab", label: "24 months", group: "boost", link: BOOSTING, months: 24, since: "boost" },

    // The newer ones, earned by playing and streaming. Each comes in tiers that share an id and
    // differ only by picture; Discord does not say which tier is which, so they are numbered.
    ...tiers("streaming", "Streaming", ["046ddc05551d3b91d269460956d81188", "0b06966b175dc72c9b5eaea61003d530", "dac8be3f227ad66655e402814c366f64", "852c0e2f5d2d73e75b1eabb286417acf", "30670da18925260946379b7fe10def26", "f5e5b1a2820da1981084e4b719be72e7"]),
    ...tiers("account_age", "Account Age", ["bce1cb27ae581e866dc86f9f16e4046e", "c2ff7d8d6285305f969be81c3c92dd78", "813d80b654901205a69da56b5e5ff2e4", "b5716cca77a6e24b20eabe4d008479a9", "d7648c523cf6322e650b4f7ea718b8a3", "c478f85138cb30158637442110ab33b7"]),
    ...tiers("game_time", "Game Time", ["054c89b927c8c8907ab652fb458fb97f", "db259eb9f31a389ff0aff009b704babb", "feb9939317a21090e6dcdf410e3c3000", "269355d438e62bd1f45e127b34459caf", "452bbe19d924544ab70cfd8f3cc0e446", "208e1bb66e311286cae364bc6f19277a", "7c57adf7939dd1132e02cb273ac07b96"]),
    ...tiers("game_variety", "Game Variety", ["f2e95dea497883ba979fbb7262df4fb1", "1043a575492403efe4ec42efa451050c", "5816a47693a62f0529e53ed2fbc7f41c", "5df9e6c933a4255e2edd6030719da8c6", "ce9ae4ae128db559173a0a29c49becd2", "2ec2aa257c6fa9adb68c79b7b98b39a2"]),

    { key: "gifting_patron", id: "gifting", icon: "025035e4f4c124c44d29b369936c6843", label: "Gifting Patron", group: "gifting", description: "Gifting Patron" },
    { key: "gifting_champion", id: "gifting", icon: "e5a4b37244fe7da010086db4d4364dc7", label: "Gifting Champion", group: "gifting", description: "Gifting Champion" },
    { key: "gifting_hero", id: "gifting", icon: "12199b534e062d67eb419543804a5889", label: "Gifting Hero", group: "gifting", description: "Gifting Hero" },
    { key: "gifting_luminary", id: "gifting", icon: "beddfe5a71fba596694521e96130fac6", label: "Gifting Luminary", group: "gifting", description: "Gifting Luminary" },
    { key: "gifting_legend", id: "gifting", icon: "57c6737293fa3af054e5d50f8dcf9db2", label: "Gifting Legend", group: "gifting", description: "Gifting Legend" },

    { key: "hypesquad_house_1", id: "hypesquad_house_1", icon: "8a88d63823d8a71cd5e390baa45efa02", label: "Bravery", group: "house", description: "HypeSquad Bravery", link: "https://discord.com/settings/hypesquad-online" },
    { key: "hypesquad_house_2", id: "hypesquad_house_2", icon: "011940fd013da3f7fb926e4a1cd2e618", label: "Brilliance", group: "house", description: "HypeSquad Brilliance", link: "https://discord.com/settings/hypesquad-online" },
    { key: "hypesquad_house_3", id: "hypesquad_house_3", icon: "3aa41de486fa12454c3761e8e223442e", label: "Balance", group: "house", description: "HypeSquad Balance", link: "https://discord.com/settings/hypesquad-online" },

    { key: "legacy_username", id: "legacy_username", icon: "6de6d34650760ba5551a79732e98ed60", label: "Legacy Username", group: "other", description: "Originally known as an older name" },
    { key: "quest_completed", id: "quest_completed", icon: "7d9ae358c8c5e118768335dbe68b4fb8", label: "Completed a Quest", group: "other", description: "Completed a Quest", link: "https://discord.com/discovery/quests" },
    { key: "orb_profile_badge", id: "orb_profile_badge", icon: "83d8a1eb09a8d64e59233eec5d4d5c2d", label: "Orb", group: "other", description: "Collected the Orb Profile Badge" },
    { key: "april_fools_2026", id: "april_fools_2026", icon: "ca105ad9cfc8580c765101d17bbb2323", label: "Level 10 Reached", group: "other", description: "Level 10 Reached" },
    { key: "bot_commands", id: "bot_commands", icon: "6f9e37f9029ff57aef81db857890005e", label: "Supports Commands", group: "other", description: "Supports Commands", link: "https://discord.com/blog/welcome-to-the-new-era-of-discord-apps?ref=badge" },
    { key: "automod", id: "automod", icon: "f2459b691ac7453ed6039bbcfaccbfcd", label: "Uses AutoMod", group: "other", description: "Uses AutoMod" },
];

export const GROUPS: { id: Group; title: string; note: string; }[] = [
    { id: "staff", title: "Discord", note: "As many as you like. Bug Hunter is one tier at a time." },
    { id: "nitro", title: "Nitro", note: "One at a time: how long you have supposedly had Nitro." },
    { id: "boost", title: "Server boosting", note: "One at a time: how long you have supposedly boosted." },
    { id: "stats", title: "Activity", note: "One tier of each." },
    { id: "gifting", title: "Gifting", note: "One at a time." },
    { id: "house", title: "HypeSquad house", note: "One house only." },
    { id: "other", title: "Other", note: "As many as you like." },
];

/** Groups where picking one replaces the last */
const EXCLUSIVE: Group[] = ["nitro", "boost", "gifting", "house"];

export const badgeCalled = (key: string) => BADGES.find(badge => badge.key === key);

/** Our key for a badge as a profile carries it */
export function keyOfReal(real: { id: string; icon: string; }): string | null {
    const found = BADGES.find(badge => badge.id === real.id && badge.icon === real.icon)
        ?? BADGES.find(badge => badge.id === real.id && !badge.family && badge.group !== "gifting");
    return found?.key ?? null;
}

/** Add one, taking out whatever it cannot be worn with */
export function withBadge(chosen: string[], key: string): string[] {
    const badge = badgeCalled(key);
    if (!badge) return chosen;

    const clashes = (other: Badge) =>
        (EXCLUSIVE.includes(badge.group) && other.group === badge.group)
        || (!!badge.family && other.family === badge.family);

    return [...chosen.filter(k => {
        const other = badgeCalled(k);
        return !other || !clashes(other);
    }), key];
}

// ---------------------------------------------------------------- the order a card draws them in

/**
 * Read off nineteen real profiles: Nitro first, then boosting, then the activity badges, then
 * gifting and the HypeSquad house, then the older one-off badges. The staff kind were on nobody
 * within reach, so they keep the place Discord has always given them, at the front.
 */
const ORDER: string[] = [
    "staff", "partner", "certified_moderator", "hypesquad", "bug_hunter_level_1", "bug_hunter_level_2",
    "premium", ...BADGES.filter(b => b.id.startsWith("premium_tenure")).map(b => b.id),
    ...BADGES.filter(b => b.group === "boost").map(b => b.id),
    "streaming", "account_age", "game_time", "game_variety",
    "gifting", "hypesquad_house_1", "hypesquad_house_2", "hypesquad_house_3",
    "early_supporter", "verified_developer", "active_developer",
    "legacy_username", "quest_completed", "orb_profile_badge", "april_fools_2026", "bot_commands", "automod",
];

/** The activity badges sit in whatever order each person earned them, so they share one place */
const ACTIVITY = ["streaming", "account_age", "game_time", "game_variety"];

const rank = (id: string) => {
    const at = ORDER.indexOf(ACTIVITY.includes(id) ? "streaming" : id);
    return at === -1 ? ORDER.length : at;
};

// ---------------------------------------------------------------- what a profile carries

const SHORT = new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric", year: "2-digit" });
const LONG = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/** A day this many months ago, which is what a badge that says "since" is about */
const monthsAgo = (months: number) => {
    const day = new Date();
    day.setMonth(day.getMonth() - months);
    return day;
};

/** The badge as a profile carries it: Discord's id, its picture, and what it says on hover */
export function asProfileBadge(badge: Badge) {
    let description = badge.description ?? badge.label;

    if (badge.months && badge.since) {
        const day = monthsAgo(badge.months);
        description = badge.since === "boost"
            ? `Server boosting since ${LONG.format(day)}`
            : `Subscriber since ${(badge.since === "short" ? SHORT : LONG).format(day)}`;
    }

    return { id: badge.id, icon: badge.icon, description, ...(badge.link ? { link: badge.link } : {}) };
}

/**
 * The badges a profile should show: the chosen ones, with the real ones kept as they really
 * read, in the order a card draws them.
 *
 * A real badge somebody still has keeps its own text - their real "Subscriber since" date
 * rather than one worked back from a length. One this does not know about (a bot's, a new one)
 * is never taken away, since it could not be offered back.
 */
export function badgesFor(real: any[], chosen: string[]): any[] {
    const keep = new Set(chosen);
    const out: any[] = [];
    const used = new Set<string>();

    for (const badge of real ?? []) {
        const key = keyOfReal(badge);
        if (key === null) {
            out.push(badge);
            continue;
        }
        if (keep.has(key)) {
            out.push(badge);
            used.add(key);
        }
    }

    for (const key of chosen) {
        if (used.has(key)) continue;
        const badge = badgeCalled(key);
        if (badge) out.push(asProfileBadge(badge));
    }

    // Stable, so two badges Discord has no opinion about keep the order they came in
    return out
        .map((badge, i) => ({ badge, i }))
        .sort((a, b) => rank(a.badge.id) - rank(b.badge.id) || a.i - b.i)
        .map(({ badge }) => badge);
}

/** Our keys for what somebody really wears */
export const realKeys = (real: any[]) => (real ?? []).map(keyOfReal).filter((key): key is string => !!key);
