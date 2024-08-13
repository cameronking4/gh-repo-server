import { Application, Router } from "https://deno.land/x/oak/mod.ts";

const GITHUB_PAT = Deno.env.get("GITHUB_PAT");
const CONCURRENCY_LIMIT = 20; // Increased concurrency limit to 10

// Function to check if an item should be excluded
function shouldExclude(item: any): boolean {
  const excludedPatterns = [
    "node_modules", "vendor", ".lock", "yarn.lock", "package-lock.json", ".git",
    "dist", "build", ".zip", ".tar", ".gz"
  ];
  return excludedPatterns.some(pattern => item.path.includes(pattern));
}

// Function to fetch file content with streaming
async function fetchFileContent(url: string, headers: Headers): Promise<string> {
  const response = await fetch(url, { headers });
  const size = response.headers.get("Content-Length");

  if (size && parseInt(size, 10) > 50000) { // Limit to 50KB
    return `File too large to fetch (${size} bytes)`;
  }
  
  // Stream the content instead of loading it all at once
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let result = '';
  let done = false;

  while (!done) {
    const { value, done: doneReading } = await reader?.read()!;
    done = doneReading;
    result += decoder.decode(value, { stream: !done });
  }

  return result;
}

// Function to fetch repository contents with streaming and batching
async function fetchRepoContents(contents: any[], headers: Headers): Promise<any[]> {
  const data: any[] = [];
  const queue: Promise<any>[] = [];

  for (const item of contents) {
    if (shouldExclude(item)) {
      continue;
    }
    if (queue.length >= CONCURRENCY_LIMIT) {
      await Promise.race(queue);
    }

    const promise = (async () => {
      try {
        if (item.type === "file" && !item.name.match(/\.(mp4|avi|mkv|jpg|jpeg|png|svg|gif|lock|ico)$/)) {
          const fileContent = await fetchFileContent(item.download_url, headers);
          data.push({ path: item.path, content: fileContent });
        } else if (item.type === "dir") {
          const dirContentUrl = item.url;
          const dirContentResponse = await fetch(dirContentUrl, { headers });
          const dirContentJson = await dirContentResponse.json();
          const dirData = await fetchRepoContents(dirContentJson, headers);
          data.push({ path: item.path, content: dirData });
        } else if (item.type === "file") {
          data.push({ path: item.path, content: null });
        }
      } catch (error) {
        console.error(`Failed to process item ${item.path}:`, error);
      }
    })();

    queue.push(promise);
    promise.then(() => {
      queue.splice(queue.indexOf(promise), 1);
    }).catch((error) => {
      console.error(error);
    });
  }

  await Promise.all(queue);
  return data;
}

const router = new Router();
router.get("/", (context) => {
  context.response.body = "Github Repo Fetcher";
});

router.get("/get-repo", async (context) => {
  const repoName = context.request.url.searchParams.get("repo");
  if (!repoName) {
    context.response.status = 400;
    context.response.body = { error: "Repository name is required" };
    return;
  }

  const repoContentUrl = `https://api.github.com/repos/${repoName}/contents`;

  const headers = new Headers();
  headers.append("Authorization", `token ${GITHUB_PAT}`);
  headers.append("Accept", "application/vnd.github.v3+json");

  try {
    const repoContent = await fetch(repoContentUrl, { headers });
    if (!repoContent.ok) {
      context.response.status = repoContent.status;
      context.response.body = { error: repoContent.statusText };
      return;
    }

    const repoJson = await repoContent.json();
    const repoData = await fetchRepoContents(repoJson, headers);
    context.response.headers.set("Content-Type", "application/json");
    context.response.body = JSON.stringify(repoData);
  } catch (error) {
    context.response.status = 500;
    context.response.body = { error: error.message };
  }
});

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

console.log("Server is running on http://localhost:8000");
await app.listen({ port: 8000 });
