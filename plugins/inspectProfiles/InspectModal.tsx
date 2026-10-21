/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ModalAction, RenderModalProps } from "@vencord/discord-types";
import { findByCodeLazy, findByPropsLazy } from "@webpack";
import { ColorPicker, Modal, openModal, ScrollerThin, SearchableSelect, showToast, TextArea, TextInput, useEffect, useRef, UserStore, useState } from "@webpack/common";

import { Badge, BADGES, badgesFor, GROUPS, realKeys, withBadge } from "./badges";
import { CollectiblesTab, decorationPicture } from "./Collectibles";
import { DateField } from "./DateField";
import { BookmarkIcon, CheckIcon, CloseIcon, CopyIcon, ImageIcon, LinkIcon, MasksIcon, PaletteIcon, PersonIcon, StarIcon, TrashIcon } from "./icons";
import { keep } from "./images";
import { pictureUrl, realProfile, realUser, wholeLookOf } from "./rewrite";
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
const isLink = (value?: string) => !!value && /^https?:\/\//.test(value);
const hex = (n?: number) => "#" + ((n ?? 0) & 0xffffff).toString(16).padStart(6, "0");
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
    const avatar = look.avatar === NOTHING ? plainAvatar(userId) : pictureUrl(look.avatar) ?? real.avatar;
    const banner = look.banner === NOTHING ? null : pictureUrl(look.banner) ?? real.banner;
    const colours: number[] | undefined = look.themeColors ?? real.profile?.themeColors;
    const themed = !!colours && colours.length === 2;
    const badges = badgesFor(real.profile?.badges ?? [], look.badges ?? real.badges);
    const bio = look.bio ?? real.profile?.bio ?? "";
    const pronouns = look.pronouns ?? real.profile?.pronouns ?? "";
    const since = new Date(look.memberSince ?? real.user?.createdAt?.getTime?.() ?? Date.now());
    const connections: Connection[] = look.connections ?? real.profile?.connectedAccounts ?? [];
    const ring = look.decoration === NOTHING ? null
        : look.decoration ? { asset: look.decoration, skuId: look.decorationSku }
            : real.user?.avatarDecorationData ?? null;
    const decoration = ring?.asset ? decorationPicture(ring.asset, ring.skuId, true) : undefined;

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
                <div className={cl("pcard-avatar-wrap")}>
                    <img className={cl("pcard-avatar")} src={avatar} alt="" />
                    {decoration && <img className={cl("pcard-deco")} src={decoration} alt="" />}
                </div>
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

/**
 * Choosing one picture: from a file, dropped on it, pasted, or from a link.
 *
 * Shared by the banner and the avatar, which are drawn together the way a profile draws them
 * and each get the same row of controls.
 */
function usePicture(kind: "avatar" | "banner", value: string | undefined, onChange: (next?: string) => void) {
    const [linking, setLinking] = useState(isLink(value));
    const [busy, setBusy] = useState(false);
    const [over, setOver] = useState(false);
    const picker = useRef<HTMLInputElement>(null);

    const take = async (file?: File | null) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            showToast({ text: "That file is not a picture", variant: "critical" });
            return;
        }

        setBusy(true);
        try {
            onChange(await keep(file, kind));
            setLinking(false);
        } catch {
            showToast({ text: "Could not use that picture", variant: "critical" });
        } finally {
            setBusy(false);
        }
    };

    // the area itself: click to pick a file, drop one on it, or paste a picture or a link
    const target = {
        onClick: () => picker.current?.click(),
        onPaste: (event: any) => {
            const file = [...(event.clipboardData?.files ?? [])].find((f: File) => f.type.startsWith("image/"));
            const text = event.clipboardData?.getData("text")?.trim();
            if (file) {
                event.preventDefault();
                void take(file);
            } else if (isLink(text)) {
                event.preventDefault();
                onChange(text);
            }
        },
        onDragOver: (e: any) => { e.preventDefault(); setOver(true); },
        onDragLeave: () => setOver(false),
        onDrop: (e: any) => {
            e.preventDefault();
            setOver(false);
            void take(e.dataTransfer.files?.[0]);
        },
    };

    const input = (
        <input
            ref={picker}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={e => {
                void take(e.currentTarget.files?.[0]);
                e.currentTarget.value = "";
            }}
        />
    );

    return { linking, setLinking, busy, over, target, input, pick: () => picker.current?.click() };
}

/** One picture's controls, on a line of their own under the header */
function PictureControls({ label, value, onChange, picture }: {
    label: string;
    value?: string;
    onChange(next?: string): void;
    picture: ReturnType<typeof usePicture>;
}) {
    const state = value === NOTHING ? "None" : value ? (isLink(value) ? "From a link" : "Uploaded") : "Real";

    return (
        <div className={cl("pc")}>
            <div className={cl("pc-row")}>
                <div className={cl("pc-text")}>
                    <span className={cl("item-name")}>{label}</span>
                    <span className={cl("item-detail")}>{picture.busy ? "Saving..." : state}</span>
                </div>
                <div className={cl("pc-buttons")}>
                    <IconButton icon={ImageIcon} variant="primary" disabled={picture.busy} onClick={picture.pick}>Upload</IconButton>
                    <IconButton icon={LinkIcon} variant="secondary" onClick={() => picture.setLinking(!picture.linking)}>Link</IconButton>
                    {value !== NOTHING && (
                        <IconButton icon={CloseIcon} variant="secondary" onClick={() => { onChange(NOTHING); picture.setLinking(false); }}>Remove</IconButton>
                    )}
                    {value !== undefined && (
                        <button className={cl("link")} onClick={() => { onChange(undefined); picture.setLinking(false); }}>Use real</button>
                    )}
                </div>
            </div>
            {picture.linking && (
                <TextInput
                    autoFocus
                    value={isLink(value) ? value : ""}
                    placeholder="Paste an image link"
                    onChange={(next: string) => onChange(next.trim() || undefined)}
                />
            )}
            {picture.input}
        </div>
    );
}

