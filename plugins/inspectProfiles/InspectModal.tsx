/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ModalAction, RenderModalProps } from "@vencord/discord-types";
import { findByCodeLazy, findByPropsLazy } from "@webpack";
import { Modal, openModal, SearchableSelect, showToast, TextArea, TextInput, useEffect, UserStore, useState } from "@webpack/common";

import { Badge, BADGES, badgesFor, GROUPS, realKeys, withBadge } from "./badges";
import { BookmarkIcon, CheckIcon, CloseIcon, CopyIcon, ImageIcon, MasksIcon, PersonIcon, StarIcon, TrashIcon } from "./icons";
import { realProfile, realUser, wholeLookOf } from "./rewrite";
import {
    Connection, deletePreset, Look, lookFor, NOTHING, presetCalled, presetNames, revert, savePreset, setLook, summary, tidyName,
} from "./store";
import { cl, IconButton } from "./ui";

const fetchProfile = findByCodeLazy("USER_PROFILE_FETCH_START");

/** Discord's own list of connection services: their names and their logos */
const Platforms: {
    get(type: string): { type: string; name: string; icon?: { lightSVG?: string; darkSVG?: string; }; } | undefined;
    filter(test: (p: any) => boolean): any[];
} = findByPropsLazy("isSupported", "getByUrl");

const badgeIcon = (icon: string) => `https://cdn.discordapp.com/badge-icons/${icon}.png`;
const isAddress = (value?: string) => !!value && /^https?:\/\//.test(value);
const hex = (n?: number) => "#" + ((n ?? 0) & 0xffffff).toString(16).padStart(6, "0");
const fromHex = (h: string) => parseInt(h.replace("#", ""), 16);
const plainAvatar = (userId: string) => `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(userId) >> 22n) % 6}.png`;

/** Light or dark, so a logo is drawn in the version made for the background behind it */
const isLight = () => document.documentElement.classList.contains("theme-light");

function logoOf(type: string): string | undefined {
    try {
        const icon = Platforms.get(type)?.icon;
        return isLight() ? icon?.lightSVG : icon?.darkSVG;
    } catch {
        return undefined;
    }
}

const nameOf = (type: string) => {
    try {
        return Platforms.get(type)?.name ?? type;
    } catch {
        return type;
    }
};

/** Every service Discord can show, apart from its own test ones */
function services(): { value: string; label: string; }[] {
    try {
        return Platforms.filter(p => !/-stg$/.test(p.type))
            .map(p => ({ value: p.type, label: p.name }))
            .sort((a, b) => a.label.localeCompare(b.label));
    } catch {
        return [{ value: "spotify", label: "Spotify" }];
    }
}

const NITRO = [
    { value: 0, label: "None" },
    { value: 1, label: "Classic" },
    { value: 3, label: "Basic" },
    { value: 2, label: "Nitro" },
];

/** Markdown as it would read once drawn, which is all the preview needs */
const unmark = (text: string) => text.replace(/(\*\*|__|~~|\*|_)(.+?)\1/g, "$2");

/** What somebody really looks like, as the preview needs it */
function realOf(userId: string) {
    const user = realUser(userId);
    const profile = realProfile(userId);
    const avatar = user?.avatar
        ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=256`
        : plainAvatar(userId);
    const bannerHash = profile?.banner ?? user?.banner;

    return {
        user, profile, avatar,
        banner: bannerHash ? `https://cdn.discordapp.com/banners/${userId}/${bannerHash}.${bannerHash.startsWith("a_") ? "gif" : "png"}?size=600` : null,
        badges: realKeys(profile?.badges ?? []),
    };
}

// ---------------------------------------------------------------- the preview

