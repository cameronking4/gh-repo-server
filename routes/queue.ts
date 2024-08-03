import { Context } from "oak/mod.ts";
import { queueGroupedJobs } from "../utils.ts";

export async function queueRoute(context: Context) {
  const { owner, repo } = await context.request.body().value;

  try {
    const groupId = await queueGroupedJobs(owner, repo);
    context.response.body = { success: true, groupId };
  } catch (error) {
    context.response.status = 500;
    context.response.body = error.message;
  }
}
