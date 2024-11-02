// sf-cli.js

import { Command } from "https://deno.land/x/cliffy@v0.25.7/mod.ts";
import { ensureDir } from "https://deno.land/std@0.203.0/fs/mod.ts";
import { green, bold } from "https://deno.land/std@0.203.0/fmt/colors.ts";
import { existsSync } from "https://deno.land/std@0.203.0/fs/exists.ts";

// Initialize command
await new Command()
  .name("sf-cli")
  .version("0.1.0")
  .description("CLI tool for Semantic Flow Root Repositories")
  .command("init <path:string> [siteRoot:string]")
  .description("Initialize a new SFRootRepo at the given path.")
  .action(async (path, siteRoot) => {
    // Extract the rootRepoName from the last part of the path
    const rootRepoName = path.split('/').filter(Boolean).pop();

    if (!rootRepoName) {
      console.log("Error: Invalid path provided.");
      Deno.exit(1);
    }

    // Infer site root if not provided
    if (!siteRoot) {
      // Attempt to infer site root if the SFRootRepo has been checked out from git
      if (existsSync(`${path}/.git`)) {
        try {
          const gitConfigPath = `${path}/.git/config`;
          const gitConfig = await Deno.readTextFile(gitConfigPath);
          const urlMatch = gitConfig.match(/url = (.+)/);
          if (urlMatch) {
            const gitUrl = urlMatch[1].trim();
            // Handle different URL formats
            if (gitUrl.startsWith("git@github.com:")) {
              // SSH URL format
              const repoPath = gitUrl.split("git@github.com:")[1].replace(".git", "");
              siteRoot = `https://${repoPath.replace(":", "/")}`;
            } else if (gitUrl.startsWith("https://github.com/")) {
              // HTTPS URL format
              const repoPath = gitUrl.split("https://github.com/")[1].replace(".git", "");
              const [user, repo] = repoPath.split("/");
              siteRoot = `https://${user}.github.io/${repo}`;
            } else {
              console.log("Warning: Unrecognized git URL format. Cannot infer site root.");
              siteRoot = "Unknown";
            }
          } else {
            console.log("Warning: Could not find repository URL in .git/config.");
            siteRoot = "Unknown";
          }
        } catch (error) {
          console.log("Warning: Failed to read .git/config for site root inference.", error);
          siteRoot = "Unknown";
        }
      } else {
        console.log("Warning: Site root not provided and could not be inferred.");
        siteRoot = "Unknown";
      }
    }

    // Create the root directory
    await ensureDir(path);

    // Create 'docs' structure
    const docsDir = `${path}/docs`;
    await ensureDir(docsDir);
    await ensureDir(`${docsDir}/${rootRepoName}`); // Default namespace folder
    await ensureDir(`${docsDir}/_assets`);

    // Create 'src' directory
    const srcDir = `${path}/src`;
    await ensureDir(srcDir);

    // Create template directory
    const templateDir = `${path}/templates`;
    await ensureDir(templateDir);

    console.log(green(`SFRootRepo initialized successfully at ${bold(path)}`));
    if (siteRoot !== "Unknown") {
      console.log(green(`Site Root: ${bold(siteRoot)}`));
    }
  })
  .parse(Deno.args);
