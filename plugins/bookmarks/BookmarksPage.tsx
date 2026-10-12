/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { openPrivateChannel, openUserProfile } from "@utils/discord";
import { React, Tooltip, useEffect, useState } from "@webpack/common";

import { BookmarkIcon, ChatIcon, CloseIcon, PersonIcon } from "./icons";
import { all, describe, onChange, remove } from "./store";
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
                        // the row itself opens the conversation; a button on it should not
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

/**
 * The Bookmarked tab: everybody you have bookmarked, each one a click from their DM.
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
                    <div className={cl("none-text")}>Right-click a person or a DM and choose Bookmark. Then you can close the DM and find them here.</div>
                </div>
            )}

            <div className={cl("people")}>
                {people.map(({ bookmark, name, username, image }) => (
                    <div
                        key={bookmark.id}
                        className={cl("person")}
                        role="button"
                        tabIndex={0}
                        onClick={() => openPrivateChannel(bookmark.id)}
                        onKeyDown={event => {
                            if (event.key === "Enter") openPrivateChannel(bookmark.id);
                        }}
                    >
                        {image
                            ? <img className={cl("face")} src={image} alt="" />
                            : <div className={cl("face", "face-blank")}>{name.slice(0, 1).toUpperCase()}</div>}
                        <div className={cl("who")}>
                            <div className={cl("name")}>{name}</div>
                            <div className={cl("username")}>{username}</div>
                        </div>
                        <div className={cl("buttons")}>
                            <RowButton label="Message" onClick={() => openPrivateChannel(bookmark.id)}>
                                <ChatIcon height={20} width={20} />
                            </RowButton>
                            <RowButton label="Profile" onClick={() => openUserProfile(bookmark.id)}>
                                <PersonIcon height={20} width={20} />
                            </RowButton>
                            <RowButton label="Remove Bookmark" danger onClick={() => remove(bookmark.id)}>
                                <CloseIcon height={20} width={20} />
                            </RowButton>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default ErrorBoundary.wrap(BookmarksPage, { noop: true });
