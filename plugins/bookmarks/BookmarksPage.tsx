/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { openUserProfile } from "@utils/discord";
import { Avatar, PresenceStore, React, Tooltip, useEffect, useState, useStateFromStores } from "@webpack/common";

import { BookmarkIcon, ChatIcon, CloseIcon } from "./icons";
import { all, describe, onChange, openDM, remove } from "./store";
import { cl } from "./ui";

function RowButton({ label, onClick, danger, children }: { label: string; onClick(): void; danger?: boolean; children: React.ReactNode; }) {
    return (
        <Tooltip text={label}>
            {(props: any) => (
                <button
                    {...props}
                    aria-label={label}
                    className={cl("round", danger ? "round-danger" : "")}
                    onClick={event => {
                        // the row itself opens the profile; a button on it should not
                        event.stopPropagation();
                        onClick();
                    }}
                >
                    {children}
                </button>
            )}
        </Tooltip>
    );
}

const STATUS_WORDS: Record<string, string> = { online: "Online", idle: "Idle", dnd: "Do Not Disturb", streaming: "Streaming" };

/**
 * One bookmarked person, drawn the way the Friends tab beside this one draws a friend: their
 * picture with a live status dot, their name with the username beside it while the pointer is
 * over the row, and underneath their custom status - or Online, Idle, Offline.
 *
 * Clicking the row opens their profile, since a bookmark is of the person. The DM is a button.
 */
function Person({ id, image, name, username }: { id: string; image: string; name: string; username: string; }) {
    const [status, mobile, custom] = useStateFromStores([PresenceStore], () => {
        const activities: any[] = (PresenceStore as any).getActivities?.(id) ?? [];
        return [
            PresenceStore.getStatus(id) ?? "offline",
            !!(PresenceStore as any).isMobileOnline?.(id),
            String(activities.find(activity => activity?.type === 4)?.state ?? "")
        ] as const;
    });

    const open = () => openUserProfile(id);

    return (
        <div
            className={cl("person")}
            role="button"
            tabIndex={0}
            aria-label={`Open ${name}'s profile`}
            onClick={open}
            onKeyDown={event => {
                if (event.key === "Enter") open();
            }}
        >
            {image
                ? <Avatar className={cl("face")} src={image} size="SIZE_32" status={status} isMobile={mobile} />
                : <div className={cl("face", "face-blank")}>{name.slice(0, 1).toUpperCase()}</div>}
            <div className={cl("who")}>
                <div className={cl("names")}>
                    <span className={cl("name")}>{name}</span>
                    <span className={cl("username")}>{username}</span>
                </div>
                <div className={cl("status")}>{custom || STATUS_WORDS[status] || "Offline"}</div>
            </div>
            <div className={cl("buttons")}>
                <RowButton label="Message" onClick={() => openDM(id)}>
                    <ChatIcon height={20} width={20} />
                </RowButton>
                <RowButton label="Remove Bookmark" danger onClick={() => remove(id)}>
                    <CloseIcon height={20} width={20} />
                </RowButton>
            </div>
        </div>
    );
}

/**
 * The Bookmarked tab: everybody you have bookmarked, each one a click from their profile.
 *
 * Laid out the way Discord lays out the tabs beside it - a search box, a count, and rows
 * with a face, a name and the things you can do on the right - so it reads as part of the
 * Friends page rather than as something sitting on top of it.
 */
function BookmarksPage() {
    const [, redraw] = useState(0);
    const [query, setQuery] = useState("");

    useEffect(() => onChange(() => redraw(n => n + 1)), []);

    const wanted = query.trim().toLowerCase();
    const people = all()
        .map(bookmark => ({ bookmark, ...describe(bookmark) }))
        .filter(one => !wanted || one.name.toLowerCase().includes(wanted) || one.username.toLowerCase().includes(wanted))
        .sort((a, b) => a.name.localeCompare(b.name));

    return (
        <div className={cl("page")}>
            <input
                type="text"
                className={cl("search")}
                placeholder="Search"
                aria-label="Search bookmarks"
                value={query}
                onChange={event => setQuery(event.currentTarget.value)}
            />

            <div className={cl("count")}>Bookmarked &mdash; {people.length}</div>

            {!all().length && (
                <div className={cl("none")}>
                    <BookmarkIcon height={28} width={28} />
                    <div className={cl("none-title")}>Nobody bookmarked yet</div>
                    <div className={cl("none-text")}>Right-click someone, or open the ... menu on their profile, and choose Bookmark. They stay here even after you close their DM.</div>
                </div>
            )}

            <div className={cl("people")}>
                {people.map(({ bookmark, name, username, image }) => (
                    <Person key={bookmark.id} id={bookmark.id} image={image} name={name} username={username} />
                ))}
            </div>
        </div>
    );
}

export default ErrorBoundary.wrap(BookmarksPage, { noop: true });
