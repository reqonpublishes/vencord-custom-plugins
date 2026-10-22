/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";
import { findByCodeLazy, findStoreLazy } from "@webpack";
import { ContextMenuApi, IconUtils, Menu, TextInput, useEffect, useMemo, useRef, useState } from "@webpack/common";

import { CheckIcon, CloseIcon, StarIcon, UndoIcon } from "./icons";
import { keepList, keptList, loadPicture, pictureNow } from "./shopCache";
import { Look, NOTHING } from "./store";
import { cl } from "./ui";

/** Discord's shop catalogue, and the request the Shop makes to fill it */
const CategoryStore = findStoreLazy("CollectiblesCategoryStore");
const fetchCategories = findByCodeLazy('type:"COLLECTIBLES_CATEGORIES_FETCH"');

export type Kind = "decoration" | "nameplate" | "effect" | "frame";

/** Discord's own numbers for each kind of thing the shop sells */
const TYPE: Record<Kind, number> = { decoration: 0, effect: 1, nameplate: 2, frame: 3 };

export const KINDS: { id: Kind; label: string; }[] = [
    { id: "decoration", label: "Decorations" },
    { id: "nameplate", label: "Nameplates" },
    { id: "effect", label: "Effects" },
    { id: "frame", label: "Frames" },
];

/** One thing the shop sells, with only what wearing it and drawing it need - small enough to keep */
interface Entry {
    skuId: string;
    name: string;
    collection: string;
    picture?: string;
    item: { asset?: string; palette?: string; label?: string; };
}

type List = Record<Kind, Entry[]>;

/** The address of a decoration's picture, as Discord builds it */
export function decorationPicture(asset: string, skuId?: string, animate = false) {
    try {
        return IconUtils.getAvatarDecorationURL({ avatarDecoration: { asset, skuId }, size: 160, canAnimate: animate } as any);
    } catch {
        return undefined;
    }
}

const nameplatePicture = (asset: string) => `https://cdn.discordapp.com/assets/collectibles/${asset}static.png`;

/** The element a picture scrolls inside, so it can be fetched before it is scrolled to */
function scrollerOf(el: HTMLElement): HTMLElement | null {
    for (let node = el.parentElement; node; node = node.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
    }
    return null;
}

/**
 * A picture, fetched as it comes close to being seen and kept on this computer after that.
 *
 * The shop has hundreds of these. Watching the window alone does not work inside the editor,
 * which scrolls on its own: a picture was only asked for once it was already on screen, so
 * tiles sat empty while you scrolled (measured). The editor's own scroller is watched instead,
 * with a screen and a half of warning.
 */
function LazyPicture({ src }: { src: string; }) {
    const ref = useRef<HTMLImageElement>(null);
    const [shown, setShown] = useState<string | undefined>(() => pictureNow(src));

    useEffect(() => {
        const el = ref.current;
        if (!el || shown) return;

        let gone = false;
        const watcher = new IntersectionObserver(seen => {
            if (!seen.some(entry => entry.isIntersecting)) return;
            watcher.disconnect();
            loadPicture(src)
                .then(url => !gone && setShown(url))
                // kept or not, a picture that can be shown is shown
                .catch(() => !gone && setShown(src));
        }, { root: scrollerOf(el), rootMargin: "900px 0px" });
        watcher.observe(el);

        return () => {
            gone = true;
            watcher.disconnect();
        };
    }, [src, shown]);

    return <img ref={ref} src={shown} alt="" />;
}

/**
 * A decoration's animation, played while the pointer is over its tile.
 *
 * The still frames of two variants can be the same picture - Jack Skellington's Base and Bones
 * differ only once they move - so a still on its own makes them look like one item twice.
 * Asked for on the first hover only, so a shop of hundreds does not download hundreds of
 * animations.
 */
function Moving({ asset, skuId }: { asset: string; skuId: string; }) {
    const [wanted, setWanted] = useState(false);
    const ref = useRef<HTMLImageElement>(null);

    useEffect(() => {
        const tile = ref.current?.closest("button");
        if (!tile || wanted) return;

        const want = () => setWanted(true);
        tile.addEventListener("pointerenter", want, { once: true });
        return () => tile.removeEventListener("pointerenter", want);
    }, [wanted]);

    return <img ref={ref} className={cl("shop-moving")} src={wanted ? decorationPicture(asset, skuId, true) : undefined} alt="" />;
}

/** Marks the one worn */
const Tick = () => <span className={cl("shop-tick")}><CheckIcon height={12} width={12} /></span>;

