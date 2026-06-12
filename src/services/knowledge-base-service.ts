import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

type KnowledgeDocument = {
  content: string;
  filename: string;
};

let cache: KnowledgeDocument[] | null = null;

async function loadKnowledgeBase() {
  if (cache) {
    return cache;
  }

  const directory = join(process.cwd(), "knowledge-base");
  const filenames = (await readdir(directory)).filter((filename) => filename.endsWith(".md")).sort();

  cache = await Promise.all(
    filenames.map(async (filename) => ({
      content: await readFile(join(directory, filename), "utf8"),
      filename,
    })),
  );

  return cache;
}

export async function getKnowledgeContext() {
  const documents = await loadKnowledgeBase();

  return documents.map((document) => `# Arquivo: ${document.filename}\n\n${document.content}`).join("\n\n---\n\n");
}
