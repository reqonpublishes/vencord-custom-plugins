/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@api/Styles";
import { Button } from "@components/Button";
import { useForceUpdater } from "@utils/react";

import {
    clearRequest, counts, hideAllFriends, listed, nameOf, removeFakeFriend, restoreEverything,
    restoreRequest, showAllFriends, showFriend, unblockUser
} from "./store";

const cl = classNameFactory("vc-chf-");

function Group({ title, rows, undo, onChange }: {
    title: string;
    rows: [string, string][];
    undo: { label: string; run(id: string): void; };
    onChange(): void;
}) {
    if (!rows.length) return null;

    return (
        <div className={cl("group")}>
            <div className={cl("title")}>{title} ({rows.length})</div>
            {rows.map(([id, name]) => (
                <div className={cl("row")} key={id}>
                    <span className={cl("name")}>{name || nameOf(id)}</span>
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
                </div>
            ))}
        </div>
    );
}

/**
 * Everybody this client is pretending something about, and the way back for each.
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
        <div className={cl("list")}>
            <div className={cl("buttons")}>
                <Button
                    size="small"
                    onClick={() => {
                        hideAllFriends();
                        update();
                    }}
                >
                    Hide all friends
                </Button>
                <Button
                    size="small"
                    variant="secondary"
                    disabled={!n.hidden}
                    onClick={() => {
                        showAllFriends();
                        update();
                    }}
                >
                    Show all friends
                </Button>
                <Button
                    size="small"
                    variant="dangerSecondary"
                    disabled={!any}
                    onClick={() => {
                        restoreEverything();
                        update();
                    }}
                >
                    Put everyone back
                </Button>
            </div>

            {!any && <div className={cl("empty")}>Nobody is hidden or faked.</div>}

            <Group title="Shown as not added" rows={all.hidden} undo={{ label: "Show", run: showFriend }} onChange={update} />
            <Group title="Shown as blocked" rows={all.blocked} undo={{ label: "Unblock", run: unblockUser }} onChange={update} />
            <Group title="Shown as friends" rows={all.friended} undo={{ label: "Remove", run: removeFakeFriend }} onChange={update} />
            <Group title="Requests shown as received" rows={all.incoming} undo={{ label: "Remove", run: clearRequest }} onChange={update} />
            <Group
                title="Requests shown as sent"
                rows={all.pending.map(id => [id, nameOf(id)] as [string, string])}
                undo={{ label: "Remove", run: clearRequest }}
                onChange={update}
            />
            <Group title="Real requests hidden" rows={all.dismissed} undo={{ label: "Restore", run: restoreRequest }} onChange={update} />
        </div>
    );
}
