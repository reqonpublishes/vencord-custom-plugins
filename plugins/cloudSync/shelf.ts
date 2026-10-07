/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * The shelf: one address holding one blob of JSON.
 *
 * This client and the phone keep the same things in different shapes - a desktop list of
 * hidden messages is not laid out like a phone's - so neither can read the other's storage
 * directly. What they can agree on is a single document in the middle, in one shape both
 * know how to read and write.
 *
 * The link is the whole of the security. There is no account and no password: a link is a
 * long random word, and holding it is what lets you read and write that shelf. That is why
 * it is generated rather than typed, and why it should be treated like a password.
 */

import { PluginNative } from "@utils/types";

const Native = VencordNative.pluginHelpers.CustomPluginSync as PluginNative<typeof import("./native")>;

export const DEFAULT_BASE = "https://veil.veil-worker.workers.dev/sync/";

/** The shape both clients write. Anything not listed here is carried across untouched. */
export interface Shelf {
    version: number;
    /** set by whichever client last sent, for the line under the buttons */
    from?: string;
    plugins: Record<string, any>;
}

export interface Fetched {
    /** when the shelf was last written, as the server saw it */
    at: string | null;
    shelf: Shelf;
}

const EMPTY: Shelf = { version: 1, plugins: {} };

/** A link somebody can be handed: the address of a shelf nobody else will guess. */
export function makeLink(base = DEFAULT_BASE): string {
    const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const bytes = crypto.getRandomValues(new Uint8Array(32));

    let token = "";
    for (const byte of bytes) token += alphabet[byte % alphabet.length];

    return base.replace(/\/+$/, "") + "/" + token;
}

/**
 * Whether an address looks like a shelf.
 *
 * Checked before anything is sent rather than after it fails: a typo in a link is a request
 * to somebody else's server carrying your hidden conversations, and the point of asking is
 * that it never leaves.
 */
export function looksLikeLink(link: string): boolean {
    try {
        const url = new URL(link.trim());
        if (url.protocol !== "https:") return false;

        const token = url.pathname.split("/").filter(Boolean).pop() ?? "";
        return /^[A-Za-z0-9_-]{16,80}$/.test(token);
    } catch {
        return false;
    }
}

/** What is on the shelf now, or an empty one if nothing has been put there yet. */
export async function fetchShelf(link: string): Promise<Fetched> {
    const answer = await Native.request(link.trim(), "GET");

    // Nothing there yet is an ordinary answer, not a failure: it is what a new link says.
    if (answer.status === 404) return { at: null, shelf: { ...EMPTY } };
    if (answer.status < 200 || answer.status >= 300) throw new Error(describe(answer));

    let body: any = null;
    try {
        body = JSON.parse(answer.text);
    } catch {
        throw new Error("That link did not answer with a shelf");
    }

    const shelf = body?.data ?? body;

    return {
        at: typeof body?.at === "string" ? body.at : null,
        shelf: {
            version: Number(shelf?.version) || 1,
            from: typeof shelf?.from === "string" ? shelf.from : undefined,
            plugins: (shelf?.plugins && typeof shelf.plugins === "object") ? shelf.plugins : {}
        }
    };
}

export async function sendShelf(link: string, shelf: Shelf): Promise<string | null> {
    const answer = await Native.request(link.trim(), "PUT", JSON.stringify(shelf));
    if (answer.status < 200 || answer.status >= 300) throw new Error(describe(answer));

    try {
        const body = JSON.parse(answer.text);
        return typeof body?.at === "string" ? body.at : null;
    } catch {
        return null;
    }
}

/** A failure in words. Nought is not a status: it means the request never got anywhere. */
function describe(answer: { status: number; text: string; }): string {
    return answer.status
        ? "The shelf answered " + answer.status
        : "Could not reach the link - " + answer.text;
}
