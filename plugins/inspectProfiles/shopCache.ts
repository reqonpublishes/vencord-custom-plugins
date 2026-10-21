/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createStore, get, set } from "@api/DataStore";

/**
 * The shop, kept on this computer: its pictures, and the list of what it sells.
 *
 * Discord lets the app keep a shop picture for one day (max-age=86400, measured), and asks for
 * the list again every time Discord starts. On a slow connection that is hundreds of pictures
 * downloaded over and over. Each picture is downloaded once here and kept, and the list is kept
 * from the last time it was seen, so the shop opens straight away and fills in from this
 * computer. The list is still asked for each time, and replaces the kept one when it arrives.
 */

const pictures = createStore("InspectProfilesShop", "pictures");
const LIST_KEY = "InspectProfiles_ShopList";

/** Pictures already turned into something an <img> can show, this session */
const ready = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

/** A picture already on hand, so it can be drawn without waiting at all */
export const pictureNow = (url: string) => ready.get(url);

/** A picture from this computer, or downloaded once and kept */
export function loadPicture(url: string): Promise<string> {
    const have = ready.get(url);
    if (have) return Promise.resolve(have);

    let loading = pending.get(url);
    if (!loading) {
        loading = (async () => {
            let blob = await get<Blob>(url, pictures).catch(() => undefined);
            if (!blob) {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`${response.status} for ${url}`);
                blob = await response.blob();
                void set(url, blob, pictures).catch(() => { });
            }

            const shown = URL.createObjectURL(blob);
            ready.set(url, shown);
            return shown;
        })().finally(() => pending.delete(url));
        pending.set(url, loading);
    }
    return loading;
}

/** The shop's list as it was last seen */
export const keptList = <T>() => get<T>(LIST_KEY).catch(() => undefined);

export const keepList = (list: unknown) => set(LIST_KEY, list).catch(() => { });
