/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ModalAction, RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, showToast, TextArea, UserStore, useState } from "@webpack/common";

import { Badge, BADGES, badgesFor, GROUPS, realKeys, withBadge } from "./badges";
import { BookmarkIcon, CheckIcon, CloseIcon, CopyIcon, ImageIcon, MasksIcon, PersonIcon, StarIcon, TrashIcon, UndoIcon } from "./icons";
import { realProfile, realUser, wholeLookOf } from "./rewrite";
import {
    Connection, deletePreset, Look, lookFor, NOTHING, presetCalled, presetNames, revert, savePreset, setLook, summary, tidyName,
} from "./store";
import { cl, IconButton } from "./ui";

const badgeIcon = (icon: string) => `https://cdn.discordapp.com/badge-icons/${icon}.png`;
const isAddress = (value?: string) => !!value && /^https?:\/\//.test(value);
const hex = (n?: number) => "#" + ((n ?? 0) & 0xffffff).toString(16).padStart(6, "0");
const fromHex = (h: string) => parseInt(h.replace("#", ""), 16);

const NITRO = [
    { value: 0, label: "None" },
    { value: 1, label: "Classic" },
    { value: 3, label: "Basic" },
    { value: 2, label: "Nitro" },
];

/** The services a connection can be for, as Discord names them */
const SERVICES = [
    "spotify", "steam", "xbox", "playstation", "battlenet", "epicgames", "riotgames", "leagueoflegends", "roblox",
    "twitch", "youtube", "github", "reddit", "twitter", "bluesky", "tiktok", "instagram", "crunchyroll", "domain", "paypal", "ebay",
];

/** What somebody really looks like, as the preview needs it */
function realOf(userId: string) {
    const user = realUser(userId);
    const profile = realProfile(userId);
    const avatar = user?.avatar
        ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=256`
        : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(userId) >> 22n) % 6}.png`;
    const bannerHash = profile?.banner ?? user?.banner;

    return {
        user, profile, avatar,
        banner: bannerHash ? `https://cdn.discordapp.com/banners/${userId}/${bannerHash}.${bannerHash.startsWith("a_") ? "gif" : "png"}?size=600` : null,
        badges: realKeys(profile?.badges ?? []),
    };
}

// ---------------------------------------------------------------- the preview

