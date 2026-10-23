/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";

import { plugins } from "@api/PluginManager";
import { definePluginSettings, Settings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { localStorage } from "@utils/localStorage";
import { formatDuration } from "@utils/text";
import definePlugin, { OptionType } from "@utils/types";
import { findStoreLazy } from "@webpack";
import { ChannelStore, FluxDispatcher, MessageStore, React } from "@webpack/common";

import { TimerIcon } from "./icons";
import { About, choiceChips } from "./ui";

const CallStore: any = findStoreLazy("CallStore");

const SHOW = [["call", "Whole call"], ["you", "Your time"], ["both", "Both"]] as const;

const settings = definePluginSettings({
    showChoice: {
        type: OptionType.COMPONENT,
        component: choiceChips(() => settings, "show", "Show", "What the timer under Voice Connected counts.", SHOW)
    },
    show: {
        type: OptionType.STRING,
        hidden: true,
        description: "What the timer counts",
        default: "call"
    }
});

/** When an id was made: a call message's id is when the call began */
const timeOfId = (id: string) => Number(BigInt(id) >> 22n) + 1420070400000;

/** The calls already asked about, so each is asked once */
const asked = new Set<string>();

/**
 * When the call in a channel began, for a DM or group call: from the message Discord posts
 * when a call starts, whose id is that moment. A server voice channel has no such message, so
 * there is nothing to say how long it has been going.
 *
 * Discord only asks the server about the call in the chat you have open - when you open it,
 * and again on connecting. In a call whose chat is not open, after a restart say, it never
 * hears when the call began. So it is asked here the way opening that chat asks, once; the
 * answer comes back as the call's own update and the timer catches up a moment later.
 */
function callStartedAt(channelId: string): number | null {
    try {
        const channel: any = ChannelStore.getChannel(channelId);
        if (!channel || channel.guild_id) return null;

        const messageId = CallStore.getMessageId?.(channelId);
        if (messageId) return timeOfId(messageId);

        // the "started a call" message, when the chat is loaded and the call has not ended
        const loaded: any[] = (MessageStore.getMessages(channelId) as any)?._array ?? [];
        const ongoing = loaded.findLast(message => message.type === 3 && message.call && !message.call.endedTimestamp && !message.call.ended_timestamp);
        if (ongoing) return timeOfId(ongoing.id);

        if (!asked.has(channelId)) {
            asked.add(channelId);
            FluxDispatcher.dispatch({ type: "CALL_CONNECT", channelId } as any);
        }
        return null;
    } catch {
        return null;
    }
}

const KEY = "vc-ctl-joined";
/** A restart takes well under this; longer and it was a new call */
const RESTART_GAP = 3 * 60_000;

/**
 * When you joined the call you are in.
 *
 * Written down as you sit in it, so a restart - which drops you and puts you straight back -
 * picks up where it was instead of starting again at zero. Coming back to the same channel
 * after longer than a restart takes counts as joining again.
 */
function joinedAt(channelId: string): number {
    const now = Date.now();
    try {
        const held = JSON.parse(localStorage.getItem(KEY) ?? "null");
        if (held?.channelId === channelId && now - held.seen < RESTART_GAP) return held.at;
    } catch { /* nothing kept, or the browser will not keep it */ }

    remember(channelId, now);
    return now;
}

function remember(channelId: string, at: number) {
    try {
        localStorage.setItem(KEY, JSON.stringify({ channelId, at, seen: Date.now() }));
    } catch { /* counts from now next time instead */ }
}

/** The line Call Timer draws, counting from when the call began, when you joined, or both */
const Timer = ErrorBoundary.wrap(({ channelId }: { channelId: string; }) => {
    const [, tick] = React.useState(0);
    const [joined] = React.useState(() => joinedAt(channelId));
    const show = settings.use(["show"]).show ?? "call";

    React.useEffect(() => {
        const timer = setInterval(() => {
            tick(n => n + 1);
            remember(channelId, joined);
        }, 1000);
        return () => clearInterval(timer);
    }, [channelId, joined]);

    const human = Settings.plugins.CallTimer?.format === "human";
    const now = Date.now();
    const call = callStartedAt(channelId);
    const mine = formatDuration(Math.max(0, now - joined), human);
    const whole = call ? formatDuration(Math.max(0, now - Math.min(call, joined)), human) : null;

    // Both always says both, even when they match, so it is plain which is which - and where the
    // call's start is not known (a server voice channel), it says the one number is yours.
    const text = show === "both"
        ? whole ? `${whole} · you ${mine}` : `you ${mine}`
        : show === "you" || !whole ? mine : whole;

    const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const said = call
        ? `Call started at ${clock(Math.min(call, joined))}, you joined at ${clock(joined)}`
        : `Discord does not say when this call started, so this is your time, since ${clock(joined)}`;

    return <p title={said} style={{ margin: 0, fontFamily: "var(--font-code)" }}>{text}</p>;
}, { noop: true });

/** Call Timer's own drawing, put back when this is switched off */
let original: any = null;

export default definePlugin({
    name: "CallLength",
    description: "Call Timer counts the whole call and keeps counting through restarts.",
    authors: [{ name: "reqon", id: 497562304498368513n }],
    dependencies: ["CallTimer"],
    // what Call Timer should have done all along
    enabledByDefault: true,

    settings,

    settingsAboutComponent: () => (
        <About
            icon={TimerIcon}
            title="A call timer that knows the call"
            note={false}
            steps={[
                <>Call Timer starts at zero when you join. This makes it count from when the call itself began, so joining a call two minutes in starts at 2:00.</>,
                <>A restart no longer resets it: it picks up where it was.</>,
                <>Choose <strong>Your time</strong> to count only your part, or <strong>Both</strong> for the two side by side.</>,
                <>A server voice channel never says when it started, so there it counts your time.</>
            ]}
        />
    ),

    // Call Timer's patch asks it for renderTimer each time the panel draws, so lending it
    // this one is all it takes - Call Timer itself is left as it is.
    start() {
        const timer: any = plugins.CallTimer;
        if (!timer) return;
        original ??= timer.renderTimer;
        timer.renderTimer = Timer;
    },

    stop() {
        const timer: any = plugins.CallTimer;
        if (timer && original) timer.renderTimer = original;
        original = null;
    }
});
