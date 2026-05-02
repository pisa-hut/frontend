/** Thin facade over antd's `message.*` toast API.
 *
 *  Centralises two patterns that had grown ad-hoc across the codebase:
 *
 *  1. `message.error(String(e))` after a `try/catch` — repeated 25+
 *     times. Wrapped here so the formatting is consistent and a future
 *     change (showing a stack toggle, sentry capture, etc.) is one
 *     edit instead of many.
 *  2. The duplicated `message.success("Updated")` / `"Created"` /
 *     `"Deleted"` copy in every Resources tab. Use `notify.created`,
 *     `notify.updated`, `notify.deleted` so the wording stays
 *     consistent and changes in one place.
 *
 *  Existing call sites can migrate gradually — `notify` is additive
 *  and doesn't conflict with direct `message.*` use.
 */

import { message } from "antd";

function asMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export const notify = {
  success(content: React.ReactNode) {
    message.success(content);
  },
  warning(content: React.ReactNode) {
    message.warning(content);
  },
  error(content: React.ReactNode) {
    message.error(content);
  },
  info(content: React.ReactNode) {
    message.info(content);
  },

  /** "Resource created" — used by every Resources-tab create handler. */
  created(label = "Created") {
    message.success(label);
  },
  /** "Resource updated" — likewise. */
  updated(label = "Updated") {
    message.success(label);
  },
  /** "Resource deleted" — likewise. */
  deleted(label = "Deleted") {
    message.success(label);
  },

  /** Standardised error toast that handles both Error instances and
   *  arbitrary thrown values without losing stack info to `String(e)`. */
  fromError(err: unknown, prefix?: string) {
    const m = asMessage(err);
    message.error(prefix ? `${prefix}: ${m}` : m);
  },
};