/** A profile card drawn the way Discord draws its own, from whatever is in the editor */
function Preview({ userId, look }: { userId: string; look: Look; }) {
    const real = realOf(userId);
    const name = look.globalName ?? real.user?.globalName ?? real.user?.username ?? "Unknown";
    const username = look.username ?? real.user?.username ?? "";
    const avatar = look.avatar === NOTHING ? plainAvatar(userId) : isAddress(look.avatar) ? look.avatar : real.avatar;
    const banner = look.banner === NOTHING ? null : isAddress(look.banner) ? look.banner : real.banner;
    const colours: number[] | undefined = look.themeColors ?? real.profile?.themeColors;
    const themed = !!colours && colours.length === 2;
    const badges = badgesFor(real.profile?.badges ?? [], look.badges ?? real.badges);
    const bio = look.bio ?? real.profile?.bio ?? "";
    const pronouns = look.pronouns ?? real.profile?.pronouns ?? "";
    const since = new Date(look.memberSince ?? real.user?.createdAt?.getTime?.() ?? Date.now());
    const connections: Connection[] = look.connections ?? real.profile?.connectedAccounts ?? [];

    return (
        <div
            className={cl("pcard", themed ? "pcard-themed" : "")}
            style={themed ? { background: `linear-gradient(180deg, ${hex(colours![0])}, ${hex(colours![1])})` } : undefined}
        >
            <div
                className={cl("pcard-banner")}
                style={banner ? { backgroundImage: `url("${banner}")` } : themed ? { background: hex(colours![0]) } : undefined}
            />
            <div className={cl("pcard-head")}>
                <img className={cl("pcard-avatar")} src={avatar} alt="" />
                {!!badges.length && (
                    <div className={cl("pcard-badges")}>
                        {badges.map((badge, i) => (
                            <img key={badge.id + badge.icon + i} src={badgeIcon(badge.icon)} title={badge.description} alt={badge.description} />
                        ))}
                    </div>
                )}
            </div>
            <div className={cl("pcard-body")}>
                <div className={cl("pcard-name")}>{name}</div>
                <div className={cl("pcard-username")}>
                    {username}
                    {pronouns && <><span className={cl("pcard-dot")} />{pronouns}</>}
                </div>
                {bio && <div className={cl("pcard-bio")}>{unmark(bio)}</div>}

                <div className={cl("pcard-section")}>
                    <div className={cl("pcard-heading")}>Member Since</div>
                    <div className={cl("pcard-text")}>{since.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</div>
                </div>

                {!!connections.length && (
                    <div className={cl("pcard-section")}>
                        <div className={cl("pcard-heading")}>Connections</div>
                        <div className={cl("pcard-connections")}>
                            {connections.map(one => (
                                <div key={one.type + one.id} className={cl("pcard-connection")}>
                                    {logoOf(one.type) && <img src={logoOf(one.type)} alt="" />}
                                    <span>{one.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------- fields

function Field({ label, hint, children, action }: { label: string; hint?: string; children: any; action?: any; }) {
    return (
        <div className={cl("f")}>
            <div className={cl("f-head")}>
                <span className={cl("f-label")}>{label}</span>
                {action}
            </div>
            {children}
            {hint && <span className={cl("f-hint")}>{hint}</span>}
        </div>
    );
}

/** A box that stays empty while it says nothing, with the real value greyed out behind it */
function Text({ value, real, onChange, multiline }: { value?: string; real?: string | null; onChange(next?: string): void; multiline?: boolean; }) {
    const change = (next: string) => onChange(next === "" ? undefined : next);

    return multiline
        ? <TextArea value={value ?? ""} placeholder={real || ""} onChange={change} rows={4} />
        : <TextInput value={value ?? ""} placeholder={real || ""} onChange={change} />;
}

/** "Use the real one", beside a field's label, only once it has been changed */
const RealLink = ({ show, onClick }: { show: boolean; onClick(): void; }) =>
    show ? <button className={cl("link")} onClick={onClick}>Use real</button> : null;

function Picture({ label, value, real, wide, onChange }: { label: string; value?: string; real: string | null; wide?: boolean; onChange(next?: string): void; }) {
    const shown = value === NOTHING ? null : isAddress(value) ? value! : real;

    return (
        <Field label={label} hint="Paste an image link, or leave empty to keep the real one." action={<RealLink show={value !== undefined} onClick={() => onChange(undefined)} />}>
            <div className={cl("picture")}>
                <div className={cl("thumb", wide ? "thumb-wide" : "")} style={shown ? { backgroundImage: `url("${shown}")` } : undefined}>
                    {!shown && "None"}
                </div>
                <div className={cl("grow")}>
                    <TextInput
                        value={isAddress(value) ? value : ""}
                        placeholder={value === NOTHING ? "No picture" : "https://"}
                        onChange={(next: string) => onChange(next.trim() || undefined)}
                    />
                </div>
                {value !== NOTHING && (
                    <IconButton icon={CloseIcon} variant="secondary" onClick={() => onChange(NOTHING)}>Remove</IconButton>
                )}
            </div>
        </Field>
    );
}

// ---------------------------------------------------------------- tabs

type Tab = "profile" | "pictures" | "badges" | "presets";

const TABS: { id: Tab; label: string; icon: any; }[] = [
    { id: "profile", label: "Profile", icon: PersonIcon },
    { id: "pictures", label: "Appearance", icon: ImageIcon },
    { id: "badges", label: "Badges", icon: StarIcon },
    { id: "presets", label: "Presets", icon: BookmarkIcon },
];

type Set = (change: Partial<Look> | ((prev: Look) => Partial<Look>)) => void;

function ProfileTab({ userId, look, set }: { userId: string; look: Look; set: Set; }) {
    const real = realOf(userId);
    const connections: Connection[] = look.connections ?? real.profile?.connectedAccounts ?? [];
    const [service, setService] = useState("spotify");
    const [account, setAccount] = useState("");
    const realSince = real.user?.createdAt?.getTime?.() ?? Date.now();
    const since = new Date(look.memberSince ?? realSince);

    const add = () => {
        const name = account.trim();
        if (!name) return;
        set({ connections: [...connections, { type: service, id: name, name, verified: true }] });
        setAccount("");
    };

    return (
        <div className={cl("tab")}>
            <div className={cl("pair")}>
                <Field label="Display name">
                    <Text value={look.globalName} real={real.user?.globalName ?? real.user?.username} onChange={v => set({ globalName: v })} />
                </Field>
                <Field label="Username">
                    <Text value={look.username} real={real.user?.username} onChange={v => set({ username: v })} />
                </Field>
            </div>
            <Field label="Pronouns">
                <Text value={look.pronouns} real={real.profile?.pronouns} onChange={v => set({ pronouns: v })} />
            </Field>
            <Field label="About me">
                <Text value={look.bio} real={real.profile?.bio} onChange={v => set({ bio: v })} multiline />
            </Field>

            <Field label="Member since" action={<RealLink show={look.memberSince !== undefined} onClick={() => set({ memberSince: undefined })} />}>
                <TextInput
                    type="date"
                    value={since.toISOString().slice(0, 10)}
                    onChange={(next: string) => set({ memberSince: next ? new Date(next + "T12:00:00").getTime() : undefined })}
                />
            </Field>

            <Field label="Connections" action={<RealLink show={look.connections !== undefined} onClick={() => set({ connections: undefined })} />}>
                <div className={cl("rows")}>
                    {connections.map((one, i) => (
                        <div key={one.type + one.id + i} className={cl("item")}>
                            {logoOf(one.type) ? <img className={cl("logo")} src={logoOf(one.type)} alt="" /> : <span className={cl("logo")} />}
                            <div className={cl("item-text")}>
                                <span className={cl("item-name")}>{one.name}</span>
                                <span className={cl("item-detail")}>{nameOf(one.type)}</span>
                            </div>
                            <button className={cl("icon-button")} aria-label={`Remove ${one.name}`} onClick={() => set({ connections: connections.filter((_, j) => j !== i) })}>
                                <CloseIcon height={16} width={16} />
                            </button>
                        </div>
                    ))}
                    {!connections.length && <div className={cl("empty-line")}>No connections</div>}
                </div>
                <div className={cl("add")}>
                    <div className={cl("add-service")}>
                        <SearchableSelect
                            options={services()}
                            value={services().find(o => o.value === service)}
                            onChange={(next: any) => setService(next?.value ?? next)}
                            closeOnSelect
                            renderOptionPrefix={(option: any) => logoOf(option?.value) ? <img className={cl("logo-small")} src={logoOf(option.value)} alt="" /> : null}
                        />
                    </div>
                    <div className={cl("grow")}>
                        <TextInput value={account} placeholder="Account name" onChange={setAccount} onKeyDown={(e: any) => e.key === "Enter" && add()} />
                    </div>
                    <IconButton icon={CheckIcon} variant="primary" disabled={!account.trim()} onClick={add}>Add</IconButton>
                </div>
            </Field>
        </div>
    );
}

function PicturesTab({ userId, look, set }: { userId: string; look: Look; set: Set; }) {
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
            <Picture label="Banner" value={look.banner} real={real.banner} wide onChange={v => set({ banner: v })} />

            <Field
                label="Profile colours"
                hint={look.themeColors ? undefined : colours ? "Their real colours." : "No colours set. Pick two to add a gradient."}
                action={<RealLink show={look.themeColors !== undefined} onClick={() => set({ themeColors: undefined })} />}
            >
                <div className={cl("swatches")}>
                    {["Top", "Bottom"].map((which, i) => (
                        <label key={which} className={cl("swatch")}>
                            <input
                                type="color"
                                value={hex(colours?.[i] ?? 0x5865f2)}
                                onChange={e => {
                                    const next: [number, number] = [colours?.[0] ?? 0x5865f2, colours?.[1] ?? 0x5865f2];
                                    next[i] = fromHex(e.currentTarget.value);
                                    set({ themeColors: next });
                                }}
                            />
                            <span>{which}</span>
                        </label>
                    ))}
                </div>
            </Field>

            <Field label="Nitro" action={<RealLink show={look.premiumType !== undefined} onClick={() => set({ premiumType: undefined })} />}>
                <div className={cl("segments")} role="radiogroup" aria-label="Nitro">
                    {NITRO.map(option => (
                        <button
                            key={option.value}
                            role="radio"
                            aria-checked={nitro === option.value}
                            className={cl("segment", nitro === option.value ? "segment-on" : "")}
                            onClick={() => set({ premiumType: option.value })}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </Field>

            <Field label="Collectibles" hint="Copied from whoever you steal.">
                <div className={cl("rows")}>
                    {extras.map(({ key, label }) => {
                        const value = look[key] as string | undefined;
                        return (
                            <div key={key} className={cl("item")}>
                                <div className={cl("item-text")}>
                                    <span className={cl("item-name")}>{label}</span>
                                    <span className={cl("item-detail")}>{value === NOTHING ? "None" : value ? "Copied from a profile" : "Real"}</span>
                                </div>
                                {value !== undefined && <button className={cl("link")} onClick={() => set({ [key]: undefined } as any)}>Use real</button>}
                                {value !== NOTHING && <button className={cl("link", "link-danger")} onClick={() => set({ [key]: NOTHING } as any)}>Remove</button>}
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
            {on && <CheckIcon className={cl("badge-tick")} height={14} width={14} />}
        </button>
    );
}

function BadgesTab({ userId, look, set }: { userId: string; look: Look; set: Set; }) {
    const real = realOf(userId);
    const chosen = look.badges ?? real.badges;

    const toggle = (key: string) => set(prev => {
        const now = prev.badges ?? real.badges;
        return { badges: now.includes(key) ? now.filter(k => k !== key) : withBadge(now, key) };
    });

    return (
        <div className={cl("tab")}>
            <div className={cl("toolbar")}>
                <span className={cl("f-hint")}>{chosen.length ? `${chosen.length} selected, shown in Discord's order` : "None selected"}</span>
                <div className={cl("toolbar-actions")}>
                    <RealLink show={look.badges !== undefined} onClick={() => set({ badges: undefined })} />
                    {!!chosen.length && <button className={cl("link", "link-danger")} onClick={() => set({ badges: [] })}>Clear all</button>}
                </div>
            </div>
            {GROUPS.map(group => (
                <div key={group.id} className={cl("group")}>
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
    // A name made only of symbols and invisible characters reads as nothing in a list, so the
    // username stands in for it.
    const visible = (text?: string | null) => !!text && /[\p{L}\p{N}]/u.test(text);
    const theirName = visible(who?.globalName) ? who.globalName : who?.username ?? "them";

    const keep = (what: Look, fallback: string) => {
        const called = tidyName(name) || fallback;
        const result = savePreset(called, what);
        if (result === "empty") showToast({ text: "Nothing to save yet", variant: "critical" });
        else showToast({ text: `Saved ${called}`, variant: "success" });
        setName("");
        redraw(n => n + 1);
    };

    const names = presetNames();

    return (
        <div className={cl("tab")}>
            <Field label="New preset" hint="Leave the name empty to use theirs.">
                <TextInput value={name} placeholder={theirName} onChange={setName} />
            </Field>
            <div className={cl("cards")}>
                <button className={cl("action")} onClick={() => {
                    const whole = wholeLookOf(userId);
                    if (whole) keep(whole, theirName);
                }}>
                    <MasksIcon className={cl("action-icon")} height={20} width={20} />
                    <span className={cl("action-title")}>Steal profile</span>
                    <span className={cl("action-text")}>Copies everything about {theirName}.</span>
                </button>
                <button className={cl("action")} onClick={() => keep(look, theirName + " (edited)")}>
                    <CopyIcon className={cl("action-icon")} height={20} width={20} />
                    <span className={cl("action-title")}>Save changes</span>
                    <span className={cl("action-text")}>Copies only what you changed here.</span>
                </button>
            </div>

            <Field label={`Saved presets${names.length ? ` (${names.length})` : ""}`}>
                <div className={cl("rows")}>
                    {!names.length && <div className={cl("empty-line")}>No presets yet</div>}
                    {names.map(called => {
                        const preset = presetCalled(called)!;
                        return (
                            <div key={called} className={cl("item")}>
                                <img className={cl("face")} alt="" src={isAddress(preset.avatar) ? preset.avatar : plainAvatar(String(called.length))} />
                                <div className={cl("item-text")}>
                                    <span className={cl("item-name")}>{called}</span>
                                    <span className={cl("item-detail")}>{summary(preset)}</span>
                                </div>
                                <div className={cl("item-actions")}>
                                    <IconButton icon={CheckIcon} variant="secondary" onClick={() => replace({ ...preset })}>Use</IconButton>
                                    {me && me !== userId && (
                                        <IconButton icon={PersonIcon} variant="secondary" onClick={() => {
                                            setLook(me, preset);
                                            showToast({ text: `You now look like ${called}`, variant: "success" });
                                        }}>Wear</IconButton>
                                    )}
                                    <button className={cl("icon-button", "icon-danger")} aria-label={`Delete ${called}`} onClick={() => { deletePreset(called); redraw(n => n + 1); }}>
                                        <TrashIcon height={16} width={16} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Field>
        </div>
    );
}

// ---------------------------------------------------------------- the window

function InspectModal({ rootProps, userId, startOn }: { rootProps: RenderModalProps; userId: string; startOn?: Tab; }) {
    const [look, setDraft] = useState<Look>(() => ({ ...(lookFor(userId) ?? {}) }));
    const [tab, setTab] = useState<Tab>(startOn ?? "profile");
    const who = realUser(userId);
    const isMe = userId === UserStore.getCurrentUser()?.id;
    const realName = who?.globalName ?? who?.username ?? "this profile";

    // From the look as it is at that moment rather than as it was drawn: two quick clicks
    // otherwise both start from the same list, and the second throws the first away.
    const set: Set = change => setDraft(prev => {
        const patch = typeof change === "function" ? change(prev) : change;
        const next = { ...prev, ...patch };
        for (const key of Object.keys(patch) as (keyof Look)[]) if (patch[key] === undefined) delete next[key];
        return next;
    });

    // The bio, badges and connections only arrive with the full profile, so it is asked for
    // as the window opens - the same request opening their profile makes.
    const [loaded, setLoaded] = useState(() => !!realProfile(userId));
    useEffect(() => {
        if (loaded) return;
        Promise.resolve(fetchProfile?.(userId)).catch(() => { }).finally(() => setLoaded(true));
    }, []);

    const changed = !!lookFor(userId);
    const resetLabel = isMe ? "Reset to my real profile" : "Reset to real profile";
    const reset = (close: boolean) => {
        revert(userId);
        setDraft({});
        showToast({ text: isMe ? "Your real profile is back" : "Their real profile is back", variant: "default" });
        if (close) rootProps.onClose();
    };

    const actions: ModalAction[] = [
        {
            text: "Save",
            variant: "primary",
            onClick: () => {
                setLook(userId, look);
                showToast({ text: "Saved", variant: "success" });
                rootProps.onClose();
            }
        },
        { text: "Cancel", variant: "secondary", onClick: rootProps.onClose },
    ];

    return (
        <Modal {...rootProps} size="xl" title={isMe ? "Edit your profile" : `Inspect ${realName}`} subtitle="Only you can see these changes. Nothing is sent to Discord." actions={actions}>
            <div className={cl("layout")}>
                <aside className={cl("aside")}>
                    <Preview userId={userId} look={look} />
                    <div className={cl("status", changed ? "status-on" : "")}>
                        <span className={cl("status-dot")} />
                        <div className={cl("status-text")}>
                            <span>
                                {changed
                                    ? isMe ? "You are showing a changed profile" : `${realName} is changed for you`
                                    : isMe ? "This is your real profile" : `This is ${realName}'s real profile`}
                            </span>
                            {changed && <button className={cl("link")} onClick={() => reset(false)}>{resetLabel}</button>}
                        </div>
                    </div>
                    {!loaded && <div className={cl("f-hint")}>Loading the full profile...</div>}
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
                    {/* One height for every tab, scrolling inside, so switching tabs never moves the window */}
                    <div className={cl("scroller")}>
                        {tab === "profile" && <ProfileTab userId={userId} look={look} set={set} />}
                        {tab === "pictures" && <PicturesTab userId={userId} look={look} set={set} />}
                        {tab === "badges" && <BadgesTab userId={userId} look={look} set={set} />}
                        {tab === "presets" && <PresetsTab userId={userId} look={look} replace={next => setDraft(next)} />}
                    </div>
                </div>
            </div>
        </Modal>
    );
}

export const openInspect = (userId: string, startOn?: Tab) =>
    openModal(rootProps => <InspectModal rootProps={rootProps} userId={userId} startOn={startOn} />);
