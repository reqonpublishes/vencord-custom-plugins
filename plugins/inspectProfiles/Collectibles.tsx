/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByCodeLazy, findStoreLazy } from "@webpack";
import { IconUtils, TextInput, useEffect, useMemo, useRef, useState } from "@webpack/common";

import { CloseIcon, UndoIcon } from "./icons";
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

interface Entry {
    skuId: string;
    name: string;
    collection: string;
    picture?: string;
    item: any;
}

/** The address of a decoration's picture, as Discord builds it */
export function decorationPicture(asset: string, skuId?: string, animate = false) {
    try {
        return IconUtils.getAvatarDecorationURL({ avatarDecoration: { asset, skuId }, size: 160, canAnimate: animate } as any);
    } catch {
        return undefined;
    }
}

const nameplatePicture = (asset: string) => `https://cdn.discordapp.com/assets/collectibles/${asset}static.png`;

/**
 * A picture that is only fetched once it is about to be seen.
 *
 * The shop has hundreds of these, and asking for all of them at once is several megabytes before
 * anything shows. The browser's own loading="lazy" never fires inside Discord's window - measured,
 * tiles in plain view stayed empty - so this watches for itself.
 */
function LazyPicture({ src }: { src: string; }) {
    const ref = useRef<HTMLImageElement>(null);
    const [shown, setShown] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el || shown) return;

        const watcher = new IntersectionObserver(seen => {
            if (seen.some(entry => entry.isIntersecting)) {
                setShown(true);
                watcher.disconnect();
            }
        }, { rootMargin: "300px" });
        watcher.observe(el);
        return () => watcher.disconnect();
    }, [shown]);

    return <img ref={ref} src={shown ? src : undefined} alt="" />;
}

/** Everything of one kind in the catalogue, under the collection each belongs to */
function entriesOf(kind: Kind): Entry[] {
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
            return { skuId: p.skuId, name: p.name, collection: collection?.name ?? "Other", picture, item };
        });
}

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

/**
 * The shop, to choose from: every decoration, nameplate, effect and frame Discord sells, with
 * its real picture, grouped by collection the way the Shop groups them.
 *
 * Read from the same catalogue the Shop shows, fetched the same way the Shop fetches it the
 * first time it is opened. Choosing one only changes how the profile looks to you.
 */
export function CollectiblesTab({ look, set }: { look: Look; set(change: Partial<Look>): void; }) {
    const [kind, setKind] = useState<Kind>("decoration");
    const [query, setQuery] = useState("");
    const [state, setState] = useState<"loading" | "ready" | "failed">(() => CategoryStore?.categories?.size ? "ready" : "loading");

    useEffect(() => {
        if (state !== "loading") return;
        Promise.resolve(fetchCategories?.())
            .then(() => setState(CategoryStore?.categories?.size ? "ready" : "failed"))
            .catch(() => setState("failed"));
    }, [state]);

    const all = useMemo(() => state === "ready" ? entriesOf(kind) : [], [kind, state]);
    const wanted = query.trim().toLowerCase();
    const shown = wanted ? all.filter(e => e.name.toLowerCase().includes(wanted) || e.collection.toLowerCase().includes(wanted)) : all;

    // grouped by collection, in the order the catalogue gives them
    const groups: [string, Entry[]][] = [];
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
                    <div className={cl("shop-pic", "shop-pic-icon")}><UndoIcon height={28} width={28} /></div>
                    <span className={cl("shop-name")}>Real</span>
                </button>
                <button className={cl("shop-tile", value === NOTHING ? "shop-on" : "")} onClick={() => clear(NOTHING)}>
                    <div className={cl("shop-pic", "shop-pic-icon")}><CloseIcon height={28} width={28} /></div>
                    <span className={cl("shop-name")}>None</span>
                </button>
            </div>

            {state === "loading" && <div className={cl("empty-line")}>Loading the shop...</div>}
            {state === "failed" && (
                <div className={cl("empty-line")}>
                    Could not load the shop. <button className={cl("link")} onClick={() => setState("loading")}>Try again</button>
                </div>
            )}
            {state === "ready" && !shown.length && <div className={cl("empty-line")}>Nothing matches "{query}"</div>}

            {groups.map(([collection, entries]) => (
                <div key={collection} className={cl("group")}>
                    <div className={cl("group-head")}>
                        <span className={cl("f-label")}>{collection}</span>
                        <span className={cl("f-hint")}>{entries.length}</span>
                    </div>
                    <div className={cl("shop-grid")}>
                        {entries.map(e => (
                            <button
                                key={e.skuId}
                                className={cl("shop-tile", isWorn[kind](look, e) ? "shop-on" : "")}
                                title={e.item?.label ?? e.name}
                                onClick={() => set(apply[kind](e))}
                            >
                                <div className={cl("shop-pic", `shop-pic-${kind}`)}>
                                    {e.picture && <LazyPicture key={e.picture} src={e.picture} />}
                                </div>
                                <span className={cl("shop-name")}>{e.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
