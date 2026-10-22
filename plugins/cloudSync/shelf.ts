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
 * The code is the whole of the security. There is no account and no password: a code is a
 * long random word, and holding it is what lets you read and write that shelf. That is why
 * it should be treated like a password.
 *
 * Only the code is ever shown or kept, never the server's address. The address is named once,
 * here, so moving to another server is a change to this line and nobody's code changes.
 */

import { PluginNative } from "@utils/types";

const Native = VencordNative.pluginHelpers.CloudSync as PluginNative<typeof import("./native")>;

const SERVER = "https://veil.veil-worker.workers.dev/sync/";

/** What the server accepts as a code: 16 to 80 letters, numbers, dashes or underscores */
const CODE = /^[A-Za-z0-9_-]{16,80}$/;

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

/** A code nobody else will guess, for somebody to put on their other device. */
export function makeCode(): string {
    const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const bytes = crypto.getRandomValues(new Uint8Array(32));

    let token = "";
    for (const byte of bytes) token += alphabet[byte % alphabet.length];

    return token;
}

/**
 * The code in whatever was typed or pasted.
 *
 * Older versions kept the whole link, and a phone that has not updated still shows one, so a
 * link is read as the code at its end.
 */
export function codeOf(text: string): string {
    const held = String(text ?? "").trim();

    try {
        const url = new URL(held);
        return url.pathname.split("/").filter(Boolean).pop() ?? "";
    } catch {
        return held;
    }
}

/** Whether something is a code the server will take. Checked before anything is sent. */
export const isCode = (text: string) => CODE.test(codeOf(text));

const addressOf = (code: string) => SERVER + codeOf(code);

/** What is on the shelf now, or an empty one if nothing has been put there yet. */
export async function fetchShelf(code: string): Promise<Fetched> {
    const answer = await Native.request(addressOf(code), "GET");

    // Nothing there yet is an ordinary answer, not a failure: it is what a new link says.
    if (answer.status === 404) return { at: null, shelf: { ...EMPTY } };
    if (answer.status < 200 || answer.status >= 300) throw new Error(describe(answer));

    let body: any = null;
    try {
        body = JSON.parse(answer.text);
    } catch {
        throw new Error("The sync server answered with something unreadable");
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

export async function sendShelf(code: string, shelf: Shelf): Promise<string | null> {
    const answer = await Native.request(addressOf(code), "PUT", JSON.stringify(shelf));
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
        ? "The sync server answered " + answer.status
        : "Could not reach the sync server - " + answer.text;
}
