import { parse as babelParse } from "https://deno.land/x/babel_parser/mod.ts";
import { parse as htmlParser } from "https://deno.land/x/htmlparser2/mod.ts";
import { parse as postcssParse } from "https://deno.land/x/postcss/mod.ts";
import { parse as markdownParse } from "https://deno.land/x/marked/mod.ts";
import { v4 } from "https://deno.land/std@0.106.0/uuid/mod.ts";
import { config } from "https://deno.land/x/dotenv/mod.ts";

config({ export: true });

const kv = {
  async set(key: string, value: string) {
    // Simulating a key-value store set operation
    await Deno.writeTextFile(`./kv/${key}`, value);
  },
  async get(key: string): Promise<string | null> {
    try {
      return await Deno.readTextFile(`./kv/${key}`);
    } catch {
      return null;
    }
  },
};

export async function fetchWithRetries(url: string, options: any, retries = 5): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
      return await response.json();
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
}

export async function fetchFileContent(url: string): Promise<string> {
  return await fetchWithRetries(url, { headers: { Authorization: `token ${Deno.env.get("GITHUB_TOKEN")}`, Accept: "application/vnd.github.v3+json" } });
}

export function parseJSON(file: string): Record<string, unknown> {
  return JSON.parse(file);
}

export function deriveSchema(jsonObject: Record<string, unknown>): any {
  const getType = (value: unknown) => {
    if (Array.isArray(value)) return "array";
    else if (value === null) return "null";
    else return typeof value;
  };

  const schema: any = {};
  for (const key in jsonObject) {
    const value: any = jsonObject[key];
    schema[key] = { type: getType(value) };
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      schema[key].properties = deriveSchema(value);
    }
  }
  return schema;
}

export async function generateAST(file: string, content: string): Promise<unknown> {
  let result;
  const fileType = getFileType(file);
  switch (fileType) {
    case "JavaScript/TypeScript":
      result = babelParse(content, { sourceType: "module", plugins: ["jsx", "typescript"] });
      break;
    case "JSON":
      result = parseJSON(content);
      break;
    case "HTML":
      result = htmlParser(content);
      break;
    case "CSS":
      result = postcssParse(content);
      break;
    case "Markdown":
      result = markdownParse(content);
      break;
    default:
      result = {};
  }
  return result;
}

export async function summarizeFileOpenAI(filename: string, fileContent: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful repo assistant. Be concise but insightful." },
        { role: "user", content: `Summarize the code for this file (${filename}) and its purpose. What functions and UI elements are written here? : ${fileContent}` },
      ],
    }),
  });
  const data = await response.json();
  return data.choices[0].message.content;
}

export async function fetchRepoMetadata(owner: string, repo: string): Promise<any> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `token ${Deno.env.get("GITHUB_TOKEN")}`,
      Accept: "application/vnd.github.v3+json",
    },
  });
  return await response.json();
}

export function saveASTsToFile(filename: string, data: object): void {
  Deno.writeTextFileSync(filename, JSON.stringify(data));
}

export async function uploadDocument(filename: string): Promise<void> {
  const uploadable = await Deno.readTextFile(filename);
  const response = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
    },
    body: JSON.stringify({ purpose: "search", file: uploadable }),
  });
  await response.json();
}

export function getFileType(file: string): string {
  const ext = file.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "jsx":
    case "ts":
    case "tsx":
      return "JavaScript/TypeScript";
    case "json":
      return "JSON";
    case "html":
      return "HTML";
    case "css":
      return "CSS";
    case "md":
      return "Markdown";
    default:
      return "Unknown";
  }
}

