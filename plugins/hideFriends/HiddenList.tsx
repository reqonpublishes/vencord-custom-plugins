/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { useForceUpdater } from "@utils/react";

import { EyeIcon, EyeOffIcon, PersonOffIcon, UndoIcon } from "./icons";
import {
    clearRequest, counts, hideAllFriends, infoOf, listed, removeFakeFriend, restoreEverything,
    restoreRequest, showAllFriends, showFriend, unblockUser
} from "./store";
import { cl, Empty, IconButton, Panel, Row } from "./ui";

function Group({ title, rows, undo, onChange }: {
    title: string;
    rows: [string, string][];
    undo: { label: string; run(id: string): void; };
    onChange(): void;
}) {
    if (!rows.length) return null;

    return (
        <>
            <div className={cl("group-title")}>{title} &mdash; {rows.length}</div>
            {rows.map(([id, stored]) => {
                const info = infoOf(id, stored);

                return (
                    <Row key={id} image={info.image} name={info.name} detail={info.detail}>
                        <Button
                            size="small"
                            variant="secondary"
                            onClick={() => {
                                undo.run(id);
                                onChange();
                            }}
                        >
                            {undo.label}
                        </Button>
                    </Row>
                );
            })}
        </>
    );
}

/**
 * Everybody this client is showing differently, and the way back for each.
 *
 * The list is the way back because the usual one is gone: somebody shown as not added is not
 * in your friends list to be right-clicked.
 */
export function HiddenList() {
    const update = useForceUpdater();
    const all = listed();
    const n = counts();
    const any = n.hidden + n.blocked + n.pending + n.incoming + n.dismissed + n.friended;

    return (
        <Panel
            title="Hidden and faked"
            count={any}
            actions={
                <>
                    <IconButton
                        icon={EyeOffIcon}
                        onClick={() => {
                            hideAllFriends();
                            update();
                        }}
                    >
                        Hide All
                    </IconButton>
                    <IconButton
                        icon={EyeIcon}
                        variant="secondary"
                        disabled={!n.hidden}
                        onClick={() => {
                            showAllFriends();
                            update();
                        }}
                    >
                        Unhide All
                    </IconButton>
                    <IconButton
                        icon={UndoIcon}
                        variant="dangerSecondary"
                        disabled={!any}
                        onClick={() => {
                            restoreEverything();
                            update();
                        }}
                    >
                        Reset
                    </IconButton>
                </>
            }
        >
            {!any && (
                <Empty
                    icon={PersonOffIcon}
                    title="Nobody is hidden or faked"
                    text="Right-click a friend and choose Hide Friend, or hide them all at once."
                />
            )}

            {!!any && (
                <div className={cl("rows")}>
                    <Group title="Hidden friends" rows={all.hidden} undo={{ label: "Unhide", run: showFriend }} onChange={update} />
                    <Group title="Fake blocks" rows={all.blocked} undo={{ label: "Remove", run: unblockUser }} onChange={update} />
                    <Group title="Fake friends" rows={all.friended} undo={{ label: "Remove", run: removeFakeFriend }} onChange={update} />
                    <Group title="Fake incoming requests" rows={all.incoming} undo={{ label: "Remove", run: clearRequest }} onChange={update} />
                    <Group
                        title="Fake outgoing requests"
                        rows={all.pending.map(id => [id, ""] as [string, string])}
                        undo={{ label: "Remove", run: clearRequest }}
                        onChange={update}
                    />
                    <Group title="Hidden friend requests" rows={all.dismissed} undo={{ label: "Unhide", run: restoreRequest }} onChange={update} />
                </div>
            )}
        </Panel>
    );
}
