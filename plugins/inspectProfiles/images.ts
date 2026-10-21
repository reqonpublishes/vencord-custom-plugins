/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { del, get, set } from "@api/DataStore";
import { Logger } from "@utils/Logger";

const logger = new Logger("InspectProfiles");

/**
 * Pictures from this computer, for avatars and banners that are not on the internet.
 *
 * A look holds a short reference ("vcip-image:<id>") rather than the picture itself, and each
 * picture is kept once under its own key. So a preset with an uploaded banner is a few bytes,
 * however many times it is copied, and saving a name change does not rewrite a megabyte of image.
 *
 * Discord is handed an address it can draw from straight away: a blob made from the stored
 * picture when it is first needed and kept for as long as Discord is open.
 */

export const PREFIX = "vcip-image:";
const KEY = (id: string) => `InspectProfiles_Image_${id}`;
const INDEX = "InspectProfiles_Images";

export const isStored = (value?: string) => !!value && value.startsWith(PREFIX);
const idOf = (ref: string) => ref.slice(PREFIX.length);

/** id -> an address Discord can draw */
const ready = new Map<string, string>();
/** ids being read from disk, so a burst of asks is one read */
const reading = new Map<string, Promise<void>>();

let onReady: (() => void) | null = null;

/** Told whenever a picture becomes drawable, so whatever is showing can draw it */
export const whenReady = (callback: () => void) => void (onReady = callback);

/** The address for a reference now, or undefined while it is still being read */
export function urlOf(ref: string): string | undefined {
    const id = idOf(ref);
    const url = ready.get(id);
    if (url) return url;

    void load(id);
    return undefined;
}

function load(id: string) {
    let pending = reading.get(id);
    if (pending) return pending;

    pending = (async () => {
        try {
            const blob = await get<Blob>(KEY(id));
            if (!blob) return;

            ready.set(id, URL.createObjectURL(blob));
            onReady?.();
        } catch (e) {
            logger.error("Could not read a stored picture", e);
        }
    })();

    reading.set(id, pending);
    return pending;
}

/** Read every stored picture these looks mention, before anything asks for them */
export async function preload(refs: (string | undefined)[]) {
    await Promise.all(refs.filter(isStored).map(ref => load(idOf(ref!))));
}

// ---------------------------------------------------------------- keeping one

/** Biggest each kind is kept at: plenty for the largest place Discord draws it */
const LIMIT = { avatar: 512, banner: 1200 } as const;

/**
 * Make a picture a sensible size.
 *
 * A photo straight off a phone is several megabytes and several thousand pixels wide, which
 * Discord would scale down on every draw. A GIF is kept exactly as it is - drawing it to a
 * canvas would keep only its first frame and lose the animation that is the point of it.
 */
async function shrink(file: Blob, kind: keyof typeof LIMIT): Promise<Blob> {
    if (file.type === "image/gif") return file;

    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, LIMIT[kind] / Math.max(bitmap.width, kind === "banner" ? bitmap.width : bitmap.height));
        if (scale === 1 && file.size < 1_500_000) return file;

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

        return await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("could not encode")), "image/webp", 0.92));
    } catch (e) {
        logger.error("Could not resize a picture, keeping it as it is", e);
        return file;
    }
}

/** Named by what is in it, so the same picture chosen twice is kept once */
async function nameFor(blob: Blob) {
    const digest = await crypto.subtle.digest("SHA-1", await blob.arrayBuffer());
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

/** Keep a picture and give back the reference a look holds */
export async function keep(file: Blob, kind: keyof typeof LIMIT): Promise<string> {
    if (!file.type.startsWith("image/")) throw new Error("That is not a picture");

    const blob = await shrink(file, kind);
    const id = await nameFor(blob);

    if (!ready.has(id)) {
        await set(KEY(id), blob);
        ready.set(id, URL.createObjectURL(blob));
        const index = (await get<string[]>(INDEX)) ?? [];
        if (!index.includes(id)) await set(INDEX, [...index, id]);
    }

    return PREFIX + id;
}

/** Let go of pictures nothing uses any more, so the disk does not fill with old banners */
export async function forgetUnused(inUse: (string | undefined)[]) {
    const keep = new Set(inUse.filter(isStored).map(ref => idOf(ref!)));
    const index = (await get<string[]>(INDEX)) ?? [];
    const gone = index.filter(id => !keep.has(id));
    if (!gone.length) return;

    for (const id of gone) {
        await del(KEY(id));
        const url = ready.get(id);
        if (url) URL.revokeObjectURL(url);
        ready.delete(id);
        reading.delete(id);
    }

    await set(INDEX, index.filter(id => keep.has(id)));
}
