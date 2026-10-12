/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { findStore } from "@webpack";
import { FluxDispatcher } from "@webpack/common";

import { isLive } from "./store";

const logger = new Logger("FakeCalls");

let callStore: any = null;
let patched = false;

function store(): any {
    if (callStore) return callStore;

    try {
        callStore = findStore("CallStore");
    } catch { /* not built yet */ }

    return callStore;
}

/**
 * Make a call that is still going look like one.
 *
 * A call in the history is a message, and the message alone only ever says "started a
 * call". The Join button beside it is not part of the message: Discord shows it when it
 * believes that call is in progress right now, which it asks its call store. So for the calls
 * added here that have no end, the store answers that yes, that one is.
 *
 * Only for that one question about that one message. Whether there is a call in the
 * conversation at all - which is what the header and the ringing are driven by - is left
 * alone, so nothing starts ringing and the real call buttons go on telling the truth.
 */
function patch() {
    if (patched) return;

    const target = store();
    if (!target || typeof target.isCallActive !== "function") return;

    try {
        const proto = Object.getPrototypeOf(target);

        target.isCallActive = function (this: any, channelId: string, messageId?: string, ...rest: any[]) {
            if (messageId != null && isLive(channelId, messageId)) return true;
            return proto.isCallActive.call(this, channelId, messageId, ...rest);
        };

        patched = true;
    } catch (e) {
        logger.error("Could not make ongoing calls look ongoing", e);
    }
}

/** Have anything showing a call look again at whether it is going */
export function redrawCalls() {
    try {
        store()?.emitChange?.();
    } catch { /* nothing showing one */ }
}

/**
 * Keep the Join button on an added call from joining anything.
 *
 * The button is Discord's own, and pressing it does what it always does: it connects you to
 * a call in that conversation - and with no call there, that starts one and rings the other
 * person. An added call must never do that. So a click anywhere on one of them is stopped
 * here, before Discord hears about it. Right-clicking still works, which is how one is removed.
 */
function swallow(event: MouseEvent) {
    const target = event.target as Element | null;
    // Anywhere on the row: the way in is a link in the line of text rather than a button,
    // and which words it is depends on the language.
    const row = target?.closest?.('[id^="chat-messages-"]');
    if (!row) return;

    const [channelId, messageId] = row.id.slice("chat-messages-".length).split("-");
    if (!channelId || !messageId || !isLive(channelId, messageId)) return;

    event.stopPropagation();
    event.preventDefault();
}

/** The store is built late on some loads, so it is tried again as conversations are opened */
const tryAgain = () => patch();

export function startLive() {
    patch();
    FluxDispatcher.subscribe("CHANNEL_SELECT", tryAgain);
    window.addEventListener("click", swallow, true);
    redrawCalls();
}

export function stopLive() {
    FluxDispatcher.unsubscribe("CHANNEL_SELECT", tryAgain);
    window.removeEventListener("click", swallow, true);

    if (patched) {
        delete store().isCallActive;
        patched = false;
    }

    redrawCalls();
}
