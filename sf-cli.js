// sf-cli.js

import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts";
import { Input, Confirm } from "https://deno.land/x/cliffy@v1.0.0-rc.4/prompt/mod.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { green, bold } from "https://deno.land/std@0.224.0/fmt/colors.ts";
import { existsSync } from "https://deno.land/std@0.224.0/fs/exists.ts";

// Initialize command
await new Command()
  .name("sf-cli")
  .version("0.1.0")
  .description("CLI tool for Semantic Flow Root Repositories")
  .command("init")
  .option("-d, --debug", "Enable debug output.")
  .arguments("<path:string> [siteRoot:string]")
  .description("Initialize a new SFRootRepo at the given path.")
  .action(async (options, path, siteRoot) => {
    if (options.debug) {
      console.log('Debug: Passed-in Path value:', path);
      console.log('Debug: Passed-in siteRoot value:', siteRoot);
      console.log('Debug: Options received:', options);
    }
    
    // If path is not provided, use the current working directory
    path = path || Deno.cwd(); 
    console.log(`Initializing SFRootRepo at: ${path}`);

    // Extract the rootRepoName from the last part of the path
    const rootRepoName = path.split('/').filter(Boolean).pop();

    if (options.debug) {
      console.log('Debug: final path:', path);
      console.log('Debug: rootRepoName:', rootRepoName);
    }

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
              const repoPath = gitUrl.split("git@github.com:")[1].replace(".git", "");
              siteRoot = `https://${repoPath.replace(":", "/")}`;
            } else if (gitUrl.startsWith("https://github.com/")) {
              const repoPath = gitUrl.split("https://github.com/")[1].replace(".git", "");
              const [user, repo] = repoPath.split("/");
              siteRoot = `https://${user}.github.io/${repo}`;
            } else {
              console.log("Warning: Unrecognized git URL format. Cannot infer site root.");
            }
          } else {
            console.log("Warning: Could not find repository URL in .git/config.");
          }
        } catch (error) {
          console.log("Warning: Failed to read .git/config for site root inference.", error);
        }
      } else {
        console.log("Warning: Site root not provided and could not be inferred.");
      }
    
      // Assign default site root if inference failed
      siteRoot = siteRoot || DEFAULT_SITEROOT;
    }
    

    if (options.debug) {
      console.log('Debug: final siteRoot:', siteRoot);
      console.log('Debug: rootRepoName:', rootRepoName);
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

    // Check if config.jsonld exists
    const configPath = `${path}/config.jsonld`;
    let writeConfig = false;

    if (existsSync(configPath)) {
      // Prompt the user whether to overwrite the existing config
      const overwriteResponse = await Confirm.prompt({ message: "Configuration file already exists. Do you want to overwrite it?", default: false });
      writeConfig = overwriteResponse;
    } else {
      writeConfig = true;
    }

    if (writeConfig) {
      // Prompt for metadata
      const siteDescription = await Input.prompt({ message: "Enter a description for the Semantic Flow site:", default: "A Semantic Flow site." });
      const creator = await Input.prompt({ message: "Enter the creator name (default inferred from Git repository username/orgname):", default: siteRoot !== "Unknown" ? siteRoot.split("https://")[1].split(".")[0] : "unknown" });
      const responses = { siteDescription, creator };

      // Create config.jsonld file
      const config = {
        "@context": {
          "sflo": "http://semantic-flow.github.io/ontology/",
          "dc": "http://purl.org/dc/elements/1.1/",
          "@base": siteRoot
        },
        "@id": "",
        "@type": "sflo:SemanticFlowSite",
        "sflo:siteDescription": responses.siteDescription,
        "dc:creator": responses.creator,
        "sflo:hasSourceFolder": "src",
        "sflo:hasOutputFolder": "docs"
      };

      await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2));
      console.log(green(`Configuration file created at: ${bold(configPath)}`));
    } else {
      console.log(green(`Configuration file was not written.`));
    }

    console.log(green(`SFRootRepo initialized successfully at ${bold(path)}`));
    if (siteRoot !== "Unknown") {
      console.log(green(`Site Root: ${bold(siteRoot)}`));
    }
  })
  .parse(Deno.args);
