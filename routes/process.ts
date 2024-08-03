export { Context } from "https://deno.land/x/oak@v10.0.0/mod.ts";
import { config } from "https://deno.land/x/dotenv/mod.ts";
import { getJobs, filterForStaleJobs, processJobs } from "../utils.ts";

const env = config();

export async function processRoute(context: Context) {
  if (context.request.headers.get("Authorization") !== `Bearer ${env.CRON_SECRET}`) {
    context.response.status = 401;
    context.response.body = "Unauthorized";
    return;
  }

  try {
    const jobs = await getJobs("job:*");
    const inProgressJobs = jobs.filter((job: any) => job.status === "in-progress");
    const staleInProgressJobs = filterForStaleJobs(inProgressJobs, 60_000 * 6);

    if (staleInProgressJobs.length > 0) {
      await processJobs(staleInProgressJobs);
      context.response.body = { success: true };
      return;
    }

    const queuedJobs = jobs.filter((job: any) => job.status === "queued");
    if (queuedJobs.length > 0) {
      await processJobs(queuedJobs);
      context.response.body = { success: true };
      return;
    }

    context.response.body = { success: true };
  } catch (error) {
    context.response.status = 500;
    context.response.body = error.message;
  }
}
