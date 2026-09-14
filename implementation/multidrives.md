# Multi-Drive Disk Library

## Status

Draft specification. This document formalizes the requested browser interface
and records the initial implementation decisions. Detailed API and persistence
decisions will be added here as development proceeds.

## Objective

Add a browser-side disk library interface alongside the existing HostFS (`H:`)
interface. The library shall allow users to upload Atari disk-related files,
keep them available across browser sessions, mount them in the emulated disk
drives, use them normally from the Atari, and download the resulting data after
the emulator has modified it.

The initial user-facing drive range is `D1:` through `D4:`.

## User interface

The interface should resemble the existing HostFS file manager and include:

- A dedicated toolbar with upload and download actions.
- A drag-and-drop area for supported files.
- A file list with the following columns:
  - `Name`
  - `Size`
  - `D1:`
  - `D2:`
  - `D3:`
  - `D4:`
- A selectable checkbox in each drive column for every compatible library
  file.
- Visual indication of the currently mounted image in each drive column.
- File selection controls for downloading one or more files.
- Appropriate empty, loading, error, and persistence-status states.

Selecting a drive checkbox shall mount that file immediately in the
corresponding emulated drive. Selecting another file for the same drive shall
replace the previous mount. Clearing the checkbox shall unmount the drive.

The UI shall enforce these constraints:

1. A drive can have at most one mounted image.
2. A library file can be mounted in at most one drive.
3. The interface must not allow two images to be mounted simultaneously in the
   same drive.

The implementation should keep the UI state synchronized with the emulator
state after mounting, unmounting, resets, snapshot restoration, and other
operations that can change mounted media.

## Supported files

The first version shall accept:

- `.ATR` disk images.
- `.XEX` executable files.

Files with unsupported extensions should be rejected with a clear error. The
implementation may also validate the file format before adding it to the
library, so malformed ATR and XEX files do not become unusable entries.

## XEX mounting behavior

The emulator already supports loading an XEX by converting it into a bootable
ATR representation. The multi-drive library must preserve this distinction:

- The uploaded XEX bytes remain available as the original library content.
- Mounting an XEX may use the emulator's generated ATR representation.
- The final download behavior must be explicit and consistent with the
  conversion model.

The preferred initial policy is:

- Download an ATR as its current, possibly modified ATR bytes.
- Download an XEX as the original XEX when it has not been converted or
  modified as disk media.
- If an XEX-derived mounted ATR is modified through SIO, expose the resulting
  ATR as the downloadable mounted-media result, using an appropriate name or
  an explicit conversion indicator in the UI.

This policy remains an implementation decision to validate before coding.

## Persistence

The library shall persist its contents in browser storage and restore them on
the next application load.

IndexedDB is the selected persistence technology. It is preferable to
`localStorage` because it can store binary data directly, is asynchronous, and
is better suited to multiple and relatively large ATR images.

The persistent record should contain at least:

- A stable library identifier.
- The display filename.
- The original file type.
- The current downloadable bytes or the original bytes plus a mounted-media
  representation, according to the final XEX policy.
- The current byte size.
- Creation and modification timestamps.
- Optional dirty/conversion metadata.

Drive assignments may be persisted as metadata, but stale assignments must be
validated when restoring the emulator. A deleted or unavailable library entry
must never result in a phantom mounted drive.

The implementation should use debounced persistence for emulator writes instead
of writing to IndexedDB synchronously after every sector operation.

### Initial synchronization strategy

The first implementation will use a per-entry `dirty` flag as the source of
truth for pending persistence. A numeric revision counter is not required for
the initial design.

Persistence must nevertheless be serialized because IndexedDB operations are
asynchronous. Each library entry may maintain:

- `dirty`: the in-memory bytes contain changes not yet confirmed by IndexedDB.
- `persisting`: a persistence operation is currently in progress.
- `pendingFlush`: the promise for the complete flush chain currently required
  to make the entry clean.

The flush sequence should be:

1. If a flush is already in progress, callers join its `pendingFlush` promise.
2. If the entry is not dirty, the flush completes immediately.
3. The implementation marks the current pending changes as claimed by setting
   `dirty` to false, copies the current bytes, and writes that copy to
   IndexedDB.
4. If the write fails, `dirty` is restored to true and the error is reported.
5. If the emulator writes new data while IndexedDB is saving the copy, the new
   write sets `dirty` to true. The same flush chain must then repeat the
   capture-and-save steps until the entry is clean.

This prevents a completed asynchronous write from incorrectly clearing a dirty
flag set by a newer emulator write.

### Download as a consistency barrier

Downloading a file must first request an explicit flush for that library entry.
The worker waits for the complete pending flush chain to finish, then returns
the current in-memory bytes and metadata for download. This makes download a
final consistency barrier between the emulated disk and its IndexedDB copy.

The UI does not need to reject or ignore a download click while a write or
flush is in progress. It may accept the request immediately, show a temporary
`Saving...` state, and wait for the worker's flush promise. The download must
only be generated after the entry is clean, so the user cannot accidentally
download an older version of the image. The button may be temporarily disabled
as a usability enhancement, but correctness must be enforced by the worker
flush rather than by the UI state alone.

Automatic debounced persistence remains necessary because the user may close or
reload the page without downloading the image. The download flush is an
additional guarantee, not a replacement for background persistence.

The same explicit flush should be considered for unmount, replacement,
deletion, snapshot creation, and other operations that can discard or export
the current in-memory media state.

## Initial implementation decisions

The first implementation will use the following defaults unless later testing
shows that a change is necessary:

