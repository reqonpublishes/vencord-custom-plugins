/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcMainInvokeEvent } from "electron";

/**
 * The request itself, made from outside the page.
 *
 * Discord only lets its own window talk to a short list of addresses, and a link you chose is
 * not on it - measured, the same request made from the window simply fails. Adding an address
 * to that list is possible, but it means a permission prompt and a full restart for every
 * link, which is a lot to ask for a button that is meant to be pressed and forgotten.
 *
 * So the window asks this to make the request instead. Nothing is loosened for the page: it
 * can still only reach what Discord allows, and this will only ever speak to the one address
 * it is handed, over https, to read it or to write it.
 */
export async function request(_: IpcMainInvokeEvent, url: string, method: "GET" | "PUT", body?: string) {
    let target: URL;
    try {
        target = new URL(url);
    } catch {
        return { status: 0, text: "That is not an address" };
    }

    if (target.protocol !== "https:") return { status: 0, text: "Only https links can be synced" };
    if (method !== "GET" && method !== "PUT") return { status: 0, text: "Only reading and writing" };

    try {
        const answer = await fetch(target, {
            method,
            headers: body === undefined ? undefined : { "content-type": "application/json" },
            body
        });

        return { status: answer.status, text: await answer.text() };
    } catch (e) {
        return { status: 0, text: e instanceof Error ? e.message : String(e) };
    }
}
