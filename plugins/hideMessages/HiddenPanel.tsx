/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { closeAllModals } from "@utils/modal";
import { useForceUpdater } from "@utils/react";
import { ChannelStore, NavigationRouter, React, UserStore } from "@webpack/common";

import { ChatIcon, ChevronDownIcon, EyeIcon, EyeOffIcon } from "./icons";
import { placeOf } from "./places";
import { clearAll, detailsFor, perChat, previewOf, restoreChat, showChannel, showMessage, showRange, showWhole, snapshotChat } from "./store";
import { cl, Empty, IconButton, Panel, RoundButton, Row } from "./ui";
import { remember } from "./undo";

/** Change one chat's hides so that Ctrl+Z puts it back */
function undoable(channelId: string, label: string, run: () => void) {
    const before = snapshotChat(channelId);
    run();
    remember(label, () => restoreChat(channelId, before));
}

/** Unhide everything, so that Ctrl+Z hides it all again */
function unhideAll() {
    const before = perChat().map(({ channelId }) => [channelId, snapshotChat(channelId)] as const);
    clearAll();
    remember("Unhide All", () => before.forEach(([channelId, snap]) => restoreChat(channelId, snap)));
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** When a message was sent, read off its id */
function sentAt(id: string): string {
    try {
        const at = new Date(Number(BigInt(id) >> 22n) + 1420070400000);
        return at.toLocaleString(undefined, { day: "numeric", month: "short", year: at.getFullYear() === new Date().getFullYear() ? undefined : "numeric", hour: "numeric", minute: "2-digit" });
    } catch {
        return "";
    }
}

function openChat(channelId: string) {
    const channel = ChannelStore.getChannel(channelId);
    closeAllModals();
    NavigationRouter.transitionTo(`/channels/${channel?.guild_id ?? "@me"}/${channelId}`);
}

/** One hidden thing inside a conversation: a message, a stretch, or everything before a moment */
function Item({ image, name, time, text, unhide }: { image?: string | null; name: string; time?: string; text?: string; unhide(): void; }) {
    return (
        <div className={cl("item")}>
            {image ? <img className={cl("item-face")} src={image} alt="" /> : <div className={cl("item-face", "item-face-blank")}><EyeOffIcon height={12} width={12} /></div>}
            <div className={cl("item-text")}>
                <div className={cl("item-head")}>
                    <span className={cl("item-name")}>{name}</span>
                    {time && <span className={cl("item-time")}>{time}</span>}
                </div>
                {text && <div className={cl("item-body")}>{text}</div>}
            </div>
            <RoundButton icon={EyeIcon} label="Unhide" onClick={unhide} />
        </div>
    );
}

/** What is hidden in one conversation, listed out */
function Inside({ channelId, onChange }: { channelId: string; onChange(): void; }) {
    const { messages, ranges, since } = detailsFor(channelId);
    const run = (action: () => void) => () => {
        action();
        onChange();
    };

    return (
        <div className={cl("inside")}>
            {since && (
                <Item name="Everything before" time={sentAt(since)} text="New messages still show" unhide={run(() => undoable(channelId, "Unhide Messages", () => showWhole(channelId)))} />
            )}
            {ranges.map(([from, to]) => (
                <Item key={from + to} name="Messages" time={`${sentAt(from)} – ${sentAt(to)}`} unhide={run(() => undoable(channelId, "Unhide Messages", () => showRange(channelId, from, to)))} />
            ))}
            {messages.map(id => {
                const preview = previewOf(channelId, id);
                const author: any = preview?.a ? UserStore.getUser(preview.a) : null;

                return (
                    <Item
                        key={id}
                        image={author?.getAvatarURL?.(undefined, 40)}
                        name={preview?.n || "Message"}
                        time={sentAt(id)}
                        text={preview ? preview.t || "No text" : "Not loaded - open the chat to load it"}
                        unhide={run(() => undoable(channelId, "Unhide Message", () => showMessage(channelId, id)))}
                    />
                );
            })}
        </div>
    );
}

/**
 * Every conversation with something hidden in it.
 *
 * Each opens to what is hidden inside - who sent it, when, and what it said - with a way back
 * for each one, and for the whole conversation at once.
 */
export function HiddenPanel() {
    const update = useForceUpdater();
    const [open, setOpen] = React.useState<string | null>(null);
    const places = perChat();

    return (
        <Panel
            title="Hidden messages"
            count={places.length}
            actions={places.length ? (
                <IconButton icon={EyeIcon} variant="secondary" onClick={() => { unhideAll(); update(); }}>Unhide All</IconButton>
            ) : undefined}
        >
            {!places.length ? (
                <Empty icon={EyeOffIcon} title="Nothing hidden" text="Right-click a message and choose Hide Message, or a conversation to hide all of it." />
            ) : (
                <div className={cl("rows")}>
                    {places.map(({ channelId, messages, ranges, whole }) => {
                        const place = placeOf(channelId);
                        const what = [whole && "Everything before a date", messages && plural(messages, "message"), ranges && plural(ranges, "stretch")].filter(Boolean).join(", ");
                        const isOpen = open === channelId;

                        return (
                            <div key={channelId} className={cl("chat", isOpen ? "chat-open" : "")}>
                                <Row
                                    image={place.image}
                                    icon={EyeOffIcon}
                                    name={place.name}
                                    detail={[what, place.detail].filter(Boolean).join(" · ")}
                                    title={isOpen ? "Close" : "Show what is hidden"}
                                    onClick={() => setOpen(isOpen ? null : channelId)}
                                >
                                    <RoundButton icon={ChatIcon} label="Open Chat" onClick={() => openChat(channelId)} />
                                    <RoundButton icon={EyeIcon} label="Unhide All Here" onClick={() => { undoable(channelId, "Unhide Messages", () => showChannel(channelId)); update(); }} />
                                    <ChevronDownIcon className={cl("chevron")} height={18} width={18} />
                                </Row>
                                {isOpen && <Inside channelId={channelId} onChange={update} />}
                            </div>
                        );
                    })}
                </div>
            )}
        </Panel>
    );
}
