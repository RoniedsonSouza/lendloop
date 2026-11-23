import { env } from "../_generated/server";

/** The neighborhood's single timezone; all calendar dates are interpreted in it. */
export function appTimezone(): string {
  return env.APP_TIMEZONE ?? "America/Sao_Paulo";
}
