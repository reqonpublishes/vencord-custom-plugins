/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { useForceUpdater } from "@utils/react";
import { React, UserStore, UserUtils } from "@webpack/common";

import { clearAll, counts, Fake, fakeAs, fakeOf, infoOf, listed, unfake } from "./friends";
import { CheckIcon, PersonAddIcon, UndoIcon } from "./icons";
import { cl, Empty, IconButton, Panel, Row } from "./ui";
import { remember } from "./undo";

const CHOICES: { fake: Fake; label: string; done: string; }[] = [
    { fake: "friended", label: "Friend", done: "is now your friend" },
    { fake: "incoming", label: "Incoming request", done: "sent you a friend request" },
    { fake: "pending", label: "Outgoing request", done: "has a friend request from you" },
    { fake: "blocked", label: "Blocked", done: "is blocked" }
];

/**
 * Fake somebody by their user ID - for people you share no server or chat with, so there is
 * nowhere to right-click them. Discord is asked who the ID belongs to, the way opening their
 * profile would ask, so they show with their real name and picture.
 */
function AddById({ onChange }: { onChange(): void; }) {
    const [id, setId] = React.useState("");
    const [fake, setFake] = React.useState<Fake>("friended");
    const [said, setSaid] = React.useState<{ text: string; bad: boolean; } | null>(null);
    const [busy, setBusy] = React.useState(false);

    const wanted = id.trim();
    const valid = /^\d{17,20}$/.test(wanted);

    const add = async () => {
        if (!valid || busy) return;
        if (wanted === UserStore.getCurrentUser()?.id) return setSaid({ text: "That is you.", bad: true });

        setBusy(true);
        setSaid(null);

        try {
            const user: any = UserStore.getUser(wanted) ?? await UserUtils.getUser(wanted);
            if (!user) throw new Error("missing");

            const was = fakeOf(wanted);
            fakeAs(wanted, fake);
            remember("Add Fake", () => was ? fakeAs(wanted, was) : unfake(wanted));
            setSaid({ text: `${user.globalName ?? user.username} ${CHOICES.find(one => one.fake === fake)!.done}.`, bad: false });
            setId("");
            onChange();
        } catch {
            setSaid({ text: "No account has that ID.", bad: true });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={cl("add")}>
            <div className={cl("label")}>Add by user ID</div>
            <div className={cl("field")}>
                <input
                    className={cl("input", wanted && !valid ? "input-bad" : "")}
                    placeholder="User ID"
                    aria-label="User ID"
                    spellCheck={false}
                    value={id}
                    onChange={event => {
                        setId(event.currentTarget.value.replace(/\D/g, ""));
                        setSaid(null);
                    }}
                    onKeyDown={event => {
                        if (event.key === "Enter") void add();
                    }}
                />
                <IconButton icon={PersonAddIcon} variant="secondary" disabled={!valid || busy} onClick={add}>
                    {busy ? "Adding..." : "Add"}
                </IconButton>
            </div>
            <div className={cl("chips")} role="radiogroup" aria-label="Show them as">
                {CHOICES.map(choice => (
                    <button
                        key={choice.fake}
                        type="button"
                        role="radio"
                        aria-checked={fake === choice.fake}
                        className={cl("chip", fake === choice.fake ? "chip-on" : "")}
                        onClick={() => setFake(choice.fake)}
                    >
                        {fake === choice.fake && <CheckIcon height={14} width={14} />}
                        {choice.label}
                    </button>
                ))}
            </div>
            {said && <div className={cl("hint", said.bad ? "hint-bad" : "")}>{said.text}</div>}
        </div>
    );
}

function Group({ title, rows, onChange }: { title: string; rows: [string, string][]; onChange(): void; }) {
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
                                const was = fakeOf(id);
                                unfake(id);
                                if (was) remember("Remove Fake", () => fakeAs(id, was));
                                onChange();
                            }}
                        >
                            Remove
                        </Button>
                    </Row>
                );
            })}
        </>
    );
}

/** Everybody faked, by kind, with the way back for each */
export function FakeList() {
    const update = useForceUpdater();
    const all = listed();
    const n = counts();
    const any = n.friended + n.incoming + n.pending + n.blocked;

    return (
        <Panel
            title="Faked"
            count={any}
            actions={!!any && (
                <IconButton
                    icon={UndoIcon}
                    variant="dangerSecondary"
                    onClick={() => {
                        clearAll("fake");
                        update();
                    }}
                >
                    Remove All
                </IconButton>
            )}
        >
            <AddById onChange={update} />

            {!any && (
                <Empty
                    icon={PersonAddIcon}
                    title="Nothing faked yet"
                    text="Right-click someone and open Fake, or add someone by their ID above."
                />
            )}

            {!!any && (
                <div className={cl("rows")}>
                    <Group title="Friends" rows={all.friended} onChange={update} />
                    <Group title="Incoming requests" rows={all.incoming} onChange={update} />
                    <Group title="Outgoing requests" rows={all.pending.map(id => [id, ""] as [string, string])} onChange={update} />
                    <Group title="Blocked" rows={all.blocked} onChange={update} />
                </div>
            )}
        </Panel>
    );
}
