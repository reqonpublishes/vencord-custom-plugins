/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { Message } from "@vencord/discord-types";
import { findByProps } from "@webpack";
import { MessageStore, showToast } from "@webpack/common";

import { isFake, removeMessage } from "./store";

const logger = new Logger("FakeMessages");

/** Open the editor on a fake message. Editing one is Inspect Messages' job, so it is asked */
export function editFake(message: Message) {
    const inspect = (window as any).Vencord?.Plugins?.plugins?.InspectMessages;

    if (inspect?.started && typeof inspect.inspect === "function") inspect.inspect(message);
    else showToast({ text: "Turn on Inspect Messages to edit a fake message", variant: "default" });
}

/** Discord's message actions: the module behind Edit, Delete and Reply */
let actions: any = null;
/** What was there before, so stopping puts back exactly that */
const originals: Record<string, any> = {};
/** The replacements as put in, so stopping only takes back what is still ours */
const ours: Record<string, any> = {};

/**
 * Make Discord's own Edit, Delete and Reply work on a fake message.
 *
 * Left alone, each of them asks Discord's server to do something to a message it has never
 * heard of, which fails. So for a fake one they do here what they would have done there:
 * Edit opens the editor Edit Fake Message opens, Delete takes it away, and a reply to one is
 * sent as a plain message, since a reply pointing at it would be refused.
 *
 * The functions are replaced on the module itself rather than wrapped by the patcher.
 * Discord calls them through that object - its own code included - so replacing the property
 * is what every caller sees.
 */
const replacements: Record<string, (original: any) => (this: any, ...args: any[]) => any> = {
    // The hover Edit button, the menu entry and the up arrow all start here.
    startEditMessageRecord: original => function (this: any, channelId: string, message: any, ...rest: any[]) {
        if (message?.id && isFake(channelId, message.id)) return void editFake(message);
        return original.call(this, channelId, message, ...rest);
    },

    startEditMessage: original => function (this: any, channelId: string, messageId: string, ...rest: any[]) {
        if (isFake(channelId, messageId)) {
            const message = MessageStore.getMessage(channelId, messageId);
            if (message) return void editFake(message);
        }
        return original.call(this, channelId, messageId, ...rest);
    },

    // After Discord's own Are you sure, or straight away with Shift held - the same as a real one.
    deleteMessage: original => function (this: any, ...args: any[]) {
        const [channelId, messageId] = args;
        if (isFake(channelId, messageId)) {
            removeMessage(channelId, messageId);
            return Promise.resolve();
        }
        // passed on exactly as given: Discord reads how many arguments there were
        return original.apply(this, args);
    },

    // What a reply is sent with. Nothing to point at means it goes as an ordinary message.
    getSendMessageOptionsForReply: original => function (this: any, reply: any, ...rest: any[]) {
        if (reply?.channel?.id && reply?.message?.id && isFake(reply.channel.id, reply.message.id)) return {};
        return original.call(this, reply, ...rest);
    }
};

export function startNative() {
    try {
        actions ??= findByProps("startEditMessageRecord", "deleteMessage", "getSendMessageOptionsForReply");
    } catch (e) {
        logger.error("Could not find Discord's message actions", e);
        return;
    }

    for (const [name, replace] of Object.entries(replacements)) {
        const original = actions[name];
        if (typeof original !== "function" || name in originals) continue;

        originals[name] = original;
        actions[name] = ours[name] = replace(original);
    }
}

export function stopNative() {
    if (!actions) return;

    for (const [name, original] of Object.entries(originals)) {
        if (actions[name] === ours[name]) actions[name] = original;
        delete originals[name];
        delete ours[name];
    }
}
