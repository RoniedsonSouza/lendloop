/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as automation_deliveries from "../automation/deliveries.js";
import type * as automation_http from "../automation/http.js";
import type * as automation_outbox from "../automation/outbox.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_availability from "../lib/availability.js";
import type * as lib_config from "../lib/config.js";
import type * as lib_dates from "../lib/dates.js";
import type * as lib_domain from "../lib/domain.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_hmac from "../lib/hmac.js";
import type * as lib_loanRules from "../lib/loanRules.js";
import type * as loans from "../loans.js";
import type * as seed from "../seed.js";
import type * as tools from "../tools.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  "automation/deliveries": typeof automation_deliveries;
  "automation/http": typeof automation_http;
  "automation/outbox": typeof automation_outbox;
  crons: typeof crons;
  http: typeof http;
  "lib/audit": typeof lib_audit;
  "lib/availability": typeof lib_availability;
  "lib/config": typeof lib_config;
  "lib/dates": typeof lib_dates;
  "lib/domain": typeof lib_domain;
  "lib/errors": typeof lib_errors;
  "lib/functions": typeof lib_functions;
  "lib/hmac": typeof lib_hmac;
  "lib/loanRules": typeof lib_loanRules;
  loans: typeof loans;
  seed: typeof seed;
  tools: typeof tools;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