function Preview({ userId, look }: { userId: string; look: Look; }) {
    const real = realOf(userId);
    const name = look.globalName ?? real.user?.globalName ?? real.user?.username ?? "Unknown";
    const username = look.username ?? real.user?.username ?? "";
    const avatar = look.avatar === NOTHING
        ? `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(userId) >> 22n) % 6}.png`
        : isAddress(look.avatar) ? look.avatar : real.avatar;
    const banner = look.banner === NOTHING ? null : isAddress(look.banner) ? look.banner : real.banner;
    const colours = look.themeColors ?? real.profile?.themeColors;
    const badges = badgesFor(real.profile?.badges ?? [], look.badges ?? real.badges);
    const bio = look.bio ?? real.profile?.bio ?? "";
    const pronouns = look.pronouns ?? real.profile?.pronouns ?? "";
    const since = new Date(look.memberSince ?? real.user?.createdAt?.getTime?.() ?? Date.now());
    const connections: Connection[] = look.connections ?? real.profile?.connectedAccounts ?? [];

    const gradient = colours && colours.length === 2
        ? `linear-gradient(180deg, ${hex(colours[0])}, ${hex(colours[1])})`
        : undefined;

    return (
        <div className={cl("preview")} style={gradient ? { background: gradient } : undefined}>
            <div className={cl("preview-banner")} style={banner ? { backgroundImage: `url("${banner}")` } : { background: colours ? hex(colours[0]) : undefined }} />
            <img className={cl("preview-avatar")} src={avatar} alt="" />
            <div className={cl("preview-body")}>
                {!!badges.length && (
                    <div className={cl("preview-badges")}>
                        {badges.map((badge, i) => <img key={badge.id + badge.icon + i} src={badgeIcon(badge.icon)} title={badge.description} alt={badge.description} />)}
                    </div>
                )}
                <div className={cl("preview-name")}>{name}</div>
                <div className={cl("preview-username")}>
                    {username}{pronouns && <span> · {pronouns}</span>}
                </div>
                {bio && <div className={cl("preview-bio")}>{bio}</div>}
                <div className={cl("preview-label")}>Member since</div>
                <div className={cl("preview-text")}>{since.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</div>
                {!!connections.length && (
                    <>
                        <div className={cl("preview-label")}>Connections</div>
                        <div className={cl("preview-connections")}>
                            {connections.map(one => <span key={one.type + one.id} className={cl("preview-connection")}>{one.type} · {one.name}</span>)}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------- fields

function Field({ label, hint, children }: { label: string; hint?: string; children: any; }) {
    return (
        <label className={cl("f")}>
            <span className={cl("f-label")}>{label}</span>
            {children}
            {hint && <span className={cl("f-hint")}>{hint}</span>}
        </label>
    );
}

/** A box that is empty while it says nothing, with what they really have greyed out behind it */
function Text({ value, real, onChange, multiline }: { value?: string; real?: string | null; onChange(next?: string): void; multiline?: boolean; }) {
    const common = {
        value: value ?? "",
        placeholder: real || "",
        onChange: (next: string) => onChange(next === "" ? undefined : next),
    };

    return multiline
        ? <TextArea {...common} rows={4} />
        : <input className={cl("input")} type="text" {...common} onChange={e => common.onChange(e.currentTarget.value)} />;
}

function Picture({ label, value, real, onChange }: { label: string; value?: string; real: string | null; onChange(next?: string): void; }) {
    const shown = value === NOTHING ? null : isAddress(value) ? value! : real;

    return (
        <Field label={label} hint="Any picture address: a png, a gif, an attachment link. Empty keeps theirs.">
            <div className={cl("picture")}>
                <div className={cl("picture-thumb")} style={shown ? { backgroundImage: `url("${shown}")` } : undefined}>{!shown && "None"}</div>
                <input
                    className={cl("input")}
                    type="text"
                    value={isAddress(value) ? value : ""}
                    placeholder={value === NOTHING ? "None" : "https://..."}
                    onChange={e => onChange(e.currentTarget.value.trim() || undefined)}
                />
                <IconButton icon={value === NOTHING ? UndoIcon : CloseIcon} variant="secondary" onClick={() => onChange(value === NOTHING ? undefined : NOTHING)}>
                    {value === NOTHING ? "Theirs" : "None"}
                </IconButton>
            </div>
        </Field>
    );
}

// ---------------------------------------------------------------- tabs

type Tab = "profile" | "pictures" | "badges" | "presets";

const TABS: { id: Tab; label: string; icon: any; }[] = [
    { id: "profile", label: "Profile", icon: PersonIcon },
    { id: "pictures", label: "Pictures & colours", icon: ImageIcon },
    { id: "badges", label: "Badges", icon: StarIcon },
    { id: "presets", label: "Presets", icon: BookmarkIcon },
];

function ProfileTab({ userId, look, set }: { userId: string; look: Look; set(change: Partial<Look> | ((prev: Look) => Partial<Look>)): void; }) {
    const real = realOf(userId);
    const connections: Connection[] = look.connections ?? real.profile?.connectedAccounts ?? [];
    const [service, setService] = useState("spotify");
    const [account, setAccount] = useState("");
    const realSince = real.user?.createdAt?.getTime?.() ?? Date.now();
    const since = new Date(look.memberSince ?? realSince);

    return (
        <div className={cl("tab")}>
            <div className={cl("pair")}>
                <Field label="Display name"><Text value={look.globalName} real={real.user?.globalName ?? real.user?.username} onChange={v => set({ globalName: v })} /></Field>
                <Field label="Username"><Text value={look.username} real={real.user?.username} onChange={v => set({ username: v })} /></Field>
            </div>
            <Field label="Pronouns"><Text value={look.pronouns} real={real.profile?.pronouns} onChange={v => set({ pronouns: v })} /></Field>
            <Field label="About me"><Text value={look.bio} real={real.profile?.bio} onChange={v => set({ bio: v })} multiline /></Field>

            <Field label="Member since" hint={look.memberSince ? undefined : "Their real date"}>
                <div className={cl("row-inline")}>
                    <input
                        className={cl("input")}
                        type="date"
                        value={since.toISOString().slice(0, 10)}
                        onChange={e => set({ memberSince: e.currentTarget.value ? new Date(e.currentTarget.value + "T12:00:00").getTime() : undefined })}
                    />
                    {look.memberSince && <IconButton icon={UndoIcon} variant="secondary" onClick={() => set({ memberSince: undefined })}>Theirs</IconButton>}
                </div>
            </Field>

            <Field label={`Connections (${connections.length})`}>
                <div className={cl("list")}>
                    {connections.map((one, i) => (
                        <div key={one.type + one.id + i} className={cl("list-row")}>
                            <span className={cl("tag")}>{one.type}</span>
                            <span className={cl("list-name")}>{one.name}</span>
                            <button className={cl("x")} aria-label={`Remove ${one.name}`} onClick={() => set({ connections: connections.filter((_, j) => j !== i) })}>
                                <CloseIcon height={14} width={14} />
                            </button>
                        </div>
                    ))}
                    <div className={cl("list-row", "list-add")}>
                        <select className={cl("input", "select")} value={service} onChange={e => setService(e.currentTarget.value)}>
                            {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <input className={cl("input")} type="text" placeholder="account name" value={account} onChange={e => setAccount(e.currentTarget.value)} />
                        <IconButton
                            icon={CheckIcon}
                            variant="secondary"
                            disabled={!account.trim()}
                            onClick={() => {
                                set({ connections: [...connections, { type: service, id: account.trim(), name: account.trim(), verified: true }] });
                                setAccount("");
                            }}
                        >
                            Add
                        </IconButton>
                    </div>
                    {look.connections && (
                        <button className={cl("link")} onClick={() => set({ connections: undefined })}>Use their real connections</button>
                    )}
                </div>
            </Field>
        </div>
    );
}

function PicturesTab({ userId, look, set }: { userId: string; look: Look; set(change: Partial<Look> | ((prev: Look) => Partial<Look>)): void; }) {
    const real = realOf(userId);
    const colours = look.themeColors ?? real.profile?.themeColors;
    const nitro = look.premiumType ?? real.user?.premiumType ?? 0;

    const extras: { key: keyof Look; label: string; }[] = [
        { key: "decoration", label: "Avatar decoration" },
        { key: "nameplate", label: "Nameplate" },
        { key: "profileEffect", label: "Profile effect" },
        { key: "profileFrame", label: "Profile frame" },
    ];

    return (
        <div className={cl("tab")}>
            <Picture label="Avatar" value={look.avatar} real={real.avatar} onChange={v => set({ avatar: v })} />
            <Picture label="Banner" value={look.banner} real={real.banner} onChange={v => set({ banner: v })} />

            <Field label="Profile colours" hint={look.themeColors ? undefined : "Their real colours, or none"}>
                <div className={cl("row-inline")}>
                    {[0, 1].map(i => (
                        <input
                            key={i}
                            className={cl("colour")}
                            type="color"
                            value={hex(colours?.[i] ?? 0x5865f2)}
                            onChange={e => {
                                const next: [number, number] = [colours?.[0] ?? 0x5865f2, colours?.[1] ?? 0x5865f2];
                                next[i] = fromHex(e.currentTarget.value);
                                set({ themeColors: next });
                            }}
                        />
                    ))}
                    {look.themeColors && <IconButton icon={UndoIcon} variant="secondary" onClick={() => set({ themeColors: undefined })}>Theirs</IconButton>}
                </div>
            </Field>

            <Field label="Nitro">
                <div className={cl("segments")}>
                    {NITRO.map(option => (
                        <button
                            key={option.value}
                            className={cl("segment", nitro === option.value ? "segment-on" : "")}
                            onClick={() => set({ premiumType: option.value })}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </Field>

            <Field label="Collectibles" hint="Copied whole when you steal a profile or wear a preset.">
                <div className={cl("list")}>
                    {extras.map(({ key, label }) => {
                        const value = look[key] as string | undefined;
                        return (
                            <div key={key} className={cl("list-row")}>
                                <span className={cl("list-name")}>{label}</span>
                                <span className={cl("muted")}>{value === NOTHING ? "None" : value ? "Chosen" : "Theirs"}</span>
                                {value && (
                                    <button className={cl("link")} onClick={() => set({ [key]: undefined } as any)}>Use theirs</button>
                                )}
                                {value !== NOTHING && (
                                    <button className={cl("link")} onClick={() => set({ [key]: NOTHING } as any)}>Remove</button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </Field>
        </div>
    );
}

function BadgeTile({ badge, on, toggle }: { badge: Badge; on: boolean; toggle(): void; }) {
    return (
        <button className={cl("badge", on ? "badge-on" : "")} onClick={toggle} title={badge.description ?? badge.label} aria-pressed={on}>
            <img src={badgeIcon(badge.icon)} alt="" />
            <span>{badge.label}</span>
        </button>
    );
}

function BadgesTab({ userId, look, set }: { userId: string; look: Look; set(change: Partial<Look> | ((prev: Look) => Partial<Look>)): void; }) {
    const real = realOf(userId);
    const chosen = look.badges ?? real.badges;

    const toggle = (key: string) => set(prev => {
        const now = prev.badges ?? real.badges;
        return { badges: now.includes(key) ? now.filter(k => k !== key) : withBadge(now, key) };
    });

    return (
        <div className={cl("tab")}>
            <div className={cl("row-inline", "spread")}>
                <span className={cl("muted")}>{chosen.length} chosen. They show in the order Discord draws them.</span>
                <div className={cl("row-inline")}>
                    <IconButton icon={CloseIcon} variant="secondary" onClick={() => set({ badges: [] })}>None</IconButton>
                    {look.badges && <IconButton icon={UndoIcon} variant="secondary" onClick={() => set({ badges: undefined })}>Theirs</IconButton>}
                </div>
            </div>
            {GROUPS.map(group => (
                <div key={group.id} className={cl("badge-group")}>
                    <div className={cl("group-head")}>
                        <span className={cl("f-label")}>{group.title}</span>
                        <span className={cl("f-hint")}>{group.note}</span>
                    </div>
                    <div className={cl("badges")}>
                        {BADGES.filter(badge => badge.group === group.id).map(badge => (
                            <BadgeTile key={badge.key} badge={badge} on={chosen.includes(badge.key)} toggle={() => toggle(badge.key)} />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function PresetsTab({ userId, look, replace }: { userId: string; look: Look; replace(next: Look): void; }) {
    const [name, setName] = useState("");
    const [, redraw] = useState(0);
    const me = UserStore.getCurrentUser()?.id;
    const who = realUser(userId);
    const theirName = who?.globalName ?? who?.username ?? "them";

    const keep = (what: Look, fallback: string) => {
        const called = tidyName(name) || fallback;
        const result = savePreset(called, what);
        if (result === "empty") showToast({ text: "Nothing to save yet", variant: "critical" });
        else showToast({ text: `Saved ${called}`, variant: "success" });
        setName("");
        redraw(n => n + 1);
    };

    return (
        <div className={cl("tab")}>
            <Field label="Name" hint="Optional when stealing: it is named after them.">
                <input className={cl("input")} type="text" value={name} placeholder="what to call this look" onChange={e => setName(e.currentTarget.value)} />
            </Field>
            <div className={cl("cards")}>
                <button className={cl("action")} onClick={() => {
                    const whole = wholeLookOf(userId);
                    if (whole) keep(whole, theirName);
                }}>
                    <MasksIcon height={22} width={22} />
                    <span className={cl("action-title")}>Steal {theirName}</span>
                    <span className={cl("action-text")}>Everything: names, bio, date, badges, pictures, collectibles, colours and connections.</span>
                </button>
                <button className={cl("action")} onClick={() => keep(look, theirName + " (edited)")}>
                    <CopyIcon height={22} width={22} />
                    <span className={cl("action-title")}>Save these changes</span>
                    <span className={cl("action-text")}>Only what you have changed here.</span>
                </button>
            </div>

            <div className={cl("f-label")}>Saved ({presetNames().length})</div>
            {!presetNames().length && <div className={cl("muted")}>Nothing saved yet.</div>}
            <div className={cl("list")}>
                {presetNames().map(called => (
                    <div key={called} className={cl("list-row")}>
                        <div className={cl("list-text")}>
                            <span className={cl("list-name")}>{called}</span>
                            <span className={cl("muted")}>{summary(presetCalled(called))}</span>
                        </div>
                        <IconButton icon={CheckIcon} variant="secondary" onClick={() => replace({ ...presetCalled(called)! })}>Use here</IconButton>
                        {me && me !== userId && (
                            <IconButton icon={PersonIcon} variant="secondary" onClick={() => {
                                setLook(me, presetCalled(called)!);
                                showToast({ text: `You now look like ${called}`, variant: "success" });
                            }}>Wear it</IconButton>
                        )}
                        <button className={cl("x")} aria-label={`Delete ${called}`} onClick={() => { deletePreset(called); redraw(n => n + 1); }}>
                            <TrashIcon height={16} width={16} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------- the window

function InspectModal({ rootProps, userId, startOn }: { rootProps: RenderModalProps; userId: string; startOn?: Tab; }) {
    const [look, setDraft] = useState<Look>(() => ({ ...(lookFor(userId) ?? {}) }));
    const [tab, setTab] = useState<Tab>(startOn ?? "profile");
    const who = realUser(userId);

    // From the look as it is at that moment rather than as it was drawn: two quick clicks
    // otherwise both start from the same list, and the second throws the first away.
    const set = (change: Partial<Look> | ((prev: Look) => Partial<Look>)) => setDraft(prev => {
        const patch = typeof change === "function" ? change(prev) : change;
        const next = { ...prev, ...patch };
        for (const key of Object.keys(patch) as (keyof Look)[]) if (patch[key] === undefined) delete next[key];
        return next;
    });

    const actions: ModalAction[] = [
        {
            text: "Save",
            variant: "primary",
            onClick: () => {
                setLook(userId, look);
                showToast({ text: "Saved. Only you see this", variant: "success" });
                rootProps.onClose();
            }
        },
        {
            text: "Show their real profile",
            variant: "secondary",
            onClick: () => {
                revert(userId);
                showToast({ text: "Back to their real profile", variant: "default" });
                rootProps.onClose();
            }
        },
    ];

    return (
        <Modal {...rootProps} size="xl" title={`Inspect ${who?.globalName ?? who?.username ?? "profile"}`} subtitle="Only you see any of this. Nothing is sent to Discord." actions={actions}>
            <div className={cl("layout")}>
                <aside className={cl("aside")}>
                    <Preview userId={userId} look={look} />
                    {!realProfile(userId) && <div className={cl("muted")}>Their full profile has not loaded. Open it once to fill in bio, badges and connections.</div>}
                </aside>
                <div className={cl("main")}>
                    <div className={cl("tabs")} role="tablist">
                        {TABS.map(({ id, label, icon: Icon }) => (
                            <button key={id} role="tab" aria-selected={tab === id} className={cl("tab-button", tab === id ? "tab-on" : "")} onClick={() => setTab(id)}>
                                <Icon height={16} width={16} />
                                {label}
                            </button>
                        ))}
                    </div>
                    {tab === "profile" && <ProfileTab userId={userId} look={look} set={set} />}
                    {tab === "pictures" && <PicturesTab userId={userId} look={look} set={set} />}
                    {tab === "badges" && <BadgesTab userId={userId} look={look} set={set} />}
                    {tab === "presets" && <PresetsTab userId={userId} look={look} replace={next => setDraft(next)} />}
                </div>
            </div>
        </Modal>
    );
}

export const openInspect = (userId: string, startOn?: Tab) =>
    openModal(rootProps => <InspectModal rootProps={rootProps} userId={userId} startOn={startOn} />);
