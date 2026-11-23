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
import type * as http from "../http.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_dates from "../lib/dates.js";
import type * as lib_domain from "../lib/domain.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_hmac from "../lib/hmac.js";
import type * as users from "../users.js";
import type * as zz_guard_probe from "../zz_guard_probe.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  http: typeof http;
  "lib/audit": typeof lib_audit;
  "lib/dates": typeof lib_dates;
  "lib/domain": typeof lib_domain;
  "lib/errors": typeof lib_errors;
  "lib/functions": typeof lib_functions;
  "lib/hmac": typeof lib_hmac;
  users: typeof users;
  zz_guard_probe: typeof zz_guard_probe;
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
