# Amaurote Plus XEX investigation

## Current verified status

As of 2026-09-22, `AmaurotePlus.xex` passes its presentation screen and starts
the game in jsA8E. Pressing the joystick trigger now reaches the game's menu
instead of returning to the Atari self-test. The fix is in the generic XEX
loader and does not special-case Amaurote.

## Symptom and trace

The XEX loaded and displayed its presentation. On trigger, the game sampled
active-low `STRIG0` at `$0284`, branched from `$30A2` to `$3102`, then returned
to the emulator's internal XEX loader. The loader did not recover the expected
run vector and execution fell through to the self-test.

The generated boot stream uses a 128-byte sector buffer. The previous buffer
selection could place it at `$0600-$067F`, a shared low-memory workspace also
used by the program during startup. This allowed buffered XEX data, including
the final run-vector data, to be overwritten before the loader consumed it.

## Generic loader correction

The loader now selects an available 128-byte buffer from `$0880` upward,
avoiding the shared `$0600-$067F` region. It also saves the loader's zero-page
sector cursor across XEX `INITAD` calls and restores it before reading the next
part of the stream. The JavaScript and native C loader images are kept in sync.

The buffer selection checks the XEX segment map, so the chosen range is not
occupied by a segment in that XEX. This is a loader allocation rule, not a
guarantee that arbitrary software will never use that RAM dynamically.

## Validation

- `jsA8E/tests/memory_xex_preflight_bank_switch.test.js` checks that the
  preflight selects `$0880` for its fixture.
- `npm.cmd run test:automation` passed after the loader change.
- A fresh browser reload rebuilt the runtime ATR from the original XEX. The
  presentation appeared; after trigger, execution reached the game's run
  address `$0C00` and continued in the game with self-test disabled.

## Historical context

Git history shows the fixed `$0600` sector-buffer fallback was present when XEX
boot support was introduced on 2026-02-17. A later change made selection
dynamic but continued to prefer `$0600` when no static XEX segment occupied
that range. The history inspected for this investigation does not show a
recent change introducing the page-6 buffer behavior. The evidence therefore
points to a longstanding loader limitation exposed by this title, rather than
a recent regression. Git history alone cannot establish whether Amaurote
worked in some earlier build or under a different runtime configuration.

## AHRM scope

The AHRM memory-system reference was consulted. This correction changes where
the software XEX loader stores its temporary sector data; it does not change
the emulated memory map, hardware registers, or machine timing. Choosing free
RAM is a loader policy and cannot account for undocumented dynamic use by every
program.