export async function queueGroupedJobs(owner: string, repo: string): Promise<string> {
  const repoKey = `${owner}/${repo}`;
  const files = (await fetchFiles(owner, repo)).filter(
    (fileInfo: any) => getFileType(fileInfo.path) !== "Media"
  );

  const groupId = v4.generate();
  const jobs: any[] = [];

  for (const file of files) {
    const latestMetadata = await fetchGitHubCommits(repoKey, file.path);
    const storedMetadata = await getFileMetadata(repoKey, file.path);

    if (!storedMetadata || storedMetadata.sha !== latestMetadata[0].sha) {
      const job = {
        id: v4.generate(),
        file,
        groupId,
        status: "queued",
        owner,
        repo,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      jobs.push(job);
      await queueJob(job);
      await storeFileMetadata(repoKey, file.path, latestMetadata[0]);
    }
  }

  return groupId;
}

export async function queueJob(job: any): Promise<void> {
  await kv.set(`job:${job.id}`, JSON.stringify(job));
  await kv.set(`group:${job.groupId}:${job.id}`, "queued");
}

export async function fetchGitHubCommits(repo: string, path: string): Promise<any> {
  const url = `https://api.github.com/repos/${repo}/commits?path=${path}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `token ${Deno.env.get("GITHUB_TOKEN")}`,
      Accept: "application/vnd.github.v3+json",
    },
  });
  return await response.json();
}

export async function storeFileMetadata(repo: string, file: string, metadata: any): Promise<void> {
  await kv.set(`${repo}:${file}:metadata`, JSON.stringify(metadata));
}

export async function getFileMetadata(repo: string, file: string): Promise<any> {
  const key = `${repo}:${file}:metadata`;
  const result = await kv.get(key);
  return result ? JSON.parse(result) : null;
}

export async function getJobs(pattern: string): Promise<any[]> {
  const jobIds: string[] = [];
  for await (const key of Deno.readDir('./kv')) {
    if (key.name.startsWith(pattern)) {
      jobIds.push(key.name);
    }
  }
  const jobs: any[] = await Promise.all(jobIds.map(async (key) => JSON.parse(await kv.get(key) ?? '{}')));
  return jobs.filter(Boolean).sort((a, b) => a.updatedAt - b.updatedAt);
}

export function filterForStaleJobs(jobs: any[], staleTime: number): any[] {
  return jobs.filter((job: any) => Date.now() - job.updatedAt > staleTime);
}

export async function processJobs(jobs: any[], limit: number = 50): Promise<void> {
  const jobsToProcess = jobs.slice(0, Math.min(jobs.length, limit));
  await Promise.all(jobsToProcess.map(processJob));
}

export async function processJob(job: any): Promise<void> {
  try {
    await saveJobWithStatus(job, "in-progress");
    job.result = await processFile(job.file);
    await saveJobWithStatus(job, "completed");
    await checkGroupCompletion(job.groupId);
  } catch (error) {
    await handleJobFailure(job);
  }
}

export async function saveJobWithStatus(job: any, status: string): Promise<void> {
  job.status = status;
  job.updatedAt = Date.now();
  await kv.set(`job:${job.id}`, JSON.stringify(job));
}

export async function handleJobFailure(job: any): Promise<void> {
  await saveJobWithStatus(job, "failed");
  await kv.set(`group:${job.groupId}:${job.id}`, "failed");
}

export async function processFile(file: any): Promise<string> {
  const astData = await generateAST(file.path, await fetchFileContent(file.download_url));
  const summary = await summarizeFileOpenAI(file.path, await fetchFileContent(file.download_url));
  return JSON.stringify({ file: file.path, type: file.type, ast: astData, summary, sourceCode: await fetchFileContent(file.download_url) });
}

export async function checkGroupCompletion(groupId: string): Promise<void> {
  const jobs = await getJobs(`group:${groupId}:*`);
  const isComplete = jobs.every(({ status }) => status === "completed");
  if (isComplete) {
    await finalizeGroup(groupId, jobs);
  }
}

export async function finalizeGroup(groupId: string, jobs: any[]): Promise<void> {
  const { owner, repo } = jobs[0];
  const filename = getASTFilename(owner, repo);
  const finalDocument = await assembleDocument(jobs);
  saveASTsToFile(filename, finalDocument);
  await uploadDocument(filename);
  await kv.set(`group:${groupId}:status`, "completed");
}

export async function assembleDocument(jobs: any[]): Promise<Record<string, unknown>> {
  const entries = jobs.map((job) => [job.file.path, job.result]);
  const metadata = await fetchRepoMetadata(jobs[0].owner, jobs[0].repo);
  entries.push(["metadata", JSON.stringify(metadata)]);
  return Object.fromEntries(entries);
}

export function getASTFilename(owner: string, repo: string): string {
  return `${owner.replace(/_/g, "ZzDasHzZ")}_${repo.replace(/_/g, "ZzDasHzZ")}-asts.json`;
}
