/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./forward.css";

import { ModalAction, RenderModalProps } from "@vencord/discord-types";
import { ChannelStore, Modal, openModal, showToast, TextArea, UserStore, useState } from "@webpack/common";

import { ChatIcon, LockIcon } from "./icons";
import { addMessage } from "./store";
import { cl } from "./ui";

/** A conversation as the picker draws it */
function describe(channel: any): { name: string; detail: string; image: string | null; } {
    const ids: string[] = channel.recipients ?? [];

    if (channel.type === 3) {
        const names = ids.map(id => (UserStore.getUser(id) as any)?.globalName ?? UserStore.getUser(id)?.username).filter(Boolean);
        return { name: channel.name || names.join(", ") || "Group", detail: `${ids.length + 1} members`, image: null };
    }

    const user: any = UserStore.getUser(ids[0]);
    return {
        name: user?.globalName ?? user?.username ?? "Unknown user",
        detail: user ? "@" + user.username : "",
        image: user?.getAvatarURL?.(undefined, 64) ?? null
    };
}

export interface ForwardOf {
    /** where the original sits, so the forward can say where it came from */
    channelId: string;
    messageId: string;
    /** what it says, as it reads on screen - rewritten, if it has been */
    content: string;
    sentAt: number;
}

/**
 * Forward a fake message, the way Discord's own Forward does.
 *
 * A real forward is sent to Discord and points at a message Discord has. This one has
 * nothing to point at, so it cannot be sent - what it can do is show up. Each conversation
 * picked gets a forwarded message from you, now, carrying the fake one inside it exactly as a
 * real forward carries its original, and like every fake message it exists only here.
 */
function ForwardModal({ rootProps, of }: { rootProps: RenderModalProps; of: ForwardOf; }) {
    const me: any = UserStore.getCurrentUser();
    const [query, setQuery] = useState("");
    const [picked, setPicked] = useState<string[]>([]);
    const [note, setNote] = useState("");

    const wanted = query.trim().toLowerCase();
    const channels = (ChannelStore as any).getSortedPrivateChannels()
        .map((channel: any) => ({ channel, ...describe(channel) }))
        .filter((one: any) => !wanted || one.name.toLowerCase().includes(wanted) || one.detail.toLowerCase().includes(wanted))
        .slice(0, 40);

    const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter(other => other !== id) : [...picked, id]);

    const send = () => {
        const now = Date.now();

        for (const channelId of picked) {
            addMessage({
                channelId,
                authorId: me.id,
                content: "",
                sentAt: now,
                forward: of
            });

            // The note goes after it, as a message of its own - which is how Discord sends one.
            if (note.trim()) addMessage({ channelId, authorId: me.id, content: note.trim(), sentAt: now + 1000 });
        }

        rootProps.onClose();
        showToast({ text: picked.length === 1 ? "Forwarded" : `Forwarded to ${picked.length} conversations`, variant: "success" });
    };

    const actions: ModalAction[] = [
        { text: picked.length > 1 ? `Send to ${picked.length}` : "Send", variant: "primary", onClick: () => picked.length && send() },
        { text: "Cancel", variant: "secondary", onClick: rootProps.onClose }
    ];

    return (
        <Modal {...rootProps} size="md" title="Forward To" actions={actions}>
            <section className={cl("section")}>
                <input
                    type="text"
                    className={cl("input")}
                    placeholder="Search"
                    aria-label="Search conversations"
                    value={query}
                    onChange={event => setQuery(event.currentTarget.value)}
                />
            </section>

            <section className={cl("section")}>
                <div className={cl("choices", "forward-list")}>
                    {channels.map(({ channel, name, detail, image }: any) => {
                        const on = picked.includes(channel.id);

                        return (
                            <button key={channel.id} className={cl("choice", "forward-row", on ? "choice-on" : "")} onClick={() => toggle(channel.id)}>
                                {image
                                    ? <img src={image} alt="" />
                                    : <div className={cl("choice-blank")}><ChatIcon height={16} width={16} /></div>}
                                <div className={cl("choice-text")}>
                                    <div className={cl("choice-name")}>{name}</div>
                                    <div className={cl("choice-detail")}>{detail}</div>
                                </div>
                                <div className={cl("tick", on ? "tick-on" : "")} />
                            </button>
                        );
                    })}
                </div>
            </section>

            <section className={cl("section", "section-last")}>
                <TextArea value={note} onChange={(next: string) => setNote(next)} placeholder="Add an optional message..." rows={2} />
                <div className={cl("footnote")}>
                    <LockIcon height={14} width={14} />
                    <span>Only you can see this forward. Nothing is sent.</span>
                </div>
            </section>
        </Modal>
    );
}

export const openForward = (of: ForwardOf) =>
    openModal(rootProps => <ForwardModal rootProps={rootProps} of={of} />);
