import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("sweep deliveries", { minutes: 5 }, internal.automation.outbox.sweep, {});
crons.daily("purge old automation records", { hourUTC: 6, minuteUTC: 17 }, internal.automation.outbox.purgeOld, {});
export default crons;