- The worker owns the canonical library state and its IndexedDB persistence.
- ATR entries store and mount their current ATR bytes directly.
- XEX entries preserve the original XEX bytes and mount the generated ATR
  representation already supported by the emulator.
- If an XEX-derived mounted image is modified, the default download is the
  resulting ATR representation. Downloading the untouched original XEX may be
  added as a separate action later.
- Valid drive assignments are restored after reload when their library entries
  still exist.
- IndexedDB failures report a warning and trigger retry behavior, but do not
  block the emulator from continuing to operate in memory.
- Library entries use stable identifiers rather than filenames as their primary
  identity. Replacing an existing logical filename requires confirmation.

These defaults are intended to keep the initial implementation predictable
while leaving room for future refinement.

## Emulator integration

The existing media model already contains disk image storage and device-slot
assignments. The new feature should reuse those mechanisms rather than adding a
second emulated disk implementation.

Required integration points include:

- Add or expose a library/media-store service for persistent disk entries.
- Load library metadata and file bytes during application initialization.
- Mount a library entry through the existing device-slot API.
- Unmount or replace an image when the corresponding checkbox changes.
- Observe disk writes, format operations, and other mutations to mounted image
  bytes.
- Mark the affected library entry dirty and persist the updated bytes through
  the serialized flush strategy described above.
- Refresh the UI size, status, and download data after modifications.

The persistence boundary must account for the current worker architecture: the
emulator runs disk I/O in the worker while the browser UI uses a proxy. The
chosen design must avoid maintaining unrelated, unsynchronized copies of the
same disk image.

## Modularity and future expansion

The library must be implemented as a modular service rather than as UI-only
logic tied directly to the current four drive columns. Future ideas and
adjustments should be addable without rewriting the persistence layer or the
emulator media model.

The design should allow future expansion such as:

- Additional emulated drive columns or device types.
- Entry renaming, tagging, sorting, and filtering.
- Alternative download representations for XEX-derived media.
- Explicit save, revert, or version-history actions.
- Import/export of the complete library and its metadata.
- Browser-tab synchronization or other storage backends.
- New file formats when their mount and persistence semantics are defined.

The initial implementation should therefore keep storage records, mounted
media state, UI presentation, and download policy separated behind small,
well-defined interfaces.

## AHRM compliance requirement

Any change to the emulator required by this feature must preserve faithful
Atari hardware behavior and remain compliant with the AHRM documentation.

Before modifying hardware emulation, SIO behavior, disk timing, memory mapping,
or related machine state, the relevant AHRM sections must be consulted. The
implementation must not introduce browser-specific shortcuts into the emulated
hardware model when a real-hardware behavior is defined.

Where the AHRM does not define a browser-facing concern, such as IndexedDB
persistence, worker messaging, or UI state, that concern should remain in the
application layer and must not alter the documented hardware-visible behavior.

Any hardware-facing change should include a focused regression test or other
repeatable validation demonstrating that existing real-hardware-compatible
behavior remains intact.

## Download behavior

The toolbar and row actions should support downloading:

- A single library file.
- Multiple selected files.
- The current mounted bytes after emulated writes.

Downloads should preserve the best available filename and extension. If the
downloaded representation differs from the originally uploaded file, the UI
should make that fact visible rather than silently returning a different file
format.

Before producing the download, the worker must flush the selected entry and
return the current in-memory representation. The UI must not assume that a
previous background persistence operation has completed merely because the
entry is displayed as modified.

## Deletion and replacement

Deleting a library entry that is mounted must first unmount it from its drive.
The UI should then remove the persistent entry and update all related state.

Uploading a file with the same logical name requires an explicit policy. The
initial preferred behavior is to ask for confirmation before replacing the
existing library entry, while preserving the current mount only if replacement
succeeds.

## Non-goals for the first implementation

- Supporting more than the initial `D1:`–`D4:` UI range.
- Implementing a new disk-drive or SIO protocol model.
- Supporting folders or arbitrary non-disk files in this library.
- Synchronizing the library between browser tabs or devices.
- Guaranteeing persistence after the user clears browser site data.
- Treating an XEX as a native writable disk image without defining its
  conversion semantics.

## Acceptance criteria

The feature is complete when all of the following are true:

1. A user can upload or drop valid ATR and XEX files into the library.
2. Library entries survive a page reload using IndexedDB.
3. The list displays `Name`, `Size`, `D1:`, `D2:`, `D3:`, and `D4:`.
4. Selecting a drive cell mounts the selected image immediately.
5. The UI enforces one image per drive and one drive per image.
6. Atari software can read, write, verify, and format a mounted writable ATR.
7. Changes made by the emulator mark the entry dirty and are persisted after a
   safe debounce period.
8. Download explicitly flushes pending changes before returning the current
   image bytes.
9. A new emulator write occurring during persistence is not lost and causes a
   subsequent flush.
10. The user can download the current contents of a modified image.
11. Deleting or replacing an entry cannot leave an invalid mounted-drive state.
12. The feature does not regress the existing HostFS workflow or direct disk
    loading workflow.

## Open decisions

- Whether an XEX-derived image is downloaded as XEX, ATR, or both.
- Whether drive assignments survive reload or are cleared on startup.
- Whether the library supports renaming entries in the first version.
- Whether duplicate files are identified by name only or by stable identity.
- Whether persistence errors should block emulator writes or only display a
  warning.
- Whether the UI should offer an explicit “Save changes” action in addition to
  automatic persistence.
- Whether a revision counter should be added later for multi-tab or
  multi-writer synchronization. It is intentionally out of scope for the
  initial single-worker implementation.
