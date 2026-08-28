# StageClock

A stage-timing app: an operator drives a control window; a separate popout window shows the audience-facing clock/timer.

## Language

**Draft**:
The operator's local editing state on the control window — what they see and manipulate directly. Invisible to the audience until published.
_Avoid_: local state, working copy

**Live**:
The published state broadcast to the popout (audience-facing) window. Only changes when explicitly published.
_Avoid_: broadcast state, published state

**Save**:
The explicit action that publishes all of Draft to Live at once (mode, timers, everything), making it visible in the popout.
_Avoid_: publish, sync

**Duration**:
The countdown's nominal total for the current session — what Reset restores to, and what the duration-input field displays. Set directly before the countdown starts; while running, only Confirm or Nudge change it. Once any time has elapsed, Duration and Remaining Time are different numbers.
_Avoid_: time left, countdown time, total

**Remaining Time**:
The countdown's live, ticking value — what the big display and the audience popout actually show. Derived from Duration and elapsed time; a Nudge shifts it directly, so it doesn't always equal Duration.
_Avoid_: time left, countdown time, current time

**Pending Edit**:
An unconfirmed manual edit typed into the duration field while the countdown is running. While staged, the control window's display freezes on this value instead of the ticking Remaining Time. Only typing stages a Pending Edit — Nudge never does, and never freezes the display. Canceling restores the field to the current Duration. Paused/not-yet-started countdowns apply typed edits immediately, with no staging.
_Avoid_: staged value, draft value

**Confirm**:
Commits a Pending Edit as a hard override: both Duration and Remaining Time snap to the typed value, discarding elapsed time, as if the countdown had just started fresh at that value. Updates Draft and Live together immediately, publishing to the audience popout without needing Save. Scoped only to the countdown; other unrelated Draft changes (e.g. mode) still require Save as normal.
_Avoid_: apply, commit

**Nudge**:
An immediate ± adjustment (5s/10s/30s/1m/5m, via a magnitude dropdown and +/- buttons) applied directly to both Duration and Remaining Time by the same relative delta — elapsed time is preserved, so Remaining Time simply shifts rather than resetting. Behaves like Start/Pause/Reset: instant, published immediately, never stages a Pending Edit or freezes the display. Discards any in-progress Pending Edit first. Only shown while the countdown is running.
_Avoid_: increment control, adjuster