/**
 * The banner with the avatar over its bottom edge, as a profile has them - each one a place to
 * click, drop or paste a picture. Below, a line of controls for each.
 */
function Header({ look, real, set }: { look: Look; real: ReturnType<typeof realOf>; set: Set; }) {
    const banner = usePicture("banner", look.banner, v => set({ banner: v }));
    const avatar = usePicture("avatar", look.avatar, v => set({ avatar: v }));

    const bannerShown = look.banner === NOTHING ? null : pictureUrl(look.banner) ?? real.banner;
    const avatarShown = look.avatar === NOTHING ? null : pictureUrl(look.avatar) ?? real.avatar;

    return (
        <div className={cl("f")}>
            <span className={cl("f-label")}>Banner and avatar</span>
            <div className={cl("hero")}>
                <button
                    className={cl("hero-banner", banner.over ? "drop-over" : "")}
                    style={bannerShown ? { backgroundImage: `url("${bannerShown}")` } : undefined}
                    aria-label="Change banner"
                    {...banner.target}
                >
                    {!bannerShown && <span className={cl("hero-empty")}>No banner</span>}
                    <span className={cl("drop-hover")}>{banner.busy ? "Saving..." : banner.over ? "Drop to use" : "Change banner"}</span>
                </button>
                <button
                    className={cl("hero-avatar", avatar.over ? "drop-over" : "")}
                    style={avatarShown ? { backgroundImage: `url("${avatarShown}")` } : undefined}
                    aria-label="Change avatar"
                    {...avatar.target}
                >
                    {!avatarShown && <span className={cl("hero-empty")}>None</span>}
                    <span className={cl("drop-hover")}>{avatar.busy ? "..." : avatar.over ? "Drop" : "Change"}</span>
                </button>
            </div>
            <div className={cl("rows")}>
                <PictureControls label="Banner" value={look.banner} onChange={v => set({ banner: v })} picture={banner} />
                <PictureControls label="Avatar" value={look.avatar} onChange={v => set({ avatar: v })} picture={avatar} />
            </div>
            <span className={cl("f-hint")}>Click or drop a picture on the banner or avatar, or click one and paste. GIFs keep moving.</span>
        </div>
    );
}

// ---------------------------------------------------------------- tabs

type Tab = "profile" | "pictures" | "collectibles" | "badges" | "presets";

const TABS: { id: Tab; label: string; icon: any; }[] = [
    { id: "profile", label: "Profile", icon: PersonIcon },
    { id: "pictures", label: "Appearance", icon: ImageIcon },
    { id: "collectibles", label: "Collectibles", icon: PaletteIcon },
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
                <DateField value={since.getTime()} onChange={ms => set({ memberSince: ms })} />
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


    return (
        <div className={cl("tab")}>
            <Header look={look} real={real} set={set} />

            <Field
                label="Profile colours"
                hint={look.themeColors ? undefined : colours ? "Their real colours." : "No colours set. Pick two to give the card a gradient."}
                action={<RealLink show={look.themeColors !== undefined} onClick={() => set({ themeColors: undefined })} />}
            >
                <div className={cl("swatches")}>
                    {["Primary", "Accent"].map((which, i) => (
                        <ColorPicker
                            key={which}
                            color={colours?.[i] ?? null}
                            showEyeDropper
                            label={<span className={cl("swatch-label")}>{which}</span>}
                            onChange={(value: number | null) => set(prev => {
                                const now = prev.themeColors ?? colours ?? [value ?? 0, value ?? 0];
                                const next: [number, number] = [now[0], now[1]];
                                next[i] = value ?? 0;
                                return { themeColors: next };
                            })}
                        />
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
                                <img className={cl("face")} alt="" src={pictureUrl(preset.avatar) ?? plainAvatar(String(called.length))} />
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
                    <ScrollerThin className={cl("scroller")} fade>
                        <div className={cl("scroll-inner")}>
                            {tab === "profile" && <ProfileTab userId={userId} look={look} set={set} />}
                            {tab === "pictures" && <PicturesTab userId={userId} look={look} set={set} />}
                            {tab === "collectibles" && <CollectiblesTab look={look} set={set} />}
                            {tab === "badges" && <BadgesTab userId={userId} look={look} set={set} />}
                            {tab === "presets" && <PresetsTab userId={userId} look={look} replace={next => setDraft(next)} />}
                        </div>
                    </ScrollerThin>
                </div>
            </div>
        </Modal>
    );
}

export const openInspect = (userId: string, startOn?: Tab) =>
    openModal(rootProps => <InspectModal rootProps={rootProps} userId={userId} startOn={startOn} />);
