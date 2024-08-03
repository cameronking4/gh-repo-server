import { Application, Router } from "https://deno.land/x/oak/mod.ts";

const GITHUB_PAT = Deno.env.get("GITHUB_PAT");

const router = new Router();
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

async function fetchRepoContents(contents: any[], headers: Headers): Promise<any[]> {
  const data: any[] = [];
  for (const item of contents) {
    if (item.type === "file" && !item.name.match(/\.(mp4|avi|mkv|jpg|jpeg|png|svg|gif)$/)) {
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
  }
  return data;
}

async function fetchFileContent(url: string, headers: Headers): Promise<string> {
  const response = await fetch(url, { headers });
  return await response.text();
}