/** Everything of one kind in Discord's catalogue, under the collection each belongs to */
function liveEntries(kind: Kind): Entry[] {
    const products: any[] = [...(CategoryStore?.products?.values?.() ?? [])];
    const categories: any[] = [...(CategoryStore?.categories?.values?.() ?? [])];
    const collectionOf = (p: any) => categories.find(c => c.skuId === p.categorySkuId);

    return products
        .filter(p => p.type === TYPE[kind] && p.items?.[0])
        .map(p => {
            const item = p.items[0];
            const collection = collectionOf(p);
            const picture = kind === "decoration" ? decorationPicture(item.asset, p.skuId)
                : kind === "nameplate" ? nameplatePicture(item.asset)
                    : kind === "effect" ? item.thumbnailPreviewSrc ?? item.staticFrameSrc
                        : collection?.logoUrl;
            return {
                skuId: String(p.skuId),
                name: p.name,
                collection: collection?.name ?? "Other",
                picture,
                item: { asset: item.asset, palette: item.palette, label: item.label }
            };
        });
}

const liveList = (): List => ({ decoration: liveEntries("decoration"), nameplate: liveEntries("nameplate"), effect: liveEntries("effect"), frame: liveEntries("frame") });

/** What wearing one sets on a look, and how to tell it is the one worn */
const apply: Record<Kind, (e: Entry) => Partial<Look>> = {
    decoration: e => ({ decoration: e.item.asset, decorationSku: e.skuId }),
    nameplate: e => ({ nameplate: e.item.asset, nameplateSku: e.skuId, nameplatePalette: e.item.palette }),
    effect: e => ({ profileEffect: e.skuId }),
    frame: e => ({ profileFrame: e.skuId }),
};
const field: Record<Kind, keyof Look> = { decoration: "decoration", nameplate: "nameplate", effect: "profileEffect", frame: "profileFrame" };
const extras: Record<Kind, (keyof Look)[]> = { decoration: ["decorationSku"], nameplate: ["nameplateSku", "nameplatePalette"], effect: [], frame: [] };
const isWorn: Record<Kind, (look: Look, e: Entry) => boolean> = {
    decoration: (look, e) => look.decoration === e.item.asset,
    nameplate: (look, e) => look.nameplate === e.item.asset,
    effect: (look, e) => look.profileEffect === e.skuId,
    frame: (look, e) => look.profileFrame === e.skuId,
};

// ---------------------------------------------------------------- favourites

const favouritesStore = () => Settings.plugins.InspectProfiles as any;

/** The things kept at the top of each kind, by their shop id */
const favourites = (kind: Kind): string[] => favouritesStore()?.favourites?.[kind] ?? [];

function toggleFavourite(kind: Kind, skuId: string) {
    const all = { ...(favouritesStore()?.favourites ?? {}) };
    const mine: string[] = all[kind] ?? [];
    all[kind] = mine.includes(skuId) ? mine.filter(id => id !== skuId) : [skuId, ...mine];
    favouritesStore().favourites = all;
}

function openTileMenu(event: React.MouseEvent, kind: Kind, entry: Entry, wear: () => void, changed: () => void) {
    const favourite = favourites(kind).includes(entry.skuId);
    ContextMenuApi.openContextMenu(event, () => (
        <Menu.Menu navId="vc-cip-shop" onClose={ContextMenuApi.closeContextMenu} aria-label={entry.name}>
            <Menu.MenuItem id="vc-cip-shop-wear" label="Wear" action={wear} />
            <Menu.MenuItem
                id="vc-cip-shop-favourite"
                label={favourite ? "Remove from Favourites" : "Add to Favourites"}
                icon={StarIcon}
                action={() => {
                    toggleFavourite(kind, entry.skuId);
                    changed();
                }}
            />
        </Menu.Menu>
    ));
}

/**
 * The shop, to choose from: every decoration, nameplate, effect and frame Discord sells, with
 * its real picture, grouped by collection the way the Shop groups them, favourites first.
 *
 * Read from the same catalogue the Shop shows, fetched the same way the Shop fetches it. The
 * list last seen is kept on this computer, so it opens at once and is brought up to date as
 * Discord answers. Choosing one only changes how the profile looks to you.
 */
