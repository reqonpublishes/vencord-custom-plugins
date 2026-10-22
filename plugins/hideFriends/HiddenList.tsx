/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { useForceUpdater } from "@utils/react";

import { clearAll, counts, hideAllFriends, infoOf, listed, restoreRequest, showAllFriends, showFriend } from "./friends";
import { EyeIcon, EyeOffIcon, PersonOffIcon } from "./icons";
import { cl, Empty, IconButton, Panel, Row } from "./ui";

function Group({ title, rows, run, onChange }: {
    title: string;
    rows: [string, string][];
    run(id: string): void;
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
                                run(id);
                                onChange();
                            }}
                        >
                            Unhide
                        </Button>
                    </Row>
                );
            })}
        </>
    );
}

/**
 * Everybody hidden, and the way back for each.
 *
 * The list is the way back because the usual one is gone: somebody shown as not added is not
 * in your friends list to be right-clicked.
 */
export function HiddenList() {
    const update = useForceUpdater();
    const all = listed();
    const n = counts();
    const any = n.hidden + n.dismissed;

    return (
        <Panel
            title="Hidden"
            count={any}
            actions={
                <>
                    <IconButton
                        icon={EyeOffIcon}
                        variant="secondary"
                        onClick={() => {
                            hideAllFriends();
                            update();
                        }}
                    >
                        Hide All
                    </IconButton>
                    {!!any && (
                        <IconButton
                            icon={EyeIcon}
                            variant="secondary"
                            onClick={() => {
                                showAllFriends();
                                clearAll("hide");
                                update();
                            }}
                        >
                            Unhide All
                        </IconButton>
                    )}
                </>
            }
        >
            {!any && (
                <Empty
                    icon={PersonOffIcon}
                    title="Nobody is hidden"
                    text="Right-click a friend and choose Hide Friend, or hide them all at once."
                />
            )}

            {!!any && (
                <div className={cl("rows")}>
                    <Group title="Friends" rows={all.hidden} run={showFriend} onChange={update} />
                    <Group title="Friend requests" rows={all.dismissed} run={restoreRequest} onChange={update} />
                </div>
            )}
        </Panel>
    );
}
