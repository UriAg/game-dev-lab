import { part1 } from './part1.js';
import { part2 } from './part2.js';
import { part3 } from './part3.js';
export const LESSON_ORDER = [...part1, ...part2, ...part3];
export const LESSONS = Object.fromEntries(LESSON_ORDER.map((l) => [l.id, l]));
export const LESSON_INDEX = Object.fromEntries(LESSON_ORDER.map((l, i) => [l.id, i]));
