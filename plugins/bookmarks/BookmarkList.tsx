/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { useEffect, useState } from "@webpack/common";

import { BookmarkIcon } from "./icons";
import { all, count, describe, load, onChange, remove } from "./store";
import { cl, Empty, Panel, Row } from "./ui";

/**
 * Everybody bookmarked, in the plugin's settings.
 *
 * The Bookmarked tab is the main way to see them, but it is not there while the plugin is
 * off or the screen is shared - and this is where you look for it when it is not.
 */
export function BookmarkList() {
    const [, redraw] = useState(0);

    useEffect(() => {
        const stop = onChange(() => redraw(n => n + 1));
        // Read here too, so the list is right even while the plugin is switched off.
        load();
        return stop;
    }, []);

    const people = all()
        .map(bookmark => ({ bookmark, ...describe(bookmark) }))
        .sort((a, b) => a.name.localeCompare(b.name));

    return (
        <Panel title="Bookmarked people" count={count()}>
            {!people.length && (
                <Empty
                    icon={BookmarkIcon}
                    title="Nobody bookmarked yet"
                    text="Right-click a person or a DM and choose Bookmark."
                />
            )}

            {!!people.length && (
                <div className={cl("rows")}>
                    {people.map(({ bookmark, name, username, image }) => (
                        <Row key={bookmark.id} image={image} name={name} detail={username}>
                            <Button size="small" variant="secondary" onClick={() => remove(bookmark.id)}>
                                Remove
                            </Button>
                        </Row>
                    ))}
                </div>
            )}
        </Panel>
    );
}
