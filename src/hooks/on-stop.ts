/**
 * Stop hook — closes the active task with final duration and counters.
 * Flushes accumulated counters from _active.json into the project data file.
 */
import { flushActiveTask } from '../store.js';

flushActiveTask();