export function CollectiblesTab({ look, set }: { look: Look; set(change: Partial<Look>): void; }) {
    const [kind, setKind] = useState<Kind>("decoration");
    const [query, setQuery] = useState("");
    const [, redraw] = useState(0);
    const [list, setList] = useState<List | null>(() => CategoryStore?.categories?.size ? liveList() : null);
    const [state, setState] = useState<"loading" | "ready" | "failed">(() => list ? "ready" : "loading");

    // The kept list first, if Discord has not got its own yet; then Discord's, which replaces it
    useEffect(() => {
        if (state !== "loading") return;
        let gone = false;

        if (!list) void keptList<List>().then(kept => !gone && kept && setList(prev => prev ?? kept));

        Promise.resolve(fetchCategories?.())
            .then(() => {
                if (gone) return;
                if (!CategoryStore?.categories?.size) {
                    setState("failed");
                    return;
                }
                const fresh = liveList();
                setList(fresh);
                setState("ready");
                void keepList(fresh);
            })
            .catch(() => !gone && setState("failed"));

        return () => { gone = true; };
    }, [state]);

    // Discord's list, opened again with it already loaded, is kept too
    useEffect(() => {
        if (list && CategoryStore?.categories?.size) void keepList(list);
    }, []);

    const all = list?.[kind] ?? [];
    const wanted = query.trim().toLowerCase();
    const shown = useMemo(() => wanted ? all.filter(e => e.name.toLowerCase().includes(wanted) || e.collection.toLowerCase().includes(wanted)) : all, [all, wanted]);

    // favourites first, then by collection, in the order the catalogue gives them
    const starred = new Set(favourites(kind));
    const groups: [string, Entry[]][] = [];
    const favouriteEntries = shown.filter(e => starred.has(e.skuId));
    if (favouriteEntries.length) groups.push(["Favourites", favouriteEntries]);
    for (const e of shown) {
        const group = groups.find(([name]) => name === e.collection);
        if (group) group[1].push(e);
        else groups.push([e.collection, [e]]);
    }

    const key = field[kind];
    const value = look[key] as string | undefined;
    const clear = (to: string | undefined) => {
        const patch: Partial<Look> = { [key]: to } as any;
        for (const extra of extras[kind]) (patch as any)[extra] = undefined;
        set(patch);
    };

    return (
        <div className={cl("tab")}>
            <div className={cl("segments")} role="tablist" aria-label="Kind">
                {KINDS.map(k => (
                    <button key={k.id} role="tab" aria-selected={kind === k.id} className={cl("segment", kind === k.id ? "segment-on" : "")} onClick={() => setKind(k.id)}>
                        {k.label}
                    </button>
                ))}
            </div>

            <TextInput value={query} placeholder={`Search ${KINDS.find(k => k.id === kind)!.label.toLowerCase()} or collections`} onChange={setQuery} />

            <div className={cl("shop-grid")}>
                <button className={cl("shop-tile", value === undefined ? "shop-on" : "")} onClick={() => clear(undefined)}>
                    <div className={cl("shop-pic", "shop-pic-icon")}><UndoIcon height={28} width={28} />{value === undefined && <Tick />}</div>
                    <span className={cl("shop-name")}>Real</span>
                </button>
                <button className={cl("shop-tile", value === NOTHING ? "shop-on" : "")} onClick={() => clear(NOTHING)}>
                    <div className={cl("shop-pic", "shop-pic-icon")}><CloseIcon height={28} width={28} />{value === NOTHING && <Tick />}</div>
                    <span className={cl("shop-name")}>None</span>
                </button>
            </div>

            {!list && state === "loading" && <div className={cl("empty-line")}>Loading the shop...</div>}
            {!list && state === "failed" && (
                <div className={cl("empty-line")}>
                    Could not load the shop. <button className={cl("link")} onClick={() => setState("loading")}>Try again</button>
                </div>
            )}
            {list && !shown.length && <div className={cl("empty-line")}>{wanted ? `Nothing matches "${query}"` : "Nothing here yet"}</div>}

            {groups.map(([collection, entries]) => (
                <div key={collection} className={cl("group")}>
                    <div className={cl("group-head")}>
                        <span className={cl("f-label")}>{collection}</span>
                        <span className={cl("f-hint")}>{entries.length}</span>
                    </div>
                    <div className={cl("shop-grid")}>
                        {entries.map(e => {
                            const wear = () => set(apply[kind](e));
                            return (
                                <button
                                    key={e.skuId}
                                    className={cl("shop-tile", isWorn[kind](look, e) ? "shop-on" : "")}
                                    title={e.item?.label ?? e.name}
                                    onClick={wear}
                                    onContextMenu={event => openTileMenu(event, kind, e, wear, () => redraw(n => n + 1))}
                                >
                                    <div className={cl("shop-pic", `shop-pic-${kind}`)}>
                                        {e.picture && <LazyPicture key={e.picture} src={e.picture} />}
                                        {kind === "decoration" && e.item?.asset?.startsWith("a_") && <Moving asset={e.item.asset} skuId={e.skuId} />}
                                        {starred.has(e.skuId) && <span className={cl("shop-star")}><StarIcon height={12} width={12} /></span>}
                                        {isWorn[kind](look, e) && <Tick />}
                                    </div>
                                    <span className={cl("shop-name")}>{e.name}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}

            {list && <div className={cl("shop-tip")}>Right-click anything to add it to your Favourites.</div>}
        </div>
    );
}
