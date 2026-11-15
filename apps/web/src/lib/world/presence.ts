/**
 * Where the Sandbox's `WorldView` is right now, for the rules about who draws
 * (`viewDraws` and `backdropLease` in ./ambient.ts). `WorldView` writes it;
 * the page backdrop reads it.
 */
import { writable } from 'svelte/store'

import { NO_VIEW } from './ambient.ts'
import type { ViewPresence } from './ambient.ts'

export const viewPresence = writable<ViewPresence>(NO_VIEW)
