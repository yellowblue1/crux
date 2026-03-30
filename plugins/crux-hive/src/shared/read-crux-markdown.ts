import { homedir } from "node:os";
import { join } from "node:path";

export async function readCruxMarkdownFile(
  filename: string,
  projectDir: string,
  homeDir?: string,
): Promise<string | null> {
  try {
    const home = homeDir ?? homedir();
    const globalPath = join(home, ".crux", filename);
    const projectPath = join(projectDir, ".crux", filename);

    const globalFile = Bun.file(globalPath);
    const projectFile = Bun.file(projectPath);

    const [globalExists, projectExists] = await Promise.all([
      globalFile.exists(),
      projectFile.exists(),
    ]);

    if (!globalExists && !projectExists) {
      return null;
    }

    const parts: string[] = [];

    if (globalExists) {
      const content = (await globalFile.text()).trim();
      if (content) {
        parts.push(content);
      }
    }

    if (projectExists) {
      const content = (await projectFile.text()).trim();
      if (content) {
        parts.push(content);
      }
    }

    return parts.length > 0 ? parts.join("\n\n") : null;
  } catch {
    return null;
  }
}
