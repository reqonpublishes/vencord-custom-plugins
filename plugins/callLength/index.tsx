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
import { ChannelStore, FluxDispatcher, MessageStore, React, SelectedChannelStore, useStateFromStores } from "@webpack/common";

import { TimerIcon } from "./icons";
import panelFix from "./panelFix.css?managed";
import { About, choiceChips } from "./ui";

const CallStore: any = findStoreLazy("CallStore");

const SHOW = [["call", "Whole call"], ["you", "Your time"], ["both", "Both"]] as const;
const FORMATS = [["human", "1h 22m 26s"], ["stopwatch", "01:22:26"]] as const;

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
    },
    formatChoice: {
        type: OptionType.COMPONENT,
        component: choiceChips(() => settings, "format", "Format", "How the time is written.", FORMATS)
    },
    format: {
        type: OptionType.STRING,
        hidden: true,
        description: "How the time is written",
        default: "human"
    }
});

/** When an id was made: a call message's id is when the call began */
const timeOfId = (id: string) => Number(BigInt(id) >> 22n) + 1420070400000;

/**
 * When each call was last asked about, and how many times. Asked again every so often until
 * the answer comes: an ask made while Discord is still connecting, straight after a restart,
 * is dropped without a word.
 */
const asked = new Map<string, { at: number; times: number; }>();
const ASK_EVERY = 10_000;
const ASK_TIMES = 12;

/**
 * When the call in a channel began, for a DM or group call: from the message Discord posts
 * when a call starts, whose id is that moment. A server voice channel has no such message, so
 * there is nothing to say how long it has been going.
 *
 * Discord only asks the server about the call in the chat you have open - when you open it,
 * and again on connecting. In a call whose chat is not open, after a restart say, it never
 * hears when the call began. So it is asked here the way opening that chat asks; the answer
 * comes back as the call's own update and the timer catches up a moment later.
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

        const last = asked.get(channelId);
        if (!last || (Date.now() - last.at > ASK_EVERY && last.times < ASK_TIMES)) {
            asked.set(channelId, { at: Date.now(), times: (last?.times ?? 0) + 1 });
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

/**
 * The line under Voice Connected, counting from when the call began, when you joined, or both.
 *
 * Drawn from this plugin's own patch, which hands over the panel's channel. When it is lent to
 * Call Timer instead (see start) the channel arrives empty - Call Timer reads it off `this`,
 * which the panel, a function, does not have - so the voice channel you are connected to,
 * which is the one the panel shows, stands in.
 */
const Timer = ErrorBoundary.wrap(({ channelId: given }: { channelId?: string; }) => {
    const channelId = useStateFromStores([SelectedChannelStore], () => given ?? SelectedChannelStore.getVoiceChannelId() ?? "");
    const [, tick] = React.useState(0);
    const joined = React.useMemo(() => joinedAt(channelId), [channelId]);
    const show = settings.use(["show"]).show ?? "call";

    React.useEffect(() => {
        const timer = setInterval(() => {
            tick(n => n + 1);
            remember(channelId, joined);
        }, 1000);
        return () => clearInterval(timer);
    }, [channelId, joined]);

    const human = (settings.use(["format"]).format ?? "human") === "human";
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

/** Call Timer's own drawing, while it is lent this one; put back when this is switched off */
let original: any = null;

export default definePlugin({
    name: "CallLength",
    description: "A call timer that counts the whole call and keeps counting through restarts.",
    authors: [{ name: "reqon", id: 497562304498368513n }],
    enabledByDefault: true,
    managedStyle: panelFix,

    settings,

    patches: [
        {
            // The voice panel's line with the call's name. The timer goes under it, given the
            // channel the panel is for - which sits a few lines above, in its right-click menu.
            find: '"RTCConnectionMenu"',
            replacement: {
                match: /(channel:(\i),onInteraction:\(0,\i\.\i\)\("RTCConnectionMenu".{0,400}?lineClamp:1,children:)(\i)(?=,|}\))/,
                replace: "$1[$3,$self.renderTimer({channelId:$2?.id})]"
            }
        }
    ],

    renderTimer: Timer,

    settingsAboutComponent: () => (
        <About
            icon={TimerIcon}
            title="A call timer that knows the call"
            note={false}
            steps={[
                <>Shows how long the call has gone on under Voice Connected: join a call two minutes in and it starts at 2:00.</>,
                <>A restart does not reset it: it picks up where it was.</>,
                <>Choose <strong>Your time</strong> to count only your part, or <strong>Both</strong> for the two side by side.</>,
                <>A server voice channel never says when it started, so there it counts your time.</>
            ]}
        />
    ),

    start() {
        const timer: any = plugins.CallTimer;
        if (!timer) return;

        // Two timers would draw two lines, and Call Timer's patch goes in before this one, so
        // while it is on this one has nowhere to go. It is switched off for the next start...
        if (Settings.plugins.CallTimer?.enabled) {
            if (Settings.plugins.CallTimer.format) settings.store.format = Settings.plugins.CallTimer.format;
            Settings.plugins.CallTimer.enabled = false;
        }

        // ...and until then its line is lent this timer: its patch asks it for renderTimer each
        // time the panel draws.
        if (timer.started) {
            original ??= timer.renderTimer;
            timer.renderTimer = Timer;
        }
    },

    stop() {
        const timer: any = plugins.CallTimer;
        if (timer && original) timer.renderTimer = original;
        original = null;
    }
});
